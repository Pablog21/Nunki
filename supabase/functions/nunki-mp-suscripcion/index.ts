// Nunki · Crea (o reabre) la suscripción mensual de Mercado Pago de un salón.
// La llama el administrador del salón (o el superadmin). Devuelve el link de Mercado Pago para autorizar el débito.
// Secretos: MP_ACCESS_TOKEN (obligatorio), NUNKI_APP_URL (opcional, para volver a la app).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const PLAN_NOMBRE: Record<string, string> = { esencial: 'Esencial', premium: 'Premium' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
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
    const payerEmail = String(body?.email || user.email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return json({ error: 'Ingresá el email de tu cuenta de Mercado Pago' }, 400)

    const { data: empresa } = await admin.from('empresas').select('id, nombre, plan, moneda, precio_mensual, mp_preapproval_id, mp_preapproval_estado').eq('id', empresaId).maybeSingle()
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

    // Si ya tenía una suscripción pendiente o pausada, se cancela para no duplicar cobros
    if (empresa.mp_preapproval_id) {
      await fetch(`https://api.mercadopago.com/preapproval/${empresa.mp_preapproval_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }).catch(() => null)
    }

    const appUrl = Deno.env.get('NUNKI_APP_URL') ?? req.headers.get('origin') ?? 'https://nunki-app-321805493034.us-central1.run.app'
    const resp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        reason: `Nunki ${PLAN_NOMBRE[empresa.plan] ?? ''} · ${empresa.nombre}`.slice(0, 120),
        external_reference: empresa.id,
        payer_email: payerEmail,
        back_url: `${appUrl.replace(/\/$/, '')}/mi-plan`,
        status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: monto, currency_id: 'ARS' },
      }),
    })
    const mp = await resp.json()
    if (!resp.ok || !mp?.init_point) {
      console.error('MP preapproval', resp.status, mp)
      return json({ error: mp?.message ? `Mercado Pago: ${mp.message}` : 'Mercado Pago no pudo crear la suscripción' }, 502)
    }

    await admin.from('empresas').update({
      mp_preapproval_id: mp.id, mp_preapproval_estado: mp.status ?? 'pending', mp_payer_email: payerEmail,
    }).eq('id', empresa.id)

    return json({ ok: true, url: mp.init_point, plan: empresa.plan, monto })
  } catch (err) {
    console.error(err)
    return json({ error: 'Error inesperado' }, 500)
  }
})
