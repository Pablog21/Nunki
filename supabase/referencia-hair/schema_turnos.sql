-- ====================================================================
-- SCRIPT DE MIGRACIÓN: CREACIÓN DE TABLA DE TURNOS (AGENDA)
-- Ejecutar en el SQL Editor de tu panel de Supabase
-- ====================================================================

-- 1. Crear tabla de turnos
CREATE TABLE IF NOT EXISTS public.turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    cliente_nombre_rapido TEXT, -- Para agendamientos ultra rápidos sin registro previo
    colaborador_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    servicio_id UUID REFERENCES public.servicios(id) ON DELETE SET NULL,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    fecha_hora_fin TIMESTAMPTZ NOT NULL,
    notas TEXT,
    estado TEXT DEFAULT 'Pendiente', -- 'Pendiente', 'Confirmado', 'Realizado', 'Cancelado'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar Seguridad a nivel de filas (RLS)
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas antiguas para evitar colisiones
DROP POLICY IF EXISTS "Lectura turnos miembros o super_admin" ON public.turnos;
DROP POLICY IF EXISTS "Gestión turnos miembros o super_admin" ON public.turnos;
DROP POLICY IF EXISTS "Permitir lectura de turnos a miembros o super_admin" ON public.turnos;
DROP POLICY IF EXISTS "Permitir gestion de turnos" ON public.turnos;

-- 4. Crear políticas RLS ultra-robustas (con USING y WITH CHECK para inserciones)
CREATE POLICY "Permitir lectura de turnos a miembros o super_admin" ON public.turnos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND (lower(u.rol) = 'super_admin' OR u.empresa_id = turnos.empresa_id)
        )
    );

CREATE POLICY "Permitir gestion de turnos" ON public.turnos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND (lower(u.rol) = 'super_admin' OR u.empresa_id = turnos.empresa_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.id = auth.uid() AND (lower(u.rol) = 'super_admin' OR u.empresa_id = turnos.empresa_id)
        )
    );
