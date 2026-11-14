import AgendaTabs from '../components/AgendaTabs'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { 
  Plus, Calendar as CalendarIcon, User, Scissors, Clock, 
  ChevronLeft, ChevronRight, Search, CheckCircle2, AlertCircle, 
  Trash2, Edit, X, Star, FileText, Filter, Wrench, Phone, MessageCircle, List
} from 'lucide-react'

export default function Agenda() {
  const { activeEmpresaId } = useAuth()
  const navigate = useNavigate()
  
  // Responsive detection
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false))

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // App states
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? 'day' : 'week')) // 'day' | 'list' | 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [turnos, setTurnos] = useState([])
  const [clientes, setClientes] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [servicios, setServicios] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  
  // Advanced filters state
  const [selectedColaboradores, setSelectedColaboradores] = useState([])
  const [selectedServicios, setSelectedServicios] = useState([])
  const [selectedEstados, setSelectedEstados] = useState([])
  const [showFilters, setShowFilters] = useState(false)

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [selectedTurno, setSelectedTurno] = useState(null)
  const [clienteSearch, setClienteSearch] = useState('')
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  
  // Action selector popup states
  const [showActionSelector, setShowActionSelector] = useState(false)
  const [selectedTurnoForAction, setSelectedTurnoForAction] = useState(null)
  
  // Form states
  const [isQuickClient, setIsQuickClient] = useState(false)
  const [formData, setFormData] = useState({
    cliente_id: '',
    cliente_nombre_rapido: '',
    colaborador_id: '',
    servicio_id: '',
    fecha: '',
    hora_inicio: '10:00',
    duracion: '60', // minutes
    notas: '',
    estado: 'Pendiente'
  })

  useEffect(() => {
    if (activeEmpresaId) {
      fetchCatalogData()
      fetchTurnos()
    }
  }, [activeEmpresaId, currentDate, viewMode])

  // Fetch clients, operators, and services
  const fetchCatalogData = async () => {
    try {
      const [resClientes, resColabs, resServicios] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido').eq('empresa_id', activeEmpresaId).order('nombre'),
        supabase.from('usuarios').select('id, nombre_completo, rol').eq('empresa_id', activeEmpresaId).order('nombre_completo'),
        supabase.from('servicios').select('id, nombre, precio').eq('empresa_id', activeEmpresaId).order('nombre')
      ])

      setClientes(resClientes.data || [])
      // Filter out only active operators and admins for assignment
      setColaboradores(resColabs.data || [])
      setServicios(resServicios.data || [])
    } catch (err) {
      console.error('Error fetching catalog data:', err)
    }
  }

  // Helper para obtener fecha YYYY-MM-DD en hora local (evita desfase UTC en Argentina UTC-3)
  function toLocalDateStr(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Fetch bookings in the current view range
  const fetchTurnos = async () => {
    try {
      setLoading(true)
      let startRange, endRange

      if (viewMode === 'month') {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1 - 7, 0, 0, 0, 0)
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7, 23, 59, 59, 999)
        startRange = start.toISOString()
        endRange = end.toISOString()
      } else {
        // En vista 'day', 'list' o 'week', cargamos la semana completa (de lunes a domingo)
        // para que la cinta táctil de días (Date Strip) tenga los conteos al instante sin parpadeos.
        const start = getOfWeek(currentDate, 1)
        start.setHours(0, 0, 0, 0)
        const end = getOfWeek(currentDate, 7)
        end.setHours(23, 59, 59, 999)
        startRange = start.toISOString()
        endRange = end.toISOString()
      }

      const { data, error } = await supabase
        .from('turnos')
        .select(`
          *,
          clientes (id, nombre, apellido, telefono),
          usuarios (id, nombre_completo),
          servicios (id, nombre, precio)
        `)
        .eq('empresa_id', activeEmpresaId)
        .gte('fecha_hora_inicio', startRange)
        .lte('fecha_hora_inicio', endRange)
        .order('fecha_hora_inicio', { ascending: true })

      if (error) throw error
      setTurnos(data || [])
    } catch (err) {
      console.error('Error fetching bookings:', err)
    } finally {
      setLoading(false)
    }
  }

  // Helper to get specific day (1=Monday ... 7=Sunday) of current date's week in local time
  function getOfWeek(d, dayIndex) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0)
    const day = date.getDay()
    const isoDay = day === 0 ? 7 : day
    const diff = date.getDate() - isoDay + dayIndex
    date.setDate(diff)
    return date
  }

  // 7 days of the current week (from Monday to Sunday)
  const weekDays = []
  for (let i = 1; i <= 7; i++) {
    weekDays.push(getOfWeek(currentDate, i))
  }

  const getDayTurnosCount = (dateObj) => {
    const dateStr = toLocalDateStr(dateObj)
    return filteredTurnos.filter(t => {
      if (!t.fecha_hora_inicio) return false
      return toLocalDateStr(t.fecha_hora_inicio) === dateStr
    }).length
  }

  // Date Navigation handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'day' || viewMode === 'list') {
      newDate.setDate(newDate.getDate() - 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'day' || viewMode === 'list') {
      newDate.setDate(newDate.getDate() + 1)
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Pre-open booking dialog on empty hour click
  const handleGridCellClick = (dateStr, hourStr) => {
    setIsQuickClient(false)
    setSelectedTurno(null)
    setClienteSearch('')
    setShowClienteDropdown(false)
    setFormData({
      cliente_id: '',
      cliente_nombre_rapido: '',
      colaborador_id: colaboradores[0]?.id || '',
      servicio_id: servicios[0]?.id || '',
      fecha: dateStr,
      hora_inicio: hourStr,
      duracion: '60',
      notas: '',
      estado: 'Pendiente'
    })
    setShowModal(true)
  }

  // Load turning for edit directly
  const proceedToEditDirect = (turno) => {
    if (!turno) return
    setShowActionSelector(false)

    setSelectedTurno(turno)
    setIsQuickClient(!!turno.cliente_nombre_rapido)
    
    if (turno.cliente_id && turno.clientes) {
      setClienteSearch(`${turno.clientes.nombre} ${turno.clientes.apellido}`)
    } else {
      setClienteSearch('')
    }
    setShowClienteDropdown(false)
    
    // Parse start date & hour in local time
    const startObj = new Date(turno.fecha_hora_inicio)
    const endObj = new Date(turno.fecha_hora_fin)
    const diffMins = Math.round((endObj - startObj) / (1000 * 60))

    const dateStr = toLocalDateStr(startObj)
    const hourStr = `${String(startObj.getHours()).padStart(2, '0')}:${String(startObj.getMinutes()).padStart(2, '0')}`

    setFormData({
      cliente_id: turno.cliente_id || '',
      cliente_nombre_rapido: turno.cliente_nombre_rapido || '',
      colaborador_id: turno.colaborador_id || '',
      servicio_id: turno.servicio_id || '',
      fecha: dateStr,
      hora_inicio: hourStr,
      duracion: String(diffMins),
      notas: turno.notas || '',
      estado: turno.estado || 'Pendiente'
    })
    setShowModal(true)
  }

  // Action popup trigger
  const handleTurnoClick = (turno, e) => {
    e.stopPropagation()
    setSelectedTurnoForAction(turno)
    setShowActionSelector(true)
  }

  const proceedToEdit = () => {
    proceedToEditDirect(selectedTurnoForAction)
  }

  const proceedToCreateOT = () => {
    const turno = selectedTurnoForAction
    if (!turno) return
    setShowActionSelector(false)
    
    if (!turno.cliente_id) {
      alert("Para crear una Orden de Trabajo, el turno debe tener un cliente registrado. Por favor, edita el turno y selecciona un cliente registrado.")
      return
    }

    // Redirect to Work Orders page with preselected parameters in router state
    navigate('/ordenes', {
      state: {
        createNewForClienteId: turno.cliente_id,
        colaboradorId: turno.colaborador_id,
        servicioId: turno.servicio_id,
        precio: turno.servicios?.precio ?? turno.precio ?? null,
        turnoId: turno.id,
        turnoInfo: {
          id: turno.id,
          fecha: turno.fecha_hora_inicio,
          servicioNombre: turno.servicios?.nombre || 'Servicio agendado',
          colaboradorNombre: turno.usuarios?.nombre_completo || ''
        }
      }
    })
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveTurno = async (e) => {
    e.preventDefault()
    try {
      if (!formData.fecha || !formData.hora_inicio) {
        return alert('Por favor completa la fecha y hora de inicio.')
      }

      // Compute full timestamp explicitly in local timezone
      const [year, month, day] = formData.fecha.split('-').map(Number)
      const [hours, mins] = formData.hora_inicio.split(':').map(Number)
      const startDateTime = new Date(year, month - 1, day, hours, mins, 0, 0)
      const endDateTime = new Date(startDateTime.getTime() + Number(formData.duracion) * 60 * 1000)

      const payload = {
        empresa_id: activeEmpresaId,
        cliente_id: isQuickClient ? null : (formData.cliente_id || null),
        cliente_nombre_rapido: isQuickClient ? formData.cliente_nombre_rapido : null,
        colaborador_id: formData.colaborador_id || null,
        servicio_id: formData.servicio_id || null,
        fecha_hora_inicio: startDateTime.toISOString(),
        fecha_hora_fin: endDateTime.toISOString(),
        notas: formData.notas || null,
        estado: formData.estado
      }

      if (selectedTurno) {
        // Edit
        const { error } = await supabase
          .from('turnos')
          .update(payload)
          .eq('id', selectedTurno.id)

        if (error) throw error
      } else {
        // Create
        const { error } = await supabase
          .from('turnos')
          .insert([payload])

        if (error) throw error
      }

      setShowModal(false)
      fetchTurnos()
    } catch (err) {
      console.error('Error saving turn:', err)
      alert('Error al guardar el turno: ' + err.message)
    }
  }

  const handleDeleteTurno = async () => {
    if (!selectedTurno) return
    if (!window.confirm('¿Estás seguro de que deseas eliminar este agendamiento?')) return
    try {
      const { error } = await supabase
        .from('turnos')
        .delete()
        .eq('id', selectedTurno.id)

      if (error) throw error
      setShowModal(false)
      fetchTurnos()
    } catch (err) {
      console.error('Error deleting turn:', err)
      alert('Error al eliminar el turno')
    }
  }

  // Filter turnos based on search query and advanced selections
  const filteredTurnos = turnos.filter(t => {
    // 1. Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const nameManual = t.cliente_nombre_rapido?.toLowerCase() || ''
      const dbNameStr = t.clientes ? `${t.clientes.nombre} ${t.clientes.apellido}`.toLowerCase() : ''
      const serviceName = t.servicios?.nombre?.toLowerCase() || ''
      const stylisName = t.usuarios?.nombre_completo?.toLowerCase() || ''
      
      const matchesSearch = nameManual.includes(q) || dbNameStr.includes(q) || serviceName.includes(q) || stylisName.includes(q)
      if (!matchesSearch) return false
    }

    // 2. Colaboradores Filter
    if (selectedColaboradores.length > 0) {
      if (!selectedColaboradores.includes(t.colaborador_id)) return false
    }

    // 3. Servicios Filter
    if (selectedServicios.length > 0) {
      if (!selectedServicios.includes(t.servicio_id)) return false
    }

    // 4. Estados Filter
    if (selectedEstados.length > 0) {
      if (!selectedEstados.includes(t.estado)) return false
    }

    return true
  })

  // Date Formatting Utilities
  const getHeaderTitle = () => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    } else if (viewMode === 'list') {
      return `Cronograma • ${currentDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
    } else if (viewMode === 'week') {
      const start = getOfWeek(currentDate, 1)
      const end = getOfWeek(currentDate, 6)
      return `${start.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`
    } else {
      return currentDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    }
  }

  // Hours definition for day/week grid
  const workingHours = []
  for (let i = 8; i <= 20; i++) {
    workingHours.push(`${i < 10 ? '0' + i : i}:00`)
  }

  // Get color depending on state
  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'Confirmado': return { bg: 'rgba(34, 197, 94, 0.15)', border: 'var(--success-color)', text: 'var(--success-color)' }
      case 'Realizado': return { bg: 'rgba(180, 97, 42, 0.15)', border: 'var(--primary-color)', text: 'var(--primary-color)' }
      case 'Cancelado': return { bg: 'rgba(239, 68, 68, 0.15)', border: 'var(--danger-color)', text: 'var(--danger-color)' }
      default: return { bg: 'rgba(234, 179, 8, 0.15)', border: 'var(--warning-color)', text: 'var(--warning-color)' }
    }
  }

  // Render Mobile Day View (Optimized touch feed for phones)
  const renderMobileDayView = () => {
    const dateStr = toLocalDateStr(currentDate)
    const dayTurnos = filteredTurnos.filter(t => {
      return toLocalDateStr(t.fecha_hora_inicio) === dateStr
    }).sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))

    if (dayTurnos.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(180, 97, 42, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
            <CalendarIcon size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: '700' }}>Sin turnos agendados</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '280px' }}>
            No hay citas programadas para el {currentDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}.
          </p>
          <button 
            type="button"
            className="btn btn-primary" 
            style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => handleGridCellClick(dateStr, '10:00')}
          >
            <Plus size={18} /> Agendar Turno
          </button>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
            {dayTurnos.length} {dayTurnos.length === 1 ? 'turno programado' : 'turnos programados'}
          </span>
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '8px' }}
            onClick={() => handleGridCellClick(dateStr, '11:00')}
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>

        {dayTurnos.map(turno => {
          const colors = getEstadoColor(turno.estado)
          const start = new Date(turno.fecha_hora_inicio)
          const end = new Date(turno.fecha_hora_fin)
          const startTimeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const endTimeStr = end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const diffMins = Math.round((end - start) / (1000 * 60))
          const clientName = turno.cliente_nombre_rapido || (turno.clientes ? `${turno.clientes.nombre} ${turno.clientes.apellido}` : 'Cliente Sin Nombre')
          const clientPhone = turno.clientes?.telefono
          const phoneClean = clientPhone ? clientPhone.replace(/\D/g, '') : null

          return (
            <div 
              key={turno.id}
              onClick={(e) => handleTurnoClick(turno, e)}
              style={{
                background: 'var(--surface-color)',
                backdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--surface-border)',
                borderLeft: `4px solid ${colors.border}`,
                borderRadius: '14px',
                padding: '1rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.3rem', 
                    fontSize: '0.9rem', 
                    fontWeight: '700', 
                    color: 'var(--text-primary)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px'
                  }}>
                    <Clock size={14} color="var(--primary-color)" />
                    {startTimeStr} - {endTimeStr}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    ({diffMins}m)
                  </span>
                </div>

                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  background: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`
                }}>
                  {turno.estado || 'Pendiente'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {clientName}
                    </span>
                    {turno.cliente_nombre_rapido && (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--warning-color)', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 'normal', flexShrink: 0 }}>
                        Rápido
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600' }}>
                      <Scissors size={13} />
                      {turno.servicios?.nombre || 'Servicio'}
                    </span>
                    {turno.servicios?.precio && (
                      <span style={{ fontSize: '0.78rem', background: 'rgba(180, 97, 42, 0.12)', color: 'var(--primary-color)', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: '700' }}>
                        ${Number(turno.servicios.precio).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>

                  {turno.usuarios?.nombre_completo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      <User size={12} />
                      <span>{turno.usuarios.nombre_completo}</span>
                    </div>
                  )}

                  {turno.notas && (
                    <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-secondary)', marginTop: '0.3rem', background: 'rgba(255,255,255,0.03)', padding: '0.3rem 0.5rem', borderRadius: '6px' }}>
                      "{turno.notas}"
                    </div>
                  )}
                </div>

                {phoneClean && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <a 
                      href={`https://wa.me/${phoneClean}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      title="Enviar WhatsApp"
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '50%', 
                        background: 'rgba(34, 197, 94, 0.15)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#22c55e',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      }}
                    >
                      <MessageCircle size={16} />
                    </a>
                    <a 
                      href={`tel:${phoneClean}`} 
                      title="Llamar"
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '50%', 
                        background: 'rgba(59, 130, 246, 0.15)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: '#3b82f6',
                        border: '1px solid rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      <Phone size={16} />
                    </a>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--primary-color), #E39461)',
                    color: '#fff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem'
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedTurnoForAction(turno)
                    proceedToCreateOT()
                  }}
                >
                  <Wrench size={13} /> Comanda
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.78rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    proceedToEditDirect(turno)
                  }}
                >
                  <Edit size={13} /> Editar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Render Chronological List View
  const renderListView = () => {
    const sorted = [...filteredTurnos].sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))

    if (sorted.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(180, 97, 42, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
            <CalendarIcon size={32} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: '700' }}>Sin turnos encontrados</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            No hay citas registradas que coincidan con la búsqueda o filtro en este período.
          </p>
          <button 
            type="button"
            className="btn btn-primary" 
            style={{ marginTop: '0.5rem' }}
            onClick={() => handleGridCellClick(toLocalDateStr(currentDate), '10:00')}
          >
            <Plus size={18} /> Agendar Turno
          </button>
        </div>
      )
    }

    const grouped = {}
    sorted.forEach(t => {
      const dateKey = toLocalDateStr(t.fecha_hora_inicio)
      if (!grouped[dateKey]) grouped[dateKey] = []
      grouped[dateKey].push(t)
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {Object.entries(grouped).map(([dateKey, items]) => {
          const dObj = new Date(dateKey + 'T12:00:00')
          const isToday = dObj.toDateString() === new Date().toDateString()

          return (
            <div key={dateKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.45rem 0.75rem', 
                background: isToday ? 'rgba(180, 97, 42, 0.15)' : 'rgba(255, 255, 255, 0.04)', 
                borderRadius: '8px',
                borderLeft: isToday ? '3px solid var(--primary-color)' : '3px solid var(--surface-border)'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: isToday ? 'var(--primary-color)' : 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {dObj.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  ({items.length} {items.length === 1 ? 'cita' : 'citas'})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {items.map(turno => {
                  const colors = getEstadoColor(turno.estado)
                  const start = new Date(turno.fecha_hora_inicio)
                  const end = new Date(turno.fecha_hora_fin)
                  const startTimeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  const endTimeStr = end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  const clientName = turno.cliente_nombre_rapido || (turno.clientes ? `${turno.clientes.nombre} ${turno.clientes.apellido}` : 'Cliente Sin Nombre')
                  const clientPhone = turno.clientes?.telefono
                  const phoneClean = clientPhone ? clientPhone.replace(/\D/g, '') : null

                  return (
                    <div 
                      key={turno.id}
                      onClick={(e) => handleTurnoClick(turno, e)}
                      style={{
                        background: 'var(--surface-color)',
                        backdropFilter: 'var(--glass-blur)',
                        border: '1px solid var(--surface-border)',
                        borderLeft: `4px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Clock size={13} color="var(--primary-color)" />
                          {startTimeStr} - {endTimeStr}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '10px', background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                          {turno.estado || 'Pendiente'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{clientName}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                            <Scissors size={12} />
                            {turno.servicios?.nombre || 'Servicio'}
                            {turno.usuarios?.nombre_completo && <span style={{ color: 'var(--text-secondary)' }}> • {turno.usuarios.nombre_completo}</span>}
                          </div>
                        </div>

                        {phoneClean && (
                          <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                            <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer" style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                              <MessageCircle size={15} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Render Grid Content for Day View
  const renderDayView = () => {
    if (isMobile) return renderMobileDayView()

    const dateStr = toLocalDateStr(currentDate)
    const dayTurnos = filteredTurnos.filter(t => {
      return toLocalDateStr(t.fecha_hora_inicio) === dateStr
    })

    const sortedTurnos = [...dayTurnos].sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))
    const columns = [] 
    const bookingCol = {} 

    sortedTurnos.forEach(t => {
      const start = new Date(t.fecha_hora_inicio)
      const end = new Date(t.fecha_hora_fin)
      const startHour = start.getHours() + start.getMinutes() / 60
      const endHour = end.getHours() + end.getMinutes() / 60

      let colIdx = 0
      while (true) {
        if (!columns[colIdx]) {
          columns[colIdx] = []
          columns[colIdx].push({ t, startHour, endHour })
          bookingCol[t.id] = colIdx
          break
        }
        const overlaps = columns[colIdx].some(existing => !(endHour <= existing.startHour || startHour >= existing.endHour))
        if (!overlaps) {
          columns[colIdx].push({ t, startHour, endHour })
          bookingCol[t.id] = colIdx
          break
        }
        colIdx++
      }
    })

    const getLocalDensity = (t, startHour, endHour) => {
      const overlapsWithT = sortedTurnos.filter(o => {
        if (o.id === t.id) return true
        const oStart = new Date(o.fecha_hora_inicio)
        const oEnd = new Date(o.fecha_hora_fin)
        const oStartHour = oStart.getHours() + oStart.getMinutes() / 60
        const oEndHour = oEnd.getHours() + oEnd.getMinutes() / 60
        return !(endHour <= oStartHour || startHour >= oEndHour)
      })
      let maxCol = 0
      overlapsWithT.forEach(o => {
        const col = bookingCol[o.id] || 0
        if (col > maxCol) maxCol = col
      })
      return maxCol + 1
    }

    const ROW_HEIGHT = 80 
    return (
      <div style={{ display: 'flex', position: 'relative', border: '1px solid var(--surface-border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ width: '70px', background: 'rgba(0,0,0,0.1)', borderRight: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column' }}>
          {workingHours.map(hour => (
            <div key={hour} style={{ height: `${ROW_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', borderBottom: '1px solid var(--surface-border)' }}>
              {hour}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {workingHours.map(hour => (
            <div 
              key={hour} 
              style={{ height: `${ROW_HEIGHT}px`, borderBottom: '1px solid var(--surface-border)', cursor: 'pointer', transition: 'background 0.2s' }}
              onClick={() => handleGridCellClick(dateStr, hour)}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            />
          ))}

          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
            {sortedTurnos.map(t => {
              const startObj = new Date(t.fecha_hora_inicio)
              const endObj = new Date(t.fecha_hora_fin)
              const startHour = startObj.getHours() + startObj.getMinutes() / 60
              const endHour = endObj.getHours() + endObj.getMinutes() / 60
              const totalHours = 13
              const topPercent = Math.max(0, ((startHour - 8) / totalHours) * 100)
              const heightPercent = Math.max(2, ((endHour - startHour) / totalHours) * 100)
              const colIdx = bookingCol[t.id] || 0
              const localDensity = getLocalDensity(t, startHour, endHour)
              const cardWidth = (100 / localDensity)
              const cardLeft = colIdx * cardWidth
              const colors = getEstadoColor(t.estado)

              return (
                <div 
                  key={t.id} 
                  style={{
                    position: 'absolute',
                    top: `${topPercent}%`,
                    height: `calc(${heightPercent}% - 4px)`,
                    left: `calc(${cardLeft}% + 4px)`,
                    width: `calc(${cardWidth}% - 8px)`,
                    pointerEvents: 'auto',
                    background: colors.bg,
                    backdropFilter: 'var(--glass-blur)',
                    borderLeft: `5px solid ${colors.border}`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    padding: '0.6rem 1rem',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-lg)',
                    cursor: 'pointer',
                    zIndex: 2,
                    overflow: 'hidden'
                  }}
                  onClick={(e) => handleTurnoClick(t, e)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                        {t.cliente_nombre_rapido || (t.clientes ? `${t.clientes.nombre} ${t.clientes.apellido || ''}`.trim() : (clientes.find(c => c.id === t.cliente_id) ? `${clientes.find(c => c.id === t.cliente_id).nombre} ${clientes.find(c => c.id === t.cliente_id).apellido || ''}`.trim() : 'Cliente'))}
                      </div>
                      {(t.servicios?.nombre || servicios.find(s => s.id === t.servicio_id)?.nombre) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem', fontWeight: '600' }}>
                          <Scissors size={12} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.servicios?.nombre || servicios.find(s => s.id === t.servicio_id)?.nombre}
                          </span>
                        </div>
                      )}
                      {(t.usuarios?.nombre_completo || colaboradores.find(c => c.id === t.colaborador_id)?.nombre_completo) && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                          <User size={11} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.usuarios?.nombre_completo || colaboradores.find(c => c.id === t.colaborador_id)?.nombre_completo}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Render Grid Content for Week View
  const renderWeekView = () => {
    const days = []
    for (let i = 1; i <= 6; i++) { days.push(getOfWeek(currentDate, i)) }
    const ROW_HEIGHT = 80 
    return (
      <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: isMobile ? '680px' : 'auto', display: 'flex', flexDirection: 'column', border: '1px solid var(--surface-border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '2px solid var(--surface-border)', background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ width: '60px' }}></div>
            {days.map(d => {
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <div key={d} style={{ flex: 1, padding: '0.75rem', textAlign: 'center', borderRight: '1px solid var(--surface-border)' }}>
                  <div style={{ fontSize: '0.75rem', color: isToday ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                    {d.toLocaleDateString('es-AR', { weekday: 'short' })}
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 'bold', marginTop: '0.25rem', width: '28px', height: '28px', borderRadius: '50%', background: isToday ? 'var(--primary-color)' : 'transparent', color: isToday ? '#fff' : 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', position: 'relative' }}>
            <div style={{ width: '60px', background: 'rgba(0,0,0,0.05)', borderRight: '1px solid var(--surface-border)' }}>
              {workingHours.map(hour => (
                <div key={hour} style={{ height: `${ROW_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--surface-border)' }}>
                  {hour}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
              {days.map(d => {
                const dateStr = toLocalDateStr(d)
                const dayTurnos = filteredTurnos.filter(t => toLocalDateStr(t.fecha_hora_inicio) === dateStr)
                const sortedTurnos = [...dayTurnos].sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))

                // Algoritmo de columnas para turnos solapados en el mismo día
                const dayColumns = []
                const dayBookingCol = {}

                sortedTurnos.forEach(t => {
                  const start = new Date(t.fecha_hora_inicio)
                  const end = new Date(t.fecha_hora_fin)
                  const startHour = start.getHours() + start.getMinutes() / 60
                  const endHour = end.getHours() + end.getMinutes() / 60

                  let colIdx = 0
                  while (true) {
                    if (!dayColumns[colIdx]) {
                      dayColumns[colIdx] = []
                      dayColumns[colIdx].push({ t, startHour, endHour })
                      dayBookingCol[t.id] = colIdx
                      break
                    }
                    const overlaps = dayColumns[colIdx].some(existing => !(endHour <= existing.startHour || startHour >= existing.endHour))
                    if (!overlaps) {
                      dayColumns[colIdx].push({ t, startHour, endHour })
                      dayBookingCol[t.id] = colIdx
                      break
                    }
                    colIdx++
                  }
                })

                const getDayLocalDensity = (t, startHour, endHour) => {
                  const overlapsWithT = sortedTurnos.filter(o => {
                    if (o.id === t.id) return true
                    const oStart = new Date(o.fecha_hora_inicio)
                    const oEnd = new Date(o.fecha_hora_fin)
                    const oStartHour = oStart.getHours() + oStart.getMinutes() / 60
                    const oEndHour = oEnd.getHours() + oEnd.getMinutes() / 60
                    return !(endHour <= oStartHour || startHour >= oEndHour)
                  })
                  let maxCol = 0
                  overlapsWithT.forEach(o => {
                    const col = dayBookingCol[o.id] || 0
                    if (col > maxCol) maxCol = col
                  })
                  return maxCol + 1
                }

                return (
                  <div key={d} style={{ flex: 1, position: 'relative', borderRight: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column' }}>
                    {workingHours.map(hour => (
                      <div key={hour} style={{ height: `${ROW_HEIGHT}px`, borderBottom: '1px solid var(--surface-border)', cursor: 'pointer' }} onClick={() => handleGridCellClick(dateStr, hour)} />
                    ))}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                      {sortedTurnos.map(t => {
                        const startObj = new Date(t.fecha_hora_inicio)
                        const endObj = new Date(t.fecha_hora_fin)
                        const startHour = startObj.getHours() + startObj.getMinutes() / 60
                        const endHour = endObj.getHours() + endObj.getMinutes() / 60
                        const totalHours = 13
                        const topPercent = Math.max(0, ((startHour - 8) / totalHours) * 100)
                        const heightPercent = Math.max(2.8, ((endHour - startHour) / totalHours) * 100)
                        const diffMins = Math.round((endObj - startObj) / (1000 * 60))

                        const colIdx = dayBookingCol[t.id] || 0
                        const localDensity = getDayLocalDensity(t, startHour, endHour)
                        const cardWidthPercent = 100 / localDensity
                        const cardLeftPercent = colIdx * cardWidthPercent

                        const colors = getEstadoColor(t.estado)
                        const clientName = t.cliente_nombre_rapido || (t.clientes ? `${t.clientes.nombre} ${t.clientes.apellido || ''}`.trim() : (clientes.find(c => c.id === t.cliente_id) ? `${clientes.find(c => c.id === t.cliente_id).nombre} ${clientes.find(c => c.id === t.cliente_id).apellido || ''}`.trim() : 'Cliente'))
                        const serviceName = t.servicios?.nombre || servicios.find(s => s.id === t.servicio_id)?.nombre
                        const stylistName = t.usuarios?.nombre_completo || colaboradores.find(c => c.id === t.colaborador_id)?.nombre_completo
                        const startTimeStr = startObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                        const endTimeStr = endObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

                        return (
                          <div 
                            key={t.id} 
                            style={{ 
                              position: 'absolute', 
                              top: `${topPercent}%`, 
                              left: `calc(${cardLeftPercent}% + 2px)`, 
                              width: `calc(${cardWidthPercent}% - 4px)`, 
                              height: `calc(${heightPercent}% - 2px)`, 
                              backgroundColor: colors.bg, 
                              borderLeft: `4px solid ${colors.border}`, 
                              borderTop: `1px solid ${colors.border}`,
                              borderRight: `1px solid ${colors.border}`,
                              borderBottom: `1px solid ${colors.border}`,
                              borderRadius: '7px', 
                              padding: '0.35rem 0.45rem', 
                              pointerEvents: 'auto', 
                              cursor: 'pointer', 
                              zIndex: 2,
                              overflow: 'hidden',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.15rem',
                              boxSizing: 'border-box'
                            }} 
                            onClick={(e) => handleTurnoClick(t, e)}
                            title={`${clientName}
${serviceName ? `Servicio: ${serviceName}` : ''}
${stylistName ? `Estilista: ${stylistName}` : ''}
Horario: ${startTimeStr} - {endTimeStr} (${diffMins} min)
Estado: ${t.estado || 'Pendiente'}`}
                          >
                            {/* Nombre del Cliente */}
                            <div style={{ 
                              fontSize: '0.78rem', 
                              fontWeight: '700', 
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              lineHeight: 1.2
                            }}>
                              {clientName}
                            </div>

                            {/* Servicio Primario */}
                            {serviceName && (
                              <div style={{ 
                                fontSize: '0.7rem', 
                                fontWeight: '600', 
                                color: 'var(--primary-color)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.2rem',
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2
                              }}>
                                <Scissors size={10} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{serviceName}</span>
                              </div>
                            )}

                            {/* Estilista Asignada */}
                            {stylistName && (
                              <div style={{ 
                                fontSize: '0.68rem', 
                                color: 'var(--text-secondary)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.2rem',
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                lineHeight: 1.2
                              }}>
                                <User size={10} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{stylistName}</span>
                              </div>
                            )}

                            {/* Horario si la tarjeta es suficientemente alta */}
                            {diffMins >= 45 && (
                              <div style={{ 
                                fontSize: '0.64rem', 
                                color: 'var(--text-secondary)', 
                                opacity: 0.9,
                                marginTop: 'auto',
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                paddingTop: '0.1rem'
                              }}>
                                <Clock size={9} style={{ flexShrink: 0 }} />
                                <span>{startTimeStr} - {endTimeStr}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render Grid Content for Month View
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const daysGrid = []
    const prevMonthEnd = new Date(year, month, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) { daysGrid.push({ date: new Date(year, month - 1, prevMonthEnd - i), currentMonth: false }) }
    for (let i = 1; i <= totalDays; i++) { daysGrid.push({ date: new Date(year, month, i), currentMonth: true }) }
    const remaining = 42 - daysGrid.length
    for (let i = 1; i <= remaining; i++) { daysGrid.push({ date: new Date(year, month + 1, i), currentMonth: false }) }

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid var(--surface-border)', borderRadius: '12px', overflow: 'hidden' }}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(l => (
            <div key={l} style={{ padding: isMobile ? '0.35rem 0.1rem' : '0.5rem', textAlign: 'center', fontWeight: 'bold', fontSize: isMobile ? '0.68rem' : '0.75rem', borderBottom: '2px solid var(--surface-border)', background: 'rgba(0,0,0,0.1)' }}>{l}</div>
          ))}
          {daysGrid.map(({ date, currentMonth }, idx) => {
            const dateStr = toLocalDateStr(date)
            const isToday = date.toDateString() === new Date().toDateString()
            const isSelected = date.toDateString() === currentDate.toDateString()
            const matched = filteredTurnos.filter(t => toLocalDateStr(t.fecha_hora_inicio) === dateStr)
            return (
              <div key={idx} style={{ minHeight: isMobile ? '3.8rem' : '6.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)', padding: isMobile ? '0.2rem' : '0.35rem', opacity: currentMonth ? 1 : 0.35, background: isSelected ? 'rgba(180, 97, 42, 0.15)' : 'transparent', display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => { setCurrentDate(date); if (!isMobile) handleGridCellClick(dateStr, '12:00') }}>
                <span style={{ fontSize: isMobile ? '0.75rem' : '0.8rem', fontWeight: 'bold', width: '20px', height: '20px', borderRadius: '50%', background: isSelected ? 'var(--primary-color)' : 'transparent', color: isSelected ? '#fff' : 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{date.getDate()}</span>
                {isMobile ? (
                  matched.length > 0 && <div style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--primary-color)', fontSize: '0.6rem' }}>●</div>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {matched.slice(0, 3).map(t => (
                      <div key={t.id} style={{ background: 'rgba(0,0,0,0.1)', fontSize: '0.65rem', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden' }} onClick={(e) => { e.stopPropagation(); handleTurnoClick(t, e) }}>{t.cliente_nombre_rapido || t.clientes?.nombre}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {isMobile && <div style={{ marginTop: '1.5rem' }}>{renderMobileDayView()}</div>}
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <AgendaTabs actual="agenda" />
      {/* HEADER SECTION */}
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={28} style={{ color: 'var(--primary-color)' }} />
            Agenda y Turnero
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Gestiona la programación horaria y las citas de tus clientes de manera ágil.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setIsQuickClient(false)
          setSelectedTurno(null)
          setClienteSearch('')
          setShowClienteDropdown(false)
          setFormData({
            cliente_id: '',
            cliente_nombre_rapido: '',
            colaborador_id: colaboradores[0]?.id || '',
            servicio_id: servicios[0]?.id || '',
            fecha: toLocalDateStr(currentDate),
            hora_inicio: '10:00',
            duracion: '60',
            notas: '',
            estado: 'Pendiente'
          })
          setShowModal(true)
        }}>
          <Plus size={18} /> Nuevo Turno
        </button>
      </header>

      {/* FILTER & NAVIGATION CONTROLS */}
      <div className="glass-panel" style={{ padding: isMobile ? '1rem' : '1.25rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
          
          {/* Nav Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button className="btn btn-secondary" style={{ padding: '0.45rem 0.6rem' }} onClick={handlePrev} title="Anterior">
                <ChevronLeft size={16} />
              </button>
              <button className="btn btn-secondary" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }} onClick={handleToday}>Hoy</button>
              <button className="btn btn-secondary" style={{ padding: '0.45rem 0.6rem' }} onClick={handleNext} title="Siguiente">
                <ChevronRight size={16} />
              </button>
            </div>

            <h2 style={{ fontSize: isMobile ? '0.95rem' : '1.15rem', fontWeight: 'bold', margin: '0 0.25rem', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
              {getHeaderTitle()}
            </h2>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: isMobile ? '100%' : '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              placeholder="Buscar cliente, servicio..."
              className="input-field"
              style={{ paddingLeft: '2.25rem', width: '100%', margin: 0, fontSize: '0.82rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Action buttons (View Modes & Filter Toggle) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end', flexWrap: 'wrap' }}>
            {/* View Modes */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--surface-border)', flex: isMobile ? '1' : 'none', justifyContent: 'space-around' }}>
              <button 
                className={`btn ${viewMode === 'day' ? 'btn-primary' : ''}`} 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: viewMode === 'day' ? 'var(--primary-color)' : 'transparent', border: 'none', borderRadius: '6px' }}
                onClick={() => setViewMode('day')}
              >
                Día
              </button>
              <button 
                className={`btn ${viewMode === 'list' ? 'btn-primary' : ''}`} 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: viewMode === 'list' ? 'var(--primary-color)' : 'transparent', border: 'none', borderRadius: '6px' }}
                onClick={() => setViewMode('list')}
              >
                Lista
              </button>
              <button 
                className={`btn ${viewMode === 'week' ? 'btn-primary' : ''}`} 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: viewMode === 'week' ? 'var(--primary-color)' : 'transparent', border: 'none', borderRadius: '6px' }}
                onClick={() => setViewMode('week')}
              >
                Sem
              </button>
              <button 
                className={`btn ${viewMode === 'month' ? 'btn-primary' : ''}`} 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: viewMode === 'month' ? 'var(--primary-color)' : 'transparent', border: 'none', borderRadius: '6px' }}
                onClick={() => setViewMode('month')}
              >
                Mes
              </button>
            </div>

            {/* Filter Toggle Button */}
            <button 
              className="btn"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.35rem', 
                padding: '0.45rem 0.85rem', 
                fontSize: '0.78rem',
                borderRadius: '8px',
                border: '1px solid var(--surface-border)',
                background: showFilters ? 'var(--primary-color)' : 'rgba(0,0,0,0.1)',
                color: showFilters ? '#fff' : 'var(--text-primary)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={13} />
              Filtros {(selectedColaboradores.length + selectedServicios.length + selectedEstados.length) > 0 ? `(${selectedColaboradores.length + selectedServicios.length + selectedEstados.length})` : ''}
            </button>
          </div>

        </div>

        {/* DATE STRIP - CINTA SEMANAL TOUCH */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '0.35rem 0.1rem',
          borderTop: '1px solid var(--surface-border)',
          paddingTop: '0.75rem'
        }}>
          {weekDays.map(d => {
            const isSelected = d.toDateString() === currentDate.toDateString()
            const isToday = d.toDateString() === new Date().toDateString()
            const count = getDayTurnosCount(d)
            return (
              <button
                key={toLocalDateStr(d)}
                type="button"
                onClick={() => {
                  setCurrentDate(new Date(d))
                  if (viewMode === 'month') setViewMode('day')
                }}
                style={{
                  flex: isMobile ? '0 0 calc(14.28% - 0.35rem)' : '1',
                  minWidth: isMobile ? '44px' : '55px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: isMobile ? '0.45rem 0.2rem' : '0.55rem 0.35rem',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--surface-border)',
                  background: isSelected 
                    ? 'rgba(180, 97, 42, 0.15)' 
                    : isToday 
                      ? 'rgba(255, 255, 255, 0.05)' 
                      : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  position: 'relative'
                }}
              >
                <span style={{ 
                  fontSize: '0.62rem', 
                  textTransform: 'uppercase', 
                  fontWeight: '700',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-secondary)'
                }}>
                  {d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '').slice(0, 3)}
                </span>
                <span style={{ 
                  fontSize: isMobile ? '0.92rem' : '1.05rem', 
                  fontWeight: '800', 
                  marginTop: '0.1rem',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-primary)'
                }}>
                  {d.getDate()}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: '0.58rem',
                    fontWeight: '700',
                    padding: '0.05rem 0.3rem',
                    borderRadius: '8px',
                    marginTop: '0.15rem',
                    background: isSelected ? 'var(--primary-color)' : 'rgba(180, 97, 42, 0.2)',
                    color: isSelected ? '#fff' : 'var(--primary-color)'
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ADVANCED MULTI-SELECT FILTERS */}
        {showFilters && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)' }}>
          
          {/* Estilistas Toggles */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginRight: '0.5rem', minWidth: '70px' }}>Estilistas:</span>
            <button 
              className={`btn`} 
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.75rem',
                background: selectedColaboradores.length === 0 ? 'var(--primary-color)' : 'transparent',
                border: '1px solid var(--surface-border)',
                borderRadius: '20px',
                color: selectedColaboradores.length === 0 ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedColaboradores([])}
            >
              Todos
            </button>
            {colaboradores.map(c => {
              const isSelected = selectedColaboradores.includes(c.id)
              return (
                <button 
                  key={c.id}
                  className={`btn`}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    background: isSelected ? 'var(--primary-color)' : 'transparent',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '20px',
                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedColaboradores(prev => prev.filter(id => id !== c.id))
                    } else {
                      setSelectedColaboradores(prev => [...prev, c.id])
                    }
                  }}
                >
                  {c.nombre_completo.split(' ')[0]}
                </button>
              )
            })}
          </div>

          {/* Servicios Toggles */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginRight: '0.5rem', minWidth: '70px' }}>Servicios:</span>
            <button 
              className={`btn`} 
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.75rem',
                background: selectedServicios.length === 0 ? 'var(--primary-color)' : 'transparent',
                border: '1px solid var(--surface-border)',
                borderRadius: '20px',
                color: selectedServicios.length === 0 ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedServicios([])}
            >
              Todos
            </button>
            {servicios.map(s => {
              const isSelected = selectedServicios.includes(s.id)
              return (
                <button 
                  key={s.id}
                  className={`btn`}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    background: isSelected ? 'var(--primary-color)' : 'transparent',
                    border: '1px solid var(--surface-border)',
                    borderRadius: '20px',
                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedServicios(prev => prev.filter(id => id !== s.id))
                    } else {
                      setSelectedServicios(prev => [...prev, s.id])
                    }
                  }}
                >
                  {s.nombre}
                </button>
              )
            })}
          </div>

          {/* Estados Toggles */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginRight: '0.5rem', minWidth: '70px' }}>Estados:</span>
            <button 
              className={`btn`} 
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.75rem',
                background: selectedEstados.length === 0 ? 'var(--primary-color)' : 'transparent',
                border: '1px solid var(--surface-border)',
                borderRadius: '20px',
                color: selectedEstados.length === 0 ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedEstados([])}
            >
              Todos
            </button>
            {['Pendiente', 'Confirmado', 'Realizado', 'Cancelado'].map(est => {
              const isSelected = selectedEstados.includes(est)
              let color = 'var(--text-secondary)'
              let activeBg = 'var(--primary-color)'
              let activeBorder = 'var(--primary-color)'

              if (est === 'Confirmado') {
                color = 'var(--success-color)'
                activeBg = 'rgba(34, 197, 94, 0.2)'
                activeBorder = 'var(--success-color)'
              } else if (est === 'Realizado') {
                color = 'var(--primary-color)'
                activeBg = 'rgba(180, 97, 42, 0.2)'
                activeBorder = 'var(--primary-color)'
              } else if (est === 'Cancelado') {
                color = 'var(--danger-color)'
                activeBg = 'rgba(239, 68, 68, 0.2)'
                activeBorder = 'var(--danger-color)'
              } else if (est === 'Pendiente') {
                color = 'var(--warning-color)'
                activeBg = 'rgba(234, 179, 8, 0.2)'
                activeBorder = 'var(--warning-color)'
              }

              return (
                <button 
                  key={est}
                  className={`btn`}
                  style={{
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.75rem',
                    background: isSelected ? activeBg : 'transparent',
                    border: isSelected ? `1px solid ${activeBorder}` : '1px solid var(--surface-border)',
                    borderRadius: '20px',
                    color: isSelected ? color : 'var(--text-secondary)',
                    fontWeight: isSelected ? '600' : 'normal',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedEstados(prev => prev.filter(e => e !== est))
                    } else {
                      setSelectedEstados(prev => [...prev, est])
                    }
                  }}
                >
                  {est}
                </button>
              )
            })}
          </div>

        </div>
        )}
      </div>

      {/* CALENDAR BODY */}
      <div className="glass-panel" style={{ padding: isMobile ? '0.75rem' : '1.5rem', minHeight: '400px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)' }}>
            <Clock size={32} className="animate-pulse" style={{ color: 'var(--primary-color)' }} />
            Cargando agenda...
          </div>
        ) : (
          <>
            {viewMode === 'day' && renderDayView()}
            {viewMode === 'list' && renderListView()}
            {viewMode === 'week' && renderWeekView()}
            {viewMode === 'month' && renderMonthView()}
          </>
        )}
      </div>

      {/* BOOKING MODAL (PORTAL) */}
      {showModal && createPortal(
        <div 
          className="modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            alignItems: isMobile ? 'flex-end' : 'center',
            padding: isMobile ? 0 : '1rem'
          }}
        >
          <div 
            className="modal-content animate-slide-up" 
            style={{ 
              maxWidth: isMobile ? '100%' : '480px', 
              width: '100%',
              maxHeight: isMobile ? '90vh' : '88vh',
              borderRadius: isMobile ? '20px 20px 0 0' : '16px',
              margin: 0,
              padding: isMobile ? '1.25rem 1.25rem 2rem' : '1.5rem',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{selectedTurno ? '📝 Editar Turno' : '✨ Agendar Nuevo Turno'}</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSaveTurno} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* TIPO DE CLIENTE */}
                <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      checked={!isQuickClient} 
                      onChange={() => setIsQuickClient(false)} 
                    />
                    Cliente Registrado
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      checked={isQuickClient} 
                      onChange={() => setIsQuickClient(true)} 
                    />
                    Agendamiento Rápido (Nuevo/Manual)
                  </label>
                </div>

                {/* SELECTOR CLIENTE */}
                {!isQuickClient ? (
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label>Seleccionar Cliente *</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        required 
                        type="text" 
                        placeholder="Escribe para buscar cliente..."
                        className="input-field" 
                        style={{ width: '100%', margin: 0, paddingRight: '2.5rem' }}
                        value={clienteSearch}
                        onChange={(e) => {
                          const val = e.target.value
                          setClienteSearch(val)
                          setShowClienteDropdown(true)
                          if (!val) {
                            setFormData(prev => ({ ...prev, cliente_id: '' }))
                          }
                        }}
                        onFocus={() => setShowClienteDropdown(true)}
                      />
                      {clienteSearch && (
                        <button 
                          type="button" 
                          style={{
                            position: 'absolute',
                            right: '10px',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onClick={() => {
                            setClienteSearch('')
                            setFormData(prev => ({ ...prev, cliente_id: '' }))
                            setShowClienteDropdown(false)
                          }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    
                    {/* DROPDOWN OPTIONS LIST */}
                    {showClienteDropdown && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 999,
                          background: 'var(--solid-surface, #ffffff)',
                          backdropFilter: 'var(--glass-blur)',
                          border: '1px solid var(--surface-border)',
                          borderRadius: '8px',
                          maxHeight: '180px',
                          overflowY: 'auto',
                          marginTop: '0.25rem',
                          boxShadow: 'var(--shadow-lg)'
                        }}
                      >
                        {clientes.filter(c => {
                          const fullName = `${c.nombre} ${c.apellido}`.toLowerCase()
                          return fullName.includes(clienteSearch.toLowerCase())
                        }).length === 0 ? (
                          <div style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                            No se encontraron clientes.
                          </div>
                        ) : (
                          clientes.filter(c => {
                            const fullName = `${c.nombre} ${c.apellido}`.toLowerCase()
                            return fullName.includes(clienteSearch.toLowerCase())
                          }).map(c => (
                            <div 
                              key={c.id} 
                              style={{
                                padding: '0.6rem 1rem',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                color: 'var(--text-primary)',
                                transition: 'background 0.2s',
                                borderBottom: '1px solid var(--surface-border)'
                              }}
                              onClick={() => {
                                setFormData(prev => ({ ...prev, cliente_id: c.id }))
                                setClienteSearch(`${c.nombre} ${c.apellido}`)
                                setShowClienteDropdown(false)
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(180, 97, 42, 0.15)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              👤 {c.nombre} {c.apellido}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="input-group">
                    <label>Nombre del Cliente Rápido *</label>
                    <input 
                      required 
                      type="text" 
                      placeholder="Escribe el nombre completo..."
                      className="input-field" 
                      name="cliente_nombre_rapido" 
                      value={formData.cliente_nombre_rapido} 
                      onChange={handleInputChange} 
                    />
                  </div>
                )}

                {/* COLABORADOR / ESTILISTA */}
                <div className="input-group">
                  <label>Estilista / Operador *</label>
                  <select 
                    required 
                    className="input-field" 
                    name="colaborador_id" 
                    value={formData.colaborador_id} 
                    onChange={handleInputChange}
                  >
                    <option value="">-- Elige un Estilista --</option>
                    {colaboradores
                      .filter(col => {
                        const r = (col.rol || '').toLowerCase();
                        return r !== 'super_admin' && r !== 'admin_sistema' && r !== 'superadmin';
                      })
                      .map(col => (
                        <option key={col.id} value={col.id}>{col.nombre_completo}</option>
                      ))}
                  </select>
                </div>

                {/* SERVICIO */}
                <div className="input-group">
                  <label>Servicio *</label>
                  <select 
                    required 
                    className="input-field" 
                    name="servicio_id" 
                    value={formData.servicio_id} 
                    onChange={handleInputChange}
                  >
                    <option value="">-- Elige un Servicio --</option>
                    {servicios.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre} - ${Number(s.precio).toLocaleString()}</option>
                    ))}
                  </select>
                </div>

                {/* FECHA Y HORA */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '0.85rem' }}>
                  <div className="input-group">
                    <label>Fecha *</label>
                    <input 
                      required 
                      type="date" 
                      className="input-field" 
                      name="fecha" 
                      value={formData.fecha} 
                      onChange={handleInputChange} 
                    />
                  </div>
                  <div className="input-group">
                    <label>Hora Inicio *</label>
                    <input 
                      required 
                      type="time" 
                      className="input-field" 
                      name="hora_inicio" 
                      value={formData.hora_inicio} 
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>

                {/* DURACION & ESTADO */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                  <div className="input-group">
                    <label>Duración (Minutos) *</label>
                    <select 
                      className="input-field" 
                      name="duracion" 
                      value={formData.duracion} 
                      onChange={handleInputChange} 
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hora</option>
                      <option value="90">1 hora 30m</option>
                      <option value="120">2 horas</option>
                      <option value="180">3 horas</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Estado Cita</label>
                    <select 
                      className="input-field" 
                      name="estado" 
                      value={formData.estado} 
                      onChange={handleInputChange}
                    >
                      <option value="Pendiente">🟡 Pendiente</option>
                      <option value="Confirmado">🟢 Confirmado</option>
                      <option value="Realizado">🔵 Realizado</option>
                      <option value="Cancelado">🔴 Cancelado</option>
                    </select>
                  </div>
                </div>

                {/* NOTAS */}
                <div className="input-group">
                  <label>Observaciones o Notas</label>
                  <textarea 
                    className="input-field" 
                    placeholder="Detalles adicionales, alergias, preferencia de productos..."
                    name="notas" 
                    style={{ minHeight: '4.5rem', resize: 'vertical' }}
                    value={formData.notas} 
                    onChange={handleInputChange} 
                  />
                </div>

                {/* ACCIONES DEL FORMULARIO */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  {selectedTurno && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                      onClick={handleDeleteTurno}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ flex: 1, background: 'linear-gradient(135deg, var(--primary-color), #E39461)', border: 'none' }}
                  >
                    {selectedTurno ? 'Actualizar Cita' : 'Confirmar Reserva'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showActionSelector && createPortal(
        <div 
          className="modal-overlay" 
          onClick={() => setShowActionSelector(false)}
          style={{
            alignItems: isMobile ? 'flex-end' : 'center',
            padding: isMobile ? 0 : '1rem'
          }}
        >
          <div 
            className="modal-content animate-slide-up" 
            style={{ 
              maxWidth: isMobile ? '100%' : '400px', 
              width: '100%',
              padding: isMobile ? '1.5rem 1.25rem 2.25rem' : '1.75rem', 
              textAlign: 'center', 
              background: 'var(--surface-color)', 
              backdropFilter: 'var(--glass-blur)', 
              border: '1px solid var(--surface-border)', 
              borderRadius: isMobile ? '20px 20px 0 0' : '16px',
              margin: 0
            }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.5rem' }}>
              <button className="btn" style={{ padding: '0.4rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }} onClick={() => setShowActionSelector(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(180, 97, 42, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', marginBottom: '0.25rem' }}>
                <CalendarIcon size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>
                {selectedTurnoForAction?.cliente_nombre_rapido || `${selectedTurnoForAction?.clientes?.nombre} ${selectedTurnoForAction?.clientes?.apellido}`}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                {selectedTurnoForAction?.servicios?.nombre || 'Servicio'} • {selectedTurnoForAction && new Date(selectedTurnoForAction.fecha_hora_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                className="btn" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem', 
                  padding: '0.8rem', 
                  borderRadius: '10px', 
                  fontWeight: '600', 
                  fontSize: '0.9rem',
                  border: '1px solid var(--surface-border)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={proceedToEdit}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                  e.currentTarget.style.borderColor = 'var(--surface-border)'
                }}
              >
                <Edit size={16} /> Editar Turno
              </button>

              <button 
                className="btn" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem', 
                  padding: '0.8rem', 
                  borderRadius: '10px', 
                  fontWeight: '600', 
                  fontSize: '0.9rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--primary-color), #E39461)',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(180, 97, 42, 0.2)'
                }}
                onClick={proceedToCreateOT}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(180, 97, 42, 0.3)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(180, 97, 42, 0.2)'
                }}
              >
                <Wrench size={16} /> Crear Comanda
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
