-- ====================================================================
-- SCRIPT DE MIGRACIÓN: AGREGAR CAMPO TIPO_CLIENTE A TABLA CLIENTES
-- Ejecutar en el SQL Editor de tu panel de Supabase
-- ====================================================================

-- Agregar columna 'tipo_cliente' ('nuevo' o 'antiguo')
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tipo_cliente TEXT DEFAULT 'nuevo';
