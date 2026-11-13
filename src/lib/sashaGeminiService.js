import { supabase } from './supabaseClient'


/**
 * Invoca a Gemini solo a través de la Edge Function `nunki-sasha`.
 * La clave de Gemini vive en los secretos de Supabase y nunca llega al navegador.
 */
// Error especial cuando el salón llegó al tope de consultas de Sasha
export class SashaLimiteError extends Error {
  constructor(motivo, estado) {
    super(motivo === 'diario'
      ? 'Llegaste al máximo de consultas a Sasha por hoy. Mañana se renueva.'
      : 'El salón llegó al límite de consultas a Sasha de este mes.')
    this.name = 'SashaLimiteError'
    this.motivo = motivo
    this.estado = estado
  }
}

export async function callGemini(prompt, systemInstruction = '', history = [], empresaId = null) {
  const { data, error } = await supabase.functions.invoke('nunki-sasha', {
    body: { prompt, systemInstruction, temperature: 0.2, history, empresaId }
  })
  if (error) {
    console.error('Sasha no disponible:', error)
    throw new Error('Sasha no está disponible en este momento. Probá de nuevo en unos minutos.')
  }
  if (data?.bloqueado) throw new SashaLimiteError(data.motivo, data.estado)
  if (data?.error) throw new Error(data.error)
  return data
}

// Estado del cupo de Sasha del salón en el mes
export async function fetchUsoSasha(empresaId) {
  const { data, error } = await supabase.rpc('ia_estado', { p_empresa: empresaId })
  if (error) return null
  return data
}

// El administrador suma un paquete extra a su próxima factura
export async function comprarPaqueteSasha(empresaId) {
  const { data, error } = await supabase.rpc('ia_comprar_extra', { p_empresa: empresaId })
  if (error) throw new Error(error.message)
  return data
}

/**
 * Busca el historial de última visita de un cliente verificando comandas y turnos estrictamente
 */
