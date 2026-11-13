import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Clock, Calendar, CheckCircle2, LogIn, LogOut, Search, UserCheck } from 'lucide-react'

export default function Asistencias() {
  const { user, userProfile, activeEmpresaId } = useAuth()
  const [liveTime, setLiveTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getLocalTodayStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Admin section states
  const [asistenciasHistory, setAsistenciasHistory] = useState([])
  const [selectedDate, setSelectedDate] = useState(getLocalTodayStr)
  const [adminLoading, setAdminLoading] = useState(false)

  const userRole = userProfile?.rol?.toLowerCase()
  const isOperator = userRole === 'operador'
  const isAdminOrSuper = userRole === 'administrador' || userRole === 'super_admin'

  // Live clock hook
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch today's clock in record for the current collaborator
  const fetchTodayRecord = async () => {
    if (!user || !activeEmpresaId) return
    try {
      setLoading(true)
      const todayDate = getLocalTodayStr()
      const { data, error } = await supabase
        .from('asistencias')
        .select('*')
        .eq('colaborador_id', user.id)
        .eq('fecha', todayDate)
        .maybeSingle()

      if (error) console.error('Error fetching today record:', error)
      setTodayRecord(data || null)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch history for admins
  const fetchAsistenciasHistory = async () => {
    if (!activeEmpresaId || !isAdminOrSuper) return
    try {
      setAdminLoading(true)
      const { data, error } = await supabase
        .from('asistencias')
        .select(`
          id, fecha, entrada, salida,
          usuarios (id, nombre_completo, rol)
        `)
        .eq('empresa_id', activeEmpresaId)
        .eq('fecha', selectedDate)
        .order('entrada', { ascending: true })

      if (error) throw error
      setAsistenciasHistory(data || [])
    } catch (err) {
      console.error('Error fetching history:', err)
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    fetchTodayRecord()
  }, [user, activeEmpresaId])

  useEffect(() => {
    if (isAdminOrSuper) {
      fetchAsistenciasHistory()
    }
  }, [activeEmpresaId, selectedDate])

  const handleClockIn = async () => {
    if (!user || !activeEmpresaId) return
    setIsSubmitting(true)
    try {
      const todayDate = getLocalTodayStr()
      const { error } = await supabase
        .from('asistencias')
        .insert([{
          empresa_id: activeEmpresaId,
          colaborador_id: user.id,
          fecha: todayDate,
          entrada: new Date().toISOString()
        }])

      if (error) throw error
      await fetchTodayRecord()
      if (isAdminOrSuper) fetchAsistenciasHistory()
    } catch (err) {
      console.error('Error clocking in:', err)
      alert('Error al registrar entrada: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClockOut = async () => {
    if (!todayRecord) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('asistencias')
        .update({ salida: new Date().toISOString() })
        .eq('id', todayRecord.id)

      if (error) throw error
      await fetchTodayRecord()
      if (isAdminOrSuper) fetchAsistenciasHistory()
    } catch (err) {
      console.error('Error clocking out:', err)
      alert('Error al registrar salida: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const calculateHours = (ent, sal) => {
    if (!ent || !sal) return '-'
    const diffMs = new Date(sal) - new Date(ent)
    const diffHrs = diffMs / (1000 * 60 * 60)
    return diffHrs.toFixed(2) + ' hs'
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header className="page-header">
        <h1 className="page-title">Planilla de Asistencias</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isAdminOrSuper ? '1fr 1.2fr' : '1fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* PANEL DE CONTROL DEL USUARIO (MARCAJE) */}
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              background: 'rgba(180, 97, 42, 0.1)',
              padding: '1.25rem',
              borderRadius: '50%',
              display: 'inline-flex',
              marginBottom: '1rem',
              border: '1px solid rgba(180, 97, 42, 0.2)'
            }}>
              <Clock size={40} style={{ color: 'var(--primary-color)' }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>
              {liveTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem', textTransform: 'capitalize' }}>
              {liveTime.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div style={{ width: '100%', height: '1px', background: 'var(--surface-border)' }}></div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Cargando estado...</p>
          ) : (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* ESTADO ACTUAL BADGE */}
              <div style={{
                background: todayRecord?.salida 
                  ? 'rgba(239, 68, 68, 0.08)' 
                  : todayRecord?.entrada 
                    ? 'rgba(34, 197, 94, 0.08)' 
                    : 'rgba(255, 255, 255, 0.03)',
                border: todayRecord?.salida 
                  ? '1px solid rgba(239, 68, 68, 0.15)' 
                  : todayRecord?.entrada 
                    ? '1px solid rgba(34, 197, 94, 0.15)' 
                    : '1px solid rgba(255, 255, 255, 0.05)',
                padding: '1rem',
                borderRadius: '12px',
                textAlign: 'left'
              }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  Estado de Asistencia Hoy
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {todayRecord?.salida ? (
                    <>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--danger-color)' }}></span>
                      <span style={{ fontWeight: '600' }}>Jornada Finalizada</span>
                    </>
                  ) : todayRecord?.entrada ? (
                    <>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success-color)' }}></span>
                      <span style={{ fontWeight: '600', color: 'var(--success-color)' }}>Trabajando Activamente</span>
                    </>
                  ) : (
                    <>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--text-secondary)' }}></span>
                      <span style={{ fontWeight: '600' }}>Sin Registrar Ingreso</span>
                    </>
                  )}
                </div>

                {todayRecord && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Entrada registrada:</span>
                      <span style={{ fontWeight: '500' }}>{new Date(todayRecord.entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs</span>
                    </div>
                    {todayRecord.salida && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Salida registrada:</span>
                        <span style={{ fontWeight: '500' }}>{new Date(todayRecord.salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ACCIÓN (BOTÓN PRINCIPAL) */}
              {!todayRecord ? (
                <button 
                  className="btn btn-primary" 
                  style={{ 
                    padding: '1.25rem', 
                    fontSize: '1.05rem', 
                    fontWeight: 'bold', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.75rem',
                    width: '100%',
                    background: 'linear-gradient(135deg, var(--primary-color), #E39461)',
                    boxShadow: '0 4px 15px rgba(180, 97, 42, 0.3)',
                    border: 'none'
                  }} 
                  onClick={handleClockIn}
                  disabled={isSubmitting}
                >
                  <LogIn size={20} />
                  {isSubmitting ? 'Registrando...' : 'Marcar Entrada de Trabajo'}
                </button>
              ) : !todayRecord.salida ? (
                <button 
                  className="btn btn-secondary" 
                  style={{ 
                    padding: '1.25rem', 
                    fontSize: '1.05rem', 
                    fontWeight: 'bold', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.75rem',
                    width: '100%',
                    borderColor: 'var(--danger-color)',
                    color: 'var(--danger-color)',
                    background: 'rgba(239, 68, 68, 0.05)',
                  }} 
                  onClick={handleClockOut}
                  disabled={isSubmitting}
                >
                  <LogOut size={20} />
                  {isSubmitting ? 'Registrando...' : 'Marcar Salida de Trabajo'}
                </button>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem', 
                  color: 'var(--success-color)', 
                  fontWeight: '600', 
                  padding: '1.25rem',
                  background: 'rgba(34, 197, 94, 0.05)',
                  borderRadius: '12px',
                  border: '1px dashed rgba(34, 197, 94, 0.2)'
                }}>
                  <CheckCircle2 size={20} />
                  ¡Has completado tu turno de hoy!
                </div>
              )}

            </div>
          )}
        </div>

        {/* HISTORIAL GENERAL DE ASISTENCIAS (VISTA ADMINISTRADOR) */}
        {isAdminOrSuper && (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserCheck size={20} style={{ color: 'var(--primary-color)' }} />
                  Control de Personal
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Monitorea las horas y registros de los operadores
                </p>
              </div>

              {/* Selector de fecha */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
                <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={(e) => setSelectedDate(e.target.value)} 
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
              </div>
            </div>

            {adminLoading ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Cargando planilla...</p>
            ) : asistenciasHistory.length === 0 ? (
              <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Search size={24} style={{ opacity: 0.5 }} />
                <p style={{ margin: 0 }}>No hay asistencias registradas para esta fecha.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th>Rol</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Total Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asistenciasHistory.map(asist => (
                      <tr key={asist.id}>
                        <td style={{ fontWeight: '500' }}>{asist.usuarios?.nombre_completo}</td>
                        <td>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                            {asist.usuarios?.rol?.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--success-color)', fontWeight: '500' }}>
                            {new Date(asist.entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                          </span>
                        </td>
                        <td>
                          {asist.salida ? (
                            <span style={{ color: 'var(--danger-color)', fontWeight: '500' }}>
                              {new Date(asist.salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                            </span>
                          ) : (
                            <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem', fontStyle: 'italic' }}>Activo...</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>
                          {calculateHours(asist.entrada, asist.salida)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
