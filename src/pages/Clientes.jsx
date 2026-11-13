import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { 
  Plus, Edit, Trash2, Search, FileText, Clock, Calendar, 
  User, Scissors, Palette, Phone, Mail, MapPin, Briefcase, 
  Cake, Sparkles, AlertTriangle, ExternalLink, ChevronRight, 
  CheckCircle2, History, X, Save, MessageCircle
} from 'lucide-react'
import { formatMetodoPagoLabel } from '../lib/pagoUtils'

export default function Clientes() {
  const { userProfile, activeEmpresaId } = useAuth()
  const isOperator = userProfile?.rol === 'operador'
  const finalEmpresaId = activeEmpresaId || userProfile?.empresa_id

  const [clientes, setClientes] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  
  // Modal & Tabs state
  const [showModal, setShowModal] = useState(false)
  const [activeModalTab, setActiveModalTab] = useState('historial') // 'historial' | 'datos'
  const [selectedCliente, setSelectedCliente] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  // Historial del Cliente
  const [historialOrdenes, setHistorialOrdenes] = useState([])
  const [historialTurnos, setHistorialTurnos] = useState([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState('')

  // Catálogos para resolución de nombres
  const [catalogoServicios, setCatalogoServicios] = useState([])
  const [catalogoArticulos, setCatalogoArticulos] = useState([])

  // Edición rápida de fórmula en comandas o nota anterior
  const [editingPermanentNotes, setEditingPermanentNotes] = useState(false)
  const [permanentNotesDraft, setPermanentNotesDraft] = useState('')
  const [savingPermanentNotes, setSavingPermanentNotes] = useState(false)
  const [editingOrdenId, setEditingOrdenId] = useState(null)
  const [ordenNotasDraft, setOrdenNotasDraft] = useState('')
  const [savingOrdenNotas, setSavingOrdenNotas] = useState(false)

  // Meses para selector de cumpleaños
  const MESES_OPCIONES = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
  ]

  const getMaxDaysInMonth = (mes, anio) => {
    const m = Number(mes)
    if (!m) return 31
    if ([4, 6, 9, 11].includes(m)) return 30
    if (m === 2) {
      const y = Number(anio)
      if (!y) return 29
      const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0)
      return isLeap ? 29 : 28
    }
    return 31
  }

  // Extrae día, mes y año (si no es el año comodín 1904 usado cuando no se especifica año)
  const parseFechaCumple = (fechaStr) => {
    if (!fechaStr) return { dia: '', mes: '', anio: '' }
    const clean = String(fechaStr).split('T')[0]
    const parts = clean.split('-')
    if (parts.length === 3) {
      const [y, m, d] = parts
      const anioNum = Number(y)
      return {
        dia: d.padStart(2, '0'),
        mes: m.padStart(2, '0'),
        anio: anioNum <= 1904 ? '' : y
      }
    }
    return { dia: '', mes: '', anio: '' }
  }

  const formatCumpleanos = (fechaStr) => {
    const { dia, mes, anio } = parseFechaCumple(fechaStr)
    if (!dia || !mes) return '-'
    return anio ? `${dia}/${mes}/${anio}` : `${dia}/${mes}`
  }

  // Form state para datos personales
  const initialFormData = {
    apellido: '',
    nombre: '',
    tipo_cliente: 'nuevo',
    telefono: '',
    email: '',
    fecha_nacimiento: '',
    cumple_dia: '',
    cumple_mes: '',
    cumple_anio: '',
    profesion: '',
    direccion: '',
    notas: ''
  }
  const [formData, setFormData] = useState(initialFormData)

  useEffect(() => {
    if (finalEmpresaId) {
      fetchClientes()
      fetchCatalogos()
    }
  }, [finalEmpresaId])

  const fetchCatalogos = async () => {
    try {
      const [resServ, resArt] = await Promise.all([
        supabase.from('servicios').select('id, nombre, precio').eq('empresa_id', finalEmpresaId),
        supabase.from('articulos').select('id, nombre, precio_venta').eq('empresa_id', finalEmpresaId)
      ])
      setCatalogoServicios(resServ.data || [])
      setCatalogoArticulos(resArt.data || [])
    } catch (err) {
      console.error('Error fetching catalogos:', err)
    }
  }

  const fetchClientes = async () => {
    try {
      setLoading(true)
      const { data: clientesData, error: clientesError } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', finalEmpresaId)
        .order('created_at', { ascending: false })

      if (clientesError) throw clientesError
      setClientes(clientesData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchClienteHistorial = async (clienteId) => {
    try {
      setLoadingHistorial(true)
      const [resOrdenes, resTurnos] = await Promise.all([
        supabase
          .from('ordenes_trabajo')
          .select(`
            *,
            usuarios (id, nombre_completo),
            ordenes_trabajo_detalles (*)
          `)
          .eq('cliente_id', clienteId)
          .neq('estado', 'eliminada')
          .order('fecha_hora', { ascending: false }),
        supabase
          .from('turnos')
          .select(`
            id, fecha_hora_inicio, fecha_hora_fin, estado, notas,
            usuarios (id, nombre_completo),
            servicios (id, nombre)
          `)
          .eq('cliente_id', clienteId)
          .order('fecha_hora_inicio', { ascending: false })
      ])

      if (resOrdenes.error) throw resOrdenes.error
      setHistorialOrdenes(resOrdenes.data || [])
      setHistorialTurnos(resTurnos.data || [])
    } catch (err) {
      console.error('Error fetching client history:', err)
    } finally {
      setLoadingHistorial(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = { ...prev, [name]: value }
      if (name === 'cumple_mes' || name === 'cumple_anio') {
        const maxDays = getMaxDaysInMonth(next.cumple_mes, next.cumple_anio)
        if (next.cumple_dia && Number(next.cumple_dia) > maxDays) {
          next.cumple_dia = String(maxDays).padStart(2, '0')
        }
      }
      return next
    })
  }

  const openFichaCliente = (cliente, tab = 'historial') => {
    setSelectedCliente(cliente)
    setActiveModalTab(tab)
    const { dia, mes, anio } = parseFechaCumple(cliente.fecha_nacimiento)
    setFormData({
      apellido: cliente.apellido || '',
      nombre: cliente.nombre || '',
      tipo_cliente: cliente.tipo_cliente || 'nuevo',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      fecha_nacimiento: cliente.fecha_nacimiento || '',
      cumple_dia: dia,
      cumple_mes: mes,
      cumple_anio: anio,
      profesion: cliente.profesion || '',
      direccion: cliente.direccion || '',
      notas: cliente.notas || ''
    })
    setPermanentNotesDraft(cliente.notas || '')
    setEditingPermanentNotes(false)
    setEditingOrdenId(null)
    setOrdenNotasDraft('')
    setHistorySearchQuery('')
    setShowModal(true)
    fetchClienteHistorial(cliente.id)
  }

  const handleNuevoClienteClick = () => {
    setSelectedCliente(null)
    setActiveModalTab('datos')
    setFormData(initialFormData)
    setPermanentNotesDraft('')
    setEditingOrdenId(null)
    setOrdenNotasDraft('')
    setHistorialOrdenes([])
    setHistorialTurnos([])
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedCliente(null)
    setFormData(initialFormData)
    setPermanentNotesDraft('')
    setEditingPermanentNotes(false)
    setEditingOrdenId(null)
    setOrdenNotasDraft('')
    setHistorialOrdenes([])
    setHistorialTurnos([])
  }

  const handleDeleteCliente = async (clienteId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este cliente? Esta acción no se puede deshacer.')) return
    try {
      setLoading(true)
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', clienteId)

      if (error) throw error
      setClientes(prev => prev.filter(c => c.id !== clienteId))
    } catch (err) {
      console.error('Error deleting client:', err)
      alert('Error al eliminar el cliente. Es posible que tenga órdenes o turnos asociados.')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePermanentNotes = async () => {
    if (!selectedCliente) return
    try {
      setSavingPermanentNotes(true)
      const { error } = await supabase
        .from('clientes')
        .update({ notas: permanentNotesDraft })
        .eq('id', selectedCliente.id)

      if (error) throw error

      const updatedCliente = { ...selectedCliente, notas: permanentNotesDraft }
      setSelectedCliente(updatedCliente)
      setFormData(prev => ({ ...prev, notas: permanentNotesDraft }))
      setClientes(prev => prev.map(c => c.id === selectedCliente.id ? updatedCliente : c))
      setEditingPermanentNotes(false)
    } catch (err) {
      console.error('Error saving permanent notes:', err)
      alert('Error al guardar notas técnicas: ' + err.message)
    } finally {
      setSavingPermanentNotes(false)
    }
  }

  const handleSaveOrdenNotas = async (ordenId) => {
    if (!ordenId) return
    try {
      setSavingOrdenNotas(true)
      const { error } = await supabase
        .from('ordenes_trabajo')
        .update({ notas: ordenNotasDraft })
        .eq('id', ordenId)

      if (error) throw error

      setHistorialOrdenes(prev =>
        prev.map(o => o.id === ordenId ? { ...o, notas: ordenNotasDraft } : o)
      )
      setEditingOrdenId(null)
      setOrdenNotasDraft('')
    } catch (err) {
      console.error('Error saving orden formula:', err)
      alert('Error al guardar la fórmula en la comanda: ' + err.message)
    } finally {
      setSavingOrdenNotas(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting || submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)

    try {
      if (!finalEmpresaId) throw new Error("No empresa_id found for user")

      if (!formData.cumple_dia || !formData.cumple_mes) {
        throw new Error("El día y mes de cumpleaños son obligatorios.")
      }

      const { cumple_dia, cumple_mes, cumple_anio, ...restFormData } = formData
      const anioTrim = String(cumple_anio || '').trim()
      if (anioTrim) {
        const anioNum = Number(anioTrim)
        const currentYear = new Date().getFullYear()
        if (isNaN(anioNum) || anioNum < 1905 || anioNum > currentYear) {
          throw new Error(`El año de nacimiento debe estar entre 1905 y ${currentYear}, o dejarse vacío.`)
        }
      }

      // Usamos 1904 (bisiesto) como año comodín cuando solo se guarda día y mes de cumpleaños
      const anioGuardar = anioTrim ? String(Number(anioTrim)).padStart(4, '0') : '1904'
      const maxD = getMaxDaysInMonth(cumple_mes, anioGuardar)
      const diaGuardar = String(Math.min(Number(cumple_dia), maxD)).padStart(2, '0')
      const mesGuardar = String(cumple_mes).padStart(2, '0')
      const fechaNacimientoFinal = `${anioGuardar}-${mesGuardar}-${diaGuardar}`

      const clientPayload = {
        ...restFormData,
        empresa_id: finalEmpresaId,
        fecha_nacimiento: fechaNacimientoFinal,
        tipo_cliente: formData.tipo_cliente || 'nuevo'
      }

      if (selectedCliente) {
        // Edit mode
        const { data, error } = await supabase
          .from('clientes')
          .update(clientPayload)
          .eq('id', selectedCliente.id)
          .select()

        if (error) throw error

        const updated = data[0]
        setSelectedCliente(updated)
        setClientes(prev => prev.map(c => c.id === selectedCliente.id ? updated : c))
      } else {
        // Create mode
        const { data, error } = await supabase
          .from('clientes')
          .insert([clientPayload])
          .select()

        if (error) throw error

        setClientes(prev => [data[0], ...prev])
      }

      closeModal()
    } catch (error) {
      console.error('Error saving client:', error)
      alert('Error al guardar el cliente: ' + error.message)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  // Ayudantes de resolución de nombres de servicios y artículos
  const getItemName = (detalle) => {
    if (detalle.tipo_item === 'servicio') {
      const s = catalogoServicios.find(item => item.id === detalle.servicio_id)
      return s?.nombre || detalle.asociado_a_servicio_nombre || 'Servicio'
    } else {
      const a = catalogoArticulos.find(item => item.id === detalle.articulo_id)
      return a?.nombre || 'Artículo / Insumo'
    }
  }

  // Formato de fechas
  const formatFechaLegible = (fechaIso) => {
    if (!fechaIso) return '-'
    const d = new Date(fechaIso)
    return d.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getRelativeTime = (fechaIso) => {
    if (!fechaIso) return ''
    const diffMs = Date.now() - new Date(fechaIso).getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'Próximamente'
    if (diffDays === 0) return 'Hoy'
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
    }
    const months = Math.floor(diffDays / 30)
    return `Hace ${months} ${months === 1 ? 'mes' : 'meses'}`
  }

  // Métricas rápidas del cliente seleccionado
  const clientStats = useMemo(() => {
    if (!historialOrdenes || historialOrdenes.length === 0) {
      return { totalVisitas: 0, ultimaVisita: null, topServicio: null, topEstilista: null }
    }

    const totalVisitas = historialOrdenes.length
    const ultimaVisita = historialOrdenes[0]?.fecha_hora

    // Frecuencia de servicios
    const serviceCounts = {}
    historialOrdenes.forEach(orden => {
      (orden.ordenes_trabajo_detalles || []).forEach(d => {
        if (d.tipo_item === 'servicio') {
          const name = getItemName(d)
          serviceCounts[name] = (serviceCounts[name] || 0) + 1
        }
      })
    })

    let topServicio = null
    let maxServCount = 0
    Object.entries(serviceCounts).forEach(([name, count]) => {
      if (count > maxServCount) {
        maxServCount = count
        topServicio = name
      }
    })

    // Frecuencia de estilistas
    const stylistCounts = {}
    historialOrdenes.forEach(orden => {
      if (orden.es_colaborativa && Array.isArray(orden.colaboradores_participantes)) {
        orden.colaboradores_participantes.forEach(part => {
          if (part.colaborador_id) {
            stylistCounts[part.colaborador_id] = (stylistCounts[part.colaborador_id] || 0) + 1
          }
        })
      } else if (orden.usuarios?.nombre_completo) {
        stylistCounts[orden.usuarios.nombre_completo] = (stylistCounts[orden.usuarios.nombre_completo] || 0) + 1
      }
    })

    let topEstilista = null
    let maxStylistCount = 0
    Object.entries(stylistCounts).forEach(([name, count]) => {
      if (count > maxStylistCount) {
        maxStylistCount = count
        topEstilista = name
      }
    })

    return { totalVisitas, ultimaVisita, topServicio, topEstilista }
  }, [historialOrdenes, catalogoServicios, catalogoArticulos])

  // Filtrado de visitas en el timeline
  const filteredHistorial = useMemo(() => {
    if (!historySearchQuery.trim()) return historialOrdenes
    const q = historySearchQuery.toLowerCase()
    return historialOrdenes.filter(orden => {
      const matchNotas = (orden.notas || '').toLowerCase().includes(q)
      const matchEstilista = (orden.usuarios?.nombre_completo || '').toLowerCase().includes(q)
      const matchFecha = (orden.fecha_hora || '').toLowerCase().includes(q)
      const matchItems = (orden.ordenes_trabajo_detalles || []).some(d => {
        const name = getItemName(d).toLowerCase()
        return name.includes(q)
      })
      return matchNotas || matchEstilista || matchFecha || matchItems
    })
  }, [historialOrdenes, historySearchQuery, catalogoServicios, catalogoArticulos])

  const filteredClientes = clientes.filter(cliente => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    
    const nombre = (cliente.nombre || '').toLowerCase()
    const apellido = (cliente.apellido || '').toLowerCase()
    const tipo = (cliente.tipo_cliente || 'nuevo').toLowerCase() === 'antiguo' ? 'antiguo cliente antiguo' : 'nuevo cliente nuevo'
    const telefono = (cliente.telefono || '').toLowerCase()
    const email = (cliente.email || '').toLowerCase()
    const profesion = (cliente.profesion || '').toLowerCase()
    const direccion = (cliente.direccion || '').toLowerCase()

    if (isOperator) {
      return nombre.includes(query) || apellido.includes(query) || tipo.includes(query)
    }

    return nombre.includes(query) || 
           apellido.includes(query) || 
           tipo.includes(query) ||
           telefono.includes(query) || 
           email.includes(query) || 
           profesion.includes(query) || 
           direccion.includes(query)
  })

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Base de clientes, historial de visitas y fichas técnicas de color
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleNuevoClienteClick}>
          <Plus size={18} /> Nuevo Cliente
        </button>
      </header>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando clientes...</p>
      ) : (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input-field"
                placeholder={isOperator ? "Buscar por apellido, nombre o clasificación..." : "Buscar por apellido, nombre, tipo, teléfono, email, profesión..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '2.75rem' }}
              />
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                <Search size={18} />
              </span>
            </div>
          </div>

          {clientes.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No hay clientes registrados aún.</p>
          ) : filteredClientes.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No se encontraron clientes que coincidan con la búsqueda.</p>
          ) : (
            <div className="table-container">
              <table className="data-table table-compact">
                <thead>
                  <tr>
                    <th>Apellido</th>
                    <th>Nombre</th>
                    <th style={{ textAlign: 'center' }}>Tipo</th>
                    {!isOperator && (
                      <>
                        <th>Teléfono</th>
                        <th style={{ maxWidth: '100px' }}>Email</th>
                        <th style={{ maxWidth: '130px' }}>Profesión</th>
                        <th style={{ maxWidth: '130px' }}>Dirección</th>
                        <th>Cumpleaños</th>
                      </>
                    )}
                    <th style={{ textAlign: 'center', width: isOperator ? '130px' : '160px' }}>Ficha & Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientes.map(cliente => (
                    <tr 
                      key={cliente.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => openFichaCliente(cliente, 'historial')}
                    >
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{cliente.apellido || '-'}</strong></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{cliente.nombre}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {cliente.tipo_cliente === 'antiguo' ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: 'rgba(234, 179, 8, 0.15)',
                            color: '#eab308',
                            border: '1px solid rgba(234, 179, 8, 0.3)'
                          }}>
                            Antiguo
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: 'rgba(180, 97, 42, 0.15)',
                            color: '#E39461',
                            border: '1px solid rgba(180, 97, 42, 0.3)'
                          }}>
                            Nuevo
                          </span>
                        )}
                      </td>
                      {!isOperator && (
                        <>
                          <td style={{ whiteSpace: 'nowrap' }}>{cliente.telefono || '-'}</td>
                          <td style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliente.email || ''}>{cliente.email || '-'}</td>
                          <td style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliente.profesion || ''}>{cliente.profesion || '-'}</td>
                          <td style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliente.direccion || ''}>{cliente.direccion || '-'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatCumpleanos(cliente.fecha_nacimiento)}</td>
                        </>
                      )}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ 
                              padding: '0.3rem 0.6rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.35rem',
                              borderRadius: '6px',
                              border: '1px solid var(--primary-color)',
                              background: 'rgba(180, 97, 42, 0.12)',
                              color: 'var(--primary-color)',
                              fontWeight: 600,
                              fontSize: '0.75rem'
                            }}
                            onClick={() => openFichaCliente(cliente, 'historial')}
                            title="Ver Ficha e Historial Técnico del Cliente"
                          >
                            <FileText size={13} />
                            <span>Ficha</span>
                          </button>

                          {!isOperator && (
                            <>
                              <button 
                                className="btn btn-secondary" 
                                style={{ 
                                  padding: '0.3rem 0.45rem', 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid var(--surface-border)',
                                  background: 'rgba(255, 255, 255, 0.03)'
                                }}
                                onClick={() => openFichaCliente(cliente, 'datos')}
                                title="Editar datos personales"
                              >
                                <Edit size={13} />
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ 
                                  padding: '0.3rem 0.45rem', 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444'
                                }}
                                onClick={() => handleDeleteCliente(cliente.id)}
                                title="Eliminar cliente"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL FICHA INTEGRAL DEL CLIENTE */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div 
            className="modal-content animate-slide-up" 
            style={{ 
              maxWidth: '850px', 
              width: '95%', 
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              backgroundColor: 'var(--solid-surface)',
              border: '1px solid var(--surface-border)',
              color: 'var(--text-primary)',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.35)'
            }} 
            onClick={e => e.stopPropagation()}
          >
            
            {/* CABECERA DE LA FICHA */}
            <div 
              style={{ 
                padding: '1.25rem 1.5rem', 
                borderBottom: '1px solid var(--surface-border)',
                backgroundColor: 'var(--solid-surface)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div 
                  style={{ 
                    width: '46px', 
                    height: '46px', 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color, #3F8F86))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.15rem',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(180, 97, 42, 0.3)'
                  }}
                >
                  {selectedCliente ? (
                    `${(selectedCliente.nombre || '')[0] || ''}${(selectedCliente.apellido || '')[0] || ''}`.toUpperCase() || 'C'
                  ) : (
                    <User size={22} />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellido}` : 'Nuevo Cliente'}
                    </h2>
                    {selectedCliente && (
                      <span style={{
                        padding: '0.15rem 0.55rem',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: selectedCliente.tipo_cliente === 'antiguo' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(180, 97, 42, 0.15)',
                        color: selectedCliente.tipo_cliente === 'antiguo' ? '#b45309' : 'var(--primary-color)',
                        border: selectedCliente.tipo_cliente === 'antiguo' ? '1px solid rgba(234, 179, 8, 0.35)' : '1px solid rgba(180, 97, 42, 0.35)'
                      }}>
                        {selectedCliente.tipo_cliente === 'antiguo' ? '🏛️ Cliente Antiguo' : '✨ Cliente Nuevo'}
                      </span>
                    )}
                  </div>
                  {selectedCliente && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      {selectedCliente.telefono && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Phone size={13} /> {selectedCliente.telefono}
                          <a 
                            href={`https://wa.me/${selectedCliente.telefono.replace(/[^0-9]/g, '')}`} 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ color: '#22c55e', marginLeft: '2px', display: 'flex', alignItems: 'center' }}
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle size={13} />
                          </a>
                        </span>
                      )}
                      {selectedCliente.email && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Mail size={13} /> {selectedCliente.email}
                        </span>
                      )}
                      {selectedCliente.profesion && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Briefcase size={13} /> {selectedCliente.profesion}
                        </span>
                      )}
                      {selectedCliente.fecha_nacimiento && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Cumpleaños">
                          <Cake size={13} /> {formatCumpleanos(selectedCliente.fecha_nacimiento)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="button"
                className="btn" 
                style={{ padding: '0.45rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} 
                onClick={closeModal}
              >
                <X size={22} />
              </button>
            </div>

            {/* SELECTOR DE PESTAÑAS (TABS) */}
            {selectedCliente && (
              <div 
                style={{ 
                  display: 'flex', 
                  borderBottom: '1px solid var(--surface-border)', 
                  backgroundColor: 'rgba(180, 97, 42, 0.04)',
                  padding: '0 1.5rem'
                }}
              >
                <button
                  type="button"
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeModalTab === 'historial' ? '2px solid var(--primary-color)' : '2px solid transparent',
                    color: activeModalTab === 'historial' ? 'var(--primary-color)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setActiveModalTab('historial')}
                >
                  <History size={16} />
                  <span>Historial & Ficha Técnica</span>
                  {historialOrdenes.length > 0 && (
                    <span style={{
                      background: activeModalTab === 'historial' ? 'rgba(180, 97, 42, 0.15)' : 'rgba(0, 0, 0, 0.06)',
                      color: activeModalTab === 'historial' ? 'var(--primary-color)' : 'var(--text-secondary)',
                      padding: '0.1rem 0.5rem',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}>
                      {historialOrdenes.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeModalTab === 'datos' ? '2px solid var(--primary-color)' : '2px solid transparent',
                    color: activeModalTab === 'datos' ? 'var(--primary-color)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setActiveModalTab('datos')}
                >
                  <User size={16} />
                  <span>Datos Personales</span>
                </button>
              </div>
            )}

            {/* CUERPO DEL MODAL (SCROLLABLE) */}
            <div 
              style={{ 
                padding: '1.5rem', 
                overflowY: 'auto', 
                flex: 1, 
                maxHeight: 'calc(92vh - 145px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
              }}
            >
              
              {/* === TAB 1: HISTORIAL Y LÍNEA DE TIEMPO TÉCNICA UNIFICADA === */}
              {selectedCliente && activeModalTab === 'historial' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                  {/* RESUMEN DE MÉTRICAS RÁPIDAS DEL CLIENTE */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
                    <div style={{ background: 'var(--solid-surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ background: 'rgba(180, 97, 42, 0.15)', color: 'var(--primary-color)', padding: '0.6rem', borderRadius: '8px' }}>
                        <Clock size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Visitas</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{clientStats.totalVisitas} {clientStats.totalVisitas === 1 ? 'comanda' : 'comandas'}</div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--solid-surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success-color)', padding: '0.6rem', borderRadius: '8px' }}>
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Última Visita</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          {clientStats.ultimaVisita ? getRelativeTime(clientStats.ultimaVisita) : 'Sin visitas'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--solid-surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#d97706', padding: '0.6rem', borderRadius: '8px' }}>
                        <Scissors size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Servicio Habitual</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={clientStats.topServicio || ''}>
                          {clientStats.topServicio || '—'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--solid-surface)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ background: 'rgba(47, 127, 120, 0.15)', color: 'var(--primary-color)', padding: '0.6rem', borderRadius: '8px' }}>
                        <User size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Estilista Habitual</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={clientStats.topEstilista || ''}>
                          {clientStats.topEstilista || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BUSCADOR DENTRO DEL HISTORIAL */}
                  {(historialOrdenes.length > 0 || (selectedCliente.notas && selectedCliente.notas.trim())) && (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Buscar en el historial por fórmula (ej: 7.1), servicio, estilista o fecha..."
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        style={{ width: '100%', paddingLeft: '2.5rem', margin: 0, fontSize: '0.85rem' }}
                      />
                      <Search size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      {historySearchQuery && (
                        <button 
                          type="button"
                          onClick={() => setHistorySearchQuery('')}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}

                  {/* SECCIÓN ÚNICA: FÓRMULAS DE COLOR Y LÍNEA DE TIEMPO */}
                  {(() => {
                    const hasLegacyNote = Boolean(selectedCliente.notas && selectedCliente.notas.trim())
                    const matchesLegacyNote = hasLegacyNote && (
                      !historySearchQuery.trim() ||
                      selectedCliente.notas.toLowerCase().includes(historySearchQuery.toLowerCase().trim())
                    )
                    const totalRegistros = historialOrdenes.length + (hasLegacyNote ? 1 : 0)
                    const totalFiltrados = filteredHistorial.length + (matchesLegacyNote ? 1 : 0)

                    return (
                      <div style={{ marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <Palette size={18} style={{ color: 'var(--primary-color)' }} />
                              Fórmulas de Color e Historial de Trabajos
                            </h4>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              Arriba se muestra siempre la última fórmula realizada; desliza hacia abajo para ver las anteriores.
                            </span>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {totalFiltrados} de {totalRegistros} {totalRegistros === 1 ? 'registro' : 'registros'}
                          </span>
                        </div>

                        {loadingHistorial ? (
                          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                            Cargando historial de trabajos y fórmulas...
                          </div>
                        ) : (totalRegistros === 0 && !editingPermanentNotes) ? (
                          <div 
                            style={{ 
                              textAlign: 'center', 
                              padding: '2.5rem 1.5rem', 
                              background: 'rgba(255, 255, 255, 0.02)', 
                              borderRadius: '12px', 
                              border: '1px dashed var(--surface-border)' 
                            }}
                          >
                            <Palette size={32} style={{ color: 'var(--primary-color)', marginBottom: '0.75rem', opacity: 0.7 }} />
                            <h4 style={{ margin: '0 0 0.4rem', color: 'var(--text-primary)' }}>Aún no hay fórmulas ni visitas registradas</h4>
                            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '420px', marginInline: 'auto' }}>
                              Las fórmulas que cargues en <strong>Comandas</strong> aparecerán aquí automáticamente, o puedes anotar una fórmula inicial ahora mismo:
                            </p>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                              onClick={() => {
                                setPermanentNotesDraft(selectedCliente.notas || '')
                                setEditingPermanentNotes(true)
                              }}
                            >
                              <Edit size={14} />
                              <span>Anotar Fórmula / Nota Técnica</span>
                            </button>
                          </div>
                        ) : (totalFiltrados === 0 && !editingPermanentNotes) ? (
                          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                            No se encontraron fórmulas o trabajos que coincidan con &quot;{historySearchQuery}&quot;.
                          </div>
                        ) : (
                          <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                            {/* Línea vertical conectora */}
                            <div 
                              style={{ 
                                position: 'absolute', 
                                left: '7px', 
                                top: '10px', 
                                bottom: '10px', 
                                width: '2px', 
                                background: 'linear-gradient(to bottom, var(--primary-color), rgba(255,255,255,0.1))' 
                              }} 
                            />

                            {filteredHistorial.map((orden, idx) => {
                              const hasNotas = orden.notas && orden.notas.trim().length > 0
                              const detalles = orden.ordenes_trabajo_detalles || []
                              const isLatestVisit = idx === 0 && !historySearchQuery.trim()
                              const isEditingThisOrden = editingOrdenId === orden.id

                              // Formato de profesionales
                              let estilistaTexto = orden.usuarios?.nombre_completo || 'Sin estilista asignado'
                              if (orden.es_colaborativa && Array.isArray(orden.colaboradores_participantes) && orden.colaboradores_participantes.length > 0) {
                                estilistaTexto = 'Equipo colaborativo'
                              }

                              return (
                                <div 
                                  key={orden.id} 
                                  style={{ 
                                    position: 'relative', 
                                    marginBottom: '1.35rem',
                                    animationDelay: `${idx * 0.05}s`
                                  }}
                                >
                                  {/* Nodo circular en la línea */}
                                  <div 
                                    style={{ 
                                      position: 'absolute', 
                                      left: '-1.5rem', 
                                      top: '4px',
                                      transform: 'translateX(-50%)',
                                      width: '24px', 
                                      height: '24px', 
                                      borderRadius: '50%', 
                                      background: (hasNotas || isLatestVisit) ? 'var(--primary-color)' : 'var(--solid-surface)',
                                      border: (hasNotas || isLatestVisit) ? '2px solid var(--primary-color)' : '2px solid var(--surface-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: (hasNotas || isLatestVisit) ? '#ffffff' : 'var(--text-secondary)',
                                      boxShadow: (hasNotas || isLatestVisit) ? '0 0 10px rgba(180, 97, 42, 0.4)' : 'none',
                                      zIndex: 2
                                    }}
                                  >
                                    {hasNotas ? <Palette size={12} /> : <Scissors size={12} />}
                                  </div>

                                  {/* Tarjeta de la Comanda */}
                                  <div 
                                    style={{ 
                                      padding: '1.15rem', 
                                      borderRadius: '10px',
                                      backgroundColor: 'var(--solid-surface)',
                                      border: isLatestVisit
                                        ? '2px solid var(--primary-color)'
                                        : hasNotas
                                          ? '1px solid rgba(180, 97, 42, 0.35)'
                                          : '1px solid var(--surface-border)',
                                      boxShadow: isLatestVisit ? '0 8px 20px -6px rgba(180, 97, 42, 0.2)' : 'var(--shadow-sm)'
                                    }}
                                  >
                                    {/* Header de la visita */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                          {isLatestVisit && (
                                            <span style={{
                                              background: 'var(--primary-color)',
                                              color: '#ffffff',
                                              padding: '0.15rem 0.55rem',
                                              borderRadius: '6px',
                                              fontSize: '0.7rem',
                                              fontWeight: 700,
                                              letterSpacing: '0.03em',
                                              textTransform: 'uppercase'
                                            }}>
                                              ✨ Última Visita
                                            </span>
                                          )}
                                          <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                            {formatFechaLegible(orden.fecha_hora)}
                                          </span>
                                          <span style={{ 
                                            background: 'rgba(180, 97, 42, 0.08)', 
                                            padding: '0.15rem 0.45rem', 
                                            borderRadius: '6px', 
                                            fontSize: '0.72rem', 
                                            color: 'var(--text-secondary)',
                                            fontWeight: 500
                                          }}>
                                            {getRelativeTime(orden.fecha_hora)}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                          Atendido por: <strong style={{ color: 'var(--text-primary)' }}>{estilistaTexto}</strong>
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{
                                          padding: '0.15rem 0.5rem',
                                          borderRadius: '8px',
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          background: orden.estado === 'completada' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                          color: orden.estado === 'completada' ? '#16a34a' : '#b45309'
                                        }}>
                                          {orden.estado === 'completada' ? 'Completado' : orden.estado}
                                        </span>
                                        {!isOperator && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                                              $ {Number(orden.total_economico || 0).toLocaleString()}
                                            </span>
                                            {orden.pago_estado === 'pagado' && (
                                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                • {formatMetodoPagoLabel(orden, true)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Servicios e Insumos Realizados */}
                                    {detalles.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.6rem 0' }}>
                                        {detalles.map((d, itemIdx) => {
                                          const isServ = d.tipo_item === 'servicio'
                                          return (
                                            <span 
                                              key={d.id || itemIdx}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.25rem 0.55rem',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: isServ ? 'rgba(180, 97, 42, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                                                color: isServ ? 'var(--primary-color)' : 'var(--text-primary)',
                                                border: isServ ? '1px solid rgba(180, 97, 42, 0.25)' : '1px solid var(--surface-border)'
                                              }}
                                            >
                                              {isServ ? <Scissors size={11} /> : <Sparkles size={11} />}
                                              <span>{getItemName(d)}</span>
                                              {Number(d.cantidad) > 1 && <span style={{ opacity: 0.7 }}>x{d.cantidad}</span>}
                                            </span>
                                          )
                                        })}
                                      </div>
                                    )}

                                    {/* TARJETA DESTACADA: FÓRMULA DE COLOR Y OBSERVACIONES TÉCNICAS (EDITABLE DIRECTAMENTE AQUÍ) */}
                                    <div 
                                      style={{ 
                                        marginTop: '0.75rem',
                                        backgroundColor: hasNotas ? 'rgba(180, 97, 42, 0.08)' : 'rgba(180, 97, 42, 0.03)',
                                        border: hasNotas ? '1px solid rgba(180, 97, 42, 0.35)' : '1px dashed var(--surface-border)',
                                        borderRadius: '8px',
                                        padding: '0.85rem 1rem',
                                        position: 'relative'
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: isEditingThisOrden || hasNotas ? '0.45rem' : 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary-color)', fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          <Palette size={14} />
                                          <span>{isLatestVisit ? 'Última Fórmula de Color & Notas Técnicas:' : 'Fórmula de Color & Notas Técnicas:'}</span>
                                        </div>

                                        {!isEditingThisOrden && (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '0.22rem 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            onClick={() => {
                                              setEditingOrdenId(orden.id)
                                              setOrdenNotasDraft(orden.notas || '')
                                            }}
                                          >
                                            <Edit size={11} />
                                            <span>{hasNotas ? 'Editar Fórmula' : 'Anotar Fórmula'}</span>
                                          </button>
                                        )}
                                      </div>

                                      {isEditingThisOrden ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.35rem' }}>
                                          <textarea
                                            className="input-field"
                                            rows="3"
                                            style={{ width: '100%', margin: 0, fontSize: '0.875rem' }}
                                            placeholder="Ej: Raíz 10g 3 + 20g 9 + 45g 20 vol. Largos 5g 3 + 15g 9 + 30g 20 vol..."
                                            value={ordenNotasDraft}
                                            onChange={(e) => setOrdenNotasDraft(e.target.value)}
                                          />
                                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                              type="button"
                                              className="btn btn-secondary"
                                              style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                                              onClick={() => {
                                                setEditingOrdenId(null)
                                                setOrdenNotasDraft('')
                                              }}
                                              disabled={savingOrdenNotas}
                                            >
                                              Cancelar
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-primary"
                                              style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                              onClick={() => handleSaveOrdenNotas(orden.id)}
                                              disabled={savingOrdenNotas}
                                            >
                                              <Save size={13} />
                                              <span>{savingOrdenNotas ? 'Guardando...' : 'Guardar Fórmula'}</span>
                                            </button>
                                          </div>
                                        </div>
                                      ) : hasNotas ? (
                                        <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontWeight: '600' }}>
                                          {orden.notas}
                                        </p>
                                      ) : (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                          Sin fórmula anotada en esta visita. Pulsa &quot;Anotar Fórmula&quot; para registrarla.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}

                            {/* NOTA / FÓRMULA HISTÓRICA ANTERIOR (SI TENÍA DATOS GUARDADOS EN EL CAMPO NOTAS DE LA FICHA) */}
                            {(matchesLegacyNote || editingPermanentNotes) && (
                              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                <div 
                                  style={{ 
                                    position: 'absolute', 
                                    left: '-1.5rem', 
                                    top: '4px',
                                    transform: 'translateX(-50%)',
                                    width: '24px', 
                                    height: '24px', 
                                    borderRadius: '50%', 
                                    background: historialOrdenes.length === 0 ? 'var(--primary-color)' : 'var(--solid-surface)',
                                    border: '2px solid var(--primary-color)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: historialOrdenes.length === 0 ? '#ffffff' : 'var(--primary-color)',
                                    zIndex: 2
                                  }}
                                >
                                  <Palette size={12} />
                                </div>

                                <div 
                                  style={{ 
                                    padding: '1.1rem', 
                                    borderRadius: '10px',
                                    backgroundColor: 'var(--solid-surface)',
                                    border: historialOrdenes.length === 0 ? '2px solid var(--primary-color)' : '1px solid rgba(180, 97, 42, 0.3)',
                                    boxShadow: 'var(--shadow-sm)'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                      <span style={{
                                        background: historialOrdenes.length === 0 ? 'var(--primary-color)' : 'rgba(180, 97, 42, 0.12)',
                                        color: historialOrdenes.length === 0 ? '#ffffff' : 'var(--primary-color)',
                                        padding: '0.15rem 0.55rem',
                                        borderRadius: '6px',
                                        fontSize: '0.72rem',
                                        fontWeight: 700
                                      }}>
                                        {historialOrdenes.length === 0 ? '✨ Última Fórmula / Nota Registrada' : '📋 Fórmula / Nota Anterior (Ficha Inicial)'}
                                      </span>
                                    </div>

                                    {!editingPermanentNotes && (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.22rem 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                        onClick={() => {
                                          setPermanentNotesDraft(selectedCliente.notas || '')
                                          setEditingPermanentNotes(true)
                                        }}
                                      >
                                        <Edit size={11} />
                                        <span>Editar Nota</span>
                                      </button>
                                    )}
                                  </div>

                                  {editingPermanentNotes ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.4rem' }}>
                                      <textarea
                                        className="input-field"
                                        rows="3"
                                        style={{ width: '100%', margin: 0, fontSize: '0.875rem' }}
                                        placeholder="Escribe la fórmula de color o nota técnica..."
                                        value={permanentNotesDraft}
                                        onChange={(e) => setPermanentNotesDraft(e.target.value)}
                                      />
                                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                                          onClick={() => {
                                            setPermanentNotesDraft(selectedCliente.notas || '')
                                            setEditingPermanentNotes(false)
                                          }}
                                          disabled={savingPermanentNotes}
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                          onClick={handleSavePermanentNotes}
                                          disabled={savingPermanentNotes}
                                        >
                                          <Save size={13} />
                                          <span>{savingPermanentNotes ? 'Guardando...' : 'Guardar'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div 
                                      style={{ 
                                        backgroundColor: 'rgba(180, 97, 42, 0.07)',
                                        border: '1px solid rgba(180, 97, 42, 0.25)',
                                        borderRadius: '8px',
                                        padding: '0.75rem 0.95rem'
                                      }}
                                    >
                                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontWeight: '600' }}>
                                        {selectedCliente.notas}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* PRÓXIMOS O HISTÓRICOS TURNOS DE LA AGENDA */}
                  {historialTurnos.length > 0 && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 0.85rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                        <Calendar size={16} style={{ color: 'var(--primary-color)' }} />
                        Citas y Turnos Agendados
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {historialTurnos.slice(0, 5).map(turno => (
                          <div 
                            key={turno.id}
                            style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              padding: '0.65rem 0.85rem', 
                              borderRadius: '8px', 
                              backgroundColor: 'var(--solid-surface)',
                              border: '1px solid var(--surface-border)',
                              fontSize: '0.825rem',
                              boxShadow: 'var(--shadow-sm)'
                            }}
                          >
                            <div>
                              <strong style={{ color: 'var(--text-primary)' }}>{formatFechaLegible(turno.fecha_hora_inicio)}</strong>
                              <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                — {turno.servicios?.nombre || 'Servicio'} con {turno.usuarios?.nombre_completo || 'Estilista'}
                              </span>
                              {turno.notas && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', marginTop: '0.15rem', fontWeight: 500 }}>
                                  💬 {turno.notas}
                                </div>
                              )}
                            </div>
                            <span style={{
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              background: turno.estado === 'Realizado' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(180, 97, 42, 0.12)',
                              color: turno.estado === 'Realizado' ? '#16a34a' : 'var(--primary-color)'
                            }}>
                              {turno.estado}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* === TAB 2: DATOS PERSONALES DEL CLIENTE === */}
              {(!selectedCliente || activeModalTab === 'datos') && (
                <form id="cliente-datos-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label>Apellido</label>
                      <input type="text" className="input-field" name="apellido" value={formData.apellido} onChange={handleInputChange} />
                    </div>
                    <div className="input-group">
                      <label>Nombre *</label>
                      <input required type="text" className="input-field" name="nombre" value={formData.nombre} onChange={handleInputChange} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Clasificación de Cliente *</label>
                    <select className="input-field" name="tipo_cliente" value={formData.tipo_cliente} onChange={handleInputChange}>
                      <option value="nuevo">✨ Cliente Nuevo</option>
                      <option value="antiguo">🏛️ Cliente Antiguo (Peluquería anterior)</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label>Teléfono</label>
                      <input type="tel" className="input-field" name="telefono" value={formData.telefono} onChange={handleInputChange} />
                    </div>
                    <div className="input-group">
                      <label>Email</label>
                      <input type="email" className="input-field" name="email" value={formData.email} onChange={handleInputChange} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '1rem' }}>
                    <div className="input-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Cake size={14} style={{ color: 'var(--primary-color)' }} />
                        <span>Cumpleaños * <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Año opcional)</span></span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr 105px', gap: '0.5rem' }}>
                        <select
                          required
                          className="input-field"
                          name="cumple_dia"
                          value={formData.cumple_dia}
                          onChange={handleInputChange}
                          title="Día de cumpleaños (Obligatorio)"
                        >
                          <option value="">Día *</option>
                          {Array.from(
                            { length: getMaxDaysInMonth(formData.cumple_mes, formData.cumple_anio) },
                            (_, i) => String(i + 1).padStart(2, '0')
                          ).map(d => (
                            <option key={d} value={d}>{Number(d)}</option>
                          ))}
                        </select>

                        <select
                          required
                          className="input-field"
                          name="cumple_mes"
                          value={formData.cumple_mes}
                          onChange={handleInputChange}
                          title="Mes de cumpleaños (Obligatorio)"
                        >
                          <option value="">Mes *</option>
                          {MESES_OPCIONES.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>

                        <input
                          type="number"
                          className="input-field"
                          name="cumple_anio"
                          placeholder="Año (opc.)"
                          min="1905"
                          max={new Date().getFullYear()}
                          value={formData.cumple_anio}
                          onChange={handleInputChange}
                          title="Año de nacimiento (Opcional)"
                        />
                      </div>
                    </div>
                    <div className="input-group">
                      <label>Profesión</label>
                      <input type="text" className="input-field" name="profesion" value={formData.profesion} onChange={handleInputChange} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Dirección</label>
                    <input type="text" className="input-field" name="direccion" value={formData.direccion} onChange={handleInputChange} />
                  </div>

                  {!selectedCliente && (
                    <div className="input-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Palette size={15} style={{ color: 'var(--primary-color)' }} />
                        Fórmula de Color / Nota Inicial (Opcional)
                      </label>
                      <textarea 
                        className="input-field" 
                        name="notas" 
                        rows="3" 
                        placeholder="Si deseas anotar una fórmula de color o nota inicial para este cliente..."
                        value={formData.notas} 
                        onChange={handleInputChange}
                      ></textarea>
                    </div>
                  )}
                </form>
              )}

            </div>

            {/* FOOTER DEL MODAL */}
            <div 
              style={{ 
                padding: '1rem 1.5rem', 
                borderTop: '1px solid var(--surface-border)',
                backgroundColor: 'var(--solid-surface)',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center' 
              }}
            >
              <div>
                {selectedCliente && activeModalTab === 'historial' && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    💡 Puedes anotar o editar la fórmula directamente aquí arriba o al cargar la comanda en <strong>Comandas</strong>.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cerrar
                </button>
                {(!selectedCliente || activeModalTab === 'datos') && (
                  <button type="submit" form="cliente-datos-form" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : selectedCliente ? 'Guardar Cambios' : 'Crear Cliente'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