export async function fetchUltimaVisitaCliente(empresaId, nombreClienteBuscado) {
  try {
    // 1. Buscar cliente
    const { data: clientes, error: errCli } = await supabase
      .from('clientes')
      .select('id, nombre, apellido, telefono, created_at')
      .eq('empresa_id', empresaId)

    if (errCli) throw errCli

    const matchedClient = findBestClientMatch(clientes, nombreClienteBuscado)

    if (!matchedClient) {
      return {
        encontrado: false,
        mensaje: `No encontré a ningún cliente en el sistema que coincida con "${nombreClienteBuscado}".`
      }
    }

    const clienteCompleto = `${matchedClient.nombre} ${matchedClient.apellido || ''}`.trim()
    const ahora = new Date()
    const ahoraIso = ahora.toISOString()

    // 2. Buscar comandas (órdenes de trabajo) facturadas/atendidas
    const { data: ordenes } = await supabase
      .from('ordenes_trabajo')
      .select('id, fecha_hora, total_economico, estado')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', matchedClient.id)
      .neq('estado', 'eliminada')
      .neq('estado', 'cancelada')
      .order('fecha_hora', { ascending: false })
      .limit(1)

    // 3. Buscar turnos futuros (próximos a partir de ahora)
    const { data: turnosFuturos } = await supabase
      .from('turnos')
      .select('id, fecha_hora_inicio, estado, notas, servicios(nombre), usuarios(nombre_completo)')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', matchedClient.id)
      .neq('estado', 'cancelado')
      .gte('fecha_hora_inicio', ahoraIso)
      .order('fecha_hora_inicio', { ascending: true })
      .limit(1)

    // 4. Buscar turnos pasados (anteriores a ahora)
    const { data: turnosPasados } = await supabase
      .from('turnos')
      .select('id, fecha_hora_inicio, estado, notas, servicios(nombre), usuarios(nombre_completo)')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', matchedClient.id)
      .neq('estado', 'cancelado')
      .lt('fecha_hora_inicio', ahoraIso)
      .order('fecha_hora_inicio', { ascending: false })
      .limit(1)

    const ultimaOrden = ordenes?.[0]
    const proximoTurno = turnosFuturos?.[0]
    const ultimoTurnoPasado = turnosPasados?.[0]

    // Formatear mensaje del próximo turno si existe
    let proximoTurnoTexto = ''
    if (proximoTurno) {
      const fFut = new Date(proximoTurno.fecha_hora_inicio)
      const fFutStr = fFut.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const hFutStr = fFut.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      const servFut = proximoTurno.servicios?.nombre || 'servicio'
      const colabFut = proximoTurno.usuarios?.nombre_completo ? ` con ${proximoTurno.usuarios.nombre_completo}` : ''
      proximoTurnoTexto = ` Tiene un turno próximo agendado para el ${fFutStr} a las ${hFutStr} hs para ${servFut}${colabFut}.`
    }

    // CASO 1: El cliente TIENE comandas registradas (visita real realizada y facturada)
    if (ultimaOrden) {
      const fechaUltima = new Date(ultimaOrden.fecha_hora)
      const diffMs = ahora - fechaUltima
      const diffDias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

      let tiempoTexto = ''
      if (diffDias === 0) {
        tiempoTexto = 'hoy mismo'
      } else if (diffDias === 1) {
        tiempoTexto = 'ayer'
      } else if (diffDias < 7) {
        tiempoTexto = `hace ${diffDias} días`
      } else if (diffDias < 30) {
        const semanas = Math.floor(diffDias / 7)
        tiempoTexto = `hace ${semanas} ${semanas === 1 ? 'semana' : 'semanas'} (unos ${diffDias} días)`
      } else {
        const meses = Math.floor(diffDias / 30)
        tiempoTexto = `hace ${meses} ${meses === 1 ? 'mes' : 'meses'} (unos ${diffDias} días)`
      }

      const fechaFormateada = fechaUltima.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })

      const montoTexto = ultimaOrden.total_economico ? ` con una comanda por $${Number(ultimaOrden.total_economico).toLocaleString('es-AR')}` : ''

      return {
        encontrado: true,
        cliente: matchedClient,
        tieneComandas: true,
        diasTranscurridos: diffDias,
        fechaFormateada,
        tiempoTexto,
        mensaje: `${clienteCompleto} vino por última vez ${tiempoTexto} (${fechaFormateada})${montoTexto}.${proximoTurnoTexto ? proximoTurnoTexto : ''}`
      }
    }

    // CASO 2: El cliente NO tiene comandas, pero tiene un turno futuro
    if (proximoTurno) {
      return {
        encontrado: true,
        cliente: matchedClient,
        tieneComandas: false,
        tieneProximoTurno: true,
        mensaje: `${clienteCompleto} no registra comandas en el salón (aún no ha tenido visitas facturadas).${proximoTurnoTexto}`
      }
    }

    // CASO 3: El cliente NO tiene comandas, pero tuvo un turno pasado no completado en comanda
    if (ultimoTurnoPasado) {
      const fPas = new Date(ultimoTurnoPasado.fecha_hora_inicio)
      const fPasStr = fPas.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const servPas = ultimoTurnoPasado.servicios?.nombre || 'servicio'
      const colabPas = ultimoTurnoPasado.usuarios?.nombre_completo ? ` con ${ultimoTurnoPasado.usuarios.nombre_completo}` : ''
      return {
        encontrado: true,
        cliente: matchedClient,
        tieneComandas: false,
        mensaje: `${clienteCompleto} no registra comandas cargadas en el salón. Tuvo un turno agendado el ${fPasStr} para ${servPas}${colabPas}, pero no se emitió comanda de trabajo.`
      }
    }

    // CASO 4: Registrado/a sin comandas ni turnos
    return {
      encontrado: true,
      cliente: matchedClient,
      tieneComandas: false,
      mensaje: `${clienteCompleto} está registrado/a en el sistema, pero no registra comandas ni turnos anteriores en el salón.`
    }
  } catch (error) {
    console.error('Error buscando última visita:', error)
    return {
      encontrado: false,
      mensaje: `Ocurrió un error al consultar el historial de visitas: ${error.message}`
    }
  }
}

