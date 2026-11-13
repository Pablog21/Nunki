import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Edit2, Trash2, Package, ArrowUpCircle, ArrowDownCircle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { esOperador } from '../lib/roles'

export default function Articulos() {
  const { userProfile, activeEmpresaId } = useAuth()
  const [articulos, setArticulos] = useState([])
  const [aprobaciones, setAprobaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Modal de Ingreso / Baja de Stock
  const [stockModal, setStockModal] = useState({
    open: false,
    modo: 'ingreso', // 'ingreso' | 'baja'
    articulo: null,
    cantidad: '',
    motivo: ''
  })
  
  const [formData, setFormData] = useState({
    id: null,
    nombre: '',
    descripcion: '',
    envase_contenedor: '',
    precio_costo: '',
    precio_venta: '',
    stock_inicial: '',
    marca: '',
    clasificador_1: '',
    clasificador_2: '',
    clasificador_3: ''
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

      const { data, error } = await supabase
        .from('articulos')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .order('nombre')
      
      if (error) throw error
      setArticulos(data || [])

      const { data: empData } = await supabase
        .from('empresas')
        .select('configuracion')
        .eq('id', activeEmpresaId)
        .single()
      setAprobaciones(empData?.configuracion?.aprobaciones_pendientes || [])
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

  const openModal = (articulo = null) => {
    if (articulo) {
      setFormData({ ...articulo, stock_inicial: '' })
    } else {
      setFormData({
        id: null,
        nombre: '',
        descripcion: '',
        envase_contenedor: '',
        precio_costo: '',
        precio_venta: '',
        stock_inicial: '',
        marca: '',
        clasificador_1: '',
        clasificador_2: '',
        clasificador_3: ''
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
        descripcion: formData.descripcion,
        envase_contenedor: formData.envase_contenedor,
        precio_costo: formData.precio_costo || 0,
        precio_venta: formData.precio_venta || 0,
        marca: formData.marca,
        clasificador_1: formData.clasificador_1,
        clasificador_2: formData.clasificador_2,
        clasificador_3: formData.clasificador_3
      }

      if (formData.id) {
        const original = articulos.find(a => a.id === formData.id)
        if (isOperator) {
          if (original && Number(formData.precio_venta) !== Number(original.precio_venta)) {
            const nuevaSolicitud = {
              id: `art_precio_${Date.now()}`,
              tipo: 'cambio_precio_articulo',
              item_id: formData.id,
              nombre: original.nombre,
              precio_anterior: Number(original.precio_venta || 0),
              precio_nuevo: Number(formData.precio_venta || 0),
              usuario: userProfile?.nombre_completo || 'Operador',
              fecha: new Date().toISOString()
            }
            const filtradas = aprobaciones.filter(a => !(a.tipo === 'cambio_precio_articulo' && a.item_id === formData.id))
            await saveAprobacionesToDb([...filtradas, nuevaSolicitud])
            alert('Solicitud enviada: el nuevo precio propuesto quedó sujeto a aprobación de administración.')
          } else {
            alert('Los precios ya establecidos requieren aprobación de administración para modificarse.')
          }
        } else {
          const { error } = await supabase
            .from('articulos')
            .update(dataToSave)
            .eq('id', formData.id)
          if (error) throw error
        }
      } else {
        const stockInicialNum = Number(formData.stock_inicial || 0)
        const insertPayload = {
          ...dataToSave,
          stock_actual: stockInicialNum > 0 ? stockInicialNum : 0
        }
        const { data: createdList, error } = await supabase
          .from('articulos')
          .insert([insertPayload])
          .select()
        if (error) throw error

        const created = createdList?.[0]
        if (created && stockInicialNum > 0) {
          try {
            await supabase.from('movimientos_stock').insert([{
              empresa_id: activeEmpresaId,
              articulo_id: created.id,
              tipo_movimiento: 'ingreso_inicial',
              cantidad: stockInicialNum,
              motivo: 'Stock inicial al crear artículo',
              usuario_id: userProfile?.id || null
            }])
          } catch (eMov) {
            console.warn('No se pudo registrar movimiento inicial:', eMov)
          }
        }

        if (isOperator && created) {
          const nuevaSolicitud = {
            id: `art_nuevo_${Date.now()}`,
            tipo: 'nuevo_articulo',
            item_id: created.id,
            nombre: created.nombre,
            precio_anterior: 0,
            precio_nuevo: Number(created.precio_venta || 0),
            usuario: userProfile?.nombre_completo || 'Operador',
            fecha: new Date().toISOString()
          }
          await saveAprobacionesToDb([...aprobaciones, nuevaSolicitud])
          alert('Producto agregado correctamente. El precio cargado quedó sujeto a aprobación de administración.')
        }
      }

      setShowModal(false)
      fetchData()
    } catch (error) {
      console.error('Error saving article:', error)
      alert('Error al guardar el artículo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStockActionModal = (articulo, modo) => {
    setStockModal({
      open: true,
      modo,
      articulo,
      cantidad: '',
      motivo: modo === 'ingreso' ? 'Ingreso de mercadería' : ''
    })
  }

  const handleStockActionSubmit = async (e) => {
    e.preventDefault()
    if (!stockModal.articulo) return
    const cant = Number(stockModal.cantidad)
    if (!cant || cant <= 0) return alert('Ingresá una cantidad mayor a cero.')

    setIsSubmitting(true)
    try {
      const art = stockModal.articulo
      if (stockModal.modo === 'ingreso') {
        const nuevoStock = Number(art.stock_actual || 0) + cant
        const { error } = await supabase
          .from('articulos')
          .update({ stock_actual: nuevoStock })
          .eq('id', art.id)
        if (error) throw error

        try {
          await supabase.from('movimientos_stock').insert([{
            empresa_id: activeEmpresaId,
            articulo_id: art.id,
            tipo_movimiento: 'ingreso_stock',
            cantidad: cant,
            motivo: stockModal.motivo || 'Ingreso directo de stock',
            usuario_id: userProfile?.id || null
          }])
        } catch (eMov) {
          console.warn('No se pudo guardar log de movimiento_stock:', eMov)
        }

        alert(`Se sumaron ${cant} unidades al stock de "${art.nombre}".`)
      } else {
        // Baja o ajuste de stock
        if (isOperator) {
          const nuevaSolicitud = {
            id: `stk_baja_${Date.now()}`,
            tipo: 'baja_stock',
            item_id: art.id,
            nombre: art.nombre,
            cantidad_baja: cant,
            motivo: stockModal.motivo || 'Ajuste / Baja de stock',
            usuario: userProfile?.nombre_completo || 'Operador',
            fecha: new Date().toISOString()
          }
          await saveAprobacionesToDb([...aprobaciones, nuevaSolicitud])
          alert(`Solicitud enviada: la baja de ${cant} u. de "${art.nombre}" quedó pendiente de autorización por administración.`)
        } else {
          const nuevoStock = Math.max(0, Number(art.stock_actual || 0) - cant)
          const { error } = await supabase
            .from('articulos')
            .update({ stock_actual: nuevoStock })
            .eq('id', art.id)
          if (error) throw error

          try {
            await supabase.from('movimientos_stock').insert([{
              empresa_id: activeEmpresaId,
              articulo_id: art.id,
              tipo_movimiento: 'baja_ajuste',
              cantidad: -cant,
              motivo: stockModal.motivo || 'Baja / Ajuste autorizado',
              usuario_id: userProfile?.id || null
            }])
          } catch (eMov) {
            console.warn('No se pudo guardar log de movimiento_stock:', eMov)
          }
          alert(`Baja registrada: se descontaron ${cant} unidades de "${art.nombre}".`)
        }
      }

      setStockModal({ open: false, modo: 'ingreso', articulo: null, cantidad: '', motivo: '' })
      fetchData()
    } catch (err) {
      console.error('Error en ajuste de stock:', err)
      alert('No se pudo procesar el movimiento de stock.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAprobarSolicitud = async (req) => {
    try {
      if (req.tipo === 'cambio_precio_articulo') {
        const { error } = await supabase
          .from('articulos')
          .update({ precio_venta: Number(req.precio_nuevo || 0) })
          .eq('id', req.item_id)
        if (error) throw error
      } else if (req.tipo === 'baja_stock') {
        const art = articulos.find(a => a.id === req.item_id)
        if (art) {
          const nuevoStock = Math.max(0, Number(art.stock_actual || 0) - Number(req.cantidad_baja || 0))
          const { error } = await supabase
            .from('articulos')
            .update({ stock_actual: nuevoStock })
            .eq('id', art.id)
          if (error) throw error

          try {
            await supabase.from('movimientos_stock').insert([{
              empresa_id: activeEmpresaId,
              articulo_id: art.id,
              tipo_movimiento: 'baja_autorizada',
              cantidad: -Number(req.cantidad_baja || 0),
              motivo: `${req.motivo || 'Baja de stock'} (Solicitado por ${req.usuario})`,
              usuario_id: userProfile?.id || null
            }])
          } catch (eMov) {
            console.warn('Error log movimiento_stock:', eMov)
          }
        }
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
      if (req.tipo === 'nuevo_articulo') {
        if (window.confirm(`¿Deseás eliminar el producto nuevo "${req.nombre}" o solo descartar el aviso de revisión? (Aceptar = Eliminar producto / Cancelar = Solo quitar aviso)`)) {
          await supabase.from('articulos').delete().eq('id', req.item_id)
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
    if (isOperator) return alert('No tenés permisos para eliminar productos.')
    if (!window.confirm('¿Estás seguro de que deseas eliminar este artículo?')) return
    
    try {
      const { error } = await supabase
        .from('articulos')
        .delete()
        .eq('id', id)
      if (error) throw error
      fetchData()
    } catch (error) {
      console.error('Error deleting article:', error)
      alert('Error al eliminar el artículo. Puede estar en uso.')
    }
  }

  const solicitudesArticulos = aprobaciones.filter(a =>
    a.tipo === 'nuevo_articulo' || a.tipo === 'cambio_precio_articulo' || a.tipo === 'baja_stock'
  )

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title"><Package style={{ marginRight: '0.5rem', display: 'inline' }} /> Artículos / Stock</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={18} /> Nuevo Producto
        </button>
      </header>

      {!isOperator && solicitudesArticulos.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.06)' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} /> Autorizaciones Pendientes de Precios y Stock ({solicitudesArticulos.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {solicitudesArticulos.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(11, 31, 26, 0.65)', border: '1px solid var(--surface-border)' }}>
                <div>
                  <span className={`badge ${req.tipo === 'baja_stock' ? 'badge-danger' : 'badge-warning'}`} style={{ marginRight: '0.6rem' }}>
                    {req.tipo === 'nuevo_articulo' ? 'NUEVO PRODUCTO' : req.tipo === 'baja_stock' ? 'BAJA / AJUSTE DE STOCK' : 'CAMBIO DE PRECIO'}
                  </span>
                  <strong>{req.nombre}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '0.6rem' }}>
                    {req.tipo === 'nuevo_articulo' && `Precio venta cargado: $${Number(req.precio_nuevo).toLocaleString()}`}
                    {req.tipo === 'cambio_precio_articulo' && `Precio actual: $${Number(req.precio_anterior).toLocaleString()} → Nuevo propuesto: $${Number(req.precio_nuevo).toLocaleString()}`}
                    {req.tipo === 'baja_stock' && `Cantidad a dar de baja: -${req.cantidad_baja} u. · Motivo: ${req.motivo}`}
                    {' · '}Solicitado por {req.usuario}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', background: 'var(--success-color)' }} onClick={() => handleAprobarSolicitud(req)}>
                    <CheckCircle size={15} /> {req.tipo === 'baja_stock' ? 'Autorizar Baja' : 'Aprobar Precio'}
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
        <p style={{ color: 'var(--text-secondary)' }}>Cargando artículos...</p>
      ) : (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          {articulos.length === 0 ? (
             <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No hay artículos registrados.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Marca</th>
                    {!isOperator && <th>Costo</th>}
                    <th>Precio Venta</th>
                    <th>Stock Actual</th>
                    <th style={{ textAlign: 'right' }}>Acciones de Stock y Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {articulos.map(articulo => {
                    const reqPrecio = solicitudesArticulos.find(a => a.item_id === articulo.id && a.tipo !== 'baja_stock')
                    const reqBaja = solicitudesArticulos.find(a => a.item_id === articulo.id && a.tipo === 'baja_stock')
                    return (
                      <tr key={articulo.id}>
                        <td>
                          <strong>{articulo.nombre}</strong>
                          {articulo.descripcion && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{articulo.descripcion}</div>}
                        </td>
                        <td>{articulo.marca || '-'}</td>
                        {!isOperator && <td>$ {Number(articulo.precio_costo).toLocaleString()}</td>}
                        <td style={{ fontWeight: 'bold' }}>
                          $ {Number(articulo.precio_venta).toLocaleString()}
                          {reqPrecio && (
                            <span className="badge badge-warning" style={{ marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                              {reqPrecio.tipo === 'nuevo_articulo'
                                ? 'Precio sujeto a aprobación'
                                : `Propuesto: $${Number(reqPrecio.precio_nuevo).toLocaleString()} (Pendiente)`}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ 
                            fontWeight: 'bold', 
                            color: articulo.stock_actual <= 0 ? 'var(--danger-color)' : 
                                   articulo.stock_actual < 5 ? 'orange' : 'var(--success-color)',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px'
                          }}>
                            {articulo.stock_actual}
                          </span>
                          {reqBaja && (
                            <span className="badge badge-danger" style={{ marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                              Baja pendiente: -{reqBaja.cantidad_baja} u.
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', color: 'var(--success-color)' }}
                              title="Registrar ingreso de unidades al stock"
                              onClick={() => openStockActionModal(articulo, 'ingreso')}
                            >
                              <ArrowUpCircle size={15} /> + Ingreso
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.4rem 0.65rem', fontSize: '0.78rem', color: '#f59e0b' }}
                              title={isOperator ? 'Solicitar baja o ajuste de stock (requiere autorización)' : 'Registrar baja o ajuste de stock'}
                              onClick={() => openStockActionModal(articulo, 'baja')}
                            >
                              <ArrowDownCircle size={15} /> Baja / Ajuste
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.45rem' }}
                              title={isOperator ? 'Proponer actualización de precio (sujeto a aprobación)' : 'Editar artículo'}
                              onClick={() => openModal(articulo)}
                            >
                              <Edit2 size={16} />
                            </button>
                            {!isOperator && (
                              <button className="btn btn-secondary" style={{ padding: '0.45rem', color: 'var(--danger-color)' }} onClick={() => handleDelete(articulo.id)}>
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

      {/* Modal de Ingreso / Baja de Stock */}
      {stockModal.open && stockModal.articulo && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h2>
                {stockModal.modo === 'ingreso'
                  ? `Ingreso de Stock: ${stockModal.articulo.nombre}`
                  : `Baja / Ajuste de Stock: ${stockModal.articulo.nombre}`}
              </h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setStockModal({ open: false, modo: 'ingreso', articulo: null, cantidad: '', motivo: '' })}>✕</button>
            </div>
            <div className="modal-body">
              {stockModal.modo === 'baja' && isOperator && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '0.85rem', color: '#fbbf24' }}>
                  Esta baja o ajuste de stock quedará pendiente de autorización por administración antes de descontarse del inventario.
                </div>
              )}
              <form id="stock-action-form" onSubmit={handleStockActionSubmit}>
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Stock actual registrado: <strong style={{ color: 'var(--text-primary)' }}>{stockModal.articulo.stock_actual} unidades</strong>
                </div>
                <div className="input-group">
                  <label>{stockModal.modo === 'ingreso' ? 'Cantidad que ingresa *' : 'Cantidad a dar de baja / ajustar *'}</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    className="input-field"
                    value={stockModal.cantidad}
                    onChange={(e) => setStockModal(prev => ({ ...prev, cantidad: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Motivo / Detalle *</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    placeholder={stockModal.modo === 'ingreso' ? 'Ej: Recepción de pedido proveedor' : 'Ej: Uso interno en salón / Rotura / Ajuste'}
                    value={stockModal.motivo}
                    onChange={(e) => setStockModal(prev => ({ ...prev, motivo: e.target.value }))}
                  />
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setStockModal({ open: false, modo: 'ingreso', articulo: null, cantidad: '', motivo: '' })} disabled={isSubmitting}>
                Cancelar
              </button>
              <button type="submit" form="stock-action-form" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Procesando...'
                  : stockModal.modo === 'ingreso'
                    ? 'Confirmar Ingreso de Stock'
                    : isOperator
                      ? 'Solicitar Autorización de Baja'
                      : 'Confirmar Baja de Stock'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Portal Modal Crear / Editar Artículo */}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{formData.id ? (isOperator ? 'Proponer Cambio de Precio' : 'Editar Artículo') : 'Nuevo Producto'}</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              {isOperator && (
                <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '0.85rem', color: '#fbbf24' }}>
                  {formData.id
                    ? 'Nota: El precio ya establecido no se modificará hasta que administración apruebe el nuevo valor propuesto.'
                    : 'Nota: Podés dar de alta el producto con su precio y stock inicial; el precio quedará sujeto a aprobación de administración.'}
                </div>
              )}
              <form id="articulo-form" onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>Nombre *</label>
                  <input required type="text" className="input-field" name="nombre" value={formData.nombre} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                </div>
                <div className="input-group">
                  <label>Descripción</label>
                  <textarea className="input-field" name="descripcion" rows="2" value={formData.descripcion || ''} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)}></textarea>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: isOperator ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                  {!isOperator && (
                    <div className="input-group">
                      <label>Precio Costo ($)</label>
                      <input type="number" step="0.01" min="0" className="input-field" name="precio_costo" value={formData.precio_costo} onChange={handleInputChange} />
                    </div>
                  )}
                  <div className="input-group">
                    <label>{isOperator && formData.id ? 'Nuevo Precio Venta Propuesto ($) *' : 'Precio Venta ($) *'}</label>
                    <input required type="number" step="0.01" min="0" className="input-field" name="precio_venta" value={formData.precio_venta} onChange={handleInputChange} />
                  </div>
                </div>

                {!formData.id && (
                  <div className="input-group">
                    <label>Stock Inicial (Unidades que ingresan hoy)</label>
                    <input type="number" step="1" min="0" className="input-field" name="stock_inicial" placeholder="0" value={formData.stock_inicial} onChange={handleInputChange} />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Marca</label>
                    <input type="text" className="input-field" name="marca" value={formData.marca || ''} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                  </div>
                  <div className="input-group">
                    <label>Envase / Contenedor</label>
                    <input type="text" className="input-field" name="envase_contenedor" value={formData.envase_contenedor || ''} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                  </div>
                </div>

                <div className="input-group">
                  <label>Categoría (Clasificador 1)</label>
                  <input type="text" className="input-field" name="clasificador_1" value={formData.clasificador_1 || ''} onChange={handleInputChange} disabled={Boolean(isOperator && formData.id)} />
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={isSubmitting}>Cancelar</button>
              <button type="submit" form="articulo-form" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : (isOperator && formData.id ? 'Enviar Precio para Aprobación' : 'Guardar Producto')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
