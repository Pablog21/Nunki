import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { esOperador } from '../lib/roles'
import { 
  Plus, Trash2, ShoppingCart, Zap, Droplet, Building, Flame, Wifi, Wrench, 
  Megaphone, Briefcase, FileText, CheckCircle2, Clock, TrendingUp, TrendingDown, 
  DollarSign, Filter, Calendar, ChevronLeft, ChevronRight, Download, Eye, Edit,
  ArrowUpRight, PieChart, BarChart2, Check, AlertCircle, Search, Scissors, Receipt
} from 'lucide-react'

export const CATEGORIAS_GASTOS = [
  { id: 'insumos', label: 'Insumos y Mercadería', icon: ShoppingCart, color: '#B4612A', bg: 'rgba(180, 97, 42, 0.15)', border: 'rgba(180, 97, 42, 0.3)' },
  { id: 'electricidad', label: 'Luz / Electricidad', icon: Zap, color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.3)' },
  { id: 'agua', label: 'Agua / Red Sanitaria', icon: Droplet, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)' },
  { id: 'alquiler', label: 'Alquiler y Expensas', icon: Building, color: '#5E8C77', bg: 'rgba(94, 140, 119, 0.15)', border: 'rgba(94, 140, 119, 0.3)' },
  { id: 'gas', label: 'Gas / Calefacción', icon: Flame, color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)' },
  { id: 'internet_telefonia', label: 'Internet y Telefonía', icon: Wifi, color: '#2F7F78', bg: 'rgba(47, 127, 120, 0.15)', border: 'rgba(47, 127, 120, 0.3)' },
  { id: 'mantenimiento', label: 'Mantenimiento y Arreglos', icon: Wrench, color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' },
  { id: 'marketing', label: 'Marketing y Publicidad', icon: Megaphone, color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' },
  { id: 'honorarios_impuestos', label: 'Honorarios e Impuestos', icon: Briefcase, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' },
  { id: 'otros', label: 'Otros Gastos Operativos', icon: FileText, color: '#3F8F86', bg: 'rgba(47, 127, 120, 0.15)', border: 'rgba(47, 127, 120, 0.3)' }
]

export const TIPOS_COMPROBANTE = [
  'Factura B', 'Factura A', 'Factura C', 'Factura de Servicios', 'Ticket / Recibo', 'Remito'
]

export const MEDIOS_PAGO = [
  { id: 'efectivo', label: '💵 Efectivo' },
  { id: 'tarjeta_credito', label: '💳 Tarjeta de Crédito' },
  { id: 'tarjeta_debito', label: '💳 Tarjeta de Débito' },
  { id: 'transferencia', label: '🏦 Transferencia Bancaria' },
  { id: 'otro', label: 'Otro' }
]

export const getCuotasCompra = (compra) => {
  if (!compra || compra.medio_pago !== 'tarjeta_credito') return null
  const notas = String(compra.notas || '')
  const match = notas.match(/\[Crédito\s*-\s*(\d+)\s*cuotas?\]/i) || notas.match(/\[(\d+)\s*cuotas?\]/i)
  if (match) {
    const n = parseInt(match[1], 10)
    if ([1, 2, 3].includes(n)) return n
  }
  return 1
}

export const getNotasLimpiasCompra = (notasStr) => {
  if (!notasStr) return ''
  return String(notasStr)
    .replace(/\[Crédito\s*-\s*\d+\s*cuotas?\]\s*/gi, '')
    .trim()
}

export const formatMedioPagoCompra = (compra) => {
  const mp = compra?.medio_pago || 'efectivo'
  if (mp === 'tarjeta_credito') {
    const c = getCuotasCompra(compra) || 1
    return `💳 Crédito (${c} ${c === 1 ? 'cuota' : 'cuotas'})`
  }
  if (mp === 'tarjeta_debito') return '💳 Débito'
  if (mp === 'efectivo') return '💵 Efectivo'
  if (mp === 'transferencia') return '🏦 Transferencia'
  return mp.replace('_', ' ')
}

export default function Compras() {
  const { user, userProfile, activeEmpresaId } = useAuth()
  const rawRol = (userProfile?.rol || '').toLowerCase().trim()
  const isOperator = esOperador(userProfile)
  
  // Tabs: 'facturas' | 'analisis'
  const [activeTab, setActiveTab] = useState('facturas')
  
  const [compras, setCompras] = useState([])
  const [articulosDb, setArticulosDb] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCompraId, setEditingCompraId] = useState(null)
  const [selectedCompraDetalle, setSelectedCompraDetalle] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const getLocalTodayStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const getLocalMonthStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Filtros en pestaña Facturas
  const [filtroMes, setFiltroMes] = useState(getLocalMonthStr) // YYYY-MM
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroEstadoPago, setFiltroEstadoPago] = useState('todos')
  const [filtroMedioPago, setFiltroMedioPago] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  // Estado del Formulario de Nueva Factura / Gasto
  const [formCategoria, setFormCategoria] = useState('insumos')
  const [formData, setFormData] = useState({
    fecha: getLocalTodayStr(),
    fecha_vencimiento: '',
    proveedor: '',
    tipo_comprobante: 'Factura B',
    numero_remito_factura: '',
    estado_pago: 'pagado',
    medio_pago: 'efectivo',
    cuotas: 1,
    descontar_de_caja: true,
    monto_directo: '',
    concepto_directo: '',
    notas: '',
    comprobante_url: ''
  })
  
  // Modo de insumos: desglosado por artículo vs monto global
  const [modoInsumosArticulos, setModoInsumosArticulos] = useState(true)
  const [detalles, setDetalles] = useState([])

  // Estado para Pestaña Análisis de Resultados (P&L)
  const [selectedPlMonth, setSelectedPlMonth] = useState(getLocalMonthStr) // YYYY-MM
  const [plLoading, setPlLoading] = useState(false)
  const [plData, setPlData] = useState({
    ventasTotal: 0,
    ventasServicios: 0,
    ventasProductos: 0,
    cantidadOrdenes: 0,
    comisionesTotal: 0,
    gastosTotal: 0,
    gastosPorCategoria: {},
    resultadoNeto: 0,
    margenNetoPct: 0,
    historico6Meses: []
  })

  // Cargar datos iniciales
  useEffect(() => {
    if (activeEmpresaId) {
      fetchData()
    }
  }, [activeEmpresaId])

  // Recargar P&L al cambiar mes de análisis o pestaña
  useEffect(() => {
    if (activeEmpresaId && activeTab === 'analisis') {
      fetchPlData(selectedPlMonth)
    }
  }, [activeEmpresaId, selectedPlMonth, activeTab])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 1. Obtener Compras y Gastos
      const { data: comprasData, error: errCompras } = await supabase
        .from('compras_proveedores')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .order('fecha', { ascending: false })

      if (errCompras) throw errCompras
      setCompras(comprasData || [])

      // 2. Obtener Artículos de catálogo
      const { data: resArticulos, error: errArt } = await supabase
        .from('articulos')
        .select('id, nombre, precio_costo, stock_actual')
        .eq('empresa_id', activeEmpresaId)
        .order('nombre')

      if (errArt) console.error("Error fetching articles:", errArt)
      setArticulosDb(resArticulos || [])

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // --- Carga del Análisis de Resultados (P&L) ---
  const fetchPlData = async (mesAnoStr) => {
    try {
      setPlLoading(true)
      const [yearStr, monthStr] = mesAnoStr.split('-')
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10) // 1-12

      // Rango del mes
      const startDate = `${mesAnoStr}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${mesAnoStr}-${String(lastDay).padStart(2, '0')}`
      const startDateTime = `${startDate}T00:00:00.000Z`
      const endDateTime = `${endDate}T23:59:59.999Z`

      // 1. Obtener Órdenes Completadas del Mes con sus detalles
      const { data: ordenesMes, error: errOrd } = await supabase
        .from('ordenes_trabajo')
        .select(`
          id, total_economico, fecha_hora, estado,
          ordenes_trabajo_detalles (tipo_item, subtotal)
        `)
        .eq('empresa_id', activeEmpresaId)
        .eq('estado', 'completada')
        .gte('fecha_hora', startDateTime)
        .lte('fecha_hora', endDateTime)

      if (errOrd) throw errOrd

      let vTotal = 0
      let vServicios = 0
      let vProductos = 0
      const totalOrdenes = (ordenesMes || []).length

      ;(ordenesMes || []).forEach(ord => {
        const ordTotal = Number(ord.total_economico || 0)
        vTotal += ordTotal

        if (ord.ordenes_trabajo_detalles && ord.ordenes_trabajo_detalles.length > 0) {
          ord.ordenes_trabajo_detalles.forEach(det => {
            const sub = Number(det.subtotal || 0)
            if (det.tipo_item === 'servicio') {
              vServicios += sub
            } else {
              vProductos += sub
            }
          })
        } else {
          vServicios += ordTotal
        }
      })

      // 2. Obtener Comisiones de estilistas del mes
      const { data: comisionesMes, error: errCom } = await supabase
        .from('comisiones')
        .select('monto_comision, estado')
        .eq('empresa_id', activeEmpresaId)
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime)
        .neq('estado', 'cancelada')

      if (errCom) console.error("Error fetching comisiones:", errCom)

      const comisionesTotal = (comisionesMes || []).reduce((acc, c) => acc + Number(c.monto_comision || 0), 0)

      // 3. Obtener Compras y Gastos del mes
      const { data: gastosMes, error: errGastos } = await supabase
        .from('compras_proveedores')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .gte('fecha', startDate)
        .lte('fecha', endDate)

      if (errGastos) throw errGastos

      let gTotal = 0
      const gPorCat = {}

      // Inicializar categorías
      CATEGORIAS_GASTOS.forEach(cat => {
        gPorCat[cat.id] = { label: cat.label, total: 0, count: 0, color: cat.color }
      })

      ;(gastosMes || []).forEach(g => {
        const val = Number(g.total_compra || 0)
        gTotal += val
        const catKey = g.categoria || 'otros'
        if (!gPorCat[catKey]) {
          gPorCat[catKey] = { label: catKey, total: 0, count: 0, color: '#64748b' }
        }
        gPorCat[catKey].total += val
        gPorCat[catKey].count += 1
      })

      // Cálculo Resultado Neto
      const totalCostosYGastos = comisionesTotal + gTotal
      const resNeto = vTotal - totalCostosYGastos
      const margenNeto = vTotal > 0 ? (resNeto / vTotal) * 100 : 0

      // 4. Histórico últimos 6 meses para tendencia
      const historico = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1)
        const hYear = d.getFullYear()
        const hMonth = d.getMonth() + 1
        const hMonthKey = `${hYear}-${String(hMonth).padStart(2, '0')}`
        const hLastDay = new Date(hYear, hMonth, 0).getDate()
        const hStart = `${hMonthKey}-01T00:00:00.000Z`
        const hEnd = `${hMonthKey}-${String(hLastDay).padStart(2, '0')}T23:59:59.999Z`

        // Consultar ventas
        const { data: hOrd } = await supabase
          .from('ordenes_trabajo')
          .select('total_economico')
          .eq('empresa_id', activeEmpresaId)
          .eq('estado', 'completada')
          .gte('fecha_hora', hStart)
          .lte('fecha_hora', hEnd)

        const hVentas = (hOrd || []).reduce((acc, o) => acc + Number(o.total_economico || 0), 0)

        // Consultar comisiones
        const { data: hCom } = await supabase
          .from('comisiones')
          .select('monto_comision')
          .eq('empresa_id', activeEmpresaId)
          .gte('created_at', hStart)
          .lte('created_at', hEnd)
          .neq('estado', 'cancelada')

        const hComis = (hCom || []).reduce((acc, c) => acc + Number(c.monto_comision || 0), 0)

        // Consultar gastos
        const { data: hGas } = await supabase
          .from('compras_proveedores')
          .select('total_compra')
          .eq('empresa_id', activeEmpresaId)
          .gte('fecha', `${hMonthKey}-01`)
          .lte('fecha', `${hMonthKey}-${String(hLastDay).padStart(2, '0')}`)

        const hGastos = (hGas || []).reduce((acc, g) => acc + Number(g.total_compra || 0), 0)

        const hResultado = hVentas - (hComis + hGastos)
        const hMargen = hVentas > 0 ? (hResultado / hVentas) * 100 : 0

        historico.push({
          key: hMonthKey,
          label: d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
          ventas: hVentas,
          costos: hComis + hGastos,
          resultado: hResultado,
          margen: hMargen
        })
      }

      setPlData({
        ventasTotal: vTotal,
        ventasServicios: vServicios,
        ventasProductos: vProductos,
        cantidadOrdenes: totalOrdenes,
        comisionesTotal: comisionesTotal,
        gastosTotal: gTotal,
        gastosPorCategoria: gPorCat,
        resultadoNeto: resNeto,
        margenNetoPct: margenNeto,
        historico6Meses: historico
      })

    } catch (error) {
      console.error('Error calculando P&L:', error)
    } finally {
      setPlLoading(false)
    }
  }

  // --- Handlers de Formulario ---
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, comprobante_url: reader.result }))
      }
      reader.readAsDataURL(file)
    }
  }

  const agregarDetalle = () => {
    setDetalles([
      ...detalles, 
      { 
        id_temp: Date.now(), 
        articulo_id: '', 
        cantidad: 1, 
        precio_costo_unitario: 0 
      }
    ])
  }

  const removerDetalle = (id_temp) => {
    setDetalles(detalles.filter(d => d.id_temp !== id_temp))
  }

  const actualizarDetalle = (id_temp, campo, valor) => {
    setDetalles(detalles.map(d => {
      if (d.id_temp === id_temp) {
        const updated = { ...d, [campo]: valor }
        if (campo === 'articulo_id') {
          const art = articulosDb.find(a => a.id === valor)
          if (art) updated.precio_costo_unitario = art.precio_costo || 0
        }
        return updated
      }
      return d
    }))
  }

  const calcularTotalInsumos = () => {
    return detalles.reduce((sum, d) => sum + (Number(d.cantidad) * Number(d.precio_costo_unitario)), 0)
  }

  const calcularTotalFormulario = () => {
    if (formCategoria === 'insumos' && modoInsumosArticulos) {
      return calcularTotalInsumos()
    }
    return Number(formData.monto_directo || 0)
  }

  // Marcar rápido como pagado/pendiente
  const toggleEstadoPago = async (compra) => {
    try {
      const nuevoEstado = compra.estado_pago === 'pagado' ? 'pendiente' : 'pagado'
      const { error } = await supabase
        .from('compras_proveedores')
        .update({ estado_pago: nuevoEstado })
        .eq('id', compra.id)

      if (error) throw error

      setCompras(prev => prev.map(c => c.id === compra.id ? { ...c, estado_pago: nuevoEstado } : c))
    } catch (err) {
      console.error('Error actualizando estado de pago:', err)
      alert('Error al actualizar estado de pago')
    }
  }

  // Eliminar compra
  const handleEliminarCompra = async (compraId) => {
    if (!confirm('¿Estás seguro de eliminar esta factura/gasto?')) return
    try {
      // Eliminar movimientos de stock asociados si existieran
      await supabase.from('movimientos_stock').delete().eq('referencia_id', compraId)
      // Eliminar detalles
      await supabase.from('compras_detalles').delete().eq('compra_id', compraId)
      // Eliminar compra
      const { error } = await supabase.from('compras_proveedores').delete().eq('id', compraId)
      if (error) throw error

      setCompras(prev => prev.filter(c => c.id !== compraId))
    } catch (err) {
      console.error('Error al eliminar compra:', err)
      alert('Error al eliminar el comprobante')
    }
  }

  // Abrir modal de detalle
  const verDetalleCompra = async (compra) => {
    setSelectedCompraDetalle(compra)
    try {
      const { data: dData } = await supabase
        .from('compras_detalles')
        .select(`
          id, cantidad, precio_costo_unitario, subtotal, descripcion,
          articulos (nombre)
        `)
        .eq('compra_id', compra.id)
      
      setSelectedCompraDetalle(prev => ({ ...prev, detalles: dData || [] }))
    } catch (err) {
      console.error("Error cargando detalles:", err)
    }
  }

  const resetModalForm = () => {
    setEditingCompraId(null)
    setFormCategoria('insumos')
    setModoInsumosArticulos(true)
    setDetalles([])
    setFormData({
      fecha: getLocalTodayStr(),
      fecha_vencimiento: '',
      proveedor: '',
      tipo_comprobante: 'Factura B',
      numero_remito_factura: '',
      estado_pago: 'pagado',
      medio_pago: 'efectivo',
      cuotas: 1,
      descontar_de_caja: true,
      monto_directo: '',
      concepto_directo: '',
      notas: '',
      comprobante_url: ''
    })
  }

  // Abrir modal para editar comprobante existente
  const handleEditCompra = async (compra) => {
    setSelectedCompraDetalle(null)
    setEditingCompraId(compra.id)
    const cat = compra.categoria || 'insumos'
    setFormCategoria(cat)

    let fetchedDetalles = []
    try {
      const { data: dData } = await supabase
        .from('compras_detalles')
        .select('*')
        .eq('compra_id', compra.id)
      fetchedDetalles = dData || []
    } catch (err) {
      console.error('Error cargando detalles para editar:', err)
    }

    const tieneArticulosStock = fetchedDetalles.some(d => d.articulo_id !== null && d.articulo_id !== undefined)
    if (cat === 'insumos' && tieneArticulosStock) {
      setModoInsumosArticulos(true)
      setDetalles(fetchedDetalles.map((d, idx) => ({
        id_temp: d.id || (Date.now() + idx),
        articulo_id: d.articulo_id || '',
        cantidad: Number(d.cantidad || 1),
        precio_costo_unitario: Number(d.precio_costo_unitario || 0)
      })))
    } else {
      setModoInsumosArticulos(false)
      setDetalles([])
    }

    const detalleConcepto = !tieneArticulosStock && fetchedDetalles.length > 0
      ? (fetchedDetalles[0].descripcion || '')
      : ''

    const notasLimpias = getNotasLimpiasCompra(compra.notas || '')

    setFormData({
      fecha: compra.fecha || getLocalTodayStr(),
      fecha_vencimiento: compra.fecha_vencimiento || '',
      proveedor: compra.proveedor || '',
      tipo_comprobante: compra.tipo_comprobante || 'Factura B',
      numero_remito_factura: compra.numero_remito_factura || '',
      estado_pago: compra.estado_pago || 'pagado',
      medio_pago: compra.medio_pago || 'efectivo',
      cuotas: getCuotasCompra(compra) || 1,
      descontar_de_caja: false,
      monto_directo: compra.total_compra ?? '',
      concepto_directo: getNotasLimpiasCompra(detalleConcepto) || notasLimpias || '',
      notas: notasLimpias,
      comprobante_url: compra.comprobante_url || ''
    })

    setShowModal(true)
  }

  // --- Submit Guardar Nueva Factura / Gasto o Editar Existente ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!activeEmpresaId) return alert("Error: No hay empresa activa seleccionada.")

    const total = calcularTotalFormulario()
    if (total <= 0) return alert("El monto total de la factura o gasto debe ser mayor a 0.")

    if (formCategoria === 'insumos' && modoInsumosArticulos) {
      if (detalles.length === 0) return alert("Agrega al menos un artículo o cambia al modo de carga por monto directo.")
      if (detalles.some(d => !d.articulo_id)) return alert("Selecciona un artículo en todos los renglones.")
    }

    setIsSubmitting(true)
    try {
      const notasBase = getNotasLimpiasCompra(formData.notas || (formCategoria !== 'insumos' ? formData.concepto_directo : ''))
      let notasFinal = notasBase || null
      if (formData.medio_pago === 'tarjeta_credito') {
        const cantCuotas = [1, 2, 3].includes(Number(formData.cuotas)) ? Number(formData.cuotas) : 1
        const tagCuotas = `[Crédito - ${cantCuotas} ${cantCuotas === 1 ? 'cuota' : 'cuotas'}]`
        notasFinal = notasBase ? `${tagCuotas} ${notasBase}` : tagCuotas
      }

      const datosCompra = {
        empresa_id: activeEmpresaId,
        fecha: formData.fecha,
        fecha_vencimiento: formData.fecha_vencimiento || null,
        proveedor: formData.proveedor.trim() || 'Proveedor Varios',
        numero_remito_factura: formData.numero_remito_factura.trim() || null,
        categoria: formCategoria,
        tipo_gasto: formCategoria === 'insumos' ? 'compra_stock' : 'gasto_operativo',
        tipo_comprobante: formData.tipo_comprobante,
        total_compra: total,
        estado_pago: formData.estado_pago,
        medio_pago: formData.medio_pago,
        comprobante_url: formData.comprobante_url || null,
        notas: notasFinal
      }

      let compraId = editingCompraId

      if (editingCompraId) {
        // 1A. Actualizar comprobante existente
        const { error: errorUpdate } = await supabase
          .from('compras_proveedores')
          .update(datosCompra)
          .eq('id', editingCompraId)

        if (errorUpdate) throw errorUpdate

        // Limpiar detalles y movimientos de stock anteriores de este comprobante para reinsertarlos actualizados
        await supabase.from('movimientos_stock').delete().eq('referencia_id', editingCompraId)
        await supabase.from('compras_detalles').delete().eq('compra_id', editingCompraId)
      } else {
        // 1B. Crear nuevo comprobante
        const { data: compraCreada, error: errorCompra } = await supabase
          .from('compras_proveedores')
          .insert([datosCompra])
          .select()

        if (errorCompra) throw errorCompra
        compraId = compraCreada[0].id

        // Si se pagó en efectivo y se marcó descontar de la caja diaria actual, registrar el retiro en cajas_movimientos
        if (formData.estado_pago === 'pagado' && formData.medio_pago === 'efectivo' && formData.descontar_de_caja && total > 0) {
          const provLabel = formData.proveedor.trim() || 'Proveedor Varios'
          const compLabel = formData.numero_remito_factura?.trim() ? ` (Comp: ${formData.numero_remito_factura.trim()})` : ''
          const conceptoExtra = notasBase ? ` - ${notasBase}` : ''
          await supabase.from('cajas_movimientos').insert([{
            empresa_id: activeEmpresaId,
            tipo: 'retiro',
            monto: total,
            descripcion: `[Compra/Gasto] ${provLabel}${compLabel}${conceptoExtra}`,
            usuario_responsable_id: user?.id
          }])
        }
      }

      // 2. Si es insumos con artículos detallados, registrar renglones y stock
      if (formCategoria === 'insumos' && modoInsumosArticulos && detalles.length > 0) {
        const detallesToInsert = detalles.map(d => ({
          compra_id: compraId,
          articulo_id: d.articulo_id,
          cantidad: d.cantidad,
          precio_costo_unitario: d.precio_costo_unitario,
          subtotal: Number(d.cantidad) * Number(d.precio_costo_unitario),
          descripcion: null
        }))

        const { error: errorDetalles } = await supabase
          .from('compras_detalles')
          .insert(detallesToInsert)
          
        if (errorDetalles) throw errorDetalles

        // Registrar movimientos de stock
        const movimientosStock = detalles.map(d => ({
          empresa_id: activeEmpresaId,
          articulo_id: d.articulo_id,
          tipo_movimiento: 'ingreso_compra',
          cantidad: Math.abs(d.cantidad),
          referencia_id: compraId,
          notas: `Factura: ${formData.numero_remito_factura || 'S/N'} - Proveedor: ${formData.proveedor || 'S/D'}`
        }))

        await supabase.from('movimientos_stock').insert(movimientosStock)
      } else {
        // Guardar detalle descriptivo único para el gasto / servicio
        await supabase.from('compras_detalles').insert([{
          compra_id: compraId,
          articulo_id: null,
          cantidad: 1,
          precio_costo_unitario: total,
          subtotal: total,
          descripcion: formData.concepto_directo || `Factura de ${formCategoria}`
        }])
      }

      setShowModal(false)
      resetModalForm()
      fetchData()

    } catch (error) {
      console.error('Error guardando factura/compra:', error)
      alert(`Error al guardar: ${error.message || 'Verifica los datos'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Filtros Pestaña Facturas ---
  const comprasFiltradas = useMemo(() => {
    return compras.filter(c => {
      if (isOperator && (c.categoria || 'insumos') !== 'insumos') return false
      // Filtro Mes
      if (filtroMes) {
        const cMes = c.fecha ? c.fecha.slice(0, 7) : ''
        if (cMes !== filtroMes) return false
      }
      // Filtro Categoría
      if (filtroCategoria !== 'todas') {
        if ((c.categoria || 'insumos') !== filtroCategoria) return false
      }
      // Filtro Estado Pago
      if (filtroEstadoPago !== 'todos') {
        if ((c.estado_pago || 'pagado') !== filtroEstadoPago) return false
      }
      // Filtro Medio de Pago
      if (filtroMedioPago !== 'todos') {
        if ((c.medio_pago || 'efectivo') !== filtroMedioPago) return false
      }
      // Buscador
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const prov = (c.proveedor || '').toLowerCase()
        const nro = (c.numero_remito_factura || '').toLowerCase()
        const notas = (c.notas || '').toLowerCase()
        if (!prov.includes(q) && !nro.includes(q) && !notas.includes(q)) return false
      }
      return true
    })
  }, [compras, isOperator, filtroMes, filtroCategoria, filtroEstadoPago, filtroMedioPago, busqueda])

  // Métricas rápidas de la pestaña facturas + Control de Tarjeta de Crédito
  const metricsFacturas = useMemo(() => {
    let total = 0
    let totalPagado = 0
    let totalPendiente = 0
    let totalInsumos = 0
    let totalServicios = 0
    let totalTarjetaCredito = 0
    let countTarjetaCredito = 0
    let credito1Cuota = 0
    let credito2Cuotas = 0
    let credito3Cuotas = 0

    comprasFiltradas.forEach(c => {
      const val = Number(c.total_compra || 0)
      total += val
      if (c.estado_pago === 'pendiente') {
        totalPendiente += val
      } else {
        totalPagado += val
      }

      if ((c.categoria || 'insumos') === 'insumos') {
        totalInsumos += val
      } else {
        totalServicios += val
      }

      if (c.medio_pago === 'tarjeta_credito') {
        totalTarjetaCredito += val
        countTarjetaCredito += 1
        const cuotas = getCuotasCompra(c) || 1
        if (cuotas === 3) credito3Cuotas += val
        else if (cuotas === 2) credito2Cuotas += val
        else credito1Cuota += val
      }
    })

    return {
      total,
      totalPagado,
      totalPendiente,
      totalInsumos,
      totalServicios,
      totalTarjetaCredito,
      countTarjetaCredito,
      credito1Cuota,
      credito2Cuotas,
      credito3Cuotas
    }
  }, [comprasFiltradas])

  // Navegación meses en P&L
  const changePlMonth = (direction) => {
    const [y, m] = selectedPlMonth.split('-').map(Number)
    const newDate = new Date(y, m - 1 + direction, 1)
    const newMonthStr = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
    setSelectedPlMonth(newMonthStr)
  }

  const getCategoriaInfo = (catId) => {
    return CATEGORIAS_GASTOS.find(c => c.id === catId) || {
      id: catId,
      label: catId,
      icon: FileText,
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.15)',
      border: 'rgba(148, 163, 184, 0.3)'
    }
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      {/* Header con Pestañas */}
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
            <Receipt size={28} style={{ color: 'var(--primary-color)' }} />
            {isOperator ? 'Ingreso de Stock e Insumos' : 'Compras, Gastos y Resultados'}
          </h1>
          <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isOperator
              ? 'Registro de recepción de mercadería e ingreso de stock al salón.'
              : 'Control de facturas de proveedores, servicios (luz, agua, alquiler) y análisis financiero de utilidades.'}
          </p>
        </div>

        {/* Pestañas de Navegación */}
        {!isOperator && (
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
            <button
              onClick={() => setActiveTab('facturas')}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'facturas' ? 'var(--primary-color)' : 'transparent',
                color: activeTab === 'facturas' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'facturas' ? '600' : '400',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Receipt size={17} />
              Facturas y Egresos
            </button>
            <button
              onClick={() => setActiveTab('analisis')}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'analisis' ? 'var(--primary-color)' : 'transparent',
                color: activeTab === 'analisis' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'analisis' ? '600' : '400',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <BarChart2 size={17} />
              Análisis de Resultados (P&L)
            </button>
          </div>
        )}
      </header>

      {/* ========================================================= */}
      {/* PESTAÑA 1: FACTURAS Y EGRESOS                             */}
      {/* ========================================================= */}
      {(activeTab === 'facturas' || isOperator) && (
        <div>
          {/* Top KPI Cards (Solo Administrador) */}
          {!isOperator && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(180, 97, 42, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
                  <DollarSign size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Gastos / Compras</span>
                  <h3 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--text-primary)' }}>$ {metricsFacturas.total.toLocaleString()}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{comprasFiltradas.length} comprobantes</span>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success-color)' }}>
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Pagado</span>
                  <h3 style={{ margin: 0, fontSize: '1.35rem', color: 'var(--success-color)' }}>$ {metricsFacturas.totalPagado.toLocaleString()}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cancelado / Al día</span>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
                  <Clock size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pendiente de Pago</span>
                  <h3 style={{ margin: 0, fontSize: '1.35rem', color: '#eab308' }}>$ {metricsFacturas.totalPendiente.toLocaleString()}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>A pagar a proveedores</span>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(94, 140, 119, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5E8C77' }}>
                  <Zap size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Luz, Agua y Gastos Fijos</span>
                  <h3 style={{ margin: 0, fontSize: '1.35rem', color: '#5E8C77' }}>$ {metricsFacturas.totalServicios.toLocaleString()}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Insumos: ${metricsFacturas.totalInsumos.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Filtros y Acción */}
          <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
                {/* Filtro Mes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="month"
                    className="input-field"
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                  />
                  {filtroMes && (
                    <button 
                      onClick={() => setFiltroMes('')} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                      title="Ver todos los meses"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtro Categoría */}
                {!isOperator && (
                  <select
                    className="input-field"
                    style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                    value={filtroCategoria}
                    onChange={(e) => setFiltroCategoria(e.target.value)}
                  >
                    <option value="todas">Todas las categorías</option>
                    {CATEGORIAS_GASTOS.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                )}

                {/* Filtro Estado de Pago */}
                <select
                  className="input-field"
                  style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                  value={filtroEstadoPago}
                  onChange={(e) => setFiltroEstadoPago(e.target.value)}
                >
                  <option value="todos">Todos los estados</option>
                  <option value="pagado">Pagados</option>
                  <option value="pendiente">Pendientes de Pago</option>
                </select>

                {/* Buscador */}
                <div style={{ position: 'relative', minWidth: '200px', flex: 1 }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Buscar proveedor, n° factura..."
                    className="input-field"
                    style={{ paddingLeft: '2rem', paddingRight: '0.75rem', paddingTop: '0.45rem', paddingBottom: '0.45rem', width: '100%', fontSize: '0.85rem' }}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </div>
              </div>

              {/* Botón Cargar */}
              <button 
                className="btn btn-primary"
                onClick={() => {
                  resetModalForm()
                  setShowModal(true)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
              >
                <Plus size={18} /> {isOperator ? 'Registrar Ingreso de Stock' : 'Cargar Factura / Gasto'}
              </button>
            </div>

            {/* Filtro Rápido por Medio de Pago (Para controlar compras con Tarjeta de Crédito / Efectivo / etc.) */}
            {!isOperator && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '0.25rem', fontWeight: '600' }}>
                  Filtrar por Medio de Pago:
                </span>
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'tarjeta_credito', label: '💳 Tarjeta de Crédito' },
                  { id: 'tarjeta_debito', label: '💳 Tarjeta de Débito' },
                  { id: 'efectivo', label: '💵 Efectivo' },
                  { id: 'transferencia', label: '🏦 Transferencia' }
                ].map(m => {
                  const active = filtroMedioPago === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setFiltroMedioPago(m.id)}
                      style={{
                        padding: '0.32rem 0.75rem',
                        borderRadius: '999px',
                        fontSize: '0.76rem',
                        fontWeight: active ? '700' : '500',
                        cursor: 'pointer',
                        border: active ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.1)',
                        background: active ? 'rgba(180, 97, 42, 0.2)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s'
                      }}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Panel de Control de Compras / Gastos con Tarjeta de Crédito */}
          {!isOperator && (filtroMedioPago === 'tarjeta_credito' || metricsFacturas.totalTarjetaCredito > 0) && (
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(47, 127, 120, 0.08)', border: '1px solid rgba(47, 127, 120, 0.3)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#c4b5fd', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  💳 Control de Compras / Gastos Pagados con Tarjeta de Crédito
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#fff', marginTop: '0.15rem' }}>
                  $ {metricsFacturas.totalTarjetaCredito.toLocaleString()}
                  <span style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-secondary)', marginLeft: '0.6rem' }}>
                    ({metricsFacturas.countTarjetaCredito} {metricsFacturas.countTarjetaCredito === 1 ? 'comprobante' : 'comprobantes'})
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>En 1 Cuota</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff' }}>$ {metricsFacturas.credito1Cuota.toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>En 2 Cuotas</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#c4b5fd' }}>$ {metricsFacturas.credito2Cuotas.toLocaleString()}</div>
                </div>
                <div style={{ padding: '0.45rem 0.85rem', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>En 3 Cuotas</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#a78bfa' }}>$ {metricsFacturas.credito3Cuotas.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Tabla de Comprobantes */}
          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Cargando comprobantes...</p>
          ) : (
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              {comprasFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <Receipt size={42} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                  <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>No se encontraron comprobantes registrados.</p>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>Usa el botón superior para registrar un ingreso de mercadería.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Categoría</th>
                        <th>Comprobante</th>
                        <th>Estado de Pago</th>
                        <th>Medio</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comprasFiltradas.map(compra => {
                        const catInfo = getCategoriaInfo(compra.categoria)
                        const IconComponent = catInfo.icon || FileText
                        const isPendiente = compra.estado_pago === 'pendiente'
                        const notasLimpiasRow = getNotasLimpiasCompra(compra.notas)

                        return (
                          <tr key={compra.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: '500' }}>{new Date(compra.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</div>
                              {compra.fecha_vencimiento && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Vence: {new Date(compra.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR')}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{compra.proveedor || 'S/D'}</div>
                              {notasLimpiasRow && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {notasLimpiasRow}
                                </div>
                              )}
                            </td>
                            <td>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '12px',
                                fontSize: '0.78rem',
                                fontWeight: '500',
                                background: catInfo.bg,
                                color: catInfo.color,
                                border: `1px solid ${catInfo.border}`
                              }}>
                                <IconComponent size={13} />
                                {catInfo.label}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>{compra.tipo_comprobante || 'Factura'}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{compra.numero_remito_factura || 'S/N'}</div>
                            </td>
                            <td>
                              <button
                                onClick={() => !isOperator && toggleEstadoPago(compra)}
                                title={isOperator ? 'Estado de pago' : 'Haz clic para cambiar entre Pagado y Pendiente'}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  cursor: isOperator ? 'default' : 'pointer',
                                  border: isPendiente ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)',
                                  background: isPendiente ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                  color: isPendiente ? '#eab308' : 'var(--success-color)',
                                  transition: 'transform 0.15s'
                                }}
                              >
                                {isPendiente ? <Clock size={12} /> : <Check size={12} />}
                                {isPendiente ? 'Pendiente' : 'Pagado'}
                              </button>
                            </td>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              <span style={{
                                padding: '0.22rem 0.55rem',
                                borderRadius: '8px',
                                fontWeight: compra.medio_pago === 'tarjeta_credito' ? '700' : '500',
                                background: compra.medio_pago === 'tarjeta_credito' ? 'rgba(47, 127, 120, 0.18)' : 'rgba(255,255,255,0.04)',
                                color: compra.medio_pago === 'tarjeta_credito' ? '#c4b5fd' : 'var(--text-secondary)',
                                border: compra.medio_pago === 'tarjeta_credito' ? '1px solid rgba(47, 127, 120, 0.35)' : '1px solid transparent'
                              }}>
                                {formatMedioPagoCompra(compra)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>
                              $ {Number(compra.total_compra || 0).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem', borderRadius: '6px' }}
                                  onClick={() => verDetalleCompra(compra)}
                                  title="Ver detalle del comprobante"
                                >
                                  <Eye size={15} />
                                </button>
                                {!isOperator && (
                                  <>
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '0.35rem', borderRadius: '6px', color: 'var(--primary-color)' }}
                                      onClick={() => handleEditCompra(compra)}
                                      title="Editar comprobante"
                                    >
                                      <Edit size={15} />
                                    </button>
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '0.35rem', borderRadius: '6px', color: 'var(--danger-color)' }}
                                      onClick={() => handleEliminarCompra(compra.id)}
                                      title="Eliminar comprobante"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </>
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
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: ANÁLISIS DE RESULTADOS MENSUALES (P&L)          */}
      {/* ========================================================= */}
      {!isOperator && activeTab === 'analisis' && (
        <div>
          {/* Barra de Período y Botón de Impresión */}
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Período de Análisis:</span>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid var(--surface-border)', padding: '0.2rem' }}>
                <button 
                  onClick={() => changePlMonth(-1)} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.4rem', cursor: 'pointer', display: 'flex' }}
                  title="Mes anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <input
                  type="month"
                  value={selectedPlMonth}
                  onChange={(e) => setSelectedPlMonth(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.95rem', padding: '0.2rem 0.6rem', textAlign: 'center', outline: 'none' }}
                />
                <button 
                  onClick={() => changePlMonth(1)} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '0.4rem', cursor: 'pointer', display: 'flex' }}
                  title="Mes siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              <Download size={15} /> Imprimir / Exportar Reporte
            </button>
          </div>

          {plLoading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '3rem' }}>Calculando estado de resultados del período...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Resumen Ejecutivo de Rentabilidad (KPIs Clave) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
                {/* 1. Facturación / Ventas */}
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid var(--primary-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>1. Ventas / Facturación</span>
                    <TrendingUp size={20} style={{ color: 'var(--primary-color)' }} />
                  </div>
                  <h2 style={{ margin: '0.5rem 0 0.2rem 0', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
                    $ {plData.ventasTotal.toLocaleString()}
                  </h2>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.8rem' }}>
                    <span>Servicios: ${plData.ventasServicios.toLocaleString()}</span>
                    <span>Productos: ${plData.ventasProductos.toLocaleString()}</span>
                  </div>
                </div>

                {/* 2. Comisiones Colaboradores */}
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #f97316' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>2. Comisiones Estilistas</span>
                    <Scissors size={20} style={{ color: '#f97316' }} />
                  </div>
                  <h2 style={{ margin: '0.5rem 0 0.2rem 0', fontSize: '1.6rem', color: '#f97316' }}>
                    $ {plData.comisionesTotal.toLocaleString()}
                  </h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {plData.ventasTotal > 0 ? `${((plData.comisionesTotal / plData.ventasTotal) * 100).toFixed(1)}% de las ventas` : '0%'}
                  </span>
                </div>

                {/* 3. Compras y Gastos Operativos */}
                <div className="glass-panel" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>3. Compras y Servicios</span>
                    <ShoppingCart size={20} style={{ color: '#ef4444' }} />
                  </div>
                  <h2 style={{ margin: '0.5rem 0 0.2rem 0', fontSize: '1.6rem', color: '#ef4444' }}>
                    $ {plData.gastosTotal.toLocaleString()}
                  </h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Luz, agua, insumos y fijos
                  </span>
                </div>

                {/* 4. Resultado Neto (Ganancia Real) */}
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '1.25rem', 
                    borderLeft: `4px solid ${plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}`,
                    background: plData.resultadoNeto >= 0 ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                      4. RESULTADO NETO (Utilidad)
                    </span>
                    {plData.resultadoNeto >= 0 ? <TrendingUp size={20} style={{ color: 'var(--success-color)' }} /> : <TrendingDown size={20} style={{ color: 'var(--danger-color)' }} />}
                  </div>
                  <h2 style={{ margin: '0.5rem 0 0.2rem 0', fontSize: '1.75rem', color: plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                    $ {plData.resultadoNeto.toLocaleString()}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '10px',
                      background: plData.resultadoNeto >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
                    }}>
                      Margen: {plData.margenNetoPct.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>sobre facturación</span>
                  </div>
                </div>
              </div>

              {/* Sección Central: Estado de Resultados P&L Detallado & Desglose de Gastos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                {/* Cuadro de Estado de Resultados (P&L Contable) */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                    <FileText size={18} style={{ color: 'var(--primary-color)' }} />
                    Estado de Resultados del Mes
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {/* (+) Ingresos */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>(+) Facturación Total Bruta</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>$ {plData.ventasTotal.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>• Facturación por Servicios</span>
                      <span>$ {plData.ventasServicios.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>• Venta de Productos al público</span>
                      <span>$ {plData.ventasProductos.toLocaleString()}</span>
                    </div>

                    {/* (-) Comisiones */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginTop: '0.5rem' }}>
                      <span style={{ fontWeight: '600', color: '#f97316' }}>(-) Comisiones de Colaboradores</span>
                      <span style={{ fontWeight: 'bold', color: '#f97316' }}>- $ {plData.comisionesTotal.toLocaleString()}</span>
                    </div>

                    {/* (-) Insumos */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>(-) Compras de Insumos y Tinturas</span>
                      <span>- $ {(plData.gastosPorCategoria['insumos']?.total || 0).toLocaleString()}</span>
                    </div>

                    {/* Margen Bruto */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', margin: '0.5rem 0', fontWeight: '600', fontSize: '0.95rem' }}>
                      <span>(=) Margen Bruto Operativo</span>
                      <span style={{ color: 'var(--primary-color)' }}>
                        $ {(plData.ventasTotal - plData.comisionesTotal - (plData.gastosPorCategoria['insumos']?.total || 0)).toLocaleString()}
                      </span>
                    </div>

                    {/* (-) Gastos Fijos y Servicios */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontWeight: '600', color: '#ef4444' }}>(-) Servicios Públicos y Gastos Fijos</span>
                      <span style={{ fontWeight: 'bold', color: '#ef4444' }}>
                        - $ {(plData.gastosTotal - (plData.gastosPorCategoria['insumos']?.total || 0)).toLocaleString()}
                      </span>
                    </div>
                    {Object.entries(plData.gastosPorCategoria)
                      .filter(([catId, c]) => catId !== 'insumos' && c.total > 0)
                      .map(([catId, c]) => (
                        <div key={catId} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          <span>• {c.label}</span>
                          <span>- $ {c.total.toLocaleString()}</span>
                        </div>
                      ))}

                    {/* (=) Utilidad Neta Final */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '1rem', 
                      background: plData.resultadoNeto >= 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)', 
                      borderRadius: '10px', 
                      marginTop: '1rem',
                      border: `1px solid ${plData.resultadoNeto >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                    }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>(=) UTILIDAD NETA DEL MES</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                          $ {plData.resultadoNeto.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rentabilidad</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: plData.resultadoNeto >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                          {plData.margenNetoPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Composición y Desglose de Gastos */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                    <PieChart size={18} style={{ color: 'var(--primary-color)' }} />
                    Desglose de Compras y Gastos
                  </h3>

                  {plData.gastosTotal === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                      No hay compras ni facturas registradas en este mes.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {CATEGORIAS_GASTOS.map(cat => {
                        const catData = plData.gastosPorCategoria[cat.id]
                        const totalCat = catData ? catData.total : 0
                        if (totalCat <= 0) return null
                        const pct = plData.gastosTotal > 0 ? (totalCat / plData.gastosTotal) * 100 : 0
                        const IconComponent = cat.icon || FileText

                        return (
                          <div key={cat.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                <IconComponent size={14} style={{ color: cat.color }} />
                                {cat.label} ({catData.count})
                              </span>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold' }}>$ {totalCat.toLocaleString()}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'right' }}>
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: '4px', transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Evolución Histórica de los Últimos 6 Meses */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                  <TrendingUp size={18} style={{ color: 'var(--primary-color)' }} />
                  Tendencia Semestral (Facturación vs Costos vs Resultado Neto)
                </h3>

                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th style={{ textAlign: 'right' }}>Facturación / Ventas</th>
                        <th style={{ textAlign: 'right' }}>Costos y Gastos Totales</th>
                        <th style={{ textAlign: 'right' }}>Resultado Neto</th>
                        <th style={{ textAlign: 'right' }}>Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plData.historico6Meses.map(h => (
                        <tr key={h.key} style={{ background: h.key === selectedPlMonth ? 'rgba(180, 97, 42, 0.08)' : 'transparent' }}>
                          <td style={{ fontWeight: h.key === selectedPlMonth ? 'bold' : 'normal', textTransform: 'capitalize' }}>
                            {h.label} {h.key === selectedPlMonth && '📍 (Actual)'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '500' }}>
                            $ {h.ventas.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', color: '#ef4444' }}>
                            $ {h.costos.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: h.resultado >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                            $ {h.resultado.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: h.resultado >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                            {h.margen.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CARGAR / EDITAR FACTURA O GASTO OPERATIVO          */}
      {/* ========================================================= */}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>{editingCompraId ? 'Editar Factura o Gasto' : 'Cargar Factura o Gasto'}</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => { setShowModal(false); resetModalForm() }}>✕</button>
            </div>
            
            <div className="modal-body">
              {/* Paso 1: Selector Visual de Categoría */}
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                1. Selecciona la Categoría del Comprobante *
              </label>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {CATEGORIAS_GASTOS.map(cat => {
                  const IconComp = cat.icon || FileText
                  const isSelected = formCategoria === cat.id

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormCategoria(cat.id)}
                      style={{
                        padding: '0.6rem 0.5rem',
                        borderRadius: '10px',
                        border: isSelected ? `2px solid ${cat.color}` : '1px solid var(--surface-border)',
                        background: isSelected ? cat.bg : 'rgba(255, 255, 255, 0.02)',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        textAlign: 'center'
                      }}
                    >
                      <IconComp size={20} style={{ color: cat.color }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: isSelected ? '600' : '400', lineHeight: '1.1' }}>
                        {cat.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <form id="nueva-compra-form" onSubmit={handleSubmit}>
                {/* Paso 2: Datos de Cabecera del Comprobante */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                  <div className="input-group">
                    <label>Proveedor / Empresa *</label>
                    <input 
                      required 
                      type="text" 
                      className="input-field" 
                      name="proveedor" 
                      placeholder={formCategoria === 'electricidad' ? 'Ej. EDESUR / EDENOR' : formCategoria === 'agua' ? 'Ej. AySA' : formCategoria === 'insumos' ? 'Ej. L\'Oreal, Silkey' : 'Nombre de la empresa'} 
                      value={formData.proveedor} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="input-group">
                    <label>Tipo Comprobante *</label>
                    <select className="input-field" name="tipo_comprobante" value={formData.tipo_comprobante} onChange={handleInputChange}>
                      {TIPOS_COMPROBANTE.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="input-group">
                    <label>N° Comprobante / Factura</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      name="numero_remito_factura" 
                      placeholder="Ej. 0001-00045213"
                      value={formData.numero_remito_factura} 
                      onChange={handleInputChange} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div className="input-group">
                    <label>Fecha de Emisión *</label>
                    <input required type="date" className="input-field" name="fecha" value={formData.fecha} onChange={handleInputChange} />
                  </div>

                  <div className="input-group">
                    <label>Fecha de Vencimiento</label>
                    <input type="date" className="input-field" name="fecha_vencimiento" value={formData.fecha_vencimiento} onChange={handleInputChange} />
                  </div>

                  <div className="input-group">
                    <label>Estado de Pago *</label>
                    <select className="input-field" name="estado_pago" value={formData.estado_pago} onChange={handleInputChange}>
                      <option value="pagado">Pagado</option>
                      <option value="pendiente">Pendiente de Pago</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label>Medio de Pago</label>
                    <select className="input-field" name="medio_pago" value={formData.medio_pago} onChange={handleInputChange}>
                      {MEDIOS_PAGO.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Selector de 1, 2 o 3 Cuotas (EXCLUSIVO cuando se elige Tarjeta de Crédito) */}
                {formData.medio_pago === 'tarjeta_credito' && (
                  <div style={{ marginBottom: '1.15rem', padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(47, 127, 120, 0.1)', border: '1px solid rgba(47, 127, 120, 0.3)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#c4b5fd' }}>
                        💳 Pago con Tarjeta de Crédito — Cantidad de Cuotas
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Selecciona en cuántas cuotas se realizó esta compra o pago
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[1, 2, 3].map(n => {
                        const active = Number(formData.cuotas || 1) === n
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, cuotas: n }))}
                            style={{
                              padding: '0.45rem 0.95rem',
                              borderRadius: '8px',
                              fontWeight: '700',
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                              border: active ? '2px solid #2F7F78' : '1px solid rgba(255,255,255,0.15)',
                              background: active ? 'rgba(47, 127, 120, 0.3)' : 'rgba(0,0,0,0.25)',
                              color: active ? '#fff' : 'var(--text-secondary)',
                              transition: 'all 0.15s'
                            }}
                          >
                            {n} {n === 1 ? 'Cuota' : 'Cuotas'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Opción para descontar del efectivo de la Caja diaria actual cuando se paga en Efectivo */}
                {!editingCompraId && formData.estado_pago === 'pagado' && formData.medio_pago === 'efectivo' && (
                  <div style={{ marginBottom: '1.15rem', padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '600' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.descontar_de_caja)}
                        onChange={(e) => setFormData(prev => ({ ...prev, descontar_de_caja: e.target.checked }))}
                        style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                      />
                      <span>
                        💵 Descontar del efectivo de la Caja diaria actual
                        <small style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: '400', marginTop: '0.1rem' }}>
                          Registra automáticamente este egreso en el turno abierto para que se descuente del Efectivo Esperado al cerrar caja.
                        </small>
                      </span>
                    </label>
                  </div>
                )}

                {/* Paso 3: Detalle Económico */}
                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem', marginBottom: '1rem' }}>
                  {formCategoria === 'insumos' ? (
                    <div>
                      {/* Toggle Modo Insumos */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1rem' }}>Detalle de Insumos</h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {modoInsumosArticulos ? 'Añade artículos para actualizar inventario automáticamente' : 'Carga rápida por monto directo'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem', borderRadius: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setModoInsumosArticulos(true)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.75rem',
                              borderRadius: '6px',
                              border: 'none',
                              cursor: 'pointer',
                              background: modoInsumosArticulos ? 'var(--primary-color)' : 'transparent',
                              color: modoInsumosArticulos ? '#fff' : 'var(--text-secondary)'
                            }}
                          >
                            Desglosar Artículos (Stock)
                          </button>
                          <button
                            type="button"
                            onClick={() => setModoInsumosArticulos(false)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.75rem',
                              borderRadius: '6px',
                              border: 'none',
                              cursor: 'pointer',
                              background: !modoInsumosArticulos ? 'var(--primary-color)' : 'transparent',
                              color: !modoInsumosArticulos ? '#fff' : 'var(--text-secondary)'
                            }}
                          >
                            Monto Global
                          </button>
                        </div>
                      </div>

                      {modoInsumosArticulos ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                            <button type="button" className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={agregarDetalle}>
                              + Agregar Artículo
                            </button>
                          </div>

                          {detalles.length === 0 ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              Haz clic en "+ Agregar Artículo" para seleccionar los productos que ingresaron al stock.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {detalles.map(detalle => (
                                <div key={detalle.id_temp} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px', flexWrap: 'wrap' }}>
                                  <select 
                                    required
                                    className="input-field" 
                                    style={{ flex: 1, minWidth: '180px', padding: '0.45rem' }}
                                    value={detalle.articulo_id}
                                    onChange={(e) => actualizarDetalle(detalle.id_temp, 'articulo_id', e.target.value)}
                                  >
                                    <option value="">Selecciona Artículo...</option>
                                    {articulosDb.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                  </select>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '110px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cant:</span>
                                    <input 
                                      type="number" min="1" step="1" required
                                      className="input-field" 
                                      style={{ width: '100%', padding: '0.45rem' }}
                                      value={detalle.cantidad}
                                      onChange={(e) => actualizarDetalle(detalle.id_temp, 'cantidad', e.target.value)}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '130px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Costo: $</span>
                                    <input 
                                      type="number" min="0" step="0.01" required
                                      className="input-field" 
                                      style={{ width: '100%', padding: '0.45rem' }}
                                      value={detalle.precio_costo_unitario}
                                      onChange={(e) => actualizarDetalle(detalle.id_temp, 'precio_costo_unitario', e.target.value)}
                                    />
                                  </div>

                                  <div style={{ width: '100px', textAlign: 'right', fontWeight: 'bold' }}>
                                    $ {(Number(detalle.cantidad) * Number(detalle.precio_costo_unitario)).toLocaleString()}
                                  </div>

                                  <button type="button" className="btn btn-secondary" style={{ padding: '0.45rem', color: 'var(--danger-color)', border: 'none' }} onClick={() => removerDetalle(detalle.id_temp)}>
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                          <div className="input-group">
                            <label>Descripción / Concepto</label>
                            <input 
                              type="text" 
                              className="input-field" 
                              name="concepto_directo" 
                              placeholder="Ej. Tinturas, decolorantes y oxidantes del mes" 
                              value={formData.concepto_directo} 
                              onChange={handleInputChange} 
                            />
                          </div>
                          <div className="input-group">
                            <label>Monto Total Factura ($) *</label>
                            <input 
                              required 
                              type="number" 
                              min="0.01" 
                              step="0.01" 
                              className="input-field" 
                              name="monto_directo" 
                              placeholder="0.00" 
                              value={formData.monto_directo} 
                              onChange={handleInputChange} 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Servicios Públicos y Gastos Fijos (Luz, Agua, etc.) */
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                      <div className="input-group">
                        <label>Detalle / Período del Servicio</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          name="concepto_directo" 
                          placeholder={formCategoria === 'electricidad' ? 'Ej. Consumo período Agosto 2026' : formCategoria === 'agua' ? 'Ej. Bimestre 4 AySA' : formCategoria === 'alquiler' ? 'Ej. Alquiler local mes en curso' : 'Detalle del gasto'} 
                          value={formData.concepto_directo} 
                          onChange={handleInputChange} 
                        />
                      </div>
                      <div className="input-group">
                        <label>Monto Total Factura ($) *</label>
                        <input 
                          required 
                          type="number" 
                          min="0.01" 
                          step="0.01" 
                          className="input-field" 
                          name="monto_directo" 
                          placeholder="0.00" 
                          value={formData.monto_directo} 
                          onChange={handleInputChange} 
                        />
                      </div>
                    </div>
                  )}

                  {/* Notas y Adjunto */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div className="input-group">
                      <label>Observaciones / Notas</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        name="notas" 
                        placeholder="Comentarios adicionales opcionales..." 
                        value={formData.notas} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="input-group">
                      <label>Adjuntar Foto / Factura (Opcional)</label>
                      <input 
                        type="file" 
                        accept="image/*,application/pdf" 
                        className="input-field" 
                        onChange={handleFileChange} 
                        style={{ padding: '0.35rem' }}
                      />
                    </div>
                  </div>

                  {/* Totalizador del Formulario */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '1.2rem' }}>
                      <span style={{ color: 'var(--text-secondary)', marginRight: '1rem' }}>Total Comprobante:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--success-color)' }}>$ {calcularTotalFormulario().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetModalForm() }} disabled={isSubmitting}>Cancelar</button>
              <button type="submit" form="nueva-compra-form" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : (editingCompraId ? 'Guardar Cambios' : 'Guardar Comprobante')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL: VER DETALLE DE COMPROBANTE                         */}
      {/* ========================================================= */}
      {selectedCompraDetalle && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2>Detalle del Comprobante</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setSelectedCompraDetalle(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Proveedor</span>
                  <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{selectedCompraDetalle.proveedor || 'S/D'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Categoría</span>
                  <div>
                    {(() => {
                      const c = getCategoriaInfo(selectedCompraDetalle.categoria)
                      return (
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '10px', fontSize: '0.8rem', background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                          {c.label}
                        </span>
                      )
                    })()}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Comprobante</span>
                  <div>{selectedCompraDetalle.tipo_comprobante} N° {selectedCompraDetalle.numero_remito_factura || 'S/N'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fecha Emisión / Vto</span>
                  <div>
                    {new Date(selectedCompraDetalle.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                    {selectedCompraDetalle.fecha_vencimiento && ` (Vence: ${new Date(selectedCompraDetalle.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-AR')})`}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Estado y Medio de Pago</span>
                  <div style={{ textTransform: 'capitalize', fontWeight: '600' }}>
                    {selectedCompraDetalle.estado_pago} • {formatMedioPagoCompra(selectedCompraDetalle)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Monto Total</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--success-color)' }}>
                    $ {Number(selectedCompraDetalle.total_compra || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {getNotasLimpiasCompra(selectedCompraDetalle.notas) && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                  <strong>Notas / Detalle:</strong> {getNotasLimpiasCompra(selectedCompraDetalle.notas)}
                </div>
              )}

              {/* Renglones / Artículos */}
              {selectedCompraDetalle.detalles && selectedCompraDetalle.detalles.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Artículos / Conceptos Asociados:</h4>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Concepto / Artículo</th>
                          <th style={{ textAlign: 'center' }}>Cant.</th>
                          <th style={{ textAlign: 'right' }}>Costo Un.</th>
                          <th style={{ textAlign: 'right' }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCompraDetalle.detalles.map(d => (
                          <tr key={d.id}>
                            <td>{d.articulos?.nombre || d.descripcion || 'Gasto registrado'}</td>
                            <td style={{ textAlign: 'center' }}>{d.cantidad}</td>
                            <td style={{ textAlign: 'right' }}>$ {Number(d.precio_costo_unitario).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>$ {Number(d.subtotal).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Comprobante Adjunto */}
              {selectedCompraDetalle.comprobante_url && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Comprobante Adjunto:</span>
                  <img 
                    src={selectedCompraDetalle.comprobante_url} 
                    alt="Comprobante" 
                    style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', border: '1px solid var(--surface-border)' }} 
                  />
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <button 
                className="btn btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => handleEditCompra(selectedCompraDetalle)}
              >
                <Edit size={15} /> Editar Comprobante
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedCompraDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
