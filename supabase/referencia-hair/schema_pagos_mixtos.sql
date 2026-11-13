-- ====================================================================
-- SCRIPT DE MIGRACIÓN: AGREGAR CAMPOS PARA PAGOS DIVIDIDOS / MIXTOS
-- Ejecutar este script en el SQL Editor de tu panel de Supabase
-- ====================================================================

-- 1. Agregar columnas para desglosar pagos en efectivo, tarjeta y transferencia
ALTER TABLE public.ordenes_trabajo 
  ADD COLUMN IF NOT EXISTS pago_efectivo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_tarjeta NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_transferencia NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_detalles JSONB DEFAULT NULL;

-- 2. Asegurar que las órdenes anteriores tengan sus valores coherentes por defecto
UPDATE public.ordenes_trabajo
SET pago_efectivo = total_economico
WHERE pago_metodo = 'efectivo' AND (pago_efectivo IS NULL OR pago_efectivo = 0) AND total_economico > 0;

UPDATE public.ordenes_trabajo
SET pago_tarjeta = total_economico
WHERE pago_metodo = 'tarjeta' AND (pago_tarjeta IS NULL OR pago_tarjeta = 0) AND total_economico > 0;

UPDATE public.ordenes_trabajo
SET pago_transferencia = total_economico
WHERE pago_metodo = 'transferencia' AND (pago_transferencia IS NULL OR pago_transferencia = 0) AND total_economico > 0;