/**
 * Busca qué fue lo último que se le realizó a un cliente
 */
export async function fetchUltimoServicioCliente(empresaId, nombreClienteBuscado) {
  try {
    // 1. Buscar cliente
    const { data: clientes, error: errCli } = await supabase
      .from('clientes')
      .select('id, nombre, apellido, notas')
      .eq('empresa_id', empresaId)

    if (errCli) throw errCli

    const matchedClient = findBestClientMatch(clientes, nombreClienteBuscado)

    if (!matchedClient) {
      return {
        encontrado: false,
        mensaje: `No encontré al cliente "${nombreClienteBuscado}" en el sistema.`
      }
    }

    const clienteCompleto = `${matchedClient.nombre} ${matchedClient.apellido || ''}`.trim()
    const ahoraIso = new Date().toISOString()

    // 2. Buscar última orden con sus detalles
    const { data: ordenes, error: errOrd } = await supabase
      .from('ordenes_trabajo')
      .select(`
        id, fecha_hora, total_economico, notas,
        usuarios (nombre_completo),
        ordenes_trabajo_detalles (
          tipo_item, cantidad, precio_unitario, subtotal,
          articulo_id, servicio_id,
          articulos (nombre),
          servicios (nombre)
        )
      `)
      .eq('empresa_id', empresaId)
      .eq('cliente_id', matchedClient.id)
      .neq('estado', 'eliminada')
      .neq('estado', 'cancelada')
      .order('fecha_hora', { ascending: false })
      .limit(1)

    if (errOrd) throw errOrd

    // 3. Buscar turnos futuros y pasados
    const [resFuturos, resPasados] = await Promise.all([
      supabase
        .from('turnos')
        .select('id, fecha_hora_inicio, estado, notas, servicios(nombre), usuarios(nombre_completo)')
        .eq('empresa_id', empresaId)
        .eq('cliente_id', matchedClient.id)
        .neq('estado', 'cancelado')
        .gte('fecha_hora_inicio', ahoraIso)
        .order('fecha_hora_inicio', { ascending: true })
        .limit(1),
      supabase
        .from('turnos')
        .select('id, fecha_hora_inicio, estado, notas, servicios(nombre), usuarios(nombre_completo)')
        .eq('empresa_id', empresaId)
        .eq('cliente_id', matchedClient.id)
        .neq('estado', 'cancelado')
        .lt('fecha_hora_inicio', ahoraIso)
        .order('fecha_hora_inicio', { ascending: false })
        .limit(1)
    ])

    const ultimaOrden = ordenes?.[0]
    const proximoTurno = resFuturos.data?.[0]
    const ultimoTurnoPasado = resPasados.data?.[0]

    let proximoTurnoTexto = ''
    if (proximoTurno) {
      const fFut = new Date(proximoTurno.fecha_hora_inicio)
      const fFutStr = fFut.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const hFutStr = fFut.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      const servFut = proximoTurno.servicios?.nombre || 'servicio'
      const colabFut = proximoTurno.usuarios?.nombre_completo ? ` con ${proximoTurno.usuarios.nombre_completo}` : ''
      proximoTurnoTexto = ` Para su próxima visita tiene agendado turno el ${fFutStr} (${hFutStr} hs) para ${servFut}${colabFut}.`
    }

    // CASO 1: Tiene comanda con detalles registrados
    if (ultimaOrden && ultimaOrden.ordenes_trabajo_detalles?.length > 0) {
      const fecha = new Date(ultimaOrden.fecha_hora).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })

      const items = ultimaOrden.ordenes_trabajo_detalles.map(d => {
        const nombreItem = d.tipo_item === 'servicio' 
          ? (d.servicios?.nombre || 'Servicio')
          : (d.articulos?.nombre || 'Producto')
        return `${d.cantidad > 1 ? `${d.cantidad}x ` : ''}${nombreItem} ($${Number(d.precio_unitario || 0).toLocaleString('es-AR')})`
      })

      const responsable = ultimaOrden.usuarios?.nombre_completo ? ` Atendido/a por ${ultimaOrden.usuarios.nombre_completo}.` : ''
      const notas = ultimaOrden.notas ? ` Notas: "${ultimaOrden.notas}".` : ''

      return {
        encontrado: true,
        cliente: matchedClient,
        fecha,
        items,
        total: ultimaOrden.total_economico,
        mensaje: `En su última visita (${fecha}), a ${clienteCompleto} se le realizó: ${items.join(', ')}. Total: $${Number(ultimaOrden.total_economico || 0).toLocaleString('es-AR')}.${responsable}${notas}${proximoTurnoTexto}`
      }
    }

    // CASO 2: NO tiene comandas, pero tiene turno próximo agendado
    if (proximoTurno) {
      const fFut = new Date(proximoTurno.fecha_hora_inicio)
      const fFutStr = fFut.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const hFutStr = fFut.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      const servFut = proximoTurno.servicios?.nombre || 'servicio'
      const colabFut = proximoTurno.usuarios?.nombre_completo ? ` con ${proximoTurno.usuarios.nombre_completo}` : ''
      return {
        encontrado: true,
        cliente: matchedClient,
        mensaje: `${clienteCompleto} aún no tiene comandas registradas de trabajos realizados en el salón. Tiene agendado un próximo turno para el ${fFutStr} a las ${hFutStr} hs para ${servFut}${colabFut}.`
      }
    }

    // CASO 3: NO tiene comandas, pero tuvo un turno previo
    if (ultimoTurnoPasado) {
      const fPas = new Date(ultimoTurnoPasado.fecha_hora_inicio)
      const fPasStr = fPas.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const servPas = ultimoTurnoPasado.servicios?.nombre || 'servicio'
      const colabPas = ultimoTurnoPasado.usuarios?.nombre_completo ? ` con ${ultimoTurnoPasado.usuarios.nombre_completo}` : ''
      return {
        encontrado: true,
        cliente: matchedClient,
        mensaje: `${clienteCompleto} no registra comandas con servicios realizados. Su último agendamiento previo fue el ${fPasStr} para ${servPas}${colabPas}, pero no se emitió comanda.`
      }
    }

    return {
      encontrado: true,
      cliente: matchedClient,
      mensaje: `${clienteCompleto} no tiene registros de servicios ni compras previas en el sistema.`
    }
  } catch (error) {
    console.error('Error buscando último servicio:', error)
    return {
      encontrado: false,
      mensaje: `Error al consultar el último servicio: ${error.message}`
    }
  }
}

