-- ====================================================================
-- SCRIPT DE MIGRACIÓN: ESTADO DE CONTROL DE CAJAS CERRADAS (UKY)
-- Ejecutar este script en el SQL Editor de tu panel de Supabase (Opcional:
-- el sistema cuenta con respaldo automático en observaciones si aún no se ejecutó)
-- ====================================================================

ALTER TABLE public.cajas_cierres
  ADD COLUMN IF NOT EXISTS controlada boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS controlada_fecha timestamp with time zone,
  ADD COLUMN IF NOT EXISTS controlada_por_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS controlada_por_nombre text,
  ADD COLUMN IF NOT EXISTS controlada_comentario text;
