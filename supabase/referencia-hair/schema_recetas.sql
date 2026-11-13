-- ====================================================================
-- MIGRACIÓN DE SUPABASE: RECETAS DE SERVICIOS (INSUMOS ASOCIADOS)
-- Copia y pega este script en el editor SQL de tu panel de Supabase
-- ====================================================================

-- 1. Crear la tabla de Insumos por Servicio (Receta por defecto)
CREATE TABLE IF NOT EXISTS public.servicio_insumos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    servicio_id uuid REFERENCES public.servicios(id) ON DELETE CASCADE NOT NULL,
    articulo_id uuid REFERENCES public.articulos(id) ON DELETE CASCADE NOT NULL,
    cantidad_defecto numeric(10,2) DEFAULT 1.00 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_servicio_articulo UNIQUE (servicio_id, articulo_id)
);

-- 2. Habilitar la Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.servicio_insumos ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Acceso RLS
-- Permitir lectura a cualquier usuario autenticado que pertenezca a la misma empresa del servicio
CREATE POLICY "Permitir lectura de insumos a usuarios de la empresa" ON public.servicio_insumos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.servicios s
            JOIN public.usuarios u ON s.empresa_id = u.empresa_id
            WHERE s.id = public.servicio_insumos.servicio_id AND u.id = auth.uid()
        )
    );

-- Permitir modificaciones solo a Administradores o Super Administradores
CREATE POLICY "Permitir gestión de insumos a administradores" ON public.servicio_insumos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.servicios s
            JOIN public.usuarios u ON s.empresa_id = u.empresa_id
            WHERE s.id = public.servicio_insumos.servicio_id 
              AND u.id = auth.uid() 
              AND u.rol IN ('administrador', 'super_admin')
        )
    );

-- 4. Crear índices para optimizar la velocidad de búsqueda
CREATE INDEX IF NOT EXISTS idx_servicio_insumos_servicio ON public.servicio_insumos(servicio_id);
CREATE INDEX IF NOT EXISTS idx_servicio_insumos_articulo ON public.servicio_insumos(articulo_id);
