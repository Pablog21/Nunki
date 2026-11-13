// Nunki · Alta de un salón nuevo con su usuario administrador (solo superadmin)
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const PLANES = ['esencial', 'premium']
const limpiar = (v: unknown, max = 160) => String(v ?? '').trim().slice(0, max)
const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// Contraseña temporal legible: 3 bloques sin caracteres ambiguos
function claveTemporal() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const c = Array.from(bytes, (b) => abc[b % abc.length]).join('')
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Configuración incompleta en Supabase' }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Falta la sesión' }, 401)

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) return json({ error: 'Sesión inválida o expirada' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'nunki' } })
  const { data: perfil } = await admin.from('usuarios').select('rol').eq('id', user.id).maybeSingle()
  if (String(perfil?.rol || '').toLowerCase() !== 'super_admin') return json({ error: 'Solo superadministradores' }, 403)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ error: 'Datos inválidos' }, 400) }

  const salon = limpiar(body.salon?.nombre)
  const email = limpiar(body.admin?.email).toLowerCase()
  const nombreAdmin = limpiar(body.admin?.nombre_completo, 120)
  const telefono = limpiar(body.admin?.telefono, 40)
  const whatsapp = limpiar(body.salon?.whatsapp, 40) || telefono
  const plan = PLANES.includes(body.salon?.plan) ? body.salon.plan : 'esencial'
  const moneda = body.salon?.moneda === 'USD' ? 'USD' : 'ARS'
  const diasPrueba = Math.min(Math.max(Number(body.salon?.dias_prueba ?? 14) || 0, 0), 90)
  const contactoId = body.contacto_id ? limpiar(body.contacto_id, 40) : null

  if (!salon) return json({ error: 'Falta el nombre del salón' }, 400)
  if (!nombreAdmin) return json({ error: 'Falta el nombre del administrador' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'El email del administrador no es válido' }, 400)

  // Slug único para la página de reservas
  const base = slugify(limpiar(body.salon?.slug) || salon) || 'salon'
  let slug = base
  for (let i = 2; i < 50; i++) {
    const { data: existe } = await admin.from('empresas').select('id').eq('slug', slug).maybeSingle()
    if (!existe) break
    slug = `${base}-${i}`
  }

  const pruebaHasta = diasPrueba > 0 ? new Date(Date.now() + diasPrueba * 86400000).toISOString().slice(0, 10) : null

  const { data: empresa, error: empresaError } = await admin.from('empresas').insert([{
    nombre: salon,
    slug,
    whatsapp: whatsapp || null,
    plan,
    moneda,
    estado_cuenta: diasPrueba > 0 ? 'prueba' : 'activa',
    prueba_hasta: pruebaHasta,
    reserva_online_activa: false,
  }]).select('id, nombre, slug').single()
  if (empresaError || !empresa) return json({ error: `No se pudo crear el salón: ${empresaError?.message}` }, 400)

  const password = claveTemporal()
  const { data: creado, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreAdmin, app: 'nunki' },
  })
  if (authError || !creado?.user) {
    await admin.from('empresas').delete().eq('id', empresa.id)
    const yaExiste = /already|registered|exists/i.test(authError?.message || '')
    return json({ error: yaExiste ? 'Ya existe un usuario con ese email. Usá otro o pedile que recupere su contraseña.' : `No se pudo crear el usuario: ${authError?.message}` }, 400)
  }

  const { error: perfilError } = await admin.from('usuarios').insert([{
    id: creado.user.id,
    empresa_id: empresa.id,
    nombre_completo: nombreAdmin,
    email,
    telefono,
    rol: 'administrador',
    comision_servicios: 0,
    comision_productos: 0,
  }])
  if (perfilError) {
    await admin.auth.admin.deleteUser(creado.user.id)
    await admin.from('empresas').delete().eq('id', empresa.id)
    return json({ error: `No se pudo crear el perfil: ${perfilError.message}` }, 400)
  }

  if (contactoId) {
    await admin.from('contactos_landing')
      .update({ estado: 'ganado', empresa_id: empresa.id, actualizado_at: new Date().toISOString() })
      .eq('id', contactoId)
  }

  return json({
    ok: true,
    empresa,
    acceso: { email, password, nombre: nombreAdmin },
    prueba_hasta: pruebaHasta,
  })
})
