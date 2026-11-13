-- ====================================================================
-- MIGRACIÓN DE SUPABASE: COLABORACIÓN EN COMANDAS Y CIERRES DE CAJA
-- Copia y pega este script en el editor SQL de tu panel de Supabase
-- ====================================================================

ALTER TABLE public.ordenes_trabajo 
ADD COLUMN IF NOT EXISTS es_colaborativa boolean DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS colaboradores_participantes jsonb DEFAULT NULL;

ALTER TABLE public.ordenes_trabajo_detalles
ADD COLUMN IF NOT EXISTS colaboradores_comisiones jsonb DEFAULT NULL;

-- Vincular comisiones pagadas con el cierre de caja específico para auditoría
ALTER TABLE public.comisiones 
ADD COLUMN IF NOT EXISTS caja_cierre_id uuid REFERENCES public.cajas_cierres(id) ON DELETE SET NULL;
