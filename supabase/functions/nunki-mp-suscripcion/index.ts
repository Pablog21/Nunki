// Nunki · Genera el link (y QR) de suscripción mensual de Mercado Pago para un salón.
// No pide email: se crea un "plan de suscripción" propio del salón; quien paga entra con la sesión
// que ya tiene en la app de Mercado Pago. El código del salón va en la descripción para rastrear el pago.
// Secretos: MP_ACCESS_TOKEN (obligatorio), NUNKI_APP_URL (opcional, para volver a la app).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const PLAN_NOMBRE: Record<string, string> = { esencial: 'Esencial', premium: 'Premium' }
const codigoSalon = (id: string) => `NK-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const mpToken = (Deno.env.get('MP_ACCESS_TOKEN') ?? '').trim()
    if (!mpToken) return json({ error: 'El cobro con Mercado Pago todavía no está habilitado. Escribinos y lo resolvemos.' }, 503)

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json({ error: 'Sesión inválida' }, 401)

    const admin = createClient(supabaseUrl, serviceKey, { db: { schema: 'nunki' } })
    const { data: perfil } = await admin.from('usuarios').select('empresa_id, rol').eq('id', user.id).maybeSingle()
    const rol = String(perfil?.rol || '').toLowerCase()
    if (!perfil || !['administrador', 'super_admin'].includes(rol)) return json({ error: 'Solo el administrador del salón puede gestionar el pago' }, 403)

    const body = await req.json().catch(() => ({}))
    const empresaId = rol === 'super_admin' && body?.empresaId ? String(body.empresaId) : perfil.empresa_id

    const { data: empresa } = await admin.from('empresas')
      .select('id, nombre, plan, moneda, precio_mensual, mp_preapproval_estado, mp_plan_id, mp_plan_monto, mp_plan_tipo, mp_plan_url')
      .eq('id', empresaId).maybeSingle()
    if (!empresa) return json({ error: 'Salón inexistente' }, 404)
    if (empresa.mp_preapproval_estado === 'authorized') return json({ error: 'Este salón ya tiene el débito automático activo.' }, 409)
    if (empresa.moneda === 'USD') return json({ error: 'Las suscripciones en dólares se gestionan aparte. Te contactamos para coordinar el pago.' }, 400)

    // El salón elige el plan al pagar; queda guardado en su cuenta
    const planElegido = ['esencial', 'premium'].includes(body?.plan) ? body.plan : empresa.plan
    if (planElegido !== empresa.plan) {
      await admin.from('empresas').update({ plan: planElegido }).eq('id', empresa.id)
      empresa.plan = planElegido
    }

    const { data: precioPlan } = await admin.rpc('precio_plan', { p_plan: empresa.plan, p_moneda: 'ARS' })
    const monto = Number(empresa.precio_mensual ?? precioPlan)
    if (!(monto > 0)) return json({ error: 'No hay un precio definido para este plan' }, 400)

    const codigo = codigoSalon(empresa.id)

    // Reutilizar el plan de Mercado Pago del salón si ya existe con el mismo plan e importe
    if (empresa.mp_plan_id && empresa.mp_plan_url && Number(empresa.mp_plan_monto) === monto && empresa.mp_plan_tipo === empresa.plan) {
      return json({ ok: true, url: empresa.mp_plan_url, plan: empresa.plan, monto, codigo })
    }

    const appUrl = Deno.env.get('NUNKI_APP_URL') ?? req.headers.get('origin') ?? 'https://nunki-app-321805493034.us-central1.run.app'
    const resp = await fetch('https://api.mercadopago.com/preapproval_plan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        reason: `Nunki ${PLAN_NOMBRE[empresa.plan] ?? ''} · ${empresa.nombre} · ${codigo}`.slice(0, 120),
        back_url: `${appUrl.replace(/\/$/, '')}/mi-plan`,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: monto, currency_id: 'ARS' },
      }),
    })
    const mp = await resp.json().catch(() => ({}))
    if (!resp.ok || !mp?.init_point) {
      console.error('MP preapproval_plan', resp.status, mp)
      const msg = /token/i.test(mp?.message ?? '') ? 'La conexión con Mercado Pago no está bien configurada. Ya nos avisaron; probá de nuevo más tarde.' : (mp?.message ? `Mercado Pago: ${mp.message}` : 'Mercado Pago no pudo generar el pago')
      return json({ error: msg }, 502)
    }

    await admin.from('empresas').update({
      mp_plan_id: mp.id, mp_plan_url: mp.init_point, mp_plan_monto: monto, mp_plan_tipo: empresa.plan,
    }).eq('id', empresa.id)

    return json({ ok: true, url: mp.init_point, plan: empresa.plan, monto, codigo })
  } catch (err) {
    console.error(err)
    return json({ error: 'Error inesperado' }, 500)
  }
})
