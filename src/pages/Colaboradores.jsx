import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { 
  Plus, UserCheck, Percent, DollarSign, CheckCircle2, ShieldCheck, Mail, Phone, User, 
  Trash2, Key, Edit, Printer, FileText, Calendar, CreditCard, ChevronRight, CheckSquare, Square, History,
  Lock, Eye, EyeOff, RefreshCw, X, AlertCircle
} from 'lucide-react'

export default function Colaboradores() {
  const { activeEmpresaId, userProfile } = useAuth()
  const navigate = useNavigate()
  const isAdminOrSuper = userProfile?.rol === 'administrador' || userProfile?.rol === 'super_admin'
  const [activeTab, setActiveTab] = useState('directorio')
  const [loading, setLoading] = useState(true)
  const [empresaInfo, setEmpresaInfo] = useState(null)
  
  // Lista de Colaboradores
  const [colaboradores, setColaboradores] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingColaborador, setEditingColaborador] = useState(null)

  // Modal Cambio de Contraseña
  const [passwordModalColab, setPasswordModalColab] = useState(null)
  const [newPasswordVal, setNewPasswordVal] = useState('')
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('')
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState(null)

  const [newColaborador, setNewColaborador] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    comision_servicios: 30,
    comision_productos: 10,
    rol: 'operador'
  })

  // Liquidaciones
  const [selectedColabId, setSelectedColabId] = useState('')
  const [comisionesPendientes, setComisionesPendientes] = useState([])
  const [selectedComisionIds, setSelectedComisionIds] = useState([])
  const [isLiquidating, setIsLiquidating] = useState(false)
  const [fechaFiltro, setFechaFiltro] = useState('todos') // 'todos', 'mes', 'quincena', 'semana'
  const [medioPago, setMedioPago] = useState('efectivo') // 'efectivo', 'transferencia', 'mercadopago'
  const [notasLiquidacion, setNotasLiquidacion] = useState('')

  // Historial de Liquidaciones
  const [historialLiquidaciones, setHistorialLiquidaciones] = useState([])
  const [selectedReceipt, setSelectedReceipt] = useState(null)

  useEffect(() => {
    if (activeEmpresaId) {
      fetchEmpresaInfo()
      fetchColaboradores()
      fetchHistorialLiquidaciones()
    }
  }, [activeEmpresaId])

  useEffect(() => {
    if (selectedColabId) {
      fetchComisionesPendientes()
    } else {
      setComisionesPendientes([])
      setSelectedComisionIds([])
    }
  }, [selectedColabId])

  const fetchEmpresaInfo = async () => {
    try {
      const { data } = await supabase
        .from('empresas')
        .select('id, nombre, rut_cuit, logo_url')
        .eq('id', activeEmpresaId)
        .single()
      if (data) setEmpresaInfo(data)
    } catch (err) {
      console.error('Error fetching empresa info:', err)
    }
  }

  const fetchColaboradores = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .neq('rol', 'super_admin')
        .order('nombre_completo')
      
      if (error) throw error

      const normalizedList = data || []

      setColaboradores(normalizedList)
      
      if (normalizedList.length > 0 && !selectedColabId) {
        setSelectedColabId(normalizedList[0].id)
      }
    } catch (err) {
      console.error('Error fetching colaboradores:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchComisionesPendientes = async () => {
    try {
      const { data, error } = await supabase
        .from('comisiones')
        .select(`
          *,
          ordenes_trabajo (id, fecha_hora, estado, pago_estado, es_colaborativa, clientes (nombre, apellido))
        `)
        .eq('colaborador_id', selectedColabId)
        .eq('estado', 'Pendiente')
        .order('created_at', { ascending: false })
      
      if (error) throw error

      // Excluir comisiones de comandas que estén canceladas o eliminadas y ordenar por la fecha real del trabajo
      const validData = (data || []).filter(c => {
        const ot = c.ordenes_trabajo
        if (ot && (ot.estado === 'cancelada' || ot.estado === 'eliminada' || ot.pago_estado === 'cancelado' || ot.pago_estado === 'anulado')) {
          return false
        }
        return true
      }).sort((a, b) => {
        const dateA = new Date(a.ordenes_trabajo?.fecha_hora || a.created_at).getTime()
        const dateB = new Date(b.ordenes_trabajo?.fecha_hora || b.created_at).getTime()
        return dateB - dateA
      })

      setComisionesPendientes(validData)
      setSelectedComisionIds([]) // reset selection
    } catch (err) {
      console.error('Error fetching comisiones:', err)
    }
  }

  const fetchHistorialLiquidaciones = async () => {
    try {
      const { data, error } = await supabase
        .from('liquidaciones')
        .select(`
          *,
          usuarios:colaborador_id (nombre_completo, email)
        `)
        .eq('empresa_id', activeEmpresaId)
        .order('fecha_liquidacion', { ascending: false })

      if (error) throw error
      setHistorialLiquidaciones(data || [])
    } catch (err) {
      console.error('Error fetching liquidaciones history:', err)
      // Fallback si la tabla liquidaciones aún no se migró en Supabase
      const { data: coms } = await supabase
        .from('comisiones')
        .select(`
          *,
          usuarios:colaborador_id (nombre_completo, email)
        `)
        .eq('empresa_id', activeEmpresaId)
        .eq('estado', 'Liquidada')
        .order('created_at', { ascending: false })

      if (coms) {
        const map = {}
        coms.forEach(c => {
          const dateStr = new Date(c.created_at).toISOString().split('T')[0]
          const key = `${c.colaborador_id}_${dateStr}`
          if (!map[key]) {
            map[key] = {
              id: key,
              codigo_liquidacion: `LIQ-HIST-${dateStr}`,
              fecha_liquidacion: c.created_at,
              monto_total: 0,
              medio_pago: 'efectivo',
              colaborador_id: c.colaborador_id,
              usuarios: c.usuarios,
              comisiones: []
            }
          }
          map[key].monto_total += Number(c.monto_comision)
          map[key].comisiones.push(c)
        })
        setHistorialLiquidaciones(Object.values(map))
      }
    }
  }

  // Filtrar comisiones según la pestaña de fecha seleccionada
  const comisionesFiltradas = useMemo(() => {
    if (fechaFiltro === 'todos') return comisionesPendientes
    const now = new Date()
    return comisionesPendientes.filter(c => {
      const comDate = new Date(c.ordenes_trabajo?.fecha_hora || c.created_at)
      if (fechaFiltro === 'semana') {
        const diffTime = Math.abs(now - comDate)
        const diffDays = diffTime / (1000 * 60 * 60 * 24)
        return diffDays <= 7
      }
      if (fechaFiltro === 'quincena') {
        const diffTime = Math.abs(now - comDate)
        const diffDays = diffTime / (1000 * 60 * 60 * 24)
        return diffDays <= 15
      }
      if (fechaFiltro === 'mes') {
        return comDate.getMonth() === now.getMonth() && comDate.getFullYear() === now.getFullYear()
      }
      if (fechaFiltro === 'mes_anterior') {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return comDate.getMonth() === prevMonthDate.getMonth() && comDate.getFullYear() === prevMonthDate.getFullYear()
      }
      return true
    })
  }, [comisionesPendientes, fechaFiltro])

  const handleAddColaborador = async (e) => {
    e.preventDefault()
    if (!newColaborador.nombre_completo) return alert('Por favor ingresa un nombre')
    if (!newColaborador.email) return alert('Por favor ingresa un email válido para el inicio de sesión')
    if (!newColaborador.password || newColaborador.password.length < 8) {
      return alert('Por favor ingresa una contraseña de al menos 8 caracteres')
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false }
      })

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: newColaborador.email,
        password: newColaborador.password,
      })

      if (authError) throw authError
      if (!authData?.user) throw new Error('No se pudo crear el usuario de autenticación')

      const { error } = await supabase
        .from('usuarios')
        .insert([{
          id: authData.user.id,
          empresa_id: activeEmpresaId,
          nombre_completo: newColaborador.nombre_completo,
          email: newColaborador.email,
          telefono: newColaborador.telefono || '',
          rol: newColaborador.rol || 'operador',
          comision_servicios: Number(newColaborador.comision_servicios),
          comision_productos: Number(newColaborador.comision_productos)
        }])

      if (error) throw error

      setShowAddModal(false)
      setNewColaborador({
        nombre_completo: '',
        email: '',
        password: '',
        telefono: '',
        comision_servicios: 30,
        comision_productos: 10,
        rol: 'operador'
      })
      
      alert('Colaborador/Administrador creado exitosamente.')
      fetchColaboradores()
    } catch (err) {
      console.error('Error creando colaborador:', err)
      alert(`Error al dar de alta al colaborador: ${err.message}`)
    }
  }

  const handleUpdateColaborador = async (e) => {
    e.preventDefault()
    if (!editingColaborador.nombre_completo) return alert('Por favor ingresa un nombre')

    try {
      const { error } = await supabase
        .from('usuarios')
        .update({
          nombre_completo: editingColaborador.nombre_completo,
          telefono: editingColaborador.telefono || '',
          rol: editingColaborador.rol,
          comision_servicios: Number(editingColaborador.comision_servicios),
          comision_productos: Number(editingColaborador.comision_productos)
        })
        .eq('id', editingColaborador.id)

      if (error) throw error

      setEditingColaborador(null)
      alert('Perfil actualizado con éxito')
      fetchColaboradores()
    } catch (err) {
      console.error('Error actualizando colaborador:', err)
      alert('Error al actualizar el perfil')
    }
  }

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    let pwd = ''
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    pwd += '!@'
    setNewPasswordVal(pwd)
    setConfirmPasswordVal(pwd)
    setShowPasswordText(true)
  }

  const handleSavePassword = async (e) => {
    e.preventDefault()
    setPasswordMessage(null)

    if (!newPasswordVal || newPasswordVal.length < 8) {
      setPasswordMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (newPasswordVal !== confirmPasswordVal) {
      setPasswordMessage({ type: 'error', text: 'Las contraseñas ingresadas no coinciden.' })
      return
    }

    try {
      setIsUpdatingPassword(true)
      const { data, error } = await supabase.functions.invoke('nunki-admin-update-password', {
        body: {
          targetUserId: passwordModalColab.id,
          newPassword: newPasswordVal
        }
      })

      if (error) {
        throw new Error(error.message || 'Error al actualizar contraseña')
      }
      if (data?.error) {
        throw new Error(data.error)
      }

      setPasswordMessage({
        type: 'success',
        text: `¡Contraseña actualizada con éxito para ${passwordModalColab.nombre_completo}! Ya puede ingresar con esta nueva clave.`
      })
      setNewPasswordVal('')
      setConfirmPasswordVal('')
    } catch (err) {
      console.error('Error al actualizar contraseña:', err)
      setPasswordMessage({
        type: 'error',
        text: err.message || 'Ocurrió un error al intentar cambiar la contraseña.'
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleToggleSelectAll = () => {
    if (selectedComisionIds.length === comisionesFiltradas.length) {
      setSelectedComisionIds([])
    } else {
      setSelectedComisionIds(comisionesFiltradas.map(c => c.id))
    }
  }

  const handleToggleSelect = (id) => {
    if (selectedComisionIds.includes(id)) {
      setSelectedComisionIds(selectedComisionIds.filter(i => i !== id))
    } else {
      setSelectedComisionIds([...selectedComisionIds, id])
    }
  }

  const handleLiquidarComisiones = async () => {
    if (selectedComisionIds.length === 0) return alert('Selecciona al menos una comisión para pagar')
    
    setIsLiquidating(true)
    try {
      const selectedComms = comisionesPendientes.filter(c => selectedComisionIds.includes(c.id))
      const totalAmount = selectedComms.reduce((sum, c) => sum + Number(c.monto_comision), 0)
      const colabInfo = colaboradores.find(c => c.id === selectedColabId)
      const year = new Date().getFullYear()
      const codigoNum = String(historialLiquidaciones.length + 1).padStart(4, '0')
      const codigoStr = `LIQ-${year}-${codigoNum}`
      const fechaNow = new Date().toISOString()

      let liqId = null

      // Intentar registrar la cabecera en la tabla liquidaciones
      const { data: liqInserted, error: errLiq } = await supabase
        .from('liquidaciones')
        .insert([{
          empresa_id: activeEmpresaId,
          colaborador_id: selectedColabId,
          codigo_liquidacion: codigoStr,
          fecha_liquidacion: fechaNow,
          monto_total: totalAmount,
          medio_pago: medioPago,
          notas: notasLiquidacion || null
        }])
        .select()

      if (!errLiq && liqInserted && liqInserted.length > 0) {
        liqId = liqInserted[0].id
      }

      // Marcar comisiones como liquidadas
      const updatePayload = { estado: 'Liquidada' }
      if (liqId) updatePayload.liquidacion_id = liqId

      const { error: errUpdateComs } = await supabase
        .from('comisiones')
        .update(updatePayload)
        .in('id', selectedComisionIds)

      if (errUpdateComs) throw errUpdateComs

      // Preparar recibo para mostrar e imprimir
      const receiptObj = {
        id: liqId || codigoStr,
        codigo_liquidacion: codigoStr,
        fecha_liquidacion: fechaNow,
        colaborador_nombre: colabInfo?.nombre_completo || 'Colaborador',
        monto_total: totalAmount,
        medio_pago: medioPago,
        notas: notasLiquidacion,
        comisiones: selectedComms
      }

      setSelectedReceipt(receiptObj)
      setNotasLiquidacion('')
      fetchComisionesPendientes()
      fetchHistorialLiquidaciones()

    } catch (err) {
      console.error('Error liquidando comisiones:', err)
      alert('Error al liquidar comisiones')
    } finally {
      setIsLiquidating(false)
    }
  }

  const handleVerReciboHistorial = async (liq) => {
    try {
      // Buscar las comisiones asociadas
      let coms = liq.comisiones || []
      if (!coms.length && liq.id) {
        const { data } = await supabase
          .from('comisiones')
          .select('*')
          .eq('liquidacion_id', liq.id)

        coms = data || []
      }

      setSelectedReceipt({
        id: liq.id,
        codigo_liquidacion: liq.codigo_liquidacion,
        fecha_liquidacion: liq.fecha_liquidacion,
        colaborador_nombre: liq.usuarios?.nombre_completo || 'Colaborador',
        monto_total: liq.monto_total,
        medio_pago: liq.medio_pago,
        notas: liq.notas,
        comisiones: coms
      })
    } catch (err) {
      console.error('Error buscando recibo:', err)
    }
  }

  const totalPendiente = comisionesPendientes.reduce((sum, c) => sum + Number(c.monto_comision), 0)
  const totalSeleccionado = comisionesPendientes
    .filter(c => selectedComisionIds.includes(c.id))
    .reduce((sum, c) => sum + Number(c.monto_comision), 0)

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1 className="page-title">Gestión de Colaboradores</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Administra tu equipo de estilistas y realiza liquidaciones periódicas de comisiones.
          </p>
        </div>
        {activeTab === 'directorio' && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Nuevo Colaborador
          </button>
        )}
      </header>

      {/* Tabs Nav */}
      <div className="demo-tabs" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
        <button 
          className={`demo-tab-btn ${activeTab === 'directorio' ? 'active' : ''}`}
          onClick={() => setActiveTab('directorio')}
          style={{ padding: '0.75rem 1.5rem' }}
        >
          <User size={18} />
          Directorio de Colaboradores
        </button>
        <button 
          className={`demo-tab-btn ${activeTab === 'liquidacion' ? 'active' : ''}`}
          onClick={() => setActiveTab('liquidacion')}
          style={{ padding: '0.75rem 1.5rem' }}
        >
          <DollarSign size={18} />
          Liquidar Comisiones
        </button>
        <button 
          className={`demo-tab-btn ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={() => { setActiveTab('historial'); fetchHistorialLiquidaciones(); }}
          style={{ padding: '0.75rem 1.5rem' }}
        >
          <History size={18} />
          Historial de Liquidaciones
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando información del equipo...</p>
      ) : (
        <>
          {/* TAB DIRECTORIO */}
          {activeTab === 'directorio' && (
            <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem' }}>
              {colaboradores.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                  <UserCheck size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
                  <p>No tienes colaboradores registrados en este salón todavía.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nombre Completo</th>
                        <th>Rol</th>
                        <th>Email de Contacto</th>
                        <th>Teléfono</th>
                        <th>% Comisión Servicios</th>
                        <th>% Comisión Productos</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colaboradores.map(colab => (
                        <tr key={colab.id}>
                          <td>
                            <strong style={{ color: 'var(--text-primary)' }}>{colab.nombre_completo}</strong>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '0.25rem 0.6rem', 
                              borderRadius: '20px', 
                              fontSize: '0.75rem', 
                              fontWeight: 600,
                              background: colab.rol === 'administrador' ? 'rgba(180, 97, 42,0.15)' : 'rgba(255,255,255,0.05)',
                              color: colab.rol === 'administrador' ? 'var(--primary-color)' : 'var(--text-secondary)',
                              border: '1px solid ' + (colab.rol === 'administrador' ? 'rgba(180, 97, 42,0.3)' : 'var(--surface-border)')
                            }}>
                              {colab.rol === 'administrador' ? 'Administrador' : 'Estilista / Colaborador'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{colab.email}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{colab.telefono || '-'}</td>
                          <td>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{colab.comision_servicios || 30}%</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{colab.comision_productos || 10}%</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => setEditingColaborador(colab)}
                              >
                                <Edit size={14} /> Editar
                              </button>
                              {isAdminOrSuper && (
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                  onClick={() => {
                                    setPasswordModalColab(colab)
                                    setNewPasswordVal('')
                                    setConfirmPasswordVal('')
                                    setPasswordMessage(null)
                                    setShowPasswordText(false)
                                  }}
                                  title="Cambiar contraseña de acceso en Supabase"
                                >
                                  <Key size={14} style={{ color: 'var(--primary-color)' }} /> Clave
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
          )}

          {/* TAB LIQUIDACIÓN */}
          {activeTab === 'liquidacion' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Filtro y Balances */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>
                      1. Seleccionar Colaborador para Liquidar:
                    </label>
                    <select 
                      className="input-field"
                      value={selectedColabId}
                      onChange={(e) => setSelectedColabId(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">-- Selecciona un colaborador --</option>
                      {colaboradores.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre_completo}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>
                      2. Filtrar por Periodo de Trabajo:
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { id: 'todos', label: '🗓️ Todos los Pendientes' },
                        { id: 'mes', label: '📅 Este Mes' },
                        { id: 'mes_anterior', label: '⏪ Mes Anterior' },
                        { id: 'quincena', label: '🗓️ Esta Quincena' },
                        { id: 'semana', label: '📅 Esta Semana' }
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          className={`btn ${fechaFiltro === f.id ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => {
                            setFechaFiltro(f.id)
                            setSelectedComisionIds([])
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Acumulado Total</span>
                    <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--danger-color)' }}>
                      $ {totalPendiente.toLocaleString()}
                    </span>
                  </div>
                  <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: '0.25rem', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>A Liquidar Seleccionado</span>
                    <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--success-color)' }}>
                      $ {totalSeleccionado.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Listado y Panel de Pago */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>Detalle de Comisiones Pendientes</h3>
                    {selectedColabId && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => navigate('/ordenes', { state: { openNewComandaPast: true, colaboradorId: selectedColabId } })}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: 'var(--warning-color)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <Plus size={15} /> Cargar Comanda Faltante (Papel)
                      </button>
                    )}
                  </div>

                  {selectedColabId && comisionesFiltradas.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--input-bg)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Medio de Pago:</label>
                      <select 
                        className="input-field" 
                        value={medioPago} 
                        onChange={(e) => setMedioPago(e.target.value)}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', width: 'auto' }}
                      >
                        <option value="efectivo">💵 Efectivo</option>
                        <option value="transferencia">🏦 Transferencia Bancaria</option>
                        <option value="mercadopago">📱 MercadoPago / Digital</option>
                      </select>
                    </div>
                  )}
                </div>

                {!selectedColabId ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2.5rem 0' }}>
                    Por favor selecciona un colaborador arriba para consultar sus comisiones pendientes.
                  </p>
                ) : comisionesFiltradas.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2.5rem 0' }}>
                    🎉 ¡No hay comisiones pendientes registradas para el filtro seleccionado!
                  </p>
                ) : (
                  <>
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                checked={selectedComisionIds.length === comisionesFiltradas.length && comisionesFiltradas.length > 0} 
                                onChange={handleToggleSelectAll}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </th>
                            <th>Fecha</th>
                            <th>Clienta</th>
                            <th>Concepto / Trabajo</th>
                            <th>Monto Cobrado ($ Base)</th>
                            <th>% Comisión</th>
                            <th>$ Comisión Generada</th>
                            <th style={{ textAlign: 'center' }}>Comanda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comisionesFiltradas.map(c => {
                            const isSelected = selectedComisionIds.includes(c.id)
                            const realDate = c.ordenes_trabajo?.fecha_hora || c.created_at
                            const cliObj = c.ordenes_trabajo?.clientes
                            const clienteNombre = cliObj ? `${cliObj.nombre || ''} ${cliObj.apellido || ''}`.trim() : 'Cliente Eventual'
                            return (
                              <tr 
                                key={c.id} 
                                style={{ background: isSelected ? 'rgba(180, 97, 42,0.06)' : 'transparent', cursor: 'pointer' }}
                                onClick={() => handleToggleSelect(c.id)}
                              >
                                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected} 
                                    onChange={() => handleToggleSelect(c.id)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                  {new Date(realDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{clienteNombre}</span>
                                </td>
                                <td>
                                  <strong style={{ color: 'var(--text-primary)' }}>{c.concepto}</strong>
                                </td>
                                <td style={{ color: 'var(--text-secondary)' }}>
                                  $ {Number(c.monto_base || 0).toLocaleString()}
                                </td>
                                <td>
                                  <span style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{c.porcentaje}%</span>
                                </td>
                                <td>
                                  <strong style={{ color: 'var(--success-color)' }}>
                                    $ {Number(c.monto_comision).toLocaleString()}
                                  </strong>
                                </td>
                                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  {c.orden_trabajo_id ? (
                                    <button
                                      type="button"
                                      className="btn"
                                      title="Editar Comanda (ej. marcar Colaborativo o cambiar porcentaje)"
                                      onClick={() => navigate('/ordenes', { state: { editOrdenId: c.orden_trabajo_id } })}
                                      style={{
                                        padding: '0.3rem 0.65rem',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        background: 'rgba(180, 97, 42, 0.12)',
                                        color: 'var(--primary-color)',
                                        border: '1px solid rgba(180, 97, 42, 0.3)',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      <Edit size={13} /> Editar
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer de Acción para Liquidar */}
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="Observaciones o notas de la liquidación (Opcional)" 
                        value={notasLiquidacion}
                        onChange={(e) => setNotasLiquidacion(e.target.value)}
                        style={{ maxWidth: '400px', flex: 1 }}
                      />

                      <button 
                        className="btn btn-primary" 
                        onClick={handleLiquidarComisiones}
                        disabled={isLiquidating || selectedComisionIds.length === 0}
                        style={{ background: 'var(--success-color)', borderColor: 'var(--success-color)', padding: '0.75rem 1.5rem', fontSize: '1rem' }}
                      >
                        <CheckCircle2 size={18} />
                        {isLiquidating ? 'Procesando Liquidación...' : `Pagar y Generar Recibo ($${totalSeleccionado.toLocaleString()})`}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB HISTORIAL DE LIQUIDACIONES */}
          {activeTab === 'historial' && (
            <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1.25rem' }}>
                Historial de Recibos y Liquidaciones de Comisiones
              </h3>

              {historialLiquidaciones.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                  <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p>Aún no se han generado recibos de liquidación en este salón.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código Recibo</th>
                        <th>Fecha y Hora</th>
                        <th>Colaborador</th>
                        <th>Medio de Pago</th>
                        <th>Monto Total Liquidado</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialLiquidaciones.map(l => (
                        <tr key={l.id}>
                          <td>
                            <strong style={{ color: 'var(--primary-color)' }}>{l.codigo_liquidacion}</strong>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            {new Date(l.fecha_liquidacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <strong style={{ color: 'var(--text-primary)' }}>{l.usuarios?.nombre_completo || 'Colaborador'}</strong>
                          </td>
                          <td style={{ textTransform: 'capitalize' }}>
                            <span style={{ background: 'var(--input-bg)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--surface-border)' }}>
                              {l.medio_pago === 'transferencia' ? '🏦 Transferencia' : l.medio_pago === 'mercadopago' ? '📱 MercadoPago' : '💵 Efectivo'}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--success-color)', fontSize: '1.05rem' }}>
                              $ {Number(l.monto_total).toLocaleString()}
                            </strong>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              onClick={() => handleVerReciboHistorial(l)}
                            >
                              <Printer size={14} /> Ver Recibo
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal Agregar Colaborador */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Nuevo Colaborador / Administrador</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddColaborador}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nombre Completo *</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      required 
                      type="text" 
                      placeholder="Ej: Marcos Pérez" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={newColaborador.nombre_completo}
                      onChange={(e) => setNewColaborador({ ...newColaborador, nombre_completo: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Rol de Acceso *</label>
                  <div style={{ position: 'relative' }}>
                    <ShieldCheck size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <select
                      required
                      className="input-field"
                      style={{ paddingLeft: '2.25rem' }}
                      value={newColaborador.rol}
                      onChange={(e) => setNewColaborador({ ...newColaborador, rol: e.target.value })}
                    >
                      <option value="operador">Colaborador / Estilista (Operador)</option>
                      <option value="administrador">Administrador de Empresa</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email (Usuario de Ingreso) *</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      required 
                      type="email" 
                      placeholder="ejemplo@peluqueria.com" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={newColaborador.email}
                      onChange={(e) => setNewColaborador({ ...newColaborador, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contraseña Inicial *</label>
                  <div style={{ position: 'relative' }}>
                    <Key size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      required
                      type="password" 
                      placeholder="Mínimo 8 caracteres" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={newColaborador.password}
                      onChange={(e) => setNewColaborador({ ...newColaborador, password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Teléfono</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="tel" 
                      placeholder="Ej: +54 9 11 1234 5678" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={newColaborador.telefono}
                      onChange={(e) => setNewColaborador({ ...newColaborador, telefono: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>% Comisión Servicios</label>
                    <div style={{ position: 'relative' }}>
                      <Percent size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input 
                        required 
                        type="number" 
                        min="0"
                        max="100"
                        className="input-field" 
                        style={{ paddingLeft: '2.25rem' }}
                        value={newColaborador.comision_servicios}
                        onChange={(e) => setNewColaborador({ ...newColaborador, comision_servicios: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>% Comisión Productos</label>
                    <div style={{ position: 'relative' }}>
                      <Percent size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input 
                        required 
                        type="number" 
                        min="0"
                        max="100"
                        className="input-field" 
                        style={{ paddingLeft: '2.25rem' }}
                        value={newColaborador.comision_productos}
                        onChange={(e) => setNewColaborador({ ...newColaborador, comision_productos: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Colaborador</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Colaborador */}
      {editingColaborador && (
        <div className="modal-overlay" onClick={() => setEditingColaborador(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Editar Perfil y Comisiones</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setEditingColaborador(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateColaborador}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nombre Completo *</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      required 
                      type="text" 
                      placeholder="Ej: Marcos Pérez" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={editingColaborador.nombre_completo}
                      onChange={(e) => setEditingColaborador({ ...editingColaborador, nombre_completo: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Rol *</label>
                  <div style={{ position: 'relative' }}>
                    <ShieldCheck size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <select
                      required
                      className="input-field"
                      style={{ paddingLeft: '2.25rem' }}
                      value={editingColaborador.rol === 'administrador' ? 'administrador' : 'operador'}
                      onChange={(e) => setEditingColaborador({ ...editingColaborador, rol: e.target.value })}
                    >
                      <option value="operador">Colaborador (Operador)</option>
                      <option value="administrador">Administrador</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email (No Editable)</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', opacity: 0.5 }} />
                    <input 
                      disabled
                      type="email" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem', opacity: 0.6, cursor: 'not-allowed' }}
                      value={editingColaborador.email}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Teléfono</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="tel" 
                      placeholder="Ej: +54 9 11 1234 5678" 
                      className="input-field" 
                      style={{ paddingLeft: '2.25rem' }}
                      value={editingColaborador.telefono || ''}
                      onChange={(e) => setEditingColaborador({ ...editingColaborador, telefono: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>% Comisión Servicios</label>
                    <div style={{ position: 'relative' }}>
                      <Percent size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input 
                        required 
                        type="number" 
                        min="0"
                        max="100"
                        className="input-field" 
                        style={{ paddingLeft: '2.25rem' }}
                        value={editingColaborador.comision_servicios}
                        onChange={(e) => setEditingColaborador({ ...editingColaborador, comision_servicios: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>% Comisión Productos</label>
                    <div style={{ position: 'relative' }}>
                      <Percent size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                      <input 
                        required 
                        type="number" 
                        min="0"
                        max="100"
                        className="input-field" 
                        style={{ paddingLeft: '2.25rem' }}
                        value={editingColaborador.comision_productos}
                        onChange={(e) => setEditingColaborador({ ...editingColaborador, comision_productos: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem', marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingColaborador(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impresion Recibo de Liquidación */}
      {selectedReceipt && (
        <div className="modal-overlay no-print" onClick={() => setSelectedReceipt(null)}>
          <div className="modal-content printable-receipt" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', background: '#ffffff', color: '#0B1F1A' }}>
            
            <div className="modal-header no-print" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
              <h2 style={{ color: '#0B1F1A', fontSize: '1.25rem' }}>Recibo de Liquidación de Comisiones</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent', color: '#64748b' }} onClick={() => setSelectedReceipt(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '1.5rem 0' }}>
              {/* Encabezado del Recibo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #0B1F1A', pb: '1rem', paddingBottom: '1rem' }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0B1F1A', margin: 0, textTransform: 'uppercase' }}>
                    {empresaInfo?.nombre || 'PELUQUERÍA & SALÓN'}
                  </h1>
                  {empresaInfo?.rut_cuit && (
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
                      CUIT / RUT: {empresaInfo.rut_cuit}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#B4612A', display: 'block' }}>
                    {selectedReceipt.codigo_liquidacion}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {new Date(selectedReceipt.fecha_liquidacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Datos de la Liquidación */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>Colaborador / Estilista:</span>
                  <strong style={{ fontSize: '1.1rem', color: '#0B1F1A' }}>{selectedReceipt.colaborador_nombre}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>Medio de Pago:</span>
                  <strong style={{ fontSize: '1rem', color: '#0B1F1A', textTransform: 'capitalize' }}>
                    {selectedReceipt.medio_pago === 'transferencia' ? '🏦 Transferencia Bancaria' : selectedReceipt.medio_pago === 'mercadopago' ? '📱 MercadoPago' : '💵 Efectivo'}
                  </strong>
                </div>
              </div>

              {/* Tabla de Trabajos / Comandas incluidas */}
              <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem' }}>
                Detalle de Servicios y Comisiones Incluidas
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textTransform: 'uppercase', fontSize: '0.75rem', color: '#475569' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>Fecha</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>Concepto</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #cbd5e1' }}>$ Base</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid #cbd5e1' }}>% Com.</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #cbd5e1' }}>$ Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceipt.comisiones || []).map((c, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.5rem', color: '#64748b' }}>
                        {new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                      </td>
                      <td style={{ padding: '0.5rem', fontWeight: '500', color: '#0B1F1A' }}>{c.concepto}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#64748b' }}>$ {Number(c.monto_base || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', color: '#B4612A', fontWeight: 'bold' }}>{c.porcentaje}%</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                        $ {Number(c.monto_comision).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total y Firma */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '8px', border: '2px solid #0B1F1A' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0B1F1A' }}>TOTAL ABONADO / LIQUIDADO:</span>
                <span style={{ fontSize: '1.75rem', fontWeight: '900', color: '#16a34a' }}>
                  $ {Number(selectedReceipt.monto_total).toLocaleString()}
                </span>
              </div>

              {selectedReceipt.notas && (
                <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  Nota: {selectedReceipt.notas}
                </div>
              )}

              {/* Firmas en Recibo Impreso */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginTop: '3.5rem', textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                  Firma Empresa / Emisor
                </div>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '0.5rem', fontSize: '0.8rem', color: '#475569' }}>
                  Firma Colaborador (Conforme)
                </div>
              </div>
            </div>

            <div className="modal-footer no-print" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedReceipt(null)}>Cerrar</button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => window.print()}
                style={{ background: '#B4612A', borderColor: '#B4612A' }}
              >
                <Printer size={16} /> Imprimir Recibo
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL CAMBIAR CONTRASEÑA */}
      {passwordModalColab && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content glass-panel animate-scale-up" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ 
                  background: 'rgba(180, 97, 42, 0.15)', 
                  padding: '0.5rem', 
                  borderRadius: '10px', 
                  color: 'var(--primary-color)',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <Key size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Cambiar Contraseña</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Actualizar credenciales de acceso en Supabase Auth
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setPasswordModalColab(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Info del usuario objetivo */}
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.03)', 
              border: '1px solid var(--surface-border)', 
              borderRadius: '8px', 
              padding: '0.85rem 1rem', 
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {passwordModalColab.nombre_completo}
                </strong>
                <span style={{ 
                  fontSize: '0.75rem', 
                  padding: '0.2rem 0.5rem', 
                  borderRadius: '12px', 
                  background: passwordModalColab.rol === 'administrador' ? 'rgba(180, 97, 42,0.2)' : 'rgba(255,255,255,0.08)',
                  color: passwordModalColab.rol === 'administrador' ? 'var(--primary-color)' : 'var(--text-secondary)'
                }}>
                  {passwordModalColab.rol === 'administrador' ? 'Administrador' : 'Colaborador'}
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mail size={13} /> {passwordModalColab.email}
              </span>
            </div>

            {/* Mensajes de éxito / error */}
            {passwordMessage && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                background: passwordMessage.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: passwordMessage.type === 'success' ? '#4ade80' : '#f87171',
                border: `1px solid ${passwordMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {passwordMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSavePassword}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Nueva Contraseña
                  </label>
                  <button 
                    type="button" 
                    onClick={handleGeneratePassword}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--primary-color)', 
                      fontSize: '0.8rem', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: 0
                    }}
                  >
                    <RefreshCw size={12} /> Sugerir segura
                  </button>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showPasswordText ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mínimo 8 caracteres..."
                    value={newPasswordVal}
                    onChange={(e) => setNewPasswordVal(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', margin: 0, paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '0.2rem'
                    }}
                  >
                    {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '0.35rem' }}>
                  Confirmar Contraseña
                </label>
                <input 
                  type={showPasswordText ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Repite la nueva contraseña..."
                  value={confirmPasswordVal}
                  onChange={(e) => setConfirmPasswordVal(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', margin: 0 }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setPasswordModalColab(null)}
                  disabled={isUpdatingPassword}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isUpdatingPassword}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Lock size={15} />
                  {isUpdatingPassword ? 'Actualizando en Auth...' : 'Guardar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
