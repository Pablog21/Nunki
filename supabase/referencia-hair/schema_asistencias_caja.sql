-- ====================================================================
-- MIGRACIÓN DE SUPABASE: PLANILLA DE ASISTENCIAS Y CONTROL DE CAJA
-- Copia y pega este script en el editor SQL de tu panel de Supabase
-- ====================================================================

-- ==========================================
-- 1. MODIFICACIONES EN ÓRDENES DE TRABAJO
-- ==========================================
ALTER TABLE public.ordenes_trabajo 
ADD COLUMN IF NOT EXISTS pago_estado text DEFAULT 'pendiente_pago' NOT NULL,
ADD COLUMN IF NOT EXISTS pago_metodo text, -- 'efectivo', 'tarjeta', 'transferencia'
ADD COLUMN IF NOT EXISTS pago_comprobante_url text, -- imagen o referencia de transferencia/tarjeta
ADD COLUMN IF NOT EXISTS pago_fecha_hora timestamp with time zone,
ADD COLUMN IF NOT EXISTS pago_caja_cierre_id uuid; -- Se asocia cuando se realiza el cierre de caja


-- ==========================================
-- 2. TABLA DE ASISTENCIAS (ASISTENCIAS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.asistencias (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    colaborador_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    entrada timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    salida timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_colaborador_fecha UNIQUE (colaborador_id, fecha)
);

-- Habilitar RLS en Asistencias
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para Asistencias
CREATE POLICY "Permitir lectura de asistencias a miembros de la empresa" ON public.asistencias
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

CREATE POLICY "Permitir inserción/edición de asistencias para sí mismo o admins" ON public.asistencias
    FOR ALL TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()))
    WITH CHECK (
        colaborador_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND u.rol IN ('administrador', 'super_admin')
        )
    );


-- ==========================================
-- 3. TABLA DE CIERRES DE CAJA (CAJAS_CIERRES)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cajas_cierres (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    usuario_cierre_id uuid REFERENCES public.usuarios(id) NOT NULL,
    fecha_apertura timestamp with time zone NOT NULL,
    fecha_cierre timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    efectivo_esperado numeric(10,2) DEFAULT 0.00 NOT NULL,
    efectivo_real numeric(10,2) DEFAULT 0.00 NOT NULL,
    tarjeta_esperado numeric(10,2) DEFAULT 0.00 NOT NULL,
    transferencia_esperado numeric(10,2) DEFAULT 0.00 NOT NULL,
    observaciones text,
    responsabilidad_aceptada boolean DEFAULT false NOT NULL,
    firma_digital_nombre text NOT NULL,
    saldo_caja_restante numeric(10,2) DEFAULT 0.00 NOT NULL, -- lo que queda para el siguiente turno
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en Cierres de Caja
ALTER TABLE public.cajas_cierres ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para Cierres de Caja
CREATE POLICY "Permitir lectura de cierres de caja a miembros de la empresa" ON public.cajas_cierres
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

CREATE POLICY "Permitir gestión de cierres de caja a administradores" ON public.cajas_cierres
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND u.rol IN ('administrador', 'super_admin', 'operador')
        )
    );


-- ==========================================
-- 4. TABLA DE MOVIMIENTOS DE CAJA (CAJAS_MOVIMIENTOS)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cajas_movimientos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    tipo text NOT NULL, -- 'retiro', 'ingreso', 'apertura_caja'
    monto numeric(10,2) NOT NULL,
    descripcion text NOT NULL,
    usuario_responsable_id uuid REFERENCES public.usuarios(id) NOT NULL,
    fecha_hora timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    caja_cierre_id uuid REFERENCES public.cajas_cierres(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en Movimientos de Caja
ALTER TABLE public.cajas_movimientos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para Movimientos de Caja
CREATE POLICY "Permitir lectura de movimientos de caja a miembros" ON public.cajas_movimientos
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

CREATE POLICY "Permitir gestión de movimientos de caja a cualquier miembro" ON public.cajas_movimientos
    FOR ALL TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()))
    WITH CHECK (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));


-- ==========================================
-- 5. RELACIÓN FK EN ORDENES_TRABAJO
-- ==========================================
ALTER TABLE public.ordenes_trabajo 
ADD CONSTRAINT fk_ordenes_caja_cierre FOREIGN KEY (pago_caja_cierre_id) 
REFERENCES public.cajas_cierres(id) ON DELETE SET NULL;


-- ==========================================
-- 6. ÍNDICES DE OPTIMIZACIÓN
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_asistencias_colaborador ON public.asistencias(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_empresa ON public.asistencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha ON public.asistencias(fecha);

CREATE INDEX IF NOT EXISTS idx_cajas_cierres_empresa ON public.cajas_cierres(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cajas_movimientos_cierre ON public.cajas_movimientos(caja_cierre_id);
CREATE INDEX IF NOT EXISTS idx_cajas_movimientos_empresa ON public.cajas_movimientos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_ordenes_pago_cierre ON public.ordenes_trabajo(pago_caja_cierre_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_estado ON public.ordenes_trabajo(pago_estado);
