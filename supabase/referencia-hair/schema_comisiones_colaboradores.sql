-- ====================================================================
-- MIGRACIÓN DE SUPABASE: GESTIÓN DE COLABORADORES, COMISIONES Y RENTABILIDAD
-- Copia y pega este script en el editor SQL de tu panel de Supabase
-- ====================================================================

-- 1. Agregar columnas de comisiones por defecto en la tabla de usuarios/colaboradores
ALTER TABLE public.usuarios 
ADD COLUMN IF NOT EXISTS comision_servicios numeric(5,2) DEFAULT 30.00,
ADD COLUMN IF NOT EXISTS comision_productos numeric(5,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS telefono text;

-- 2. Modificar la tabla de detalles de orden de trabajo
-- Esto almacena el colaborador asignado, su porcentaje de comisión pactado, el costo del artículo e historial de rentabilidad por cada fila de detalle
ALTER TABLE public.ordenes_trabajo_detalles 
ADD COLUMN IF NOT EXISTS colaborador_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS porcentaje_comision numeric(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS monto_comision numeric(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS precio_costo numeric(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS rentabilidad numeric(10,2) DEFAULT 0.00;

-- 3. Crear la nueva tabla de comisiones registradas en estado "Pendiente"
CREATE TABLE IF NOT EXISTS public.comisiones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL,
    colaborador_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE NOT NULL,
    orden_trabajo_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
    concepto text NOT NULL, -- Ej: "Servicio: Corte de pelo"
    monto_base numeric(10,2) NOT NULL,
    porcentaje numeric(5,2) NOT NULL,
    monto_comision numeric(10,2) NOT NULL,
    estado text DEFAULT 'Pendiente' NOT NULL, -- 'Pendiente' o 'Liquidada'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Habilitar la Seguridad a Nivel de Fila (RLS) en comisiones
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;

-- 5. Crear Políticas de Acceso RLS para comisiones
-- Permitir lectura de comisiones a los usuarios autenticados que pertenezcan a la misma empresa
CREATE POLICY "Permitir lectura de comisiones a miembros de la empresa" ON public.comisiones
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT empresa_id FROM public.usuarios WHERE id = auth.uid()));

-- Permitir gestión total de comisiones a administradores o super administradores de la empresa
CREATE POLICY "Permitir gestión de comisiones a administradores" ON public.comisiones
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND u.rol IN ('administrador', 'super_admin')
        )
    );

-- 6. Crear índices para optimización de reportes y búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_comisiones_colaborador ON public.comisiones(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_empresa ON public.comisiones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_estado ON public.comisiones(estado);
CREATE INDEX IF NOT EXISTS idx_orden_detalles_colaborador ON public.ordenes_trabajo_detalles(colaborador_id);
