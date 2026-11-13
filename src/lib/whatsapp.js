// Utilidades de WhatsApp para Nunki (envío con un toque vía wa.me, sin costo).

// Normaliza un teléfono argentino al formato internacional que pide wa.me (549 + área + número).
export function normalizarTelefonoAR(telefono) {
  let d = String(telefono || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  // Quitar el "15" de celulares escritos a la antigua (ej: 11 15 2345 6789)
  if (d.length === 12 && d.slice(2, 4) === '15') d = d.slice(0, 2) + d.slice(4)
  if (d.length === 13 && d.slice(3, 5) === '15') d = d.slice(0, 3) + d.slice(5)
  if (d.length < 8) return ''
  return '549' + d
}

export function linkWhatsApp(telefono, texto) {
  const numero = normalizarTelefonoAR(telefono)
  const base = numero ? `https://wa.me/${numero}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(texto || '')}`
}

export const PLANTILLA_RECORDATORIO =
  'Hola {nombre}! Te recordamos tu turno de {servicio} el {dia} a las {hora} con {profesional} en {salon}. ¿Nos confirmás? Si no podés venir, avisanos así liberamos el lugar.'

export function armarRecordatorio(plantilla, datos) {
  return (plantilla || PLANTILLA_RECORDATORIO).replace(/\{(\w+)\}/g, (m, k) => (datos[k] ?? '').toString())
}

export function formatearDia(fecha) {
  return new Date(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
}

export function formatearHora(fecha) {
  return new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}
