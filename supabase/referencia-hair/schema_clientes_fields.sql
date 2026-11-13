-- ====================================================================
-- SCRIPT DE MIGRACIÓN: AGREGAR CAMPOS DE PROFESIÓN Y DIRECCIÓN A CLIENTES
-- Ejecutar este script en el SQL Editor de tu panel de Supabase
-- ====================================================================

-- Agregar columna 'profesion'
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS profesion TEXT;

-- Agregar columna 'direccion'
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS direccion TEXT;
