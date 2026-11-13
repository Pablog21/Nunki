// Planes comerciales de Nunki. Esencial en pesos argentinos; Premium en dólares
// (se factura en pesos al tipo de cambio oficial del día). Precios finales, IVA incluido.
// Se usan en la landing y en el panel de superadministrador.

export const PLANES = [
  {
    id: 'esencial',
    nombre: 'Esencial',
    precio: 25900,
    moneda: 'ARS',
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
    extra: 'Profesional adicional: $3.900/mes',
  },
  {
    id: 'premium',
    nombre: 'Premium',
    precio: 50,
    moneda: 'USD',
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
    extra: 'Mensajes adicionales de Meta: al costo',
  },
]

export const planPorId = (id) => PLANES.find((p) => p.id === id) || PLANES[0]

export const PAQUETE_SASHA = { consultas: 200, precio_ars: 4900 }

export const formatoPrecio = (p) => (p.moneda === 'USD' ? `USD ${p.precio}` : formatoPesos(p.precio))

export const formatoPesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

export const PRUEBA_DIAS = 14
export const DESCUENTO_ANUAL = '2 meses sin cargo pagando el año'
export const NOTA_USD = 'El plan Premium se factura en pesos al tipo de cambio oficial del día.'