/**
 * Consulta resumen de comandas del salón
 */
export async function fetchResumenComandas(empresaId, tipo = 'hoy') {
  try {
    const ahora = new Date()
    let startIso = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0).toISOString()
    let endIso = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999).toISOString()

    if (tipo === 'semana') {
      const primerDiaSemana = new Date(ahora)
      primerDiaSemana.setDate(ahora.getDate() - ahora.getDay())
      primerDiaSemana.setHours(0, 0, 0, 0)
      startIso = primerDiaSemana.toISOString()
    }

    const { data: ordenes, error } = await supabase
      .from('ordenes_trabajo')
      .select('id, total_economico, estado, pago_estado, fecha_hora, clientes(nombre, apellido)')
      .eq('empresa_id', empresaId)
      .neq('estado', 'eliminada')
      .neq('estado', 'cancelada')
      .gte('fecha_hora', startIso)
      .lte('fecha_hora', endIso)

    if (error) throw error

    const cantidad = ordenes?.length || 0
    const totalMonto = (ordenes || []).reduce((acc, o) => acc + (Number(o.total_economico) || 0), 0)
    const pendientesCobro = (ordenes || []).filter(o => o.pago_estado === 'pendiente')

    const periodoTexto = tipo === 'semana' ? 'esta semana' : 'el día de hoy'

    return {
      cantidad,
      totalMonto,
      pendientesCobro: pendientesCobro.length,
      mensaje: `Para ${periodoTexto} se registran ${cantidad} comanda(s) con un total facturado de $${totalMonto.toLocaleString('es-AR')}.${pendientesCobro.length > 0 ? ` Hay ${pendientesCobro.length} comanda(s) pendientes de cobro.` : ''}`
    }
  } catch (error) {
    console.error('Error consultando comandas:', error)
    return {
      mensaje: `Error al consultar las comandas: ${error.message}`
    }
  }
}

