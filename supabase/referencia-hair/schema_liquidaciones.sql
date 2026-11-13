-- ====================================================================
-- MIGRACIÓN Y POBLADO RETROACTIVO EN SUPABASE: COMISIONES Y LIQUIDACIONES
-- Copia y ejecuta todo este script en: Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. CREAR TABLA LIQUIDACIONES (si no existe)
CREATE TABLE IF NOT EXISTS public.liquidaciones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    colaborador_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    codigo_liquidacion text NOT NULL,
    fecha_liquidacion timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    monto_total numeric(12,2) DEFAULT 0.00 NOT NULL,
    medio_pago text DEFAULT 'efectivo' NOT NULL, -- 'efectivo', 'transferencia', 'mercadopago'
    periodo_desde date,
    periodo_hasta date,
    notas text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en Liquidaciones
ALTER TABLE public.liquidaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura de liquidaciones a miembros de la empresa" ON public.liquidaciones;
CREATE POLICY "Permitir lectura de liquidaciones a miembros de la empresa" ON public.liquidaciones
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Permitir insercion/gestion de liquidaciones a administradores" ON public.liquidaciones;
CREATE POLICY "Permitir insercion/gestion de liquidaciones a administradores" ON public.liquidaciones
    FOR ALL TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()))
    WITH CHECK (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

-- 2. ASEGURAR QUE LA TABLA COMISIONES EXISTE CON SUS COLUMNAS
CREATE TABLE IF NOT EXISTS public.comisiones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    colaborador_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    orden_trabajo_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
    concepto text NOT NULL,
    monto_base numeric(12,2) DEFAULT 0.00 NOT NULL,
    porcentaje numeric(5,2) DEFAULT 0.00 NOT NULL,
    monto_comision numeric(12,2) DEFAULT 0.00 NOT NULL,
    estado text DEFAULT 'Pendiente' NOT NULL, -- 'Pendiente', 'Liquidada'
    liquidacion_id uuid REFERENCES public.liquidaciones(id) ON DELETE SET NULL,
    caja_cierre_id uuid REFERENCES public.cajas_cierres(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Agregar columna liquidacion_id si falta
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'comisiones' AND column_name = 'liquidacion_id'
    ) THEN
        ALTER TABLE public.comisiones ADD COLUMN liquidacion_id uuid REFERENCES public.liquidaciones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Habilitar RLS en Comisiones
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir gestion de comisiones por empresa" ON public.comisiones;
CREATE POLICY "Permitir gestion de comisiones por empresa" ON public.comisiones
    FOR ALL TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()))
    WITH CHECK (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

-- 3. AGREGAR CONFIGURACION EN EMPRESAS (si no existe)
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS configuracion jsonb DEFAULT '{}'::jsonb;

-- 4. INDICES DE OPTIMIZACIÓN
CREATE INDEX IF NOT EXISTS idx_liquidaciones_empresa ON public.liquidaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_colaborador ON public.liquidaciones(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_liquidacion ON public.comisiones(liquidacion_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_colaborador_estado ON public.comisiones(colaborador_id, estado);

-- ====================================================================
-- 5. LIMPIEZA Y POBLADO RETROACTIVO DE COMISIONES
-- ====================================================================

-- 5.0 Limpiar cualquier comisión existente de comandas canceladas o eliminadas
DELETE FROM public.comisiones 
WHERE orden_trabajo_id IN (
    SELECT id FROM public.ordenes_trabajo 
    WHERE estado IN ('cancelada', 'eliminada') 
       OR pago_estado IN ('cancelado', 'anulado')
);

-- A. Para comandas individuales pasadas que no tengan registros de comisión (usando detalles)
INSERT INTO public.comisiones (
    empresa_id,
    colaborador_id,
    orden_trabajo_id,
    concepto,
    monto_base,
    porcentaje,
    monto_comision,
    estado,
    created_at
)
SELECT 
    o.empresa_id,
    COALESCE(d.colaborador_id, o.usuario_responsable_id) as colaborador_id,
    d.orden_trabajo_id,
    CASE 
        WHEN d.tipo_item = 'articulo' THEN 'Venta Artículo'
        ELSE 'Servicio Realizado'
    END as concepto,
    (d.cantidad * d.precio_unitario) as monto_base,
    COALESCE(NULLIF(d.porcentaje_comision, 0), u.comision_servicios, 35) as porcentaje,
    ((d.cantidad * d.precio_unitario) * COALESCE(NULLIF(d.porcentaje_comision, 0), u.comision_servicios, 35) / 100) as monto_comision,
    'Pendiente' as estado,
    o.fecha_hora as created_at
FROM public.ordenes_trabajo_detalles d
JOIN public.ordenes_trabajo o ON o.id = d.orden_trabajo_id
JOIN public.usuarios u ON u.id = COALESCE(d.colaborador_id, o.usuario_responsable_id)
WHERE o.estado NOT IN ('cancelada', 'eliminada')
  AND (o.pago_estado IS NULL OR o.pago_estado NOT IN ('cancelado', 'anulado'))
  AND (o.es_colaborativa IS NOT TRUE OR o.es_colaborativa IS NULL)
  AND COALESCE(d.colaborador_id, o.usuario_responsable_id) IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.comisiones c WHERE c.orden_trabajo_id = o.id
  );

-- A2. Para comandas individuales pasadas que no tengan registros de comisión (usando cabecera si no hay detalles)
INSERT INTO public.comisiones (
    empresa_id,
    colaborador_id,
    orden_trabajo_id,
    concepto,
    monto_base,
    porcentaje,
    monto_comision,
    estado,
    created_at
)
SELECT 
    o.empresa_id,
    o.usuario_responsable_id as colaborador_id,
    o.id as orden_trabajo_id,
    'Servicio Realizado' as concepto,
    o.total_economico as monto_base,
    COALESCE(u.comision_servicios, 35) as porcentaje,
    (o.total_economico * COALESCE(u.comision_servicios, 35) / 100) as monto_comision,
    'Pendiente' as estado,
    o.fecha_hora as created_at
FROM public.ordenes_trabajo o
JOIN public.usuarios u ON u.id = o.usuario_responsable_id
WHERE o.estado NOT IN ('cancelada', 'eliminada')
  AND (o.pago_estado IS NULL OR o.pago_estado NOT IN ('cancelado', 'anulado'))
  AND (o.es_colaborativa IS NOT TRUE OR o.es_colaborativa IS NULL)
  AND o.usuario_responsable_id IS NOT NULL
  AND o.total_economico > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.comisiones c WHERE c.orden_trabajo_id = o.id
  );

-- B. Para comandas colaborativas pasadas que no tengan registros de comisión
INSERT INTO public.comisiones (
    empresa_id,
    colaborador_id,
    orden_trabajo_id,
    concepto,
    monto_base,
    porcentaje,
    monto_comision,
    estado,
    created_at
)
SELECT 
    o.empresa_id,
    (elem->>'colaborador_id')::uuid as colaborador_id,
    o.id as orden_trabajo_id,
    'Servicio Colaborativo (' || (elem->>'porcentaje') || '%)' as concepto,
    (o.total_economico * (elem->>'porcentaje')::numeric / 100) as monto_base,
    COALESCE(u.comision_servicios, 35) as porcentaje,
    ((o.total_economico * (elem->>'porcentaje')::numeric / 100) * COALESCE(u.comision_servicios, 35) / 100) as monto_comision,
    'Pendiente' as estado,
    o.fecha_hora as created_at
FROM public.ordenes_trabajo o
CROSS JOIN LATERAL jsonb_array_elements(o.colaboradores_participantes) as elem
JOIN public.usuarios u ON u.id = (elem->>'colaborador_id')::uuid
WHERE o.estado NOT IN ('cancelada', 'eliminada')
  AND (o.pago_estado IS NULL OR o.pago_estado NOT IN ('cancelado', 'anulado'))
  AND o.es_colaborativa IS TRUE
  AND o.colaboradores_participantes IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.comisiones c WHERE c.orden_trabajo_id = o.id
  );
