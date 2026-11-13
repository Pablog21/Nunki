import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Configuración incompleta en Supabase' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Obtener token del usuario invocador
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No se proveyó encabezado de autenticación' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente para validar el usuario que llama
    const supabaseClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callerUser }, error: callerError } = await supabaseClient.auth.getUser()
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida o expirada' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Extraer datos del body
    const { targetUserId, newPassword } = await req.json()

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'Falta el identificador del usuario (targetUserId)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!newPassword || newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente administrativo con service_role para consultar permisos y actualizar
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: 'nunki' } })

    // 3. Consultar rol y empresa del usuario que hace la llamada
    const { data: callerProfile, error: callerProfError } = await supabaseAdmin
      .from('usuarios')
      .select('id, rol, empresa_id')
      .eq('id', callerUser.id)
      .single()

    if (callerProfError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: 'No se encontró el perfil del usuario administrador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const isSuperAdmin = callerProfile.rol === 'super_admin'
    const isEmpresaAdmin = callerProfile.rol === 'administrador'

    if (!isSuperAdmin && !isEmpresaAdmin) {
      return new Response(
        JSON.stringify({ error: 'Acceso denegado: solo administradores pueden cambiar contraseñas' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Consultar datos del usuario a modificar
    const { data: targetProfile, error: targetProfError } = await supabaseAdmin
      .from('usuarios')
      .select('id, rol, empresa_id, nombre_completo, email')
      .eq('id', targetUserId)
      .single()

    if (targetProfError || !targetProfile) {
      return new Response(
        JSON.stringify({ error: 'No se encontró el usuario a modificar' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Si es administrador regular (no super_admin), validar que sea de su misma peluquería
    if (!isSuperAdmin) {
      if (targetProfile.empresa_id !== callerProfile.empresa_id) {
        return new Response(
          JSON.stringify({ error: 'No tienes permiso para modificar usuarios de otra peluquería' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (targetProfile.rol === 'super_admin') {
        return new Response(
          JSON.stringify({ error: 'No puedes modificar la contraseña de un Super Administrador' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 5. Actualizar la contraseña en Supabase Auth
    const { data: updatedAuthUser, error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    )

    if (updateAuthError) {
      return new Response(
        JSON.stringify({ error: `Error al actualizar en Auth: ${updateAuthError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Contraseña actualizada exitosamente para ${targetProfile.nombre_completo || targetProfile.email}`,
        userId: targetUserId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Error inesperado del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