/**
 * Procesa la instrucción de audio o texto del usuario mediante Sasha (Gemini)
 * Manteniendo hilo conversacional, memoria de cliente activo y contexto dialogal.
 */
export async function procesarMensajeSasha({
  prompt,
  catalog,
  conversationHistory = [],
  activeClientContext = null,
  pendingIntent = null
}) {
  const { clientes = [], servicios = [], articulos = [], colaboradores = [], activeEmpresaId } = catalog
  const now = new Date()
  const nowFormatted = now.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const clientesList = clientes.slice(0, 150).map(c => `ID:${c.id} | ${c.nombre} ${c.apellido || ''} | Tel:${c.telefono || 'sin tel'}`).join('\n')
  const serviciosList = servicios.map(s => `ID:${s.id} | ${s.nombre} | $${s.precio || 0}`).join('\n')
  const articulosList = articulos.slice(0, 100).map(a => `ID:${a.id} | ${a.nombre} | $${a.precio_venta || 0}`).join('\n')
  const colabsList = colaboradores.map(c => `ID:${c.id} | ${c.nombre_completo} (${c.rol})`).join('\n')

  // Formatear historial reciente para el prompt
  const recentHistoryText = (conversationHistory || [])
    .filter(m => m.id !== 'welcome')
    .slice(-6)
    .map(m => `${m.sender === 'user' ? 'Usuario' : 'Sasha'}: "${m.text}"`)
    .join('\n')

  const clientContextText = activeClientContext
    ? `${activeClientContext.nombreCompleto} (ID: ${activeClientContext.id || 'N/A'})`
    : 'Ningún cliente en contexto en este momento'

  const pendingIntentText = pendingIntent
    ? `Intención pendiente de respuesta: '${pendingIntent}'`
    : 'Ninguna'

  const systemInstruction = `
Eres "Sasha", la asistente de inteligencia artificial para el salón de belleza y peluquería o barbería que usa Nunki.
Eres atenta, profesional, eficiente y cálida.

Fecha y hora actual del salón: ${nowFormatted} (Hoy es ${todayIso}).

MEMORIA CONVERSACIONAL Y CONTEXTO ACTIVO:
- Cliente actualmente en foco/conversación: ${clientContextText}
- ${pendingIntentText}

HISTORIAL DE DIÁLOGO RECIENTE:
${recentHistoryText || 'Inicio de conversación'}

REGLAS CRÍTICAS DE NEGOCIO Y SEGUIMIENTO CONVERSACIONAL:
1. SEGUIMIENTO DEL HILO (MEMORIA):
   - Si el usuario hace preguntas de seguimiento como "¿Qué se hizo?", "¿Cuándo vino?", "¿Tiene turno?", "Agendala/o", "Cargale una comanda", o preguntas sin especificar el nombre del cliente, DEBES APLICAR LA CONSULTA AL CLIENTE EN CONTEXTO ACTUAL (${clientContextText}).
   - Si el asistente preguntó antes "¿De qué cliente te gustaría consultar...?" y el usuario responde con un nombre (ej: "De Soledad Lafuente" o "Ana"), RECONOCE que está completando la intención previa (ej: si se había preguntado "¿Qué se hizo?", la intención sigue siendo 'consultar_ultimo_servicio' para ese cliente).
   - Si el usuario menciona un nuevo cliente (ej: "Y Ana Martín?"), cambia el cliente de búsqueda a ese nuevo cliente.
2. AGENDAR TURNOS / CARGAR COMANDAS:
   - Extrae y estructura los datos para mostrarlos en pantalla al usuario para que los valide y confirme. NUNCA digas que ya se guardó de forma definitiva; di que has preparado el borrador en pantalla para que lo revise y confirme con un clic.
   - Si un cliente no está en la lista de clientes existentes, trátalo como cliente nuevo (es_cliente_nuevo = true).
   - Interpreta fechas y horarios relativos de forma inteligente (ej: "mañana", "este viernes", "a las 4 de la tarde" -> 16:00).
3. CONSULTAS DE HISTORIAL DE CLIENTES:
   - "hace cuanto no viene X", "cuando vino", "ultima visita": intención 'consultar_ultima_visita'.
   - "que se hizo", "que fue lo ultimo que le hicimos", "ultimo servicio": intención 'consultar_ultimo_servicio'.
   - "cuanto facturamos", "comandas de hoy", "resumen de ventas": intención 'consultar_comandas'.

CATÁLOGO ACTUAL DEL SALÓN:
--- CLIENTES REGISTRADOS ---
${clientesList || 'Sin clientes aún'}

--- SERVICIOS DISPONIBLES ---
${serviciosList || 'Sin servicios cargados'}

--- PRODUCTOS / ARTÍCULOS ---
${articulosList || 'Sin artículos cargados'}

--- ESTILISTAS / COLABORADORES ---
${colabsList || 'Sin colaboradores'}

DEBES RESPONDER EXCLUSIVAMENTE CON UN OBJETO JSON con la siguiente estructura:
{
  "intencion": "proponer_turno" | "proponer_comanda" | "consultar_ultima_visita" | "consultar_ultimo_servicio" | "consultar_comandas" | "conversacion_general",
  "mensaje_sasha": "Texto que Sasha le dirá al usuario por pantalla y por audio",
  "datos": {
    "turno": {
      "cliente_id": "UUID o null",
      "cliente_nombre": "Nombre y apellido",
      "cliente_telefono": "Teléfono o vacio",
      "es_cliente_nuevo": false,
      "servicio_id": "UUID o null",
      "servicio_nombre": "Nombre servicio",
      "colaborador_id": "UUID o null",
      "colaborador_nombre": "Nombre estilista",
      "fecha": "YYYY-MM-DD",
      "hora_inicio": "HH:mm",
      "hora_fin": "HH:mm",
      "notas": ""
    },
    "comanda": {
      "cliente_id": "UUID o null",
      "cliente_nombre": "Nombre cliente",
      "usuario_responsable_id": "UUID o null",
      "usuario_responsable_nombre": "Nombre estilista",
      "items": [
        {
          "tipo_item": "servicio",
          "item_id": "UUID",
          "nombre": "Nombre del item",
          "cantidad": 1,
          "precio_unitario": 15000
        }
      ],
      "total": 15000,
      "notas": ""
    },
    "nombre_cliente_busqueda": "Nombre cliente buscado o nombre del cliente en contexto",
    "tipo_consulta_comanda": "hoy" | "semana"
  }
}
`

  const responseJson = await callGemini(prompt, systemInstruction, conversationHistory, activeEmpresaId)

  // Salvaguardas lógicas para el hilo conversacional:
  // 1. Si la intención es consultar servicio o visita y el modelo no especificó nombre o usó pronombres, usar el cliente en contexto
  if (
    (responseJson.intencion === 'consultar_ultimo_servicio' || responseJson.intencion === 'consultar_ultima_visita') &&
    activeClientContext &&
    (!responseJson.datos?.nombre_cliente_busqueda ||
      ['ella', 'el', 'él', 'cliente', 'el cliente', 'la clienta', 'esta clienta'].includes(
        responseJson.datos.nombre_cliente_busqueda.toLowerCase().trim()
      ))
  ) {
    if (!responseJson.datos) responseJson.datos = {}
    responseJson.datos.nombre_cliente_busqueda = activeClientContext.nombreCompleto
  }

  // 2. Si había una intención pendiente de saber qué se hizo ('consultar_ultimo_servicio') y el usuario respondió con un nombre
  if (
    pendingIntent === 'consultar_ultimo_servicio' &&
    responseJson.intencion !== 'consultar_ultimo_servicio' &&
    responseJson.datos?.nombre_cliente_busqueda
  ) {
    responseJson.intencion = 'consultar_ultimo_servicio'
  }

  let clienteIdentificado = null

  // Ejecución dinámica de consultas de base de datos
  if (responseJson.intencion === 'consultar_ultima_visita' && responseJson.datos?.nombre_cliente_busqueda) {
    const resVisita = await fetchUltimaVisitaCliente(activeEmpresaId, responseJson.datos.nombre_cliente_busqueda)
    responseJson.mensaje_sasha = resVisita.mensaje
    responseJson.datos.resultado_visita = resVisita
    if (resVisita.cliente) {
      clienteIdentificado = {
        id: resVisita.cliente.id,
        nombre: resVisita.cliente.nombre,
        apellido: resVisita.cliente.apellido || '',
        nombreCompleto: `${resVisita.cliente.nombre} ${resVisita.cliente.apellido || ''}`.trim()
      }
    }
  } else if (responseJson.intencion === 'consultar_ultimo_servicio' && responseJson.datos?.nombre_cliente_busqueda) {
    const resServicio = await fetchUltimoServicioCliente(activeEmpresaId, responseJson.datos.nombre_cliente_busqueda)
    responseJson.mensaje_sasha = resServicio.mensaje
    responseJson.datos.resultado_servicio = resServicio
    if (resServicio.cliente) {
      clienteIdentificado = {
        id: resServicio.cliente.id,
        nombre: resServicio.cliente.nombre,
        apellido: resServicio.cliente.apellido || '',
        nombreCompleto: `${resServicio.cliente.nombre} ${resServicio.cliente.apellido || ''}`.trim()
      }
    }
  } else if (responseJson.intencion === 'consultar_comandas') {
    const tipo = responseJson.datos?.tipo_consulta_comanda || 'hoy'
    const resComandas = await fetchResumenComandas(activeEmpresaId, tipo)
    responseJson.mensaje_sasha = resComandas.mensaje
    responseJson.datos.resultado_comandas = resComandas
  } else if (responseJson.intencion === 'proponer_turno' && responseJson.datos?.turno?.cliente_nombre) {
    const matched = findBestClientMatch(clientes, responseJson.datos.turno.cliente_nombre)
    if (matched) {
      clienteIdentificado = {
        id: matched.id,
        nombre: matched.nombre,
        apellido: matched.apellido || '',
        nombreCompleto: `${matched.nombre} ${matched.apellido || ''}`.trim()
      }
    }
  } else if (responseJson.intencion === 'proponer_comanda' && responseJson.datos?.comanda?.cliente_nombre) {
    const matched = findBestClientMatch(clientes, responseJson.datos.comanda.cliente_nombre)
    if (matched) {
      clienteIdentificado = {
        id: matched.id,
        nombre: matched.nombre,
        apellido: matched.apellido || '',
        nombreCompleto: `${matched.nombre} ${matched.apellido || ''}`.trim()
      }
    }
  }

  if (clienteIdentificado) {
    responseJson.cliente_identificado = clienteIdentificado
  }

  return responseJson
}

