import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
// Nunki vive en su propio esquema dentro del proyecto Supabase compartido con h.A.I.r
export const DB_SCHEMA = import.meta.env.VITE_DB_SCHEMA || 'nunki'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: DB_SCHEMA }
})
