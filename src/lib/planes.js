// Planes comerciales de Nunki.
// Visitantes de Argentina ven y pagan en pesos (precio final, IVA incluido);
// el resto del mundo, en dólares. Referencia: dólar oficial BNA ≈ $1.570 (nov 2026).
// Se usan en la landing, en el panel de superadministrador y en el alta de salones.

export const PLANES = [
  {
    id: 'esencial',
    nombre: 'Esencial',
    precios: { ARS: 25900, USD: 17 },
    extraProfesional: { ARS: 3900, USD: 3 },
    periodo: '/mes',
    sasha: 300,
    detalle: 'Todo el salón en un solo sistema. Hasta 5 profesionales.',
    items: [
      'Agenda y turnos por profesional',
      'Página de reserva online propia',
      'Recordatorios por WhatsApp con un toque, sin límite',
      'Comandas, caja diaria y cierres',
      'Comisiones y liquidaciones',
      'Stock, compras y proveedores',
      'Sasha, asistente con IA por voz: 300 consultas por mes',
    ],
  },
  {
    id: 'premium',
    nombre: 'Premium',
    precios: { ARS: 78900, USD: 50 },
    periodo: '/mes',
    sasha: 1500,
    destacado: true,
    detalle: 'Para salones que quieren que WhatsApp trabaje solo. Hasta 15 profesionales.',
    items: [
      'Todo lo del plan Esencial',
      'Sasha con 1.500 consultas por mes',
      'WhatsApp oficial de Meta con el número del salón',
      'Recordatorios y confirmaciones automáticas (300 mensajes/mes incluidos)',
      'Sasha responde consultas y agenda turnos por WhatsApp',
      'Campañas para recuperar clientes que dejaron de venir',
      'Varias sucursales en una misma cuenta',
      'Puesta en marcha y carga de datos hecha por nosotros',
    ],
    pronto: [
      'WhatsApp oficial de Meta con el número del salón',
      'Recordatorios y confirmaciones automáticas (300 mensajes/mes incluidos)',
      'Sasha responde consultas y agenda turnos por WhatsApp',
      'Campañas para recuperar clientes que dejaron de venir',
    ],
    extraTexto: 'Mensajes adicionales de Meta: al costo',
  },
]

export const PAQUETE_SASHA = { consultas: 200, precios: { ARS: 4900, USD: 3 } }

export const planPorId = (id) => PLANES.find((p) => p.id === id) || PLANES[0]

export const MONEDAS = ['ARS', 'USD']

// Argentina → pesos; cualquier otro país → dólares.
// Se puede forzar con ?moneda=USD o ?moneda=ARS en la dirección (útil para probar).
export function detectarMoneda() {
  try {
    const forzada = new URLSearchParams(window.location.search).get('moneda')?.toUpperCase()
    if (MONEDAS.includes(forzada)) return forzada
  } catch { /* sin window */ }
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (zona.startsWith('America/Argentina') || zona === 'America/Buenos_Aires') return 'ARS'
    if (zona) return 'USD'
  } catch { /* sin Intl */ }
  const idiomas = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || []
  return idiomas.some((l) => /-AR$/i.test(l || '')) ? 'ARS' : 'USD'
}

export const formatoPesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
export const formatoMonto = (n, moneda = 'ARS') =>
  moneda === 'USD' ? `USD ${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : formatoPesos(n)

export const precioPlan = (p, moneda = 'ARS') => p.precios[moneda] ?? p.precios.ARS
export const formatoPrecio = (p, moneda = 'ARS') => formatoMonto(precioPlan(p, moneda), moneda)

export const extraPlan = (p, moneda = 'ARS') =>
  p.extraProfesional ? `Profesional adicional: ${formatoMonto(p.extraProfesional[moneda], moneda)}/mes` : p.extraTexto

export const notaPrecios = (moneda = 'ARS') =>
  moneda === 'USD'
    ? 'Precios en dólares estadounidenses. Pueden aplicar impuestos de tu país.'
    : 'Precios finales en pesos, IVA incluido.'

export const PRUEBA_DIAS = 15
export const DESCUENTO_ANUAL = '2 meses sin cargo pagando el año'
