// Nunki · Recibe las notificaciones de Mercado Pago (suscripciones y pagos).
// Nunca confía en el contenido del aviso: verifica la firma y vuelve a consultar el dato en la API de Mercado Pago.
// Secretos: MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET (la "clave secreta" de Webhooks en el panel de Mercado Pago).
import { createClient } from 'npm:@supabase/supabase-js@2'

const ok = (msg = 'ok') => new Response(msg, { status: 200 })

async function firmaValida(req: Request, dataId: string, secret: string) {
  const firma = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  const partes = Object.fromEntries(firma.split(',').map((p) => p.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false
  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${partes.ts};`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  // Comparación en tiempo constante
  if (hex.length !== partes.v1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ partes.v1.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  // GET: chequeo de configuración (no expone las claves)
  if (req.method === 'GET') {
    const token = (Deno.env.get('MP_ACCESS_TOKEN') ?? '').trim()
    let tokenValido: boolean | null = null
    let detalle = ''
    if (token) {
      const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      tokenValido = Boolean(r?.ok)
      if (r && !r.ok) detalle = `HTTP ${r.status}`
    }
    return new Response(JSON.stringify({
      access_token: Boolean(token),
      access_token_formato: token ? (token.startsWith('APP_USR-') ? 'produccion' : token.startsWith('TEST-') ? 'prueba' : 'desconocido') : null,
      access_token_largo: token.length,
      access_token_valido: tokenValido,
      detalle,
      webhook_secret: Boolean(Deno.env.get('MP_WEBHOOK_SECRET')),
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
  if (req.method !== 'POST') return ok()
  const mpToken = (Deno.env.get('MP_ACCESS_TOKEN') ?? '').trim()
  const secret = (Deno.env.get('MP_WEBHOOK_SECRET') ?? '').trim()
  if (!mpToken || !secret) return new Response('Mercado Pago no configurado', { status: 503 })

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({} as Record<string, any>))
  const tipo = String(body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const dataId = String(url.searchParams.get('data.id') ?? body?.data?.id ?? '')
  if (!dataId) return ok('sin id')

  if (!(await firmaValida(req, dataId, secret))) {
    console.warn('Firma inválida', tipo, dataId)
    return new Response('firma inválida', { status: 401 })
  }

  const mp = (path: string) =>
    fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${mpToken}` } }).then((r) => (r.ok ? r.json() : null))
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'nunki' } })

  const esUuid = (v?: string) => /^[0-9a-f-]{36}$/i.test(String(v ?? ''))
  // El salón se identifica por: referencia externa (su ID), la suscripción o el plan de Mercado Pago creado para él
  type Emp = { id: string; moneda: string } | null
  const empresaDe = async (preapprovalId?: string, externalRef?: string, planId?: string): Promise<Emp> => {
    if (esUuid(externalRef)) {
      const { data } = await admin.from('empresas').select('id, moneda').eq('id', externalRef).maybeSingle()
      if (data) return data
    }
    if (preapprovalId) {
      const { data } = await admin.from('empresas').select('id, moneda').eq('mp_preapproval_id', preapprovalId).maybeSingle()
      if (data) return data
    }
    if (planId) {
      const { data } = await admin.from('empresas').select('id, moneda').eq('mp_plan_id', planId).maybeSingle()
      if (data) return data
    }
    // Último recurso: consultar la suscripción para saber de qué plan es
    if (preapprovalId) {
      const s = await mp(`/preapproval/${preapprovalId}`)
      if (s?.preapproval_plan_id && s.preapproval_plan_id !== planId) {
        const emp = await empresaDe(undefined, s.external_reference, s.preapproval_plan_id)
        if (emp) await admin.from('empresas').update({ mp_preapproval_id: s.id, mp_preapproval_estado: s.status }).eq('id', emp.id)
        return emp
      }
    }
    return null
  }

  try {
    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      // Cambió el estado de la suscripción (autorizada, pausada, cancelada)
      const s = await mp(`/preapproval/${dataId}`)
      if (!s) return ok('no encontrada')
      const emp = await empresaDe(undefined, s.external_reference, s.preapproval_plan_id) ?? await empresaDe(s.id)
      if (emp) await admin.from('empresas').update({ mp_preapproval_id: s.id, mp_preapproval_estado: s.status, mp_payer_email: s.payer_email ?? null }).eq('id', emp.id)
      return ok()
    }

    if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') {
      // Un cobro mensual de la suscripción
      const ap = await mp(`/authorized_payments/${dataId}`)
      if (!ap) return ok('no encontrado')
      const emp = await empresaDe(ap.preapproval_id, ap.external_reference)
      if (!emp) return ok('salón no encontrado')
      const pago = ap.payment ?? {}
      const estado = pago.status === 'approved' ? 'aprobado' : ['rejected', 'cancelled'].includes(pago.status) ? 'rechazado' : 'pendiente'
      if (estado === 'pendiente') return ok('pendiente')
      const { error } = await admin.rpc('registrar_pago', {
        p_empresa: emp.id, p_monto: Number(ap.transaction_amount ?? 0), p_moneda: ap.currency_id === 'USD' ? 'USD' : 'ARS', p_meses: 1,
        p_origen: 'mercadopago', p_referencia: String(pago.id ?? `ap-${ap.id}`), p_nota: estado === 'rechazado' ? (pago.status_detail ?? 'rechazado') : null,
        p_estado: estado, p_detalle: { authorized_payment_id: ap.id, preapproval_id: ap.preapproval_id, status: pago.status },
      })
      if (error) console.error('registrar_pago', error)
      return ok()
    }

    if (tipo === 'payment') {
      // Pago suelto (por ejemplo, el primer cobro): solo se registra si está vinculado a un salón
      const p = await mp(`/v1/payments/${dataId}`)
      if (!p) return ok('no encontrado')
      const preId = p.metadata?.preapproval_id ?? p.point_of_interaction?.transaction_data?.subscription_id
      const emp = await empresaDe(preId, p.external_reference)
      if (!emp || p.status !== 'approved') return ok('ignorado')
      const { error } = await admin.rpc('registrar_pago', {
        p_empresa: emp.id, p_monto: Number(p.transaction_amount ?? 0), p_moneda: p.currency_id === 'USD' ? 'USD' : 'ARS', p_meses: 1,
        p_origen: 'mercadopago', p_referencia: String(p.id), p_nota: null, p_estado: 'aprobado', p_detalle: { payment_id: p.id },
      })
      if (error) console.error('registrar_pago', error)
      return ok()
    }

    return ok('tipo ignorado')
  } catch (err) {
    console.error(err)
    // Mercado Pago reintenta si no respondemos 200
    return new Response('error', { status: 500 })
  }
})
