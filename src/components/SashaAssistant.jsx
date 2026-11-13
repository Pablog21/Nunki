import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { procesarMensajeSasha, fetchResumenComandas, SashaLimiteError, fetchUsoSasha, comprarPaqueteSasha } from '../lib/sashaGeminiService'
import { useNavigate } from 'react-router-dom'
import SashaFace from './SashaFace'
import { esAdmin } from '../lib/roles'
import { formatoMonto } from '../lib/planes'
import { 
  Mic, MicOff, Send, X, Minimize2, 
  Volume2, VolumeX, Calendar, Check, Trash2, 
  FileText, Clock, User, Scissors, AlertCircle, Plus, Sliders
} from 'lucide-react'
import './SashaAssistant.css'

export default function SashaAssistant() {
  const { userProfile, activeEmpresaId } = useAuth()

  // Window state
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const saludoHechoRef = useRef(false)
  const navigate = useNavigate()
  const [availableVoices, setAvailableVoices] = useState([])
  const [selectedVoiceName, setSelectedVoiceName] = useState('')
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)

  // Messages & Input
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy Sasha, tu asistente. Estoy mirando cómo viene el día…'
    }
  ])
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingError, setRecordingError] = useState(null)
  const [activeClientContext, setActiveClientContext] = useState(null)
  const [pendingIntent, setPendingIntent] = useState(null)

  // Catalogs
  const [catalog, setCatalog] = useState({
    clientes: [],
    servicios: [],
    articulos: [],
    colaboradores: [],
    activeEmpresaId: null
  })

  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)

  // Escuchar eventos para abrir a Sasha desde cualquier parte de la app
  useEffect(() => {
    const handleOpenSasha = (e) => {
      setIsOpen(true)
      setIsMinimized(false)
      if (e?.detail?.prompt) {
        handleSendMessage(e.detail.prompt)
      }
    }
    window.addEventListener('open-sasha', handleOpenSasha)
    return () => window.removeEventListener('open-sasha', handleOpenSasha)
  }, [catalog])

  // Cargar catálogos reactivamente según el salón activo
  useEffect(() => {
    if (!activeEmpresaId) return

    const loadCatalog = async () => {
      try {
        const [resCli, resSer, resArt, resCol] = await Promise.all([
          supabase.from('clientes').select('id, nombre, apellido, telefono').eq('empresa_id', activeEmpresaId).order('nombre'),
          supabase.from('servicios').select('id, nombre, precio, tiempo_aprox_minutos').eq('empresa_id', activeEmpresaId).order('nombre'),
          supabase.from('articulos').select('id, nombre, precio_venta, precio_costo').eq('empresa_id', activeEmpresaId).order('nombre'),
          supabase.from('usuarios').select('id, nombre_completo, rol, comision_servicios, comision_productos').eq('empresa_id', activeEmpresaId).order('nombre_completo')
        ])

        setCatalog({
          clientes: resCli.data || [],
          servicios: resSer.data || [],
          articulos: resArt.data || [],
          colaboradores: resCol.data || [],
          activeEmpresaId
        })
      } catch (err) {
        console.error('Error cargando catálogos para Sasha:', err)
      }
    }

    loadCatalog()
  }, [activeEmpresaId])

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isProcessing])

  // Inicializar Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const recog = new SpeechRecognition()
      recog.continuous = false
      recog.interimResults = false
      recog.lang = 'es-AR'

      recog.onstart = () => {
        setIsRecording(true)
        setRecordingError(null)
      }

      recog.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setIsRecording(false)
        if (transcript) {
          handleSendMessage(transcript)
        }
      }

      recog.onerror = (event) => {
        console.warn('Speech recognition error:', event.error)
        setIsRecording(false)
        if (event.error === 'not-allowed') {
          setRecordingError('Permiso de micrófono denegado. Permite el acceso al micrófono en tu navegador.')
        } else {
          setRecordingError(`Error de micrófono: ${event.error}`)
        }
      }

      recog.onend = () => {
        setIsRecording(false)
      }

      recognitionRef.current = recog
    }
  }, [catalog])

  // Cargar y auto-seleccionar la mejor voz neuronal disponible
  useEffect(() => {
    if (!('speechSynthesis' in window)) return

    const loadBestVoice = () => {
      const allVoices = window.speechSynthesis.getVoices() || []
      const esVoices = allVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'))
      setAvailableVoices(esVoices)

      // 1. Filtrar voces neuronales / naturales (Chrome y Edge) y descartar voces 'desktop' antiguas
      const naturalVoices = esVoices.filter(v => {
        const n = v.name.toLowerCase()
        return (n.includes('natural') || n.includes('neural') || n.includes('online')) && !n.includes('desktop')
      })

      // Priorizar voces femeninas cálidas (Paloma, Salome, Elvira, Dalia, Elena, Camila, Sofia, Paulina)
      const bestFemale = naturalVoices.find(v => {
        const n = v.name.toLowerCase()
        return n.includes('paloma') || n.includes('salome') || n.includes('elvira') || 
               n.includes('dalia') || n.includes('elena') || n.includes('camila') || 
               n.includes('sofia') || n.includes('paulina') || n.includes('female')
      }) || naturalVoices[0]

      if (bestFemale) {
        setSelectedVoiceName(bestFemale.name)
        return
      }

      // 2. Voces neuronales de Google en Chrome ("Google español", etc.)
      const googleVoice = esVoices.find(v => v.name.toLowerCase().includes('google'))
      if (googleVoice) {
        setSelectedVoiceName(googleVoice.name)
        return
      }

      // 3. Cualquier voz que no sea el sintetizador 'Desktop' de Windows
      const nonDesktop = esVoices.find(v => !v.name.toLowerCase().includes('desktop'))
      if (nonDesktop) {
        setSelectedVoiceName(nonDesktop.name)
        return
      }

      // 4. Fallback a la primera en español disponible
      if (esVoices.length > 0) {
        setSelectedVoiceName(esVoices[0].name)
      }
    }

    loadBestVoice()
    window.speechSynthesis.onvoiceschanged = loadBestVoice
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  // Reproducir voz de Sasha mediante SpeechSynthesis optimizado
  const speakText = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel() // Detener audio previo si había

      // Limpieza fonética para entonación humana natural
      let clean = text
        .replace(/[*#_~`]/g, '') // Quitar markdown
        .replace(/\$([0-9.,]+)/g, '$1 pesos') // Pronunciar montos en pesos
        .replace(/\bhs\b/gi, 'horas')
        .replace(/\bmin\b/gi, 'minutos')
        .replace(/[📊📅🧾⏱️💇✓✕✨!¡?¿]/g, '') // Quitar emojis y signos abruptos
        .replace(/\s+/g, ' ')
        .trim()

      const utterance = new SpeechSynthesisUtterance(clean)
      utterance.lang = 'es-AR'
      
      const voices = window.speechSynthesis.getVoices() || []
      const chosen = voices.find(v => v.name === selectedVoiceName) || 
                     voices.find(v => v.lang.startsWith('es') && !v.name.toLowerCase().includes('desktop')) ||
                     voices.find(v => v.lang.startsWith('es'))

      if (chosen) {
        utterance.voice = chosen
      }

      // Cadencia y tono conversacional más cálido y pausado
      utterance.rate = 0.96  // Ligeramente más pausado para eliminar efecto metálico
      utterance.pitch = 1.02 // Entonación cálida

      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.warn('Error en síntesis de voz:', e)
    }
  }

  // Toggle Grabación de Micrófono
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta reconocimiento de voz nativo (Web Speech API). Recomendamos usar Google Chrome o Edge.')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
    } else {
      setRecordingError(null)
      try {
        recognitionRef.current.start()
      } catch (e) {
        console.error('Error starting recognition:', e)
      }
    }
  }

  // Enviar consulta o instrucción a Sasha
  const handleSendMessage = async (textToSend = inputText, { reintento = false } = {}) => {
    const query = (typeof textToSend === 'string' ? textToSend : inputText).trim()
    if (!query || isProcessing) return

    setInputText('')
    setRecordingError(null)

    // Agregar mensaje del usuario (no se repite cuando reintentamos tras desbloquear)
    const userMsgId = Date.now().toString()
    if (!reintento) setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: query }])
    setIsProcessing(true)

    try {
      const response = await procesarMensajeSasha({
        prompt: query,
        catalog,
        conversationHistory: messages.slice(-8),
        activeClientContext,
        pendingIntent
      })

      // Actualizar memoria conversacional del cliente activo
      if (response.cliente_identificado) {
        setActiveClientContext(response.cliente_identificado)
      } else if (response.datos?.turno?.cliente_nombre) {
        setActiveClientContext({
          id: response.datos.turno.cliente_id || null,
          nombreCompleto: response.datos.turno.cliente_nombre
        })
      } else if (response.datos?.comanda?.cliente_nombre) {
        setActiveClientContext({
          id: response.datos.comanda.cliente_id || null,
          nombreCompleto: response.datos.comanda.cliente_nombre
        })
      }

      // Seguimiento de intención pendiente si Sasha pidió aclaración de nombre
      if (response.mensaje_sasha && response.mensaje_sasha.toLowerCase().includes('último servicio realizado? por favor dime su nombre')) {
        setPendingIntent('consultar_ultimo_servicio')
      } else if (response.mensaje_sasha && response.mensaje_sasha.toLowerCase().includes('última visita? por favor dime su nombre')) {
        setPendingIntent('consultar_ultima_visita')
      } else {
        setPendingIntent(null)
      }

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: response.mensaje_sasha || 'He procesado tu solicitud.',
        intencion: response.intencion,
        previewData: null
      }

      // Si la intención es proponer un turno o comanda, agregamos el borrador interactivo
      if (response.intencion === 'proponer_turno' && response.datos?.turno) {
        const now = new Date()
        const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        assistantMsg.previewData = {
          tipo: 'turno',
          data: {
            ...response.datos.turno,
            cliente_id: response.datos.turno.cliente_id || '',
            servicio_id: response.datos.turno.servicio_id || '',
            colaborador_id: response.datos.turno.colaborador_id || '',
            fecha: response.datos.turno.fecha || localToday,
            hora_inicio: response.datos.turno.hora_inicio || '10:00',
            hora_fin: response.datos.turno.hora_fin || '11:00',
            notas: response.datos.turno.notas || ''
          },
          status: 'pending' // pending | confirmed | discarded
        }
      } else if (response.intencion === 'proponer_comanda' && response.datos?.comanda) {
        assistantMsg.previewData = {
          tipo: 'comanda',
          data: {
            ...response.datos.comanda,
            cliente_id: response.datos.comanda.cliente_id || '',
            usuario_responsable_id: response.datos.comanda.usuario_responsable_id || '',
            items: (response.datos.comanda.items || []).map((it, idx) => ({
              id_temp: Date.now() + idx,
              tipo_item: it.tipo_item || 'servicio',
              item_id: it.item_id || '',
              nombre: it.nombre || 'Item',
              cantidad: Number(it.cantidad) || 1,
              precio_unitario: Number(it.precio_unitario) || 0
            })),
            notas: response.datos.comanda.notas || ''
          },
          status: 'pending'
        }
      }

      setMessages(prev => [...prev, assistantMsg])
      speakText(assistantMsg.text)
    } catch (err) {
      if (err instanceof SashaLimiteError) {
        const est = err.estado || {}
        const paq = est.paquete || {}
        const puedeSumar = err.motivo === 'mensual' && esAdmin(userProfile)
        const texto = err.motivo === 'diario'
          ? err.message
          : `Llegamos al límite de ${est.limite ?? ''} consultas de este mes, así que por ahora no puedo responder. ` +
            (puedeSumar
              ? `Si querés, sumás ${paq.consultas} consultas más por ${formatoMonto(paq.precio, paq.moneda)} en tu próxima factura y sigo al instante.`
              : 'Pedile al administrador del salón que sume más consultas.')
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: texto,
          limite: { motivo: err.motivo, estado: est, query, puedeSumar, status: 'pendiente' },
        }])
        speakText(texto)
        return
      }
      console.error('Error procesando mensaje con Sasha:', err)
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `Lo siento, ocurrió un error al procesar tu solicitud: ${err.message}`
      }
      setMessages(prev => [...prev, errorMsg])
      speakText('Ocurrió un error al procesar tu solicitud.')
    } finally {
      setIsProcessing(false)
    }
  }

  // =========================================================================
  // ACCIONES DE VALIDACIÓN Y CONFIRMACIÓN EN PANTALLA
  // =========================================================================

  // Guardar Turno validado en la base de datos
  const handleConfirmTurno = async (messageId, turnoData) => {
    try {
      if (!activeEmpresaId) throw new Error('No hay salón activo seleccionado.')
      if (!turnoData.fecha || !turnoData.hora_inicio || !turnoData.hora_fin) {
        alert('Por favor especifica fecha y horarios válidos.')
        return
      }

      const [year, month, day] = turnoData.fecha.split('-').map(Number)
      const [startH, startM] = turnoData.hora_inicio.split(':').map(Number)
      const [endH, endM] = turnoData.hora_fin.split(':').map(Number)
      const startDateTime = new Date(year, month - 1, day, startH, startM, 0, 0)
      const endDateTime = new Date(year, month - 1, day, endH, endM, 0, 0)

      // Manejo de cliente nuevo vs existente
      let finalClienteId = turnoData.cliente_id || null
      let nombreRapido = null

      if (!finalClienteId) {
        if (turnoData.cliente_nombre) {
          // Si especificó nombre pero no existía en BD, podemos crearlo o ponerlo como cliente_nombre_rapido
          if (turnoData.cliente_telefono) {
            // Creamos el cliente en la tabla clientes
            const { data: nuevoCli, error: errCli } = await supabase
              .from('clientes')
              .insert([{
                empresa_id: activeEmpresaId,
                nombre: turnoData.cliente_nombre,
                telefono: turnoData.cliente_telefono,
                tipo_cliente: 'nuevo'
              }])
              .select()

            if (!errCli && nuevoCli?.[0]) {
              finalClienteId = nuevoCli[0].id
            } else {
              nombreRapido = turnoData.cliente_nombre
            }
          } else {
            nombreRapido = turnoData.cliente_nombre
          }
        }
      }

      const turnoPayload = {
        empresa_id: activeEmpresaId,
        cliente_id: finalClienteId,
        cliente_nombre_rapido: nombreRapido,
        colaborador_id: turnoData.colaborador_id || null,
        servicio_id: turnoData.servicio_id || null,
        fecha_hora_inicio: startDateTime.toISOString(),
        fecha_hora_fin: endDateTime.toISOString(),
        notas: turnoData.notas ? `[Sasha AI] ${turnoData.notas}` : '[Sasha AI]',
        estado: 'Pendiente'
      }

      const { data, error } = await supabase
        .from('turnos')
        .insert([turnoPayload])
        .select()

      if (error) throw error

      // Actualizar estado del mensaje en el chat
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            previewData: { ...m.previewData, status: 'confirmed', resultId: data[0].id }
          }
        }
        return m
      }))

      const successNote = '¡Turno confirmado y agendado con éxito en el sistema!'
      speakText(successNote)
    } catch (err) {
      console.error('Error al confirmar turno:', err)
      alert(`Error al guardar el turno: ${err.message}`)
    }
  }

  // Guardar Comanda validada en la base de datos
  const handleConfirmComanda = async (messageId, comandaData) => {
    try {
      if (!activeEmpresaId) throw new Error('No hay salón activo seleccionado.')
      if (!comandaData.items || comandaData.items.length === 0) {
        alert('Debes agregar al menos un servicio o artículo en la comanda.')
        return
      }

      const totalCalculado = comandaData.items.reduce((acc, it) => acc + (Number(it.cantidad) * Number(it.precio_unitario)), 0)

      // 1. Insertar orden de trabajo
      const ordenPayload = {
        empresa_id: activeEmpresaId,
        cliente_id: comandaData.cliente_id || null,
        usuario_responsable_id: comandaData.usuario_responsable_id || null,
        estado: 'completada',
        notas: comandaData.notas ? `[Sasha AI] ${comandaData.notas}` : '[Sasha AI]',
        total_economico: totalCalculado,
        es_colaborativa: false
      }

      const { data: ordenCreada, error: errOrd } = await supabase
        .from('ordenes_trabajo')
        .insert([ordenPayload])
        .select()

      if (errOrd) throw errOrd
      const ordenId = ordenCreada[0].id

      // 2. Insertar detalles
      const detallesToInsert = comandaData.items.map(it => {
        const subtotal = Number(it.cantidad) * Number(it.precio_unitario)
        return {
          orden_trabajo_id: ordenId,
          tipo_item: it.tipo_item,
          articulo_id: it.tipo_item === 'articulo' ? it.item_id || null : null,
          servicio_id: it.tipo_item === 'servicio' ? it.item_id || null : null,
          cantidad: Number(it.cantidad) || 1,
          precio_unitario: Number(it.precio_unitario) || 0,
          subtotal: subtotal,
          colaborador_id: comandaData.usuario_responsable_id || null,
          porcentaje_comision: 0,
          monto_comision: 0,
          precio_costo: 0,
          rentabilidad: subtotal
        }
      })

      const { error: errDet } = await supabase
        .from('ordenes_trabajo_detalles')
        .insert(detallesToInsert)

      if (errDet) throw errDet

      // Actualizar tarjeta en la conversación
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            previewData: { ...m.previewData, status: 'confirmed', resultId: ordenId, total: totalCalculado }
          }
        }
        return m
      }))

      const successNote = `¡Comanda registrada con éxito por un total de $${totalCalculado.toLocaleString('es-AR')}!`
      speakText(successNote)
    } catch (err) {
      console.error('Error al confirmar comanda:', err)
      alert(`Error al guardar la comanda: ${err.message}`)
    }
  }

  // Descartar borrador
  const handleDiscard = (messageId) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        return {
          ...m,
          previewData: { ...m.previewData, status: 'discarded' }
        }
      }
      return m
    }))
  }

  // Modificar campo en borrador de Turno
  const handleUpdateTurnoField = (messageId, field, value) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.previewData?.data) {
        const updatedData = { ...m.previewData.data, [field]: value }
        
        // Si cambia el servicio, actualizar hora_fin estimada
        if (field === 'servicio_id') {
          const serv = catalog.servicios.find(s => s.id === value)
          if (serv && updatedData.hora_inicio) {
            const [h, min] = updatedData.hora_inicio.split(':').map(Number)
            const dur = serv.tiempo_aprox_minutos || 45
            const endMinTotal = (h * 60) + min + dur
            const endH = String(Math.floor(endMinTotal / 60) % 24).padStart(2, '0')
            const endM = String(endMinTotal % 60).padStart(2, '0')
            updatedData.hora_fin = `${endH}:${endM}`
          }
        }

        return {
          ...m,
          previewData: { ...m.previewData, data: updatedData }
        }
      }
      return m
    }))
  }

  // Modificar campo en borrador de Comanda
  const handleUpdateComandaField = (messageId, field, value) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.previewData?.data) {
        return {
          ...m,
          previewData: {
            ...m.previewData,
            data: { ...m.previewData.data, [field]: value }
          }
        }
      }
      return m
    }))
  }

  // Modificar o agregar ítem en Comanda
  const handleUpdateComandaItem = (messageId, itemIndex, field, value) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.previewData?.data?.items) {
        const newItems = [...m.previewData.data.items]
        newItems[itemIndex] = { ...newItems[itemIndex], [field]: value }

        // Si cambia el ID del item, rellenar precio unitario automáticamente
        if (field === 'item_id') {
          const tipo = newItems[itemIndex].tipo_item
          if (tipo === 'servicio') {
            const serv = catalog.servicios.find(s => s.id === value)
            if (serv) {
              newItems[itemIndex].nombre = serv.nombre
              newItems[itemIndex].precio_unitario = Number(serv.precio) || 0
            }
          } else {
            const art = catalog.articulos.find(a => a.id === value)
            if (art) {
              newItems[itemIndex].nombre = art.nombre
              newItems[itemIndex].precio_unitario = Number(art.precio_venta) || 0
            }
          }
        }

        return {
          ...m,
          previewData: {
            ...m.previewData,
            data: { ...m.previewData.data, items: newItems }
          }
        }
      }
      return m
    }))
  }

  const handleAddComandaItem = (messageId) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.previewData?.data?.items) {
        const defaultServ = catalog.servicios[0]
        const newItem = {
          id_temp: Date.now(),
          tipo_item: 'servicio',
          item_id: defaultServ ? defaultServ.id : '',
          nombre: defaultServ ? defaultServ.nombre : 'Servicio',
          cantidad: 1,
          precio_unitario: defaultServ ? Number(defaultServ.precio) : 0
        }
        return {
          ...m,
          previewData: {
            ...m.previewData,
            data: {
              ...m.previewData.data,
              items: [...m.previewData.data.items, newItem]
            }
          }
        }
      }
      return m
    }))
  }

  const handleRemoveComandaItem = (messageId, itemIndex) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.previewData?.data?.items) {
        const newItems = m.previewData.data.items.filter((_, idx) => idx !== itemIndex)
        return {
          ...m,
          previewData: {
            ...m.previewData,
            data: { ...m.previewData.data, items: newItems }
          }
        }
      }
      return m
    }))
  }

  // Saludo personalizado con datos reales del salón (una vez por sesión)
  useEffect(() => {
    if (!isOpen || saludoHechoRef.current || !activeEmpresaId || !userProfile) return
    saludoHechoRef.current = true

    const armarSaludo = async () => {
      const ahora = new Date()
      const h = ahora.getHours()
      const momento = h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
      const nombre = (userProfile?.nombre_completo || '').trim().split(' ')[0]
      const admin = esAdmin(userProfile)
      const partes = []

      try {
        const ini = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
        const fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59).toISOString()
        let q = supabase.from('turnos')
          .select('fecha_hora_inicio, cliente_nombre_rapido, clientes(nombre)')
          .eq('empresa_id', activeEmpresaId)
          .gte('fecha_hora_inicio', ini).lte('fecha_hora_inicio', fin)
          .neq('estado', 'Cancelado')
          .order('fecha_hora_inicio')
        if (!admin) q = q.eq('colaborador_id', userProfile.id)
        const { data: turnosHoy } = await q
        const lista = turnosHoy || []
        const proximo = lista.find((t) => new Date(t.fecha_hora_inicio) > ahora)
        if (lista.length === 0) {
          partes.push(admin ? 'Hoy no hay turnos agendados todavía.' : 'Hoy no tenés turnos agendados todavía.')
        } else {
          const quien = admin ? `Hoy hay ${lista.length} turno${lista.length > 1 ? 's' : ''}` : `Hoy tenés ${lista.length} turno${lista.length > 1 ? 's' : ''}`
          if (proximo) {
            const hora = new Date(proximo.fecha_hora_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
            const cliente = proximo.clientes?.nombre || proximo.cliente_nombre_rapido || 'un cliente'
            partes.push(`${quien}; el próximo es a las ${hora} con ${cliente}.`)
          } else {
            partes.push(`${quien} y ya pasaron todos.`)
          }
        }

        if (admin) {
          const resumen = await fetchResumenComandas(activeEmpresaId, 'hoy')
          if (resumen?.cantidad > 0) {
            partes.push(`Van ${resumen.cantidad} comanda${resumen.cantidad > 1 ? 's' : ''} por $${Math.round(resumen.totalMonto).toLocaleString('es-AR')}.`)
          }
          const m0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1).toISOString()
          const m1 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 23, 59, 59).toISOString()
          const { count } = await supabase.from('turnos')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', activeEmpresaId)
            .gte('fecha_hora_inicio', m0).lte('fecha_hora_inicio', m1)
            .neq('estado', 'Cancelado')
            .is('recordatorio_enviado_at', null)
          if (count > 0) partes.push(`Mañana hay ${count} turno${count > 1 ? 's' : ''} sin recordar por WhatsApp.`)
          const uso = await fetchUsoSasha(activeEmpresaId)
          if (uso?.bloqueado) partes.push(`Ojo: este mes ya usaron las ${uso.limite} consultas que tengo disponibles; si me preguntás algo te ofrezco sumar más.`)
          else if (uso?.porcentaje >= 80) partes.push(`Ojo: este mes ya usaron el ${uso.porcentaje}% de mis consultas (quedan ${uso.disponibles}).`)
        }
      } catch (err) {
        console.warn('Sasha: no pude armar el resumen del día', err)
      }

      const texto = `¡${momento}${nombre ? `, ${nombre}` : ''}! ${partes.join(' ')} ¿En qué te ayudo? Podés hablarme o escribirme.`
      setMessages((ms) => ms.map((m) => (m.id === 'welcome' ? { ...m, text: texto } : m)))
      speakText(texto)
    }

    armarSaludo()
  }, [isOpen, activeEmpresaId, userProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  const sumarConsultas = async (msgId) => {
    const msg = messages.find((m) => m.id === msgId)
    if (!msg?.limite || msg.limite.status !== 'pendiente') return
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, limite: { ...m.limite, status: 'procesando' } } : m)))
    try {
      const est = await comprarPaqueteSasha(activeEmpresaId)
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, limite: { ...m.limite, status: 'ok', estado: est } } : m)))
      handleSendMessage(msg.limite.query, { reintento: true })
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, limite: { ...m.limite, status: 'error', error: err.message } } : m)))
    }
  }

  const estadoSasha = isRecording ? 'listening' : isProcessing ? 'thinking' : isSpeaking ? 'speaking' : 'idle'
  const textoEstado = isRecording ? 'Escuchándote…' : isProcessing ? 'Pensando…' : isSpeaking ? 'Hablando…' : 'Lista para ayudarte'

  return (
    <>
      {/* Botón flotante para abrir a Sasha */}
      {!isOpen && (
        <button
          className="sasha-floating-trigger"
          onClick={() => {
            setIsOpen(true)
            setIsMinimized(false)
          }}
          title="Hablar con Sasha (Asistente IA)"
        >
          <SashaFace size={34} estado="idle" />
          <span>Sasha</span>
        </button>
      )}

      {/* Ventana de la asistente */}
      {isOpen && (
        <div className="sasha-window" style={{ height: isMinimized ? 'auto' : undefined }}>
          {/* Cabecera */}
          <div className="sasha-header">
            <div className="sasha-header-info">
              <SashaFace size={40} estado={estadoSasha} animada={isMinimized} />
              <div>
                <div className="sasha-header-title">
                  Sasha <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>Nunki</span>
                </div>
                <div className="sasha-header-status">
                  <span className={`sasha-status-dot ${estadoSasha}`} />
                  {textoEstado}
                </div>
              </div>
            </div>

            <div className="sasha-header-actions">
              {availableVoices.length > 0 && (
                <button
                  className={`sasha-icon-btn ${showVoiceSettings ? 'active' : ''}`}
                  onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                  title="Cambiar voz de Sasha"
                >
                  <Sliders size={16} />
                </button>
              )}
              <button
                className={`sasha-icon-btn ${voiceEnabled ? 'active' : ''}`}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? 'Voz activada (clic para silenciar)' : 'Voz desactivada'}
              >
                {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <button
                className="sasha-icon-btn"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expandir' : 'Minimizar'}
              >
                <Minimize2 size={18} />
              </button>
              <button
                className="sasha-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Barra para elegir voz */}
          {showVoiceSettings && !isMinimized && availableVoices.length > 0 && (
            <div className="sasha-voice-bar">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)', whiteSpace: 'nowrap' }}>
                Voz:
              </span>
              <select
                className="sasha-voice-select"
                value={selectedVoiceName}
                onChange={(e) => {
                  const newName = e.target.value
                  setSelectedVoiceName(newName)
                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel()
                    const testUtterance = new SpeechSynthesisUtterance('Hola, así suena mi voz.')
                    const v = availableVoices.find(voice => voice.name === newName)
                    if (v) testUtterance.voice = v
                    testUtterance.rate = 0.96
                    testUtterance.pitch = 1.02
                    window.speechSynthesis.speak(testUtterance)
                  }
                }}
              >
                {availableVoices.map(v => {
                  const isNatural = v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') || v.name.toLowerCase().includes('google')
                  const cleanName = v.name
                    .replace(/(Microsoft|Google)\s*/g, '')
                    .replace(/Desktop\s*/g, '(Básica) ')
                  return (
                    <option key={v.name} value={v.name}>
                      {isNatural ? `⭐ ${cleanName}` : cleanName}
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {!isMinimized && (
            <>
              {/* Escenario: Sasha en grande */}
              <div className={`sasha-stage ${estadoSasha}`}>
                <SashaFace size={112} estado={estadoSasha} />
              </div>

              {/* Mensajes del chat */}
              <div className="sasha-messages-container">
                {messages.map((m) => (
                  <div key={m.id} className={`sasha-msg ${m.sender}`}>
                    {m.sender === 'assistant' && (
                      <SashaFace size={28} animada={false} />
                    )}
                    <div style={{ maxWidth: '100%' }}>
                      <div className="sasha-msg-bubble">
                        {m.text}
                      </div>

                      {/* Límite de consultas: el administrador suma un paquete y sigue */}
                      {m.limite?.puedeSumar && (
                        <div className="sasha-limite">
                          {m.limite.status === 'ok' ? (
                            <p className="sasha-limite-ok"><Check size={15} /> Listo: sumaste {m.limite.estado?.paquete?.consultas} consultas. Se agregan {formatoMonto(m.limite.estado?.paquete?.precio, m.limite.estado?.paquete?.moneda)} a tu próxima factura.</p>
                          ) : (
                            <>
                              <button type="button" className="sasha-limite-btn" disabled={m.limite.status === 'procesando'} onClick={() => sumarConsultas(m.id)}>
                                {m.limite.status === 'procesando' ? 'Sumando…' : `Sumar ${m.limite.estado?.paquete?.consultas} consultas · ${formatoMonto(m.limite.estado?.paquete?.precio, m.limite.estado?.paquete?.moneda)}`}
                              </button>
                              <small>Se cobra en tu próxima factura. Usaste {m.limite.estado?.usados} de {m.limite.estado?.limite} este mes.</small>
                              {m.limite.status === 'error' && <small className="sasha-limite-err">{m.limite.error}</small>}
                            </>
                          )}
                        </div>
                      )}

                      {/* TARJETA INTERACTIVA DE PREVIEW / VALIDACIÓN DE TURNO */}
                      {m.previewData?.tipo === 'turno' && (
                        m.previewData.status === 'confirmed' ? (
                          <div className="sasha-confirmed-card">
                            <Check size={18} />
                            <span><strong>Turno confirmado</strong> y registrado en la Agenda.</span>
                          </div>
                        ) : m.previewData.status === 'discarded' ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '6px 8px', fontStyle: 'italic' }}>
                            Borrador de turno descartado.
                          </div>
                        ) : (
                          <div className="sasha-preview-card">
                            <div className="sasha-preview-badge">
                              <Calendar size={12} /> Borrador de Turno (Validar antes de guardar)
                            </div>
                            <div className="sasha-preview-title">Revisa y confirma los datos del turno:</div>

                            <div className="sasha-preview-grid">
                              {/* Cliente */}
                              <div className="sasha-preview-field full">
                                <label>Cliente:</label>
                                <select
                                  value={m.previewData.data.cliente_id || ''}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'cliente_id', e.target.value)}
                                >
                                  <option value="">-- Cliente Nuevo o Rápido --</option>
                                  {catalog.clientes.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Nombre rápido o nuevo si no seleccionó ID */}
                              {!m.previewData.data.cliente_id && (
                                <>
                                  <div className="sasha-preview-field">
                                    <label>Nombre cliente nuevo:</label>
                                    <input
                                      type="text"
                                      value={m.previewData.data.cliente_nombre || ''}
                                      placeholder="Nombre y Apellido"
                                      onChange={(e) => handleUpdateTurnoField(m.id, 'cliente_nombre', e.target.value)}
                                    />
                                  </div>
                                  <div className="sasha-preview-field">
                                    <label>Teléfono:</label>
                                    <input
                                      type="text"
                                      value={m.previewData.data.cliente_telefono || ''}
                                      placeholder="Ej: 1123456789"
                                      onChange={(e) => handleUpdateTurnoField(m.id, 'cliente_telefono', e.target.value)}
                                    />
                                  </div>
                                </>
                              )}

                              {/* Servicio */}
                              <div className="sasha-preview-field full">
                                <label>Servicio:</label>
                                <select
                                  value={m.previewData.data.servicio_id || ''}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'servicio_id', e.target.value)}
                                >
                                  <option value="">Selecciona servicio...</option>
                                  {catalog.servicios.map(s => (
                                    <option key={s.id} value={s.id}>{s.nombre} - ${Number(s.precio || 0).toLocaleString('es-AR')}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Colaborador / Estilista */}
                              <div className="sasha-preview-field full">
                                <label>Estilista / Colaborador:</label>
                                <select
                                  value={m.previewData.data.colaborador_id || ''}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'colaborador_id', e.target.value)}
                                >
                                  <option value="">Cualquier estilista disponible</option>
                                  {catalog.colaboradores.map(col => (
                                    <option key={col.id} value={col.id}>{col.nombre_completo}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Fecha */}
                              <div className="sasha-preview-field full">
                                <label>Fecha:</label>
                                <input
                                  type="date"
                                  value={m.previewData.data.fecha || ''}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'fecha', e.target.value)}
                                />
                              </div>

                              {/* Horarios */}
                              <div className="sasha-preview-field">
                                <label>Hora Inicio:</label>
                                <input
                                  type="time"
                                  value={m.previewData.data.hora_inicio || '10:00'}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'hora_inicio', e.target.value)}
                                />
                              </div>
                              <div className="sasha-preview-field">
                                <label>Hora Fin:</label>
                                <input
                                  type="time"
                                  value={m.previewData.data.hora_fin || '11:00'}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'hora_fin', e.target.value)}
                                />
                              </div>

                              {/* Notas */}
                              <div className="sasha-preview-field full">
                                <label>Notas:</label>
                                <input
                                  type="text"
                                  placeholder="Notas o requerimientos..."
                                  value={m.previewData.data.notas || ''}
                                  onChange={(e) => handleUpdateTurnoField(m.id, 'notas', e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Acciones */}
                            <div className="sasha-preview-actions">
                              <button
                                className="sasha-btn-confirm"
                                onClick={() => handleConfirmTurno(m.id, m.previewData.data)}
                              >
                                <Check size={16} /> Confirmar y Agendar
                              </button>
                              <button
                                className="sasha-btn-cancel"
                                onClick={() => handleDiscard(m.id)}
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {/* TARJETA INTERACTIVA DE PREVIEW / VALIDACIÓN DE COMANDA */}
                      {m.previewData?.tipo === 'comanda' && (
                        m.previewData.status === 'confirmed' ? (
                          <div className="sasha-confirmed-card">
                            <Check size={18} />
                            <span><strong>Comanda guardada</strong> en el sistema por un total de ${Number(m.previewData.total || 0).toLocaleString('es-AR')}.</span>
                          </div>
                        ) : m.previewData.status === 'discarded' ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '6px 8px', fontStyle: 'italic' }}>
                            Borrador de comanda descartado.
                          </div>
                        ) : (
                          <div className="sasha-preview-card">
                            <div className="sasha-preview-badge">
                              <FileText size={12} /> Borrador de Comanda (Validar antes de guardar)
                            </div>
                            <div className="sasha-preview-title">Revisa o edita los montos y servicios:</div>

                            <div className="sasha-preview-grid">
                              {/* Cliente */}
                              <div className="sasha-preview-field full">
                                <label>Cliente:</label>
                                <select
                                  value={m.previewData.data.cliente_id || ''}
                                  onChange={(e) => handleUpdateComandaField(m.id, 'cliente_id', e.target.value)}
                                >
                                  <option value="">Cliente Ocasional / Sin registrar</option>
                                  {catalog.clientes.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre} {c.apellido || ''}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Colaborador responsable */}
                              <div className="sasha-preview-field full">
                                <label>Estilista Responsable:</label>
                                <select
                                  value={m.previewData.data.usuario_responsable_id || ''}
                                  onChange={(e) => handleUpdateComandaField(m.id, 'usuario_responsable_id', e.target.value)}
                                >
                                  <option value="">Selecciona estilista...</option>
                                  {catalog.colaboradores.map(col => (
                                    <option key={col.id} value={col.id}>{col.nombre_completo}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Tabla de Ítems */}
                            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Ítems a cobrar:</label>
                            <table className="sasha-items-table">
                              <thead>
                                <tr>
                                  <th>Ítem</th>
                                  <th style={{ width: 45 }}>Cant</th>
                                  <th style={{ width: 80 }}>Precio</th>
                                  <th style={{ width: 25 }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(m.previewData.data.items || []).map((it, idx) => (
                                  <tr key={it.id_temp || idx}>
                                    <td>
                                      <select
                                        style={{ width: '100%', fontSize: '0.75rem', padding: '3px 4px' }}
                                        value={it.item_id || ''}
                                        onChange={(e) => handleUpdateComandaItem(m.id, idx, 'item_id', e.target.value)}
                                      >
                                        <optgroup label="Servicios">
                                          {catalog.servicios.map(s => (
                                            <option key={s.id} value={s.id}>{s.nombre}</option>
                                          ))}
                                        </optgroup>
                                        <optgroup label="Productos">
                                          {catalog.articulos.map(a => (
                                            <option key={a.id} value={a.id}>{a.nombre}</option>
                                          ))}
                                        </optgroup>
                                      </select>
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min="1"
                                        style={{ width: '100%', fontSize: '0.75rem', padding: '3px 4px' }}
                                        value={it.cantidad}
                                        onChange={(e) => handleUpdateComandaItem(m.id, idx, 'cantidad', e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        style={{ width: '100%', fontSize: '0.75rem', padding: '3px 4px' }}
                                        value={it.precio_unitario}
                                        onChange={(e) => handleUpdateComandaItem(m.id, idx, 'precio_unitario', e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                                        onClick={() => handleRemoveComandaItem(m.id, idx)}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <button
                              type="button"
                              className="sasha-chip"
                              style={{ margin: '4px 0 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleAddComandaItem(m.id)}
                            >
                              <Plus size={12} /> Agregar Ítem
                            </button>

                            {/* Total editable */}
                            <div className="sasha-preview-total">
                              <span>Total Calculado:</span>
                              <span>
                                ${(m.previewData.data.items || []).reduce((sum, it) => sum + (Number(it.cantidad) * Number(it.precio_unitario)), 0).toLocaleString('es-AR')}
                              </span>
                            </div>

                            {/* Acciones */}
                            <div className="sasha-preview-actions">
                              <button
                                className="sasha-btn-confirm"
                                onClick={() => handleConfirmComanda(m.id, m.previewData.data)}
                              >
                                <Check size={16} /> Confirmar y Guardar Comanda
                              </button>
                              <button
                                className="sasha-btn-cancel"
                                onClick={() => handleDiscard(m.id)}
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="sasha-msg assistant">
                    <SashaFace size={28} estado="thinking" />
                    <div className="sasha-msg-bubble" style={{ fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sasha-spinner" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #B4612A', borderTopColor: 'transparent', borderRadius: '50%', animation: 'sashaRotate 0.8s linear infinite' }} />
                      Sasha está procesando tu solicitud...
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Sugerencias Rápidas */}
              <div 
                className="sasha-chips-container"
                onWheel={(e) => {
                  if (e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
                    e.currentTarget.scrollTop += e.deltaY
                  }
                }}
              >
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => navigate('/reservas')}
                >
                  🔔 Recordatorios de mañana
                </button>
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => handleSendMessage('¿Cuánto facturamos hoy en comandas?')}
                >
                  📊 Comandas hoy
                </button>
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => setInputText('Agendame un turno para ')}
                >
                  📅 Agendar turno
                </button>
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => setInputText('Cargale una comanda a ')}
                >
                  🧾 Cargar comanda
                </button>
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => setInputText('¿Hace cuánto que no viene ')}
                >
                  ⏱️ Última visita
                </button>
                <button
                  type="button"
                  className="sasha-chip"
                  onClick={() => setInputText('¿Qué fue lo último que le hicimos a ')}
                >
                  💇 Último servicio
                </button>
              </div>

              {/* Indicador de audio o error */}
              {isRecording && (
                <div className="sasha-recording-hint">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                  Escuchando... habla claramente a tu micrófono.
                </div>
              )}
              {recordingError && (
                <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={14} /> {recordingError}
                </div>
              )}

              {/* Footer con Micrófono e Input */}
              <div className="sasha-footer">
                <form
                  className="sasha-input-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                >
                  {/* Botón de micrófono */}
                  <button
                    type="button"
                    className={`sasha-mic-btn ${isRecording ? 'recording' : ''}`}
                    onClick={toggleRecording}
                    title={isRecording ? 'Detener grabación' : 'Hablar por micrófono'}
                  >
                    {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  {/* Input de texto */}
                  <input
                    type="text"
                    className="sasha-text-input"
                    placeholder="Escribe o habla a Sasha..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isProcessing}
                  />

                  {/* Botón de enviar */}
                  <button
                    type="submit"
                    className="sasha-send-btn"
                    disabled={!inputText.trim() || isProcessing}
                    title="Enviar"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
