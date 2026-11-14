// Estado de la membresía del salón y pagos con Mercado Pago.
import { supabase } from './supabaseClient'
import { formatoMonto } from './planes'

export async function fetchMiEstadoPago() {
  const { data, error } = await supabase.rpc('mi_estado_pago')
  if (error) return null
  return data
}

export async function fetchMisPagos() {
  const { data, error } = await supabase.rpc('mis_pagos')
  if (error) return []
  return data || []
}

// Crea la suscripción mensual en Mercado Pago y devuelve el link para autorizar el débito
export async function iniciarSuscripcion({ email, empresaId, plan } = {}) {
  const { data, error } = await supabase.functions.invoke('nunki-mp-suscripcion', { body: { email, empresaId, plan } })
  if (error) {
    let msg = 'No se pudo iniciar el pago. Probá de nuevo en unos minutos.'
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if (!data?.url) throw new Error(data?.error || 'No se pudo iniciar el pago')
  return data.url
}

export const fechaLarga = (f) =>
  f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export const fechaCorta = (f) =>
  f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—'

const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

// Texto del aviso según el estado. Devuelve null si no hay nada que avisar.
export function textoAviso(ep) {
  if (!ep) return null
  switch (ep.estado) {
    case 'prueba':
      return { nivel: 'info', texto: `Te quedan ${dias(ep.dias_para_vencer)} de prueba gratis.` }
    case 'prueba_por_vencer':
      return { nivel: 'info', texto: ep.dias_para_vencer > 0 ? `Tu prueba gratis termina en ${dias(ep.dias_para_vencer)}. Activá el pago para no perder el acceso.` : 'Tu prueba gratis termina hoy. Activá el pago para no perder el acceso.' }
    case 'por_vencer':
      return { nivel: 'info', texto: `Tu membresía vence el ${fechaLarga(ep.vencimiento)}. Pagá por adelantado o activá el débito automático.` }
    case 'vencido':
      return {
        nivel: ep.dias_para_bloqueo <= 7 ? 'alerta' : 'aviso',
        texto: ep.en_prueba
          ? `Terminó tu prueba gratis. Tenés ${dias(ep.dias_para_bloqueo)} para activar el pago antes de que se suspenda el acceso.`
          : `Tenés un pago vencido hace ${dias(ep.dias_vencido)}. Si no se regulariza, el acceso se suspende el ${fechaLarga(ep.bloqueo_el)}.`,
      }
    default:
      return null
  }
}

export const precioTexto = (ep) => (ep ? `${formatoMonto(ep.precio, ep.moneda)}/mes` : '')
