import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Edit2, Trash2, Scissors, Layers, CheckCircle, XCircle, Clock } from 'lucide-react'
import { esOperador } from '../lib/roles'

export default function Servicios() {
  const { userProfile, activeEmpresaId } = useAuth()
  const [servicios, setServicios] = useState([])
  const [articulosDb, setArticulosDb] = useState([])
  const [aprobaciones, setAprobaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Recipe Modal States
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [selectedServicio, setSelectedServicio] = useState(null)
  const [recipeInsumos, setRecipeInsumos] = useState([])
  const [savingRecipe, setSavingRecipe] = useState(false)

  const [formData, setFormData] = useState({
    id: null,
    nombre: '',
    costo_estimado: '',
    precio: '',
    tiempo_aprox_minutos: 30
  })

  const rawRol = (userProfile?.rol || '').toLowerCase().trim()
  const isOperator = esOperador(userProfile)

  useEffect(() => {
    if (activeEmpresaId) {
      fetchData()
    }
  }, [activeEmpresaId])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch servicios
      const { data, error } = await supabase
        .from('servicios')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .order('nombre')
      
      if (error) throw error
      setServicios(data || [])

      // Fetch articles (materials) for the recipe selector
      const { data: artData } = await supabase
        .from('articulos')
        .select('id, nombre, envase_contenedor')
        .eq('empresa_id', activeEmpresaId)
        .order('nombre')
      setArticulosDb(artData || [])

      // Fetch pending approvals from empresas.configuracion
      const { data: empData } = await supabase
        .from('empresas')
        .select('configuracion')
        .eq('id', activeEmpresaId)
        .single()
      const allPending = empData?.configuracion?.aprobaciones_pendientes || []
      setAprobaciones(allPending)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveAprobacionesToDb = async (newList) => {
    const { data: empData } = await supabase
      .from('empresas')
      .select('configuracion')
      .eq('id', activeEmpresaId)
      .single()
    const currentConfig = empData?.configuracion || {}
    const updatedConfig = {
      ...currentConfig,
      aprobaciones_pendientes: newList
    }
    const { error } = await supabase
      .from('empresas')
      .update({ configuracion: updatedConfig })
      .eq('id', activeEmpresaId)
    if (error) throw error
    setAprobaciones(newList)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const openModal = (servicio = null) => {
    if (servicio) {
      setFormData({ ...servicio })
    } else {
      setFormData({
        id: null,
        nombre: '',
        costo_estimado: '',
        precio: '',
        tiempo_aprox_minutos: 30
      })
    }
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activeEmpresaId) return alert("Error: No hay salón activo")
    setIsSubmitting(true)

    try {
      const dataToSave = {
        empresa_id: activeEmpresaId,
        nombre: formData.nombre,
        costo_estimado: formData.costo_estimado || 0,
        precio: formData.precio || 0,
        tiempo_aprox_minutos: formData.tiempo_aprox_minutos || 30
      }

      if (formData.id) {
        const original = servicios.find(s => s.id === formData.id)
        if (isOperator) {
          // El operador no puede sobreescribir directamente un precio establecido
          if (original && Number(formData.precio) !== Number(original.precio)) {
            const nuevaSolicitud = {
              id: `srv_precio_${Date.now()}`,
              tipo: 'cambio_precio_servicio',
              item_id: formData.id,
              nombre: original.nombre,
              precio_anterior: Number(original.precio || 0),
              precio_nuevo: Number(formData.precio || 0),
              usuario: userProfile?.nombre_completo || 'Operador',
              fecha: new Date().toISOString()
            }
            const filtradas = aprobaciones.filter(a => !(a.tipo === 'cambio_precio_servicio' && a.item_id === formData.id))
            await saveAprobacionesToDb([...filtradas, nuevaSolicitud])
            alert('Solicitud enviada: el nuevo precio propuesto quedó pendiente de aprobación por administración. El precio establecido no se modificará hasta ser autorizado.')
          } else {
            alert('Los servicios ya establecidos solo pueden modificarse con autorización de administración.')
          }
        } else {
          const { error } = await supabase
            .from('servicios')
            .update(dataToSave)
            .eq('id', formData.id)
          if (error) throw error
        }
      } else {
        const { data: createdList, error } = await supabase
          .from('servicios')
          .insert([dataToSave])
          .select()
        if (error) throw error

        const created = createdList?.[0]
        if (isOperator && created) {
          const nuevaSolicitud = {
            id: `srv_nuevo_${Date.now()}`,
            tipo: 'nuevo_servicio',
            item_id: created.id,
            nombre: created.nombre,
            precio_anterior: 0,
            precio_nuevo: Number(created.precio || 0),
            usuario: userProfile?.nombre_completo || 'Operador',
            fecha: new Date().toISOString()
          }
          await saveAprobacionesToDb([...aprobaciones, nuevaSolicitud])
          alert('Servicio agregado correctamente. El precio cargado quedó sujeto a aprobación de administración.')
        }
      }

      setShowModal(false)
      fetchData()
    } catch (error) {
      console.error('Error saving service:', error)
      alert('Error al guardar el servicio.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAprobarSolicitud = async (req) => {
    try {
      if (req.tipo === 'cambio_precio_servicio') {
        const { error } = await supabase
          .from('servicios')
          .update({ precio: Number(req.precio_nuevo || 0) })
          .eq('id', req.item_id)
        if (error) throw error
      }
      const restantes = aprobaciones.filter(a => a.id !== req.id)
      await saveAprobacionesToDb(restantes)
      fetchData()
    } catch (err) {
      console.error('Error al aprobar solicitud:', err)
      alert('No se pudo aprobar la solicitud.')
    }
  }

  const handleRechazarSolicitud = async (req) => {
    try {
      if (req.tipo === 'nuevo_servicio') {
        if (window.confirm(`¿Deseás eliminar también el servicio nuevo "${req.nombre}" o solo descartar el aviso de revisión? (Aceptar = Eliminar servicio / Cancelar = Solo quitar aviso)`)) {
          await supabase.from('servicios').delete().eq('id', req.item_id)
        }
      }
      const restantes = aprobaciones.filter(a => a.id !== req.id)
      await saveAprobacionesToDb(restantes)
      fetchData()
    } catch (err) {
      console.error('Error al rechazar solicitud:', err)
      alert('No se pudo procesar la acción.')
    }
  }

  const handleDelete = async (id) => {
    if (isOperator) return alert('No tenés permisos para eliminar servicios.')
    if (!window.confirm('¿Estás seguro de que deseas eliminar este servicio?')) return
    
    try {
      const { error } = await supabase
        .from('servicios')
        .delete()
        .eq('id', id)
      if (error) throw error
      fetchData()
    } catch (error) {
      console.error('Error deleting service:', error)
      alert('Error al eliminar el servicio. Puede estar en uso.')
    }
  }

  // --- Recipe Management ---
  const openRecipeModal = async (servicio) => {
    setSelectedServicio(servicio)
    setRecipeInsumos([])
    setShowRecipeModal(true)
    
    try {
      const { data, error } = await supabase
        .from('servicio_insumos')
        .select('*')
        .eq('servicio_id', servicio.id)
      
      if (error) throw error
      if (data) {
        setRecipeInsumos(data.map(item => ({
          id_temp: item.id,
          articulo_id: item.articulo_id,
          cantidad_defecto: item.cantidad_defecto
        })))
      }
    } catch (error) {
      console.error('Error fetching recipe:', error)
    }
  }

  const agregarInsumoFila = () => {
    setRecipeInsumos([
      ...recipeInsumos,
      { id_temp: Date.now(), articulo_id: '', cantidad_defecto: 1 }
    ])
  }

  const removerInsumoFila = (id_temp) => {
    setRecipeInsumos(recipeInsumos.filter(item => item.id_temp !== id_temp))
  }

  const actualizarInsumoFila = (id_temp, campo, valor) => {
    setRecipeInsumos(recipeInsumos.map(item => {
      if (item.id_temp === id_temp) {
        return { ...item, [campo]: valor }
      }
      return item
    }))
  }

  const handleSaveRecipe = async () => {
    if (!selectedServicio) return
    if (recipeInsumos.some(item => !item.articulo_id)) {
      return alert('Por favor, selecciona un artículo para todas las filas o elimina las vacías.')
    }

    setSavingRecipe(true)
    try {
      // 1. Delete existing recipe entries
      const { error: deleteError } = await supabase
        .from('servicio_insumos')
        .delete()
        .eq('servicio_id', selectedServicio.id)
      
      if (deleteError) throw deleteError

      // 2. Insert new entries if any
      if (recipeInsumos.length > 0) {
        const insertData = recipeInsumos.map(item => ({
          servicio_id: selectedServicio.id,
          articulo_id: item.articulo_id,
          cantidad_defecto: Number(item.cantidad_defecto)
        }))

        const { error: insertError } = await supabase
          .from('servicio_insumos')
          .insert(insertData)
        
        if (insertError) throw insertError
      }

      alert('Receta guardada con éxito.')
      setShowRecipeModal(false)
    } catch (error) {
      console.error('Error saving recipe:', error)
      alert('Error al guardar la receta. Revisa que el script SQL esté corriendo en Supabase.')
    } finally {
      setSavingRecipe(false)
    }
  }

  const solicitudesServicios = aprobaciones.filter(a => a.tipo === 'nuevo_servicio' || a.tipo === 'cambio_precio_servicio')

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title"><Scissors style={{ marginRight: '0.5rem', display: 'inline' }} /> Servicios</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={18} /> Nuevo Servicio
        </button>
      </header>

      {!isOperator && solicitudesServicios.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.06)' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} /> Solicitudes de Precios y Servicios Pendientes de Aprobación ({solicitudesServicios.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {solicitudesServicios.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(11, 31, 26, 0.65)', border: '1px solid var(--surface-border)' }}>
                <div>
                  <span className="badge badge-warning" style={{ marginRight: '0.6rem' }}>
                    {req.tipo === 'nuevo_servicio' ? 'NUEVO SERVICIO' : 'CAMBIO DE PRECIO'}
                  </span>
                  <strong>{req.nombre}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '0.6rem' }}>
                    {req.tipo === 'nuevo_servicio'
                      ? `Precio cargado: $${Number(req.precio_nuevo).toLocaleString()}`
                      : `Precio actual: $${Number(req.precio_anterior).toLocaleString()} → Nuevo propuesto: $${Number(req.precio_nuevo).toLocaleString()}`}
                    {' · '}Cargado por {req.usuario}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', background: 'var(--success-color)' }} onClick={() => handleAprobarSolicitud(req)}>
                    <CheckCircle size={15} /> Aprobar Precio
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', color: 'var(--danger-color)' }} onClick={() => handleRechazarSolicitud(req)}>
                    <XCircle size={15} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando servicios...</p>
      ) : (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          {servicios.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No hay servicios registrados.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tiempo Aprox. (min)</th>
                    {!isOperator && <th>Costo Estimado</th>}
                    <th>Precio</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map(servicio => {
                    const reqPendiente = solicitudesServicios.find(a => a.item_id === servicio.id)
                    return (
                      <tr key={servicio.id}>
                        <td><strong>{servicio.nombre}</strong></td>
                        <td>{servicio.tiempo_aprox_minutos} min</td>
                        {!isOperator && <td>$ {Number(servicio.costo_estimado).toLocaleString()}</td>}
                        <td style={{ fontWeight: 'bold' }}>
                          $ {Number(servicio.precio).toLocaleString()}
                          {reqPendiente && (
                            <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                              {reqPendiente.tipo === 'nuevo_servicio'
                                ? 'Precio sujeto a aprobación'
                                : `Propuesto: $${Number(reqPendiente.precio_nuevo).toLocaleString()} (Pendiente)`}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            {!isOperator && (
                              <button className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--primary-color)' }} title="Configurar Fórmula de Insumos" onClick={() => openRecipeModal(servicio)}>
                                <Layers size={16} />
                              </button>
                            )}
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.5rem' }}
                              title={isOperator ? 'Solicitar cambio de precio (sujeto a aprobación)' : 'Editar servicio'}
                              onClick={() => openModal(servicio)}
                            >
                              <Edit2 size={16} />
                            </button>
                            {!isOperator && (
                              <button className="btn btn-secondary" style={{ padding: '0.5rem', color: 'var(--danger-color)' }} onClick={() => handleDelete(servicio.id)}>
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Portal Modal */}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{formData.id ? (isOperator ? 'Proponer Cambio de Precio' : 'Editar Servicio') : 'Nuevo Servicio'}</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              {isOperator && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '0.85rem', color: '#fbbf24' }}>
                  {formData.id
                    ? 'Nota: El precio actual ya establecido no se modificará hasta que administración apruebe el nuevo valor propuesto.'
                    : 'Nota: Podés dar de alta el nuevo servicio con su precio; quedará marcado para revisión de administración.'}
                </div>
              )}
              <form id="servicio-form" onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>Nombre *</label>
                  <input required type="text" className="input-field" name="nombre" value={formData.nombre} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: isOperator ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                  {!isOperator && (
                    <div className="input-group">
                      <label>Costo Estimado ($)</label>
                      <input type="number" step="0.01" min="0" className="input-field" name="costo_estimado" value={formData.costo_estimado} onChange={handleInputChange} />
                    </div>
                  )}
                  <div className="input-group">
                    <label>{isOperator && formData.id ? 'Nuevo Precio Propuesto ($) *' : 'Precio Venta ($) *'}</label>
                    <input required type="number" step="0.01" min="0" className="input-field" name="precio" value={formData.precio} onChange={handleInputChange} />
                  </div>
                </div>

                <div className="input-group">
                  <label>Tiempo Aproximado (minutos)</label>
                  <input type="number" min="1" className="input-field" name="tiempo_aprox_minutos" value={formData.tiempo_aprox_minutos} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancelar</button>
              <button type="submit" form="servicio-form" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : (isOperator && formData.id ? 'Enviar para Aprobación' : 'Guardar Servicio')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Recipe (Fórmulas) Modal */}
      {showRecipeModal && selectedServicio && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0 }}>Fórmula de Insumos</h2>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Define las materias primas consumidas por defecto para: <strong>{selectedServicio.nombre}</strong>
                </p>
              </div>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowRecipeModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Artículos / Productos recomendados</h3>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={agregarInsumoFila}>
                  + Añadir Artículo
                </button>
              </div>

              {recipeInsumos.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                  No hay insumos configurados para este servicio. Se creará sin materias primas por defecto.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {recipeInsumos.map((item) => (
                    <div key={item.id_temp} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <div style={{ flex: 2 }}>
                        <select 
                          className="input-field" 
                          style={{ margin: 0 }}
                          value={item.articulo_id} 
                          onChange={(e) => actualizarInsumoFila(item.id_temp, 'articulo_id', e.target.value)}
                        >
                          <option value="">Seleccionar producto de stock...</option>
                          {articulosDb.map(art => (
                            <option key={art.id} value={art.id}>
                              {art.nombre} {art.envase_contenedor ? `(${art.envase_contenedor})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: '100px' }}>
                        <input 
                          type="number" 
                          className="input-field" 
                          style={{ margin: 0 }}
                          step="0.01" 
                          min="0.01" 
                          placeholder="Cantidad"
                          value={item.cantidad_defecto}
                          onChange={(e) => actualizarInsumoFila(item.id_temp, 'cantidad_defecto', e.target.value)}
                        />
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.6rem', color: 'var(--danger-color)' }}
                        onClick={() => removerInsumoFila(item.id_temp)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowRecipeModal(false)} disabled={savingRecipe}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveRecipe} disabled={savingRecipe}>
                {savingRecipe ? 'Guardando...' : 'Guardar Receta'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
