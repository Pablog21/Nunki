import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, CreditCard, Check, AlertCircle, DollarSign, Edit, ChevronDown, ChevronRight, Calendar, Palette, Layers, PieChart, Users, Search, X } from 'lucide-react'
import { getDesglosePago, formatMetodoPagoLabel, getTipoTarjetaPago, getCuotasPago, getReferenciaPagoLimpia } from '../lib/pagoUtils'

function SearchableClientSelect({ clientes, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    if (value) {
      const selected = clientes.find(c => c.id === value)
      if (selected) {
        setSearchTerm(`${selected.nombre} ${selected.apellido}`.trim())
      } else {
        setSearchTerm('')
      }
    } else {
      setSearchTerm('')
    }
  }, [value, clientes])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        if (value) {
          const selected = clientes.find(c => c.id === value)
          if (selected) {
            setSearchTerm(`${selected.nombre} ${selected.apellido}`.trim())
          } else {
            setSearchTerm('')
          }
        } else {
          setSearchTerm('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value, clientes])

  const filteredClientes = useMemo(() => {
    if (!searchTerm) return clientes
    const normSearch = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return clientes.filter(c => {
      const fullName = `${c.nombre} ${c.apellido}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return fullName.includes(normSearch)
    })
  }, [clientes, searchTerm])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <select
        required
        value={value}
        onChange={() => {}}
        style={{ opacity: 0, position: 'absolute', width: '1px', height: '1px', pointerEvents: 'none', top: '50%', left: '50%' }}
        tabIndex={-1}
      >
        <option value="">Selecciona un cliente...</option>
        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>)}
      </select>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Escribe para buscar cliente..."
          className="input-field"
          style={{ width: '100%', margin: 0, paddingRight: '2rem' }}
          value={searchTerm}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const val = e.target.value
            setSearchTerm(val)
            setIsOpen(true)
            if (!val) {
              onChange('')
            }
          }}
        />
        {searchTerm ? (
          <button
            type="button"
            style={{
              position: 'absolute',
              right: '8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.85rem'
            }}
            onClick={() => {
              setSearchTerm('')
              onChange('')
              setIsOpen(true)
            }}
          >
            ✕
          </button>
        ) : (
          <span style={{ position: 'absolute', right: '10px', color: 'var(--text-secondary)', pointerEvents: 'none', fontSize: '0.7rem' }}>
            ▼
          </span>
        )}
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--solid-surface, #ffffff)',
            border: '1px solid var(--surface-border, rgba(0,0,0,0.15))',
            borderRadius: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
            padding: '0.25rem'
          }}
        >
          {filteredClientes.length === 0 ? (
            <div style={{ padding: '0.6rem 0.8rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
              No se encontraron clientes.
            </div>
          ) : (
            filteredClientes.map(c => {
              const isSelected = c.id === value
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '0.55rem 0.8rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    borderRadius: '4px',
                    color: isSelected ? 'var(--primary-color)' : 'var(--text-primary)',
                    background: isSelected ? 'rgba(180, 97, 42, 0.2)' : 'transparent',
                    fontWeight: isSelected ? '600' : 'normal',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.15s'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(c.id)
                    setSearchTerm(`${c.nombre} ${c.apellido}`)
                    setIsOpen(false)
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span>{c.nombre} {c.apellido}</span>
                  {isSelected && <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>✓</span>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function OrdenesTrabajo() {
  const { userProfile, activeEmpresaId } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const submittingRef = useRef(false)
  const pagoSubmittingRef = useRef(false)
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState(null)
  
  // Payment Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedOrdenParaPagar, setSelectedOrdenParaPagar] = useState(null)
  const [pagoMetodo, setPagoMetodo] = useState('efectivo')
  const [pagoTipoTarjetaMixto, setPagoTipoTarjetaMixto] = useState('credito')
  const [pagoCuotas, setPagoCuotas] = useState(1)
  const [pagoMontoEfectivo, setPagoMontoEfectivo] = useState('')
  const [pagoMontoTarjeta, setPagoMontoTarjeta] = useState('')
  const [pagoMontoTransferencia, setPagoMontoTransferencia] = useState('')
  const [pagoComprobante, setPagoComprobante] = useState('')
  const [pagoComprobantePreview, setPagoComprobantePreview] = useState('')
  const [pagoIsSubmitting, setPagoIsSubmitting] = useState(false)

  // Data for dropdowns
  const [clientes, setClientes] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [articulosDb, setArticulosDb] = useState([])
  const [serviciosDb, setServiciosDb] = useState([])
  
  // Helper para formatear fecha ISO a YYYY-MM-DDTHH:mm (hora local)
  const toLocalDateTimeInput = (dateInput) => {
    const d = dateInput ? new Date(dateInput) : new Date()
    if (isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const isDateFromPastDay = (localDateTimeStr) => {
    if (!localDateTimeStr) return false
    const selected = new Date(localDateTimeStr)
    if (isNaN(selected.getTime())) return false
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return selected.getTime() < startOfToday
  }

  // Form State
  const [formData, setFormData] = useState({
    cliente_id: '',
    usuario_responsable_id: '',
    estado: 'completada',
    notas: '',
    turno_id: null,
    fecha_hora: toLocalDateTimeInput(new Date()),
    es_comanda_pasada_cobrada: false
  })
  const [connectedTurnoInfo, setConnectedTurnoInfo] = useState(null)
  
  // Detalles State (Artículos y Servicios)
  const [detalles, setDetalles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  
  const [esColaborativa, setEsColaborativa] = useState(false)
  const [colaboradoresParticipantes, setColaboradoresParticipantes] = useState([])

  const isOperator = userProfile?.rol === 'operador'

  useEffect(() => {
    if (activeEmpresaId) {
      fetchData()
    }
  }, [activeEmpresaId])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch Ordenes
      const { data: ordenesData } = await supabase
        .from('ordenes_trabajo')
        .select(`
          *,
          clientes (nombre, apellido),
          usuarios (nombre_completo),
          ordenes_trabajo_detalles (*)
        `)
        .eq('empresa_id', activeEmpresaId)
        .neq('estado', 'eliminada')
        .order('fecha_hora', { ascending: false })
      setOrdenes(ordenesData || [])

      // Fetch References
      const [resClientes, resEmpleados, resArticulos, resServicios] = await Promise.all([
        supabase.from('clientes').select('id, nombre, apellido').eq('empresa_id', activeEmpresaId).order('nombre'),
        supabase.from('usuarios').select('id, nombre_completo, comision_servicios, comision_productos, rol').eq('empresa_id', activeEmpresaId),
        supabase.from('articulos').select('id, nombre, precio_venta, precio_costo').eq('empresa_id', activeEmpresaId).order('nombre'),
        supabase.from('servicios').select('id, nombre, precio').eq('empresa_id', activeEmpresaId).order('nombre')
      ])
      
      setClientes(resClientes.data || [])
      const validEmpleados = (resEmpleados.data || []).filter(u => {
        const r = (u.rol || '').toLowerCase()
        return r !== 'super_admin' && r !== 'superadmin' && r !== 'admin_sistema'
      })
      setEmpleados(validEmpleados)
      setArticulosDb(resArticulos.data || [])
      setServiciosDb(resServicios.data || [])

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Si aún está cargando los catálogos desde la base de datos, esperar para tener los precios y comisiones reales
    if (loading) return

    if (location.state?.createNewForClienteId) {
      const clienteId = location.state.createNewForClienteId
      const colabId = location.state.colaboradorId || ''
      const servId = location.state.servicioId || ''
      const passedPrice = location.state.precio
      const passedTurnoId = location.state.turnoId || null
      const passedTurnoInfo = location.state.turnoInfo || null

      setFormData({
        cliente_id: clienteId,
        usuario_responsable_id: colabId,
        estado: 'completada',
        notas: 'Generada automáticamente desde Agenda',
        turno_id: passedTurnoId,
        fecha_hora: toLocalDateTimeInput(new Date()),
        es_comanda_pasada_cobrada: false
      })

      if (passedTurnoInfo) {
        setConnectedTurnoInfo(passedTurnoInfo)
      } else if (passedTurnoId) {
        supabase
          .from('turnos')
          .select('id, fecha_hora_inicio, servicios(nombre)')
          .eq('id', passedTurnoId)
          .single()
          .then(({ data: tData }) => {
            if (tData) {
              setConnectedTurnoInfo({
                id: tData.id,
                fecha: tData.fecha_hora_inicio,
                servicioNombre: tData.servicios?.nombre || 'Servicio agendado'
              })
            }
          })
      }

      if (servId) {
        const foundServ = serviciosDb.find(s => s.id === servId)
        const price = (foundServ && foundServ.precio !== undefined && foundServ.precio !== null && Number(foundServ.precio) > 0)
          ? Number(foundServ.precio)
          : (passedPrice !== undefined && passedPrice !== null ? Number(passedPrice) : (foundServ ? Number(foundServ.precio || 0) : 0))

        let pct = 30
        if (colabId) {
          const foundEmp = empleados.find(e => e.id === colabId)
          if (foundEmp) pct = foundEmp.comision_servicios || 30
        }

        const nuevoDetalle = {
          id_temp: Date.now(),
          tipo_item: 'servicio',
          item_id: servId,
          cantidad: 1,
          precio_unitario: price,
          colaborador_id: colabId,
          porcentaje_comision: pct,
          precio_costo: 0
        }

        // Si el servicio tiene insumos/receta configurada, traerlos también
        supabase
          .from('servicio_insumos')
          .select('articulo_id, cantidad_defecto')
          .eq('servicio_id', servId)
          .then(({ data: recipeData }) => {
            if (recipeData && recipeData.length > 0) {
              const autoInsumos = recipeData.map((item, idx) => ({
                id_temp: Date.now() + idx + 1,
                tipo_item: 'articulo',
                item_id: item.articulo_id,
                cantidad: item.cantidad_defecto,
                precio_unitario: 0,
                es_insumo_asociado: true,
                asociado_a_servicio_nombre: foundServ?.nombre || 'Servicio',
                colaborador_id: '',
                porcentaje_comision: 0,
                precio_costo: 0
              }))
              setDetalles([nuevoDetalle, ...autoInsumos])
            } else {
              setDetalles([nuevoDetalle])
            }
          })
          .catch(() => {
            setDetalles([nuevoDetalle])
          })
      } else {
        setDetalles([])
      }

      setShowModal(true)
      navigate(location.pathname, { replace: true, state: null })
      return
    }

    if (location.state?.editOrdenId) {
      const targetId = location.state.editOrdenId
      const foundOrden = ordenes.find(o => o.id === targetId)
      navigate(location.pathname, { replace: true, state: null })
      if (foundOrden) {
        handleEditClick(foundOrden)
      } else {
        supabase
          .from('ordenes_trabajo')
          .select('*, clientes (nombre, apellido), usuarios (nombre_completo), ordenes_trabajo_detalles (*)')
          .eq('id', targetId)
          .single()
          .then(({ data }) => {
            if (data) handleEditClick(data)
          })
      }
      return
    }

    if (location.state?.openNewComandaPast) {
      const colabId = location.state.colaboradorId || ''
      const now = new Date()
      const pastDefault = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0)
      closeModal()
      setFormData({
        cliente_id: '',
        usuario_responsable_id: colabId,
        estado: 'completada',
        notas: 'Comanda histórica cargada desde talón en papel',
        turno_id: null,
        fecha_hora: toLocalDateTimeInput(pastDefault),
        es_comanda_pasada_cobrada: true
      })
      setShowModal(true)
      navigate(location.pathname, { replace: true, state: null })
      return
    }
  }, [loading, location.state, clientes, serviciosDb, empleados, ordenes, navigate, location.pathname])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }))
      return
    }
    if (name === 'fecha_hora') {
      const past = isDateFromPastDay(value)
      setFormData(prev => ({
        ...prev,
        fecha_hora: value,
        es_comanda_pasada_cobrada: !selectedOrden ? past : prev.es_comanda_pasada_cobrada
      }))
      return
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // --- Manejo de Detalles ---
  const agregarDetalle = (tipo) => {
    const respId = formData.usuario_responsable_id || (empleados[0]?.id || '')
    const colab = empleados.find(e => e.id === respId)
    const defaultPct = colab 
      ? (tipo === 'articulo' ? (colab.comision_productos || 10) : (colab.comision_servicios || 30))
      : (tipo === 'articulo' ? 10 : 30)

    setDetalles(prev => [
      ...prev, 
      { 
        id_temp: Date.now() + Math.random(), 
        tipo_item: tipo, 
        item_id: '', 
        cantidad: 1, 
        precio_unitario: 0,
        colaborador_id: respId,
        porcentaje_comision: defaultPct,
        precio_costo: 0,
        es_colaborativo: false,
        equipo_colaboradores: []
      }
    ])
  }

  const removerDetalle = (id_temp) => {
    setDetalles(prev => prev.filter(d => d.id_temp !== id_temp))
  }

  const actualizarDetalle = async (id_temp, campo, valor) => {
    let autoInsumos = []

    // If changing the selected item and it is a service, fetch its recipe
    if (campo === 'item_id' && valor) {
      const currentDetalle = detalles.find(d => d.id_temp === id_temp)
      if (currentDetalle && currentDetalle.tipo_item === 'servicio') {
        const serv = serviciosDb.find(s => s.id === valor)
        if (serv) {
          try {
            const { data: recipeData } = await supabase
              .from('servicio_insumos')
              .select('articulo_id, cantidad_defecto')
              .eq('servicio_id', valor)
            
            if (recipeData && recipeData.length > 0) {
              autoInsumos = recipeData.map((item, idx) => ({
                id_temp: Date.now() + idx + 1,
                tipo_item: 'articulo',
                item_id: item.articulo_id,
                cantidad: item.cantidad_defecto,
                precio_unitario: 0, // $0 cost
                es_insumo_asociado: true,
                asociado_a_servicio_nombre: serv.nombre,
                colaborador_id: '',
                porcentaje_comision: 0,
                precio_costo: 0,
                es_colaborativo: false,
                equipo_colaboradores: []
              }))
            }
          } catch (err) {
            console.error('Error fetching recipe:', err)
          }
        }
      }
    }

    setDetalles(prevDetalles => {
      const updatedList = prevDetalles.map(d => {
        if (d.id_temp === id_temp) {
          const updated = { ...d, [campo]: valor }
          
          // Auto-fill price and cost when item changes
          if (campo === 'item_id') {
            if (d.tipo_item === 'articulo') {
              const art = articulosDb.find(a => a.id === valor)
              if (art) {
                updated.precio_unitario = art.precio_venta || 0
                updated.precio_costo = art.precio_costo || 0
              }
            } else {
              const serv = serviciosDb.find(s => s.id === valor)
              if (serv) {
                updated.precio_unitario = serv.precio || 0
                updated.precio_costo = 0
              }
            }
            
            // Recalculate commission if single collaborator already selected
            if (updated.colaborador_id && !updated.es_colaborativo) {
              const colab = empleados.find(e => e.id === updated.colaborador_id)
              if (colab) {
                updated.porcentaje_comision = updated.tipo_item === 'articulo'
                  ? (colab.comision_productos || 10)
                  : (colab.comision_servicios || 30)
              }
            }
          }

          // Auto-fill commission rate when collaborator changes in single mode
          if (campo === 'colaborador_id') {
            if (valor) {
              const colab = empleados.find(e => e.id === valor)
              if (colab) {
                updated.porcentaje_comision = d.tipo_item === 'articulo'
                  ? (colab.comision_productos || 10)
                  : (colab.comision_servicios || 30)
              }
            } else {
              updated.porcentaje_comision = 0
            }
          }

          return updated
        }
        return d
      })

      if (autoInsumos.length > 0) {
        return [...updatedList, ...autoInsumos]
      }
      return updatedList
    })
  }

  // --- Helpers de Trabajo Colaborativo a Nivel de Fila (Servicio) ---
  const toggleColaborativoItem = (id_temp) => {
    setDetalles(prev => prev.map(d => {
      if (d.id_temp !== id_temp) return d
      const willBeColaborativo = !d.es_colaborativo

      if (willBeColaborativo) {
        let member1Id = d.colaborador_id || formData.usuario_responsable_id || (empleados[0]?.id || '')
        let member2Id = ''
        if (empleados.length >= 2) {
          const other = empleados.find(e => e.id !== member1Id)
          member2Id = other ? other.id : ''
        }
        const colab1 = empleados.find(e => e.id === member1Id)
        const colab2 = empleados.find(e => e.id === member2Id)
        const rate1 = colab1 ? (d.tipo_item === 'articulo' ? (colab1.comision_productos || 10) : (colab1.comision_servicios || 30)) : 30
        const rate2 = colab2 ? (d.tipo_item === 'articulo' ? (colab2.comision_productos || 10) : (colab2.comision_servicios || 30)) : 30

        const equipo = [
          { colaborador_id: member1Id, porcentaje: 50, tasa_comision: rate1 },
          { colaborador_id: member2Id, porcentaje: 50, tasa_comision: rate2 }
        ]
        return {
          ...d,
          es_colaborativo: true,
          equipo_colaboradores: equipo
        }
      } else {
        const firstMember = d.equipo_colaboradores && d.equipo_colaboradores[0]
        const colabId = firstMember?.colaborador_id || d.colaborador_id || formData.usuario_responsable_id || (empleados[0]?.id || '')
        const colab = empleados.find(e => e.id === colabId)
        const rate = colab ? (d.tipo_item === 'articulo' ? (colab.comision_productos || 10) : (colab.comision_servicios || 30)) : 30

        return {
          ...d,
          es_colaborativo: false,
          colaborador_id: colabId,
          porcentaje_comision: rate
        }
      }
    }))
  }

  const actualizarEquipoMiembro = (id_temp, index, campo, valor) => {
    setDetalles(prev => prev.map(d => {
      if (d.id_temp !== id_temp) return d
      const currentTeam = [...(d.equipo_colaboradores || [])]
      if (!currentTeam[index]) return d

      let updatedMember = { ...currentTeam[index], [campo]: (campo === 'porcentaje' || campo === 'tasa_comision') ? Number(valor) : valor }

      if (campo === 'colaborador_id' && valor) {
        const colab = empleados.find(e => e.id === valor)
        if (colab) {
          updatedMember.tasa_comision = d.tipo_item === 'articulo' ? (colab.comision_productos || 10) : (colab.comision_servicios || 30)
        }
      }

      currentTeam[index] = updatedMember

      // Asignar automáticamente a la otra estilista si el salón cuenta con 2 estilistas
      if (campo === 'colaborador_id' && empleados.length === 2 && valor && currentTeam.length === 2) {
        const otherIndex = index === 0 ? 1 : 0
        const otherColab = empleados.find(e => e.id !== valor)
        if (otherColab) {
          const otherRate = d.tipo_item === 'articulo' ? (otherColab.comision_productos || 10) : (otherColab.comision_servicios || 30)
          currentTeam[otherIndex] = {
            ...currentTeam[otherIndex],
            colaborador_id: otherColab.id,
            tasa_comision: currentTeam[otherIndex].tasa_comision !== undefined ? currentTeam[otherIndex].tasa_comision : otherRate
          }
        }
      }

      // Balancear automáticamente si son 2 miembros
      if (campo === 'porcentaje' && currentTeam.length === 2) {
        const val = Number(valor)
        const otherIndex = index === 0 ? 1 : 0
        currentTeam[otherIndex] = {
          ...currentTeam[otherIndex],
          porcentaje: Math.max(0, 100 - val)
        }
      }

      return {
        ...d,
        equipo_colaboradores: currentTeam
      }
    }))
  }

  const agregarMiembroEquipoItem = (id_temp) => {
    setDetalles(prev => prev.map(d => {
      if (d.id_temp !== id_temp) return d
      const currentTeam = [...(d.equipo_colaboradores || [])]
      const count = currentTeam.length + 1
      const splitVal = Math.round((100 / count) * 10) / 10
      const newTeam = [
        ...currentTeam.map(m => ({ ...m, porcentaje: splitVal })),
        { colaborador_id: '', porcentaje: splitVal, tasa_comision: 30 }
      ]
      return { ...d, equipo_colaboradores: newTeam }
    }))
  }

  const removerMiembroEquipoItem = (id_temp, index) => {
    setDetalles(prev => prev.map(d => {
      if (d.id_temp !== id_temp) return d
      const filtered = (d.equipo_colaboradores || []).filter((_, i) => i !== index)
      const count = filtered.length
      if (count === 0) {
        return { ...d, es_colaborativo: false }
      }
      const splitVal = Math.round((100 / count) * 10) / 10
      const newTeam = filtered.map(m => ({ ...m, porcentaje: splitVal }))
      return { ...d, equipo_colaboradores: newTeam }
    }))
  }

  const equilibrarEquipoItem = (id_temp) => {
    setDetalles(prev => prev.map(d => {
      if (d.id_temp !== id_temp) return d
      const currentTeam = [...(d.equipo_colaboradores || [])]
      const count = currentTeam.length
      if (count === 0) return d
      const splitVal = Math.round((100 / count) * 10) / 10
      return {
        ...d,
        equipo_colaboradores: currentTeam.map(m => ({ ...m, porcentaje: splitVal }))
      }
    }))
  }

  const getRowComisionInfo = (d) => {
    const rowSubtotal = Number(d.cantidad) * Number(d.precio_unitario)
    if (d.es_colaborativo && Array.isArray(d.equipo_colaboradores) && d.equipo_colaboradores.length > 0) {
      let totalComision = 0
      const breakdown = d.equipo_colaboradores.map(member => {
        if (!member.colaborador_id) return { ...member, montoBase: 0, comisionMonto: 0 }
        const colab = empleados.find(e => e.id === member.colaborador_id)
        const partPct = Number(member.porcentaje) || 0
        const tasaCom = Number(member.tasa_comision !== undefined ? member.tasa_comision : (d.tipo_item === 'articulo' ? (colab?.comision_productos || 10) : (colab?.comision_servicios || 30)))
        const montoBase = rowSubtotal * (partPct / 100)
        const comisionMonto = montoBase * (tasaCom / 100)
        totalComision += comisionMonto
        return {
          ...member,
          colabNombre: colab?.nombre_completo || 'Estilista',
          montoBase,
          tasaCom,
          comisionMonto
        }
      })
      return { totalComision, breakdown }
    } else {
      const colab = empleados.find(e => e.id === d.colaborador_id)
      const rate = Number(d.porcentaje_comision !== undefined ? d.porcentaje_comision : (d.tipo_item === 'articulo' ? (colab?.comision_productos || 10) : (colab?.comision_servicios || 30))) || 0
      const totalComision = d.colaborador_id ? (rowSubtotal * (rate / 100)) : 0
      return { totalComision, breakdown: [] }
    }
  }

  const calcularTotal = () => {
    return detalles.reduce((sum, d) => sum + (Number(d.cantidad) * Number(d.precio_unitario)), 0)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting || submittingRef.current) return
    if (!activeEmpresaId) return alert("Error: No hay salón activo")
    if (detalles.length === 0) return alert("Error: Debes agregar al menos un servicio o artículo en los detalles de la comanda.")
    if (detalles.some(d => !d.item_id)) return alert("Error: Selecciona un artículo/servicio en todas las filas.")

    for (let i = 0; i < detalles.length; i++) {
      const d = detalles[i]
      if (d.es_colaborativo) {
        const team = d.equipo_colaboradores || []
        if (team.length === 0) {
          return alert(`Error en renglón ${i + 1}: El servicio colaborativo debe tener estilistas asignados.`)
        }
        if (team.some(m => !m.colaborador_id)) {
          return alert(`Error en renglón ${i + 1}: Selecciona a todas las estilistas del equipo colaborativo.`)
        }
        const ids = team.map(m => m.colaborador_id)
        if (new Set(ids).size !== ids.length) {
          return alert(`Error en renglón ${i + 1}: No puedes repetir a la misma estilista en el equipo del servicio.`)
        }
        const sumPart = Math.round(team.reduce((acc, m) => acc + (Number(m.porcentaje) || 0), 0) * 10) / 10
        if (Math.abs(sumPart - 100) > 0.1) {
          return alert(`Error en renglón ${i + 1}: La suma de participación del servicio debe dar exactamente 100% (actualmente ${sumPart}%).`)
        }
      }
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const total = calcularTotal()

      let ordenId;
      const isCancelledOrDeleted = formData.estado === 'cancelada' || formData.estado === 'eliminada'

      const isAnyColaborativo = detalles.some(d => d.es_colaborativo)
      let consolidatedTeam = []
      if (isAnyColaborativo) {
        const teamMap = new Map()
        detalles.forEach(d => {
          if (d.es_colaborativo && Array.isArray(d.equipo_colaboradores)) {
            d.equipo_colaboradores.forEach(m => {
              if (m.colaborador_id) {
                teamMap.set(m.colaborador_id, { colaborador_id: m.colaborador_id, porcentaje: Number(m.porcentaje) || 50 })
              }
            })
          } else if (d.colaborador_id) {
            teamMap.set(d.colaborador_id, { colaborador_id: d.colaborador_id, porcentaje: 100 })
          }
        })
        consolidatedTeam = Array.from(teamMap.values())
      }

      const fechaHoraIsoFinal = formData.fecha_hora
        ? new Date(formData.fecha_hora).toISOString()
        : (selectedOrden?.fecha_hora || new Date().toISOString())

      const ordenDataPayload = {
        empresa_id: activeEmpresaId,
        cliente_id: formData.cliente_id || null,
        usuario_responsable_id: formData.usuario_responsable_id || null,
        estado: formData.estado || 'completada',
        notas: formData.notas || null,
        total_economico: isCancelledOrDeleted ? 0 : total,
        es_colaborativa: isAnyColaborativo,
        colaboradores_participantes: isAnyColaborativo ? consolidatedTeam : null,
        turno_id: formData.turno_id || null,
        fecha_hora: fechaHoraIsoFinal
      }

      if (isCancelledOrDeleted) {
        ordenDataPayload.pago_estado = 'cancelado'
      } else if (!selectedOrden && formData.es_comanda_pasada_cobrada) {
        // Comanda histórica ya cobrada/controlada en papel: asociar a una caja cerrada para no afectar la caja abierta del día actual
        let cierreHistoricoId = null
        try {
          const { data: cierresHist } = await supabase
            .from('cajas_cierres')
            .select('id, fecha_hora')
            .eq('empresa_id', activeEmpresaId)
            .order('fecha_hora', { ascending: false })
            .limit(20)
          if (cierresHist && cierresHist.length > 0) {
            const targetMs = new Date(fechaHoraIsoFinal).getTime()
            let closest = cierresHist[0]
            let minDiff = Math.abs(new Date(closest.fecha_hora).getTime() - targetMs)
            cierresHist.forEach(c => {
              const diff = Math.abs(new Date(c.fecha_hora).getTime() - targetMs)
              if (diff < minDiff) {
                minDiff = diff
                closest = c
              }
            })
            cierreHistoricoId = closest.id
          }
        } catch (e) {
          console.error('Error buscando cierre histórico:', e)
        }
        ordenDataPayload.pago_estado = 'pagado'
        ordenDataPayload.pago_metodo = 'efectivo'
        ordenDataPayload.pago_fecha_hora = fechaHoraIsoFinal
        if (cierreHistoricoId) {
          ordenDataPayload.pago_caja_cierre_id = cierreHistoricoId
        }
      }

      if (selectedOrden) {
        // Modo Edición: Actualizar cabecera de orden
        ordenId = selectedOrden.id
        const { error: errorOrden } = await supabase
          .from('ordenes_trabajo')
          .update(ordenDataPayload)
          .eq('id', ordenId)

        if (errorOrden) throw errorOrden

        // Limpiar detalles anteriores, comisiones y movimientos de stock correspondientes para reinsertar de manera consistente
        await Promise.all([
          supabase.from('ordenes_trabajo_detalles').delete().eq('orden_trabajo_id', ordenId),
          supabase.from('comisiones').delete().eq('orden_trabajo_id', ordenId),
          supabase.from('movimientos_stock').delete().eq('referencia_id', ordenId).eq('tipo_movimiento', 'egreso_orden_trabajo')
        ])
      } else {
        // Modo Creación: Insertar nueva orden
        const { data: ordenCreada, error: errorOrden } = await supabase
          .from('ordenes_trabajo')
          .insert([ordenDataPayload])
          .select()

        if (errorOrden) throw errorOrden
        ordenId = ordenCreada[0].id
      }

      // 2. Crear Detalles y Movimientos de Stock
      if (detalles.length > 0) {
        const detallesToInsert = detalles.map(d => {
          const subtotal = Number(d.cantidad) * Number(d.precio_unitario)
          const comInfo = getRowComisionInfo(d)
          const costoTotal = Number(d.cantidad) * Number(d.precio_costo)
          const rentabilidad = subtotal - costoTotal - comInfo.totalComision

          const itemToInsert = {
            orden_trabajo_id: ordenId,
            tipo_item: d.tipo_item,
            articulo_id: d.tipo_item === 'articulo' ? (d.item_id || null) : null,
            servicio_id: d.tipo_item === 'servicio' ? (d.item_id || null) : null,
            cantidad: d.cantidad,
            precio_unitario: d.precio_unitario,
            subtotal: subtotal,
            colaborador_id: d.es_colaborativo ? null : (d.colaborador_id || null),
            porcentaje_comision: d.es_colaborativo ? 0 : (d.colaborador_id ? Number(d.porcentaje_comision) : 0),
            monto_comision: comInfo.totalComision,
            precio_costo: Number(d.precio_costo),
            rentabilidad: rentabilidad
          }

          if (d.es_colaborativo) {
            itemToInsert.colaboradores_comisiones = {
              es_colaborativo: true,
              equipo: d.equipo_colaboradores
            }
          } else if (d.colaboradores_comisiones) {
            itemToInsert.colaboradores_comisiones = d.colaboradores_comisiones
          }

          return itemToInsert
        })

        let { error: errorDetalles } = await supabase
          .from('ordenes_trabajo_detalles')
          .insert(detallesToInsert)
          
        if (errorDetalles && (errorDetalles.message?.includes('colaboradores_comisiones') || errorDetalles.code === 'PGRST204')) {
          const fallbackDetalles = detallesToInsert.map(({ colaboradores_comisiones, ...rest }) => rest)
          const { error: errorRetry } = await supabase
            .from('ordenes_trabajo_detalles')
            .insert(fallbackDetalles)

          errorDetalles = errorRetry
        }

        if (errorDetalles) throw errorDetalles

        // 3. Insertar registros en la tabla de comisiones
        let comisionesToInsert = []
        detalles.forEach(d => {
          const subtotal = Number(d.cantidad) * Number(d.precio_unitario)
          
          let conceptoStr = ""
          if (d.tipo_item === 'articulo') {
            const art = articulosDb.find(a => a.id === d.item_id)
            conceptoStr = `Venta Artículo: ${art ? art.nombre : 'Producto'}`
          } else {
            const serv = serviciosDb.find(s => s.id === d.item_id)
            conceptoStr = `Servicio Realizado: ${serv ? serv.nombre : 'Servicio'}`
          }

          if (d.es_colaborativo && Array.isArray(d.equipo_colaboradores)) {
            d.equipo_colaboradores.forEach(member => {
              if (!member.colaborador_id) return
              const colab = empleados.find(e => e.id === member.colaborador_id)
              const partPct = Number(member.porcentaje) || 0
              const customRate = member.tasa_comision !== undefined
                ? Number(member.tasa_comision)
                : (colab ? (d.tipo_item === 'articulo' ? (colab.comision_productos || 10) : (colab.comision_servicios || 30)) : 0)
              
              const montoBaseParticipacion = subtotal * (partPct / 100)
              const comisionMonto = montoBaseParticipacion * (Number(customRate) / 100)

              if (comisionMonto > 0) {
                comisionesToInsert.push({
                  empresa_id: activeEmpresaId,
                  colaborador_id: member.colaborador_id,
                  orden_trabajo_id: ordenId,
                  concepto: `${conceptoStr} (Colaborativo - ${partPct}%)`,
                  monto_base: montoBaseParticipacion,
                  porcentaje: Number(customRate),
                  monto_comision: comisionMonto,
                  estado: 'Pendiente',
                  created_at: fechaHoraIsoFinal
                })
              }
            })
          } else {
            const colabId = d.colaborador_id || formData.usuario_responsable_id
            if (colabId) {
              const colabUser = empleados.find(u => u.id === colabId)
              const defaultPct = d.tipo_item === 'articulo' 
                ? (Number(colabUser?.comision_productos) || 10) 
                : (Number(colabUser?.comision_servicios) || 30)
              const pctComision = Number(d.porcentaje_comision !== undefined ? d.porcentaje_comision : defaultPct)
              const comisionMonto = subtotal * (pctComision / 100)
              
              if (comisionMonto > 0) {
                comisionesToInsert.push({
                  empresa_id: activeEmpresaId,
                  colaborador_id: colabId,
                  orden_trabajo_id: ordenId,
                  concepto: conceptoStr,
                  monto_base: subtotal,
                  porcentaje: pctComision,
                  monto_comision: comisionMonto,
                  estado: 'Pendiente',
                  created_at: fechaHoraIsoFinal
                })
              }
            }
          }
        })

          // Si los items no generaron comisiones pero la comanda tiene un responsable y total > 0
          if (comisionesToInsert.length === 0 && formData.usuario_responsable_id && Number(formData.total_economico) > 0) {
            const colabUser = empleados.find(u => u.id === formData.usuario_responsable_id)
            const pctComision = Number(colabUser?.comision_servicios) || 30
            const totalEco = Number(formData.total_economico)
            comisionesToInsert = [{
              empresa_id: activeEmpresaId,
              colaborador_id: formData.usuario_responsable_id,
              orden_trabajo_id: ordenId,
              concepto: 'Servicio Realizado',
              monto_base: totalEco,
              porcentaje: pctComision,
              monto_comision: totalEco * (pctComision / 100),
              estado: 'Pendiente',
              created_at: fechaHoraIsoFinal
            }]
          }

        if (!isCancelledOrDeleted && comisionesToInsert.length > 0) {
          const { error: errorComisiones } = await supabase
            .from('comisiones')
            .insert(comisionesToInsert)
          
          if (errorComisiones) console.error("Error guardando comisiones:", errorComisiones)
        }

        // 4. Registrar egresos de stock para los artículos consumidos (incluye insumos a precio $0)
        const articulosConsumidos = detalles.filter(d => d.tipo_item === 'articulo')
        if (articulosConsumidos.length > 0) {
          const movimientosStock = articulosConsumidos.map(art => ({
            empresa_id: activeEmpresaId,
            articulo_id: art.item_id || null,
            tipo_movimiento: 'egreso_orden_trabajo',
            cantidad: -Math.abs(art.cantidad), // Descuenta stock
            referencia_id: ordenId,
            notes: art.es_insumo_asociado 
              ? `Consumo de insumo para servicio: ${art.asociado_a_servicio_nombre}`
              : `Consumo en OT para cliente`
          }))

          const { error: errorStock } = await supabase
            .from('movimientos_stock')
            .insert(movimientosStock)
            
          if (errorStock) console.error("Error actualizando stock:", errorStock)
        }
      }

      // 5. Si la orden está completada y tiene un turno de agenda conectado, actualizar el turno a 'Realizado'
      if (formData.estado === 'completada' && formData.turno_id) {
        try {
          await supabase
            .from('turnos')
            .update({ estado: 'Realizado' })
            .eq('id', formData.turno_id)
        } catch (errTurno) {
          console.error("Error al actualizar turno de agenda a Realizado:", errTurno)
        }
      }

      closeModal()
      fetchData()

    } catch (error) {
      console.error('Error creating order:', error)
      alert(`Error al guardar la orden de trabajo: ${error.message || 'Verifica la información del formulario'}`)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const handleEditClick = async (orden) => {
    try {
      setModalLoading(true)
      let detallesData = orden.ordenes_trabajo_detalles

      if (!detallesData || detallesData.length === 0) {
        const { data: fetchedDetalles, error: errorDetalles } = await supabase
          .from('ordenes_trabajo_detalles')
          .select('*')
          .eq('orden_trabajo_id', orden.id)

        if (!errorDetalles && fetchedDetalles) {
          detallesData = fetchedDetalles
        }
      }

      let formattedDetalles = (detallesData || []).map((d, index) => {
        const rawTipo = (d.tipo_item || '').toLowerCase()
        const isArt = rawTipo.includes('art') || Boolean(d.articulo_id)
        const tipoItem = isArt ? 'articulo' : 'servicio'
        const itemId = (isArt ? d.articulo_id : d.servicio_id) || d.articulo_id || d.servicio_id || ''

        let isRowColaborativo = false
        let equipoMiembros = []

        if (d.colaboradores_comisiones?.es_colaborativo && Array.isArray(d.colaboradores_comisiones?.equipo)) {
          isRowColaborativo = true
          equipoMiembros = d.colaboradores_comisiones.equipo
        } else if (orden.es_colaborativa && Array.isArray(orden.colaboradores_participantes) && orden.colaboradores_participantes.length > 0 && !d.colaborador_id) {
          // Retrocompatibilidad con comandas colaborativas viejas
          isRowColaborativo = true
          equipoMiembros = orden.colaboradores_participantes.map(m => {
            const colab = empleados.find(e => e.id === m.colaborador_id)
            const customRate = d.colaboradores_comisiones && d.colaboradores_comisiones[m.colaborador_id] !== undefined
              ? d.colaboradores_comisiones[m.colaborador_id]
              : (colab ? (tipoItem === 'articulo' ? (colab.comision_productos || 10) : (colab.comision_servicios || 30)) : 30)
            return {
              colaborador_id: m.colaborador_id,
              porcentaje: m.porcentaje,
              tasa_comision: customRate
            }
          })
        }

        return {
          id_temp: d.id || Date.now() + index,
          tipo_item: tipoItem,
          item_id: itemId,
          cantidad: d.cantidad || 1,
          precio_unitario: d.precio_unitario || 0,
          colaborador_id: d.colaborador_id || orden.usuario_responsable_id || '',
          porcentaje_comision: d.porcentaje_comision || 0,
          precio_costo: d.precio_costo || 0,
          colaboradores_comisiones: d.colaboradores_comisiones || null,
          es_colaborativo: isRowColaborativo,
          equipo_colaboradores: equipoMiembros
        }
      })

      // Si la comanda en BD no tenía renglones de detalles pero posee un total económico > 0,
      // reconstruimos automáticamente un renglón de servicio con el total y responsable asignado.
      if (formattedDetalles.length === 0 && Number(orden.total_economico) > 0) {
        const colabId = orden.usuario_responsable_id || ''
        let pct = 30
        if (colabId && empleados.length > 0) {
          const emp = empleados.find(e => e.id === colabId)
          if (emp) pct = emp.comision_servicios || 30
        }

        const defaultServId = serviciosDb.length > 0 ? serviciosDb[0].id : ''

        formattedDetalles = [
          {
            id_temp: Date.now(),
            tipo_item: 'servicio',
            item_id: defaultServId,
            cantidad: 1,
            precio_unitario: Number(orden.total_economico),
            colaborador_id: colabId,
            porcentaje_comision: pct,
            precio_costo: 0,
            colaboradores_comisiones: null
          }
        ]
      }

      setFormData({
        cliente_id: orden.cliente_id || '',
        usuario_responsable_id: orden.usuario_responsable_id || '',
        estado: orden.estado || 'completada',
        notas: orden.notas || '',
        turno_id: orden.turno_id || null,
        fecha_hora: toLocalDateTimeInput(orden.fecha_hora),
        es_comanda_pasada_cobrada: false
      })

      if (orden.turno_id) {
        supabase
          .from('turnos')
          .select('id, fecha_hora_inicio, estado, servicios(nombre)')
          .eq('id', orden.turno_id)
          .single()
          .then(({ data: tData }) => {
            if (tData) {
              setConnectedTurnoInfo({
                id: tData.id,
                fecha: tData.fecha_hora_inicio,
                estado: tData.estado,
                servicioNombre: tData.servicios?.nombre || 'Servicio agendado'
              })
            }
          })
      } else {
        setConnectedTurnoInfo(null)
      }

      setSelectedOrden(orden)
      setDetalles(formattedDetalles)
      setEsColaborativa(orden.es_colaborativa || false)
      setColaboradoresParticipantes(orden.colaboradores_participantes || [])
      setShowModal(true)
    } catch (err) {
      console.error('Error fetching details:', err)
      alert('Error al cargar los detalles de la orden')
    } finally {
      setModalLoading(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedOrden(null)
    setFormData({
      cliente_id: '',
      usuario_responsable_id: '',
      estado: 'completada',
      notas: '',
      turno_id: null,
      fecha_hora: toLocalDateTimeInput(new Date()),
      es_comanda_pasada_cobrada: false
    })
    setConnectedTurnoInfo(null)
    setDetalles([])
    setEsColaborativa(false)
    setColaboradoresParticipantes([])
  }

  const handleEliminarOrden = async (ordenId) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta orden de trabajo? Esta acción restablecerá el stock y cancelará las comisiones asociadas.')) return
    try {
      setLoading(true)
      // 1. Cambiar estado de la orden principal a 'eliminada' y el estado de pago a 'cancelado'
      const { error: errorOrden } = await supabase
        .from('ordenes_trabajo')
        .update({ estado: 'eliminada', pago_estado: 'cancelado' })
        .eq('id', ordenId)

      if (errorOrden) throw errorOrden

      // 2. Eliminar movimientos de stock asociados
      const { error: errorStock } = await supabase
        .from('movimientos_stock')
        .delete()
        .eq('referencia_id', ordenId)
        .eq('tipo_movimiento', 'egreso_orden_trabajo')

      if (errorStock) console.error('Error al limpiar movimientos de stock:', errorStock)

      // 3. Eliminar comisiones asociadas
      const { error: errorComisiones } = await supabase
        .from('comisiones')
        .delete()
        .eq('orden_trabajo_id', ordenId)

      if (errorComisiones) console.error('Error al limpiar comisiones:', errorComisiones)

      fetchData()
    } catch (err) {
      console.error('Error deleting order:', err)
      alert('Error al eliminar la orden')
    } finally {
      setLoading(false)
    }
  }

  const iniciarPago = (orden) => {
    setSelectedOrdenParaPagar(orden)
    if (orden?.pago_estado === 'pagado') {
      const m = (orden.pago_metodo || 'efectivo').toLowerCase()
      const tipoT = getTipoTarjetaPago(orden)
      const cuo = getCuotasPago(orden) || 1
      const desg = getDesglosePago(orden)
      if (m === 'tarjeta') {
        setPagoMetodo(tipoT === 'debito' ? 'debito' : 'credito')
      } else {
        setPagoMetodo(m)
      }
      setPagoTipoTarjetaMixto(tipoT === 'debito' ? 'debito' : 'credito')
      setPagoCuotas(cuo)
      setPagoMontoEfectivo(desg.efectivo > 0 ? String(desg.efectivo) : '')
      setPagoMontoTarjeta(desg.tarjeta > 0 ? String(desg.tarjeta) : '')
      setPagoMontoTransferencia(desg.transferencia > 0 ? String(desg.transferencia) : '')
      const refLimpia = getReferenciaPagoLimpia(orden)
      setPagoComprobante(refLimpia || '')
      setPagoComprobantePreview(refLimpia?.startsWith('data:image') ? refLimpia : '')
    } else {
      setPagoMetodo('efectivo')
      setPagoTipoTarjetaMixto('credito')
      setPagoCuotas(1)
      setPagoMontoEfectivo('')
      setPagoMontoTarjeta('')
      setPagoMontoTransferencia('')
      setPagoComprobante('')
      setPagoComprobantePreview('')
    }
    setShowPaymentModal(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPagoComprobante(reader.result) // Base64
        setPagoComprobantePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const procesarPago = async (e) => {
    e.preventDefault()
    if (pagoIsSubmitting || pagoSubmittingRef.current) return
    if (!selectedOrdenParaPagar) return

    const totalOrden = Number(selectedOrdenParaPagar.total_economico || 0)
    let efec = 0
    let tarj = 0
    let cred = 0
    let deb = 0
    let trans = 0

    if (pagoMetodo === 'efectivo') {
      efec = totalOrden
    } else if (pagoMetodo === 'credito' || pagoMetodo === 'tarjeta') {
      tarj = totalOrden
      cred = totalOrden
    } else if (pagoMetodo === 'debito') {
      tarj = totalOrden
      deb = totalOrden
    } else if (pagoMetodo === 'transferencia') {
      trans = totalOrden
    } else if (pagoMetodo === 'mixto') {
      efec = Number(pagoMontoEfectivo || 0)
      tarj = Number(pagoMontoTarjeta || 0)
      trans = Number(pagoMontoTransferencia || 0)
      const asignado = efec + tarj + trans
      if (Math.abs(asignado - totalOrden) > 0.01) {
        alert(`La suma asignada ($ ${asignado.toLocaleString()}) no coincide con el total de la comanda ($ ${totalOrden.toLocaleString()}).`)
        return
      }
      if (efec <= 0 && tarj <= 0 && trans <= 0) {
        alert('Debe ingresar montos válidos en los medios seleccionados.')
        return
      }
      if (tarj > 0) {
        if (pagoTipoTarjetaMixto === 'debito') {
          deb = tarj
        } else {
          cred = tarj
        }
      }
    }

    const esCredito = pagoMetodo === 'credito' || (pagoMetodo === 'mixto' && tarj > 0 && pagoTipoTarjetaMixto === 'credito')
    const esDebito = pagoMetodo === 'debito' || (pagoMetodo === 'mixto' && tarj > 0 && pagoTipoTarjetaMixto === 'debito')
    const tipoTarjetaFinal = esCredito ? 'credito' : esDebito ? 'debito' : null
    // Solo hay cuotas si se eligió Crédito (1, 2 o 3 cuotas)
    const cuotasSeleccionadas = esCredito ? (Number(pagoCuotas) || 1) : null
    const esImagenComprobante = typeof pagoComprobante === 'string' && pagoComprobante.startsWith('data:image')

    let comprobantePrefixed = pagoComprobante || null
    if (!esImagenComprobante) {
      if (esCredito) {
        comprobantePrefixed = `[Crédito - ${cuotasSeleccionadas} ${cuotasSeleccionadas === 1 ? 'cuota' : 'cuotas'}]${pagoComprobante ? ` ${pagoComprobante}` : ''}`
      } else if (esDebito) {
        comprobantePrefixed = `[Débito]${pagoComprobante ? ` ${pagoComprobante}` : ''}`
      }
    }

    pagoSubmittingRef.current = true
    setPagoIsSubmitting(true)

    try {
      const updatePayload = {
        pago_estado: 'pagado',
        pago_metodo: pagoMetodo,
        pago_comprobante_url: comprobantePrefixed,
        pago_fecha_hora: new Date().toISOString(),
        pago_efectivo: efec,
        pago_tarjeta: tarj,
        pago_transferencia: trans,
        pago_detalles: {
          efectivo: efec,
          tarjeta: tarj,
          credito: cred,
          debito: deb,
          transferencia: trans,
          tipo_tarjeta: tipoTarjetaFinal,
          ...(cuotasSeleccionadas ? { cuotas: cuotasSeleccionadas } : {}),
          comprobante: pagoComprobante || null
        },
        estado: 'completada' // Se da por completada automáticamente al pagarse
      }

      let { error } = await supabase
        .from('ordenes_trabajo')
        .update(updatePayload)
        .eq('id', selectedOrdenParaPagar.id)

      // Fallback si aún no se corrió la migración SQL en Supabase
      if (error && (error.code === '42703' || error.message?.includes('column') || error.code === '23514')) {
        console.warn('Guardando con fallback compatible en Supabase:', error)
        const fallbackMetodo = (pagoMetodo === 'credito' || pagoMetodo === 'debito') ? 'tarjeta' : pagoMetodo
        const fallbackPayload = {
          pago_estado: 'pagado',
          pago_metodo: fallbackMetodo,
          pago_comprobante_url: pagoMetodo === 'mixto'
            ? `MIXT_EF:${efec}_TA:${tarj}_TR:${trans}${tipoTarjetaFinal ? `_TT:${tipoTarjetaFinal.toUpperCase()}` : ''}${cuotasSeleccionadas ? `_CUO:${cuotasSeleccionadas}` : ''} | ${pagoComprobante || ''}`
            : comprobantePrefixed,
          pago_fecha_hora: new Date().toISOString(),
          estado: 'completada'
        }
        const resFallback = await supabase
          .from('ordenes_trabajo')
          .update(fallbackPayload)
          .eq('id', selectedOrdenParaPagar.id)
        if (resFallback.error) throw resFallback.error
      } else if (error) {
        throw error
      }

      if (selectedOrdenParaPagar.turno_id) {
        try {
          await supabase
            .from('turnos')
            .update({ estado: 'Realizado' })
            .eq('id', selectedOrdenParaPagar.turno_id)
        } catch (errTurno) {
          console.error('Error al actualizar turno a Realizado tras pago:', errTurno)
        }
      }

      setShowPaymentModal(false)
      setSelectedOrdenParaPagar(null)
      fetchData()
    } catch (error) {
      console.error('Error al procesar el pago:', error)
      alert('Error al registrar pago')
    } finally {
      pagoSubmittingRef.current = false
      setPagoIsSubmitting(false)
    }
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [filtroMetodoPago, setFiltroMetodoPago] = useState('todos')
  const [collapsedMonths, setCollapsedMonths] = useState({})
  const [collapsedSearchMonths, setCollapsedSearchMonths] = useState({})

  const isSearching = searchQuery.trim().length > 0 || filtroMetodoPago !== 'todos'

  const toggleMonth = (key) => {
    if (isSearching) {
      setCollapsedSearchMonths(prev => ({
        ...prev,
        [key]: !prev[key]
      }))
    } else {
      setCollapsedMonths(prev => ({
        ...prev,
        [key]: prev[key] !== undefined ? !prev[key] : false
      }))
    }
  }

  useEffect(() => {
    setCollapsedSearchMonths({})
  }, [searchQuery, filtroMetodoPago])

  const filteredOrdenes = useMemo(() => {
    const query = searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

    return ordenes.filter(orden => {
      // 1. Filtro por Medio de Pago
      if (filtroMetodoPago !== 'todos') {
        if (filtroMetodoPago === 'pendiente') {
          if (orden.pago_estado === 'pagado') return false
        } else {
          if (orden.pago_estado !== 'pagado') return false
          const desg = getDesglosePago(orden)
          const m = (orden.pago_metodo || '').toLowerCase()
          if (filtroMetodoPago === 'credito' && desg.credito <= 0) return false
          if (filtroMetodoPago === 'debito' && desg.debito <= 0) return false
          if (filtroMetodoPago === 'efectivo' && desg.efectivo <= 0) return false
          if (filtroMetodoPago === 'transferencia' && desg.transferencia <= 0) return false
          if (filtroMetodoPago === 'mixto' && m !== 'mixto') return false
        }
      }

      if (!query) return true

      // Cliente
      const clienteNombre = `${orden.clientes?.nombre || ''} ${orden.clientes?.apellido || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (clienteNombre.includes(query)) return true

      // Responsable
      const responsable = (orden.usuarios?.nombre_completo || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (responsable.includes(query)) return true

      // Estado de trabajo
      const estado = (orden.estado || '').toLowerCase().replace('_', ' ')
      if (estado.includes(query)) return true

      // Estado de pago
      const estadoPago = (orden.pago_estado || '').toLowerCase()
      if (estadoPago.includes(query)) return true

      // Método de pago y etiqueta formateada
      const metodoPago = (orden.pago_metodo || '').toLowerCase()
      const labelPago = formatMetodoPagoLabel(orden).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (metodoPago.includes(query) || labelPago.includes(query)) return true

      // Notas
      const notas = (orden.notas || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (notas.includes(query)) return true

      // Total económico
      const totalStr = String(orden.total_economico || '')
      if (totalStr.includes(query)) return true

      // Fecha legible
      try {
        const fechaStr = new Date(orden.fecha_hora).toLocaleDateString()
        if (fechaStr.includes(query)) return true
      } catch (e) {
        // ignore
      }

      // Detalles (servicios o productos asociados)
      if (Array.isArray(orden.ordenes_trabajo_detalles)) {
        const matchesDetalle = orden.ordenes_trabajo_detalles.some(d => {
          const art = articulosDb.find(a => a.id === d.item_id || a.id === d.articulo_id)
          if (art && art.nombre) {
            const artNombre = art.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            if (artNombre.includes(query)) return true
          }
          const serv = serviciosDb.find(s => s.id === d.item_id || s.id === d.servicio_id)
          if (serv && serv.nombre) {
            const servNombre = serv.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            if (servNombre.includes(query)) return true
          }
          return false
        })
        if (matchesDetalle) return true
      }

      return false
    })
  }, [ordenes, searchQuery, filtroMetodoPago, articulosDb, serviciosDb])

  const monthGroups = useMemo(() => {
    if (!filteredOrdenes || filteredOrdenes.length === 0) return []

    const map = {}
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]

    filteredOrdenes.forEach(orden => {
      const date = new Date(orden.fecha_hora)
      const year = date.getFullYear()
      const month = date.getMonth()
      const key = `${year}-${String(month + 1).padStart(2, '0')}`
      const label = `${monthNames[month]} ${year}`

      if (!map[key]) {
        map[key] = {
          key,
          label,
          items: [],
          totalMonth: 0
        }
      }
      map[key].items.push(orden)
      map[key].totalMonth += Number(orden.total_economico || 0)
    })

    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
  }, [filteredOrdenes])

  useEffect(() => {
    if (monthGroups.length > 0 && !isSearching) {
      const now = new Date()
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setCollapsedMonths(prev => {
        const next = { ...prev }
        monthGroups.forEach(g => {
          if (next[g.key] === undefined) {
            next[g.key] = g.key !== currentKey
          }
        })
        return next
      })
    }
  }, [monthGroups, isSearching])

  const hasInvalidCollaborativeRow = useMemo(() => {
    return detalles.some(d => {
      if (!d.es_colaborativo) return false
      const team = d.equipo_colaboradores || []
      if (team.length < 2) return true
      const totalPart = Math.round(team.reduce((sum, m) => sum + (Number(m.porcentaje) || 0), 0) * 10) / 10
      if (Math.abs(totalPart - 100) > 0.1) return true
      const ids = team.map(m => m.colaborador_id).filter(Boolean)
      if (ids.length !== team.length) return true
      if (new Set(ids).size !== ids.length) return true
      return false
    })
  }, [detalles])

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Comandas</h1>
        <button className="btn btn-primary" onClick={() => { 
          closeModal(); 
          // Pre-cargar por defecto el último responsable
          const lastOrder = ordenes && ordenes.length > 0 ? ordenes[0] : null;
          if (lastOrder) {
            setFormData({
              cliente_id: '',
              usuario_responsable_id: lastOrder.usuario_responsable_id || '',
              estado: 'completada',
              notas: '',
              turno_id: null,
              fecha_hora: toLocalDateTimeInput(new Date()),
              es_comanda_pasada_cobrada: false
            });
          }
          setShowModal(true); 
        }}>
          <Plus size={18} /> Nueva Comanda
        </button>
      </header>

      {/* Barra de Búsqueda y Filtro por Medio de Pago */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '520px' }}>
            <Search 
              size={18} 
              style={{ 
                position: 'absolute', 
                left: '1rem', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }} 
            />
            <input
              type="text"
              className="input-field"
              placeholder="Buscar por cliente, responsable, servicio, estado, monto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                width: '100%', 
                paddingLeft: '2.75rem', 
                paddingRight: searchQuery ? '2.5rem' : '1rem' 
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Borrar búsqueda"
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.25rem'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filtro rápido por Medio de Pago */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'todos', label: 'Todos los medios' },
              { id: 'credito', label: '💳 Crédito' },
              { id: 'debito', label: '💳 Débito' },
              { id: 'efectivo', label: '💵 Efectivo' },
              { id: 'transferencia', label: '🏦 Transferencia' },
              { id: 'mixto', label: '🔀 Mixto' },
              { id: 'pendiente', label: '⏳ Sin Cobrar' }
            ].map(f => {
              const active = filtroMetodoPago === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroMetodoPago(f.id)}
                  className={active ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{
                    padding: '0.35rem 0.7rem',
                    fontSize: '0.78rem',
                    borderRadius: '8px',
                    fontWeight: active ? '700' : '500'
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {isSearching && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {filteredOrdenes.length} {filteredOrdenes.length === 1 ? 'comanda encontrada' : 'comandas encontradas'}
            </span>
          )}
        </div>

        {/* Panel Resumen de Control cuando se filtra por Tarjeta de Crédito */}
        {filtroMetodoPago === 'credito' && !isOperator && (() => {
          let totalCredito = 0
          let c1 = 0, c2 = 0, c3 = 0
          filteredOrdenes.forEach(o => {
            const desg = getDesglosePago(o)
            const cuo = getCuotasPago(o) || 1
            totalCredito += desg.credito
            if (cuo === 1) c1 += desg.credito
            else if (cuo === 2) c2 += desg.credito
            else if (cuo === 3) c3 += desg.credito
          })
          return (
            <div style={{
              background: 'rgba(180, 97, 42, 0.08)',
              border: '1px solid rgba(180, 97, 42, 0.28)',
              borderRadius: '10px',
              padding: '0.85rem 1.15rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--primary-color)' }}>
                  💳 Control de Cobros con Tarjeta de Crédito ({filteredOrdenes.length} {filteredOrdenes.length === 1 ? 'operación' : 'operaciones'})
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                  Total cobrado en Crédito: $ {totalCredito.toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>1 Cuota: </span>
                  <strong>$ {c1.toLocaleString()}</strong>
                </div>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>2 Cuotas: </span>
                  <strong>$ {c2.toLocaleString()}</strong>
                </div>
                <div style={{ background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>3 Cuotas: </span>
                  <strong>$ {c3.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando órdenes...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {monthGroups.length === 0 ? (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {isSearching ? (
                <div>
                  <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    No se encontraron comandas con los filtros actuales.
                  </p>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setSearchQuery(''); setFiltroMetodoPago('todos') }}
                    style={{ marginTop: '0.85rem', fontSize: '0.85rem' }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              ) : (
                'No hay órdenes registradas.'
              )}
            </div>
          ) : (
            monthGroups.map(group => {
              const isCollapsed = isSearching 
                ? Boolean(collapsedSearchMonths[group.key]) 
                : !!collapsedMonths[group.key]
              return (
                <div key={group.key} className="glass-panel" style={{ padding: '1.25rem' }}>
                  
                  {/* Encabezado del Mes (Clic para contraer/expandir) */}
                  <div 
                    onClick={() => toggleMonth(group.key)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      userSelect: 'none',
                      flexWrap: 'wrap',
                      gap: '0.6rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMonth(group.key)
                        }}
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          color: 'var(--primary-color)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          padding: 0,
                          cursor: 'pointer' 
                        }}
                        aria-label={isCollapsed ? "Expandir mes" : "Contraer mes"}
                      >
                        {isCollapsed ? <ChevronRight size={22} /> : <ChevronDown size={22} />}
                      </button>

                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                        <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
                        {group.label}
                      </span>

                      <span style={{ 
                        background: 'var(--input-bg)', 
                        border: '1px solid var(--surface-border)', 
                        padding: '0.2rem 0.6rem', 
                        borderRadius: '12px', 
                        fontSize: '0.8rem', 
                        color: 'var(--text-secondary)',
                        fontWeight: '500'
                      }}>
                        {group.items.length} {group.items.length === 1 ? 'comanda' : 'comandas'}
                      </span>
                    </div>

                    {!isOperator && (
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                        Total Mes: $ {group.totalMonth.toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Tabla de Comandas del Mes */}
                  {!isCollapsed && (
                    <div className="table-container" style={{ marginTop: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '0.75rem' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Fecha y Hora</th>
                            <th>Cliente</th>
                            <th>Responsable</th>
                            <th>Estado Trabajo</th>
                            <th>Pago</th>
                            {!isOperator && <th>Total</th>}
                            <th style={{ textAlign: 'center' }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map(orden => (
                            <tr key={orden.id}>
                              <td>{new Date(orden.fecha_hora).toLocaleString()}</td>
                              <td>{orden.clientes?.nombre} {orden.clientes?.apellido}</td>
                              <td>{orden.usuarios?.nombre_completo}</td>
                              <td>
                                <span style={{ 
                                  color: orden.estado === 'completada' ? 'var(--success-color)' : orden.estado === 'cancelada' ? 'var(--danger-color)' : 'var(--text-secondary)',
                                  fontWeight: orden.estado === 'completada' ? 600 : 'normal'
                                }}>
                                  {orden.estado.replace('_', ' ')}
                                </span>
                              </td>
                              <td>
                                {orden.pago_estado === 'pagado' ? (
                                  <div
                                    onClick={() => iniciarPago(orden)}
                                    title="Clic para ver o modificar medio de pago / cuotas"
                                    style={{ display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer' }}
                                  >
                                    <span style={{ color: 'var(--success-color)', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Check size={14} /> Pagado
                                    </span>
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                      {formatMetodoPagoLabel(orden, true)}
                                    </span>
                                  </div>
                                ) : (
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                                    onClick={() => iniciarPago(orden)}
                                  >
                                    <DollarSign size={12} style={{ marginRight: '2px' }} /> Pagar
                                  </button>
                                )}
                              </td>
                              {!isOperator && <td style={{ fontWeight: 'bold' }}>$ {Number(orden.total_economico).toLocaleString()}</td>}
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ 
                                      padding: '0.4rem', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      borderRadius: '8px',
                                      border: '1px solid var(--surface-border)',
                                      background: 'rgba(255, 255, 255, 0.03)'
                                    }}
                                    onClick={() => handleEditClick(orden)}
                                    title="Editar comanda"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  {!isOperator && (
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ 
                                        padding: '0.4rem', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        borderRadius: '8px',
                                        border: '1px solid var(--surface-border)',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        color: 'var(--danger-color)'
                                      }}
                                      onClick={() => handleEliminarOrden(orden.id)}
                                      title="Eliminar comanda"
                                    >
                                      <Trash2 size={14} />
                                    </button>
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
              )
            })
          )}
        </div>
      )}

      {/* Portal Modal */}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2>{selectedOrden ? 'Editar Comanda' : 'Nueva Comanda'}</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={closeModal}>✕</button>
            </div>
            
            <div className="modal-body">
              <form id="nueva-orden-form" onSubmit={handleSubmit}>
                {connectedTurnoInfo && (
                  <div style={{
                    background: 'rgba(180, 97, 42, 0.1)',
                    border: '1px solid rgba(180, 97, 42, 0.3)',
                    borderRadius: '8px',
                    padding: '0.65rem 0.9rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-primary)' }}>
                      <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
                      <span>
                        Conectada a la cita de agenda: <strong>{connectedTurnoInfo.servicioNombre || 'Servicio agendado'}</strong>
                        {connectedTurnoInfo.fecha ? ` (${new Date(connectedTurnoInfo.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs)` : ''}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      background: 'rgba(34, 197, 94, 0.15)',
                      color: 'var(--success-color)',
                      border: '1px solid rgba(34, 197, 94, 0.3)'
                    }}>
                      ✓ Se marcará como "Realizado" en Agenda
                    </span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Cliente *</label>
                    <SearchableClientSelect
                      clientes={clientes}
                      value={formData.cliente_id}
                      onChange={(val) => setFormData(prev => ({ ...prev, cliente_id: val }))}
                    />
                  </div>
                  <div className="input-group">
                    <label>Responsable *</label>
                    <select required className="input-field" name="usuario_responsable_id" value={formData.usuario_responsable_id} onChange={handleInputChange}>
                      <option value="">Selecciona responsable...</option>
                      {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre_completo}</option>)}
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Fecha y Hora del Trabajo *</label>
                    <input
                      type="datetime-local"
                      required
                      className="input-field"
                      name="fecha_hora"
                      value={formData.fecha_hora || ''}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {!selectedOrden && isDateFromPastDay(formData.fecha_hora) && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <input
                      type="checkbox"
                      id="es_comanda_pasada_cobrada"
                      name="es_comanda_pasada_cobrada"
                      checked={!!formData.es_comanda_pasada_cobrada}
                      onChange={handleInputChange}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--warning-color)' }}
                    />
                    <label htmlFor="es_comanda_pasada_cobrada" style={{ cursor: 'pointer', margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                      <strong>📄 Comanda de días anteriores ya cobrada en papel:</strong> Marcar como pagada en su fecha real para que <strong>sume las comisiones</strong> al colaborador en ese mes, pero <strong>NO altere la Caja abierta de hoy</strong>.
                    </label>
                  </div>
                )}

                <div style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>Detalles (Artículos y Servicios)</h3>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => agregarDetalle('servicio')}>
                        + Servicio
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => agregarDetalle('articulo')}>
                        + Artículo
                      </button>
                    </div>
                  </div>

                  {detalles.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171' }}>
                      {modalLoading ? 'Cargando detalles de la comanda...' : '⚠️ Esta comanda no posee detalles registrados. Haz clic en "+ Servicio" o "+ Artículo" para añadir los ítems antes de guardar.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {detalles.map((detalle, index) => {
                        const rowSubtotal = Number(detalle.cantidad) * Number(detalle.precio_unitario)
                        const comInfo = getRowComisionInfo(detalle)
                        const rowCosto = Number(detalle.cantidad) * Number(detalle.precio_costo)
                        const rowProfit = rowSubtotal - rowCosto - comInfo.totalComision
                        const team = detalle.equipo_colaboradores || []
                        const totalPartRow = Math.round(team.reduce((acc, m) => acc + (Number(m.porcentaje) || 0), 0) * 10) / 10
                        const isPartValid = Math.abs(totalPartRow - 100) < 0.1

                        return (
                          <div key={detalle.id_temp} className="comanda-item-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            
                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ 
                                fontSize: '0.72rem', 
                                textTransform: 'uppercase', 
                                fontWeight: '700',
                                letterSpacing: '0.5px',
                                color: detalle.es_insumo_asociado ? 'var(--success-color)' : 'var(--primary-color)', 
                                background: detalle.es_insumo_asociado ? 'rgba(16, 185, 129, 0.12)' : 'rgba(180, 97, 42, 0.12)',
                                border: `1px solid ${detalle.es_insumo_asociado ? 'rgba(16, 185, 129, 0.25)' : 'rgba(180, 97, 42, 0.25)'}`,
                                padding: '0.25rem 0.5rem',
                                borderRadius: '6px',
                                textAlign: 'center',
                                minWidth: '76px'
                              }}>
                                {detalle.es_insumo_asociado ? 'insumo' : detalle.tipo_item}
                              </span>

                              <div style={{ flex: 2, minWidth: '150px', display: 'flex', flexDirection: 'column' }}>
                                <select 
                                  required
                                  className="input-field" 
                                  style={{ width: '100%', padding: '0.5rem', margin: 0 }}
                                  value={detalle.item_id}
                                  onChange={(e) => actualizarDetalle(detalle.id_temp, 'item_id', e.target.value)}
                                >
                                  <option value="">Selecciona...</option>
                                  {detalle.tipo_item === 'articulo' 
                                    ? articulosDb.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)
                                    : serviciosDb.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)
                                  }
                                </select>
                                {detalle.es_insumo_asociado && (
                                  <span style={{ fontSize: '0.725rem', color: 'var(--success-color)', marginTop: '2px', fontWeight: '500' }}>
                                    ✨ Insumo para: {detalle.asociado_a_servicio_nombre}
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', width: '90px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>Cant:</span>
                                <input 
                                  type="number" min="0.1" step="0.1" required
                                  className="input-field" 
                                  style={{ width: '100%', padding: '0.5rem', margin: 0 }}
                                  value={detalle.cantidad}
                                  onChange={(e) => actualizarDetalle(detalle.id_temp, 'cantidad', e.target.value)}
                                />
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', width: '100px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>$</span>
                                <input 
                                  type="number" min="0" step="0.01" required
                                  className="input-field" 
                                  style={{ width: '100%', padding: '0.5rem', margin: 0 }}
                                  value={detalle.precio_unitario}
                                  onChange={(e) => actualizarDetalle(detalle.id_temp, 'precio_unitario', e.target.value)}
                                />
                              </div>

                              <div style={{ width: '95px', textAlign: 'right', fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>
                                $ {rowSubtotal.toLocaleString()}
                              </div>

                              <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--danger-color)', borderColor: 'transparent', marginLeft: 'auto' }} onClick={() => removerDetalle(detalle.id_temp)}>
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Sub-fila: Asignación Individual o Trabajo Colaborativo por Renglón */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px dashed var(--surface-border)', paddingTop: '0.6rem' }}>
                              
                              {!detalle.es_colaborativo ? (
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '180px' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Asignar a:</span>
                                    <select 
                                      className="input-field"
                                      style={{ padding: '0.35rem 0.5rem', margin: 0, fontSize: '0.8rem' }}
                                      value={detalle.colaborador_id}
                                      onChange={(e) => actualizarDetalle(detalle.id_temp, 'colaborador_id', e.target.value)}
                                    >
                                      <option value="">Ninguno (Sin comisión)</option>
                                      {empleados.map(e => (
                                        <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {detalle.colaborador_id && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', width: '110px' }}>
                                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>Com.:</span>
                                      <input 
                                        type="number" min="0" max="100"
                                        className="input-field" 
                                        style={{ padding: '0.35rem 0.5rem', margin: 0, fontSize: '0.8rem', width: '50px' }}
                                        value={detalle.porcentaje_comision}
                                        onChange={(e) => actualizarDetalle(detalle.id_temp, 'porcentaje_comision', e.target.value)}
                                      />
                                      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>%</span>
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '0.35rem 0.65rem',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      background: 'rgba(180, 97, 42, 0.1)',
                                      borderColor: 'rgba(180, 97, 42, 0.35)',
                                      color: 'var(--primary-color)'
                                    }}
                                    onClick={() => toggleColaborativoItem(detalle.id_temp)}
                                    title="Dividir este servicio entre varias estilistas"
                                  >
                                    <Users size={13} /> Colaborativo
                                  </button>

                                  <div style={{ display: 'flex', gap: '1.25rem', marginLeft: 'auto', fontSize: '0.8rem', alignItems: 'center' }}>
                                    {detalle.colaborador_id && (
                                      <span style={{ color: 'var(--text-secondary)' }}>Monto Com.: <strong style={{ color: 'var(--success-color)' }}>${comInfo.totalComision.toLocaleString()}</strong></span>
                                    )}
                                    <span style={{ color: 'var(--text-secondary)' }}>Rentabilidad: <strong style={{ color: rowProfit >= 0 ? 'var(--primary-color)' : 'var(--danger-color)' }}>${rowProfit.toLocaleString()}</strong></span>
                                  </div>
                                </div>
                              ) : (
                                <div className="comanda-colab-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
                                  
                                  {/* Cabecera del trabajo colaborativo del renglón */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Users size={15} /> Equipo Colaborativo para este ítem:
                                      </span>
                                      <span style={{ 
                                        fontSize: '0.75rem', 
                                        fontWeight: '700', 
                                        color: isPartValid ? '#15803d' : '#b91c1c', 
                                        background: isPartValid ? '#dcfce7' : '#fee2e2', 
                                        border: `1px solid ${isPartValid ? '#86efac' : '#fca5a5'}`,
                                        padding: '0.2rem 0.55rem', 
                                        borderRadius: '6px' 
                                      }}>
                                        {isPartValid ? '✓ Total asignado: 100%' : `⚠️ Suma: ${totalPartRow}% (debe ser 100%)`}
                                      </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', fontWeight: '600' }}
                                        onClick={() => equilibrarEquipoItem(detalle.id_temp)}
                                        title="Repartir porcentaje equitativamente entre las estilistas"
                                      >
                                        ⚖️ 50/50
                                      </button>
                                      {empleados.length > 2 && (
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', fontWeight: '600' }}
                                          onClick={() => agregarMiembroEquipoItem(detalle.id_temp)}
                                        >
                                          + Estilista
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', fontWeight: '600' }}
                                        onClick={() => toggleColaborativoItem(detalle.id_temp)}
                                        title="Volver a asignar solo a una estilista individual"
                                      >
                                        👤 Individual
                                      </button>
                                    </div>
                                  </div>

                                  {/* Filas de estilistas colaboradoras */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                    {team.map((member, mIdx) => {
                                      const colab = empleados.find(e => e.id === member.colaborador_id)
                                      const partPct = Number(member.porcentaje) || 0
                                      const ratePct = member.tasa_comision !== undefined ? member.tasa_comision : (detalle.tipo_item === 'articulo' ? (colab?.comision_productos || 10) : (colab?.comision_servicios || 30))
                                      const memberBase = rowSubtotal * (partPct / 100)
                                      const memberCom = memberBase * (Number(ratePct) / 100)

                                      return (
                                        <div key={mIdx} className="comanda-member-row" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                          <select
                                            required
                                            className="input-field"
                                            style={{ flex: 2, minWidth: '130px', padding: '0.3rem 0.5rem', margin: 0, fontSize: '0.8rem' }}
                                            value={member.colaborador_id}
                                            onChange={(e) => actualizarEquipoMiembro(detalle.id_temp, mIdx, 'colaborador_id', e.target.value)}
                                          >
                                            <option value="">Selecciona estilista...</option>
                                            {empleados.map(e => (
                                              <option key={e.id} value={e.id}>{e.nombre_completo}</option>
                                            ))}
                                          </select>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>Part:</span>
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="1"
                                              required
                                              className="input-field"
                                              style={{ width: '50px', padding: '0.25rem 0.35rem', margin: 0, fontSize: '0.8rem', textAlign: 'center', fontWeight: 'bold' }}
                                              value={member.porcentaje}
                                              onChange={(e) => actualizarEquipoMiembro(detalle.id_temp, mIdx, 'porcentaje', e.target.value)}
                                            />
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>%</span>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>Com:</span>
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              required
                                              className="input-field"
                                              style={{ width: '46px', padding: '0.25rem 0.35rem', margin: 0, fontSize: '0.8rem', textAlign: 'center', fontWeight: 'bold' }}
                                              value={ratePct}
                                              onChange={(e) => actualizarEquipoMiembro(detalle.id_temp, mIdx, 'tasa_comision', e.target.value)}
                                            />
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>%</span>
                                          </div>

                                          <div style={{ fontSize: '0.8rem', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Base: <strong style={{ color: 'var(--text-primary)' }}>${memberBase.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                                            <span style={{ color: 'var(--text-secondary)' }}>Com: <strong style={{ color: 'var(--success-color)' }}>${memberCom.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                                          </div>

                                          {team.length > 2 && (
                                            <button
                                              type="button"
                                              className="btn btn-secondary"
                                              style={{ padding: '0.25rem 0.4rem', color: 'var(--danger-color)', borderColor: 'transparent' }}
                                              onClick={() => removerMiembroEquipoItem(detalle.id_temp, mIdx)}
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>

                                  {/* Resumen del renglón colaborativo */}
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1.25rem', fontSize: '0.8rem', marginTop: '0.25rem', paddingTop: '0.45rem', borderTop: '1px dashed var(--surface-border)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Comisión Total Fila: <strong style={{ color: 'var(--success-color)' }}>${comInfo.totalComision.toLocaleString()}</strong></span>
                                    <span style={{ color: 'var(--text-secondary)' }}>Rentabilidad Fila: <strong style={{ color: rowProfit >= 0 ? 'var(--primary-color)' : 'var(--danger-color)' }}>${rowProfit.toLocaleString()}</strong></span>
                                  </div>

                                </div>
                              )}

                            </div>

                          </div>
                        )
                      })}
                    </div>
                  )}

                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1.25rem' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label>Estado del Trabajo</label>
                    <select className="input-field" name="estado" value={formData.estado} onChange={handleInputChange}>
                      <option value="pendiente">Pendiente</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="completada">Completada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                  
                  <div className="input-group" style={{ margin: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                      <Palette size={16} style={{ color: 'var(--primary-color)' }} />
                      Fórmula de Color, Notas Técnicas y Observaciones
                    </label>
                    <textarea 
                      className="input-field" 
                      name="notas" 
                      rows="3" 
                      placeholder="Ej: Fórmula de tintura (45g 7.1 + 15g 7.0 + 60ml Ox 20 vol). Tiempo de pose: 35 min. Matiz en bacha con 9.21. Cuero cabelludo sensible, no aplicar calor..."
                      value={formData.notas} 
                      onChange={handleInputChange}
                    ></textarea>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      💡 Esta nota quedará registrada en el <strong>Historial y Ficha del Cliente</strong> para futuras consultas de los estilistas.
                    </span>
                  </div>
                </div>
              </form>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', fontWeight: '600' }}>Total Calculado:</span>
                <span style={{ fontWeight: '800', color: 'var(--success-color)', fontSize: '1.4rem' }}>$ {calcularTotal().toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" form="nueva-orden-form" className="btn btn-primary" disabled={isSubmitting || hasInvalidCollaborativeRow}>
                  {isSubmitting ? 'Guardando...' : (selectedOrden ? 'Guardar Cambios' : 'Guardar Comanda y Descontar Stock')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Portal de Pago */}
      {showPaymentModal && selectedOrdenParaPagar && (() => {
        const totalAPagar = Number(selectedOrdenParaPagar.total_economico || 0)
        const montoEfecNum = Number(pagoMontoEfectivo || 0)
        const montoTarjNum = Number(pagoMontoTarjeta || 0)
        const montoTransNum = Number(pagoMontoTransferencia || 0)
        const totalAsignado = montoEfecNum + montoTarjNum + montoTransNum
        const diferenciaAsignacion = Math.round((totalAPagar - totalAsignado) * 100) / 100
        const isMixtoValid = pagoMetodo === 'mixto' 
          ? Math.abs(diferenciaAsignacion) < 0.01 && totalAsignado > 0
          : true

        return createPortal(
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '540px', width: '92%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <CreditCard size={22} style={{ color: 'var(--primary-color)' }} />
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Registrar Pago de la Comanda</h2>
                </div>
                <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowPaymentModal(false)}>✕</button>
              </div>
              
              <form onSubmit={procesarPago} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
                  
                  {/* Resumen de la Orden */}
                  <div style={{ background: 'rgba(180, 97, 42, 0.07)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(180, 97, 42, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cliente:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {selectedOrdenParaPagar.clientes?.nombre} {selectedOrdenParaPagar.clientes?.apellido}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total a Cobrar:</span>
                      <strong style={{ color: 'var(--success-color)', fontSize: '1.35rem' }}>
                        $ {totalAPagar.toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Selector Método de Pago */}
                  <div className="input-group">
                    <label style={{ fontWeight: '600' }}>Método de Pago *</label>
                    <select 
                      required 
                      className="input-field" 
                      value={pagoMetodo} 
                      onChange={(e) => {
                        const newMetodo = e.target.value
                        setPagoMetodo(newMetodo)
                        if (newMetodo === 'credito') {
                          setPagoCuotas(pagoCuotas || 1)
                        }
                        if (newMetodo === 'mixto' && !pagoMontoEfectivo && !pagoMontoTarjeta && !pagoMontoTransferencia) {
                          const mitad = Math.floor(totalAPagar / 2)
                          setPagoMontoEfectivo(String(mitad))
                          setPagoMontoTarjeta(String(totalAPagar - mitad))
                          setPagoMontoTransferencia('')
                        }
                      }}
                    >
                      <option value="efectivo">💵 Efectivo</option>
                      <option value="credito">💳 Tarjeta de Crédito</option>
                      <option value="debito">💳 Tarjeta de Débito</option>
                      <option value="transferencia">🏦 Transferencia Bancaria</option>
                      <option value="mixto">🔀 Pago Dividido / Mixto (2 o más medios)</option>
                    </select>
                  </div>

                  {/* Selector de Cuotas (1, 2 o 3) ÚNICAMENTE cuando se paga con Tarjeta de Crédito */}
                  {(pagoMetodo === 'credito' || (pagoMetodo === 'mixto' && montoTarjNum > 0 && pagoTipoTarjetaMixto === 'credito')) && (
                    <div className="input-group" style={{ background: 'rgba(47, 127, 120, 0.08)', border: '1px solid rgba(47, 127, 120, 0.3)', borderRadius: '8px', padding: '0.85rem' }}>
                      <label style={{ fontWeight: '600', fontSize: '0.88rem', marginBottom: '0.5rem', display: 'block', color: 'var(--text-primary)' }}>
                        💳 Cantidad de Cuotas (Tarjeta de Crédito) *
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                        {[1, 2, 3].map((numCuota) => {
                          const isSelected = Number(pagoCuotas) === numCuota
                          return (
                            <button
                              key={numCuota}
                              type="button"
                              onClick={() => setPagoCuotas(numCuota)}
                              style={{
                                padding: '0.6rem 0.5rem',
                                borderRadius: '8px',
                                fontWeight: '700',
                                fontSize: '0.88rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                background: isSelected ? 'var(--primary-color)' : 'var(--input-bg)',
                                color: isSelected ? '#ffffff' : 'var(--text-primary)',
                                border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--surface-border)',
                                boxShadow: isSelected ? '0 2px 8px rgba(180, 97, 42, 0.35)' : 'none'
                              }}
                            >
                              {numCuota === 1 ? '1 Cuota / 1 Pago' : `${numCuota} Cuotas`}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Interfaz Especial para Pago Mixto / Dividido */}
                  {pagoMetodo === 'mixto' && (
                    <div style={{ background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <PieChart size={16} style={{ color: 'var(--primary-color)' }} />
                          Desglose por medio de pago:
                        </span>
                        
                        {/* Atajos rápidos */}
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                            onClick={() => {
                              const mitad = Math.floor(totalAPagar / 2)
                              setPagoMontoEfectivo(String(mitad))
                              setPagoMontoTarjeta(String(totalAPagar - mitad))
                              setPagoMontoTransferencia('')
                            }}
                          >
                            50% Ef. + 50% Tarj.
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                            onClick={() => {
                              const mitad = Math.floor(totalAPagar / 2)
                              setPagoMontoEfectivo(String(mitad))
                              setPagoMontoTransferencia(String(totalAPagar - mitad))
                              setPagoMontoTarjeta('')
                            }}
                          >
                            50% Ef. + 50% Transf.
                          </button>
                        </div>
                      </div>

                      {/* Input 1: Efectivo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '130px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span>💵 Efectivo:</span>
                        </div>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                          <input 
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field"
                            style={{ paddingLeft: '1.75rem', margin: 0, width: '100%' }}
                            placeholder="0"
                            value={pagoMontoEfectivo}
                            onChange={(e) => setPagoMontoEfectivo(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Input 2: Tarjeta */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '130px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span>💳 Tarjeta (POS):</span>
                          </div>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                            <input 
                              type="number"
                              min="0"
                              step="0.01"
                              className="input-field"
                              style={{ paddingLeft: '1.75rem', margin: 0, width: '100%' }}
                              placeholder="0"
                              value={pagoMontoTarjeta}
                              onChange={(e) => setPagoMontoTarjeta(e.target.value)}
                            />
                          </div>
                        </div>
                        {montoTarjNum > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Tipo de tarjeta:</span>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                onClick={() => setPagoTipoTarjetaMixto('credito')}
                                style={{
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.76rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  background: pagoTipoTarjetaMixto === 'credito' ? 'var(--primary-color)' : 'var(--input-bg)',
                                  color: pagoTipoTarjetaMixto === 'credito' ? '#fff' : 'var(--text-secondary)',
                                  border: pagoTipoTarjetaMixto === 'credito' ? '1px solid var(--primary-color)' : '1px solid var(--surface-border)'
                                }}
                              >
                                💳 Crédito
                              </button>
                              <button
                                type="button"
                                onClick={() => setPagoTipoTarjetaMixto('debito')}
                                style={{
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  fontSize: '0.76rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  background: pagoTipoTarjetaMixto === 'debito' ? '#0ea5e9' : 'var(--input-bg)',
                                  color: pagoTipoTarjetaMixto === 'debito' ? '#fff' : 'var(--text-secondary)',
                                  border: pagoTipoTarjetaMixto === 'debito' ? '1px solid #0ea5e9' : '1px solid var(--surface-border)'
                                }}
                              >
                                💳 Débito
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Input 3: Transferencia */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '130px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span>🏦 Transferencia:</span>
                        </div>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                          <input 
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field"
                            style={{ paddingLeft: '1.75rem', margin: 0, width: '100%' }}
                            placeholder="0"
                            value={pagoMontoTransferencia}
                            onChange={(e) => setPagoMontoTransferencia(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Estado del balance de asignación */}
                      <div style={{ 
                        marginTop: '0.25rem', 
                        padding: '0.65rem 0.85rem', 
                        borderRadius: '6px', 
                        fontSize: '0.82rem',
                        background: Math.abs(diferenciaAsignacion) < 0.01 
                          ? 'rgba(16, 185, 129, 0.12)' 
                          : 'rgba(239, 68, 68, 0.12)',
                        border: `1px solid ${Math.abs(diferenciaAsignacion) < 0.01 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        color: Math.abs(diferenciaAsignacion) < 0.01 ? 'var(--success-color)' : 'var(--danger-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          {Math.abs(diferenciaAsignacion) < 0.01 ? (
                            <span>✅ Total asignado correctamente: <strong>$ {totalAsignado.toLocaleString()}</strong></span>
                          ) : diferenciaAsignacion > 0 ? (
                            <span>⚠️ Faltan asignar: <strong>$ {diferenciaAsignacion.toLocaleString()}</strong></span>
                          ) : (
                            <span>❌ Excedido por: <strong>$ {Math.abs(diferenciaAsignacion).toLocaleString()}</strong></span>
                          )}
                        </div>
                        {diferenciaAsignacion > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
                            onClick={() => {
                              // Asignar el resto al medio con valor o a tarjeta
                              if (montoTarjNum > 0) {
                                setPagoMontoTarjeta(String(montoTarjNum + diferenciaAsignacion))
                              } else {
                                setPagoMontoEfectivo(String(montoEfecNum + diferenciaAsignacion))
                              }
                            }}
                          >
                            Asignar resto
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Referencia o Comprobante */}
                  <div className="input-group">
                    <label style={{ fontWeight: '500', fontSize: '0.85rem' }}>
                      {pagoMetodo === 'efectivo' 
                        ? 'Referencia de Pago (Opcional)' 
                        : pagoMetodo === 'mixto'
                        ? 'Cupones / Números de Operación (Opcional)'
                        : 'Comprobante / Referencia de Transacción *'}
                    </label>
                    <input 
                      type="text" 
                      required={pagoMetodo === 'credito' || pagoMetodo === 'debito' || pagoMetodo === 'tarjeta' || pagoMetodo === 'transferencia'}
                      className="input-field"
                      placeholder={pagoMetodo === 'efectivo' ? 'Ej: Se recibe justo' : pagoMetodo === 'mixto' ? 'Ej: Cupón Tarjeta 8492 + Efec.' : 'Ej: Nro de Operación, Ref, Cupón...'}
                      value={pagoComprobante}
                      onChange={(e) => setPagoComprobante(e.target.value)}
                    />
                  </div>

                  {/* Adjuntar Comprobante (opcional) */}
                  {pagoMetodo !== 'efectivo' && (
                    <div className="input-group">
                      <label style={{ fontSize: '0.85rem' }}>Adjuntar Foto del Comprobante (Opcional)</label>
                      <input 
                        type="file" 
                        accept="image/*"
                        className="input-field"
                        style={{ padding: '0.5rem' }}
                        onChange={handleFileChange}
                      />
                      {pagoComprobantePreview && (
                        <div style={{ marginTop: '0.75rem', position: 'relative', textAlign: 'center' }}>
                          <img 
                            src={pagoComprobantePreview} 
                            alt="Vista previa del comprobante" 
                            style={{ maxWidth: '100%', maxHeight: '140px', borderRadius: '8px', border: '1px solid var(--surface-border)', objectFit: 'cover' }} 
                          />
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ position: 'absolute', top: '5px', right: '5px', padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                            onClick={() => { setPagoComprobante(''); setPagoComprobantePreview(''); }}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--surface-border)', padding: '1rem 1.25rem', flexShrink: 0 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)} disabled={pagoIsSubmitting}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={pagoIsSubmitting || !isMixtoValid}>
                    {pagoIsSubmitting ? 'Procesando...' : 'Confirmar Pago'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
