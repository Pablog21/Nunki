// Nunki · Cambio de contraseña por un administrador del mismo salón
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Configuración incompleta en Supabase' }, 500)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No se proveyó encabezado de autenticación' }, 401)

    const supabaseClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: callerUser }, error: callerError } = await supabaseClient.auth.getUser()
    if (callerError || !callerUser) return json({ error: 'Sesión inválida o expirada' }, 401)

    const { targetUserId, newPassword } = await req.json()
    if (!targetUserId) return json({ error: 'Falta el identificador del usuario (targetUserId)' }, 400)
    if (!newPassword || String(newPassword).length < 8) return json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, 400)

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'nunki' } })

    const { data: callerProfile } = await supabaseAdmin.from('usuarios').select('id, rol, empresa_id').eq('id', callerUser.id).maybeSingle()
    if (!callerProfile) return json({ error: 'No se encontró el perfil del usuario administrador' }, 403)

    const rol = String(callerProfile.rol || '').toLowerCase()
    const isSuperAdmin = rol === 'super_admin'
    const isEmpresaAdmin = rol === 'administrador'
    if (!isSuperAdmin && !isEmpresaAdmin) return json({ error: 'Acceso denegado: solo administradores pueden cambiar contraseñas' }, 403)

    const { data: targetProfile } = await supabaseAdmin.from('usuarios').select('id, rol, empresa_id, nombre_completo, email').eq('id', targetUserId).maybeSingle()
    if (!targetProfile) return json({ error: 'No se encontró el usuario a modificar' }, 404)

    if (!isSuperAdmin) {
      if (targetProfile.empresa_id !== callerProfile.empresa_id) return json({ error: 'No tenés permiso para modificar usuarios de otro salón' }, 403)
      if (String(targetProfile.rol || '').toLowerCase() === 'super_admin') return json({ error: 'No podés modificar la contraseña de un Super Administrador' }, 403)
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password: newPassword })
    if (updateAuthError) return json({ error: `Error al actualizar la contraseña: ${updateAuthError.message}` }, 400)

    return json({ success: true, message: `Contraseña actualizada para ${targetProfile.nombre_completo || targetProfile.email}`, userId: targetUserId })
  } catch (err) {
    console.error(err)
    return json({ error: 'Error inesperado del servidor' }, 500)
  }
})
