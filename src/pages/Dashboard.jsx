import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { TrendingUp, FileText, Users, Calendar, Filter, Scissors, ShoppingBag, Wallet, Package } from 'lucide-react'
import { esOperador } from '../lib/roles'

const PALETTE = [
  '#B4612A', // Indigo / Primary
  '#5E8C77', // Pink / Accent
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#2F7F78', // Violet
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#64748b'  // Slate / Otros
]

// Componente Donut SVG liviano y reactivo
function DonutChart({ items, totalValue, label, isCurrency = false }) {
  if (!items || items.length === 0 || totalValue === 0) {
    return (
      <div style={{ 
        width: '130px', 
        height: '130px', 
        borderRadius: '50%', 
        border: '3px dashed var(--surface-border)', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        color: 'var(--text-secondary)', 
        fontSize: '0.75rem', 
        textAlign: 'center', 
        padding: '0.5rem' 
      }}>
        <span>Sin registros</span>
      </div>
    )
  }

  const radius = 42
  const circumference = 2 * Math.PI * radius
  let accumulatedPercent = 0

  const formatCenter = (num) => {
    if (!isCurrency) return num.toLocaleString()
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
    if (num >= 10000) return `$${Math.round(num / 1000)}k`
    return `$${num.toLocaleString()}`
  }

  return (
    <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="130" height="130" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
        {/* Círculo base */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="14"
        />
        {/* Segmentos de la dona */}
        {items.map((item, idx) => {
          const percent = (item.pct || 0) / 100
          const strokeDasharray = `${percent * circumference} ${circumference}`
          const strokeDashoffset = -accumulatedPercent * circumference
          accumulatedPercent += percent

          return (
            <circle
              key={idx}
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke={item.color}
              strokeWidth="14"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease' }}
            >
              <title>{`${item.nombre}: ${item.valueLabel} (${item.pct}%)`}</title>
            </circle>
          )
        })}
      </svg>
      {/* Texto central */}
      <div style={{ position: 'absolute', textAlign: 'center', pointerEvents: 'none', maxWidth: '85px', overflow: 'hidden' }}>
        <div style={{ 
          fontSize: isCurrency ? '0.95rem' : '1.25rem', 
          fontWeight: 'bold', 
          color: isCurrency ? 'var(--success-color)' : 'var(--text-primary)', 
          lineHeight: 1.1 
        }}>
          {formatCenter(totalValue)}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { userProfile, activeEmpresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [rawOrdenes, setRawOrdenes] = useState([])
  const [rawClientes, setRawClientes] = useState([])
  const [serviciosDb, setServiciosDb] = useState([])
  const [articulosDb, setArticulosDb] = useState([])

  // Selector de período: 'mes' | 'ano' | 'ultimos30' | 'todo' | 'personalizado'
  const [periodo, setPeriodo] = useState('mes')

  // Criterios de ordenación de Top (cantidad o monto)
  const [criterioServicios, setCriterioServicios] = useState('cantidad') // 'cantidad' | 'monto'
  const [criterioProductos, setCriterioProductos] = useState('cantidad') // 'cantidad' | 'monto'

  // Fechas para rango personalizado (valores iniciales)
  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const monthStartStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [fechaDesde, setFechaDesde] = useState(monthStartStr)
  const [fechaHasta, setFechaHasta] = useState(todayStr)

  const rawRol = (userProfile?.rol || '').toLowerCase().trim()
  const isOperator = esOperador(userProfile)

  useEffect(() => {
    if (activeEmpresaId) {
      fetchDashboardData()
    }
  }, [activeEmpresaId, userProfile])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // 1. Clientes
      const { data: clientesData, error: errClientes } = await supabase
        .from('clientes')
        .select('id, created_at')
        .eq('empresa_id', activeEmpresaId)

      if (errClientes) console.warn('Error fetching clientes:', errClientes)

      // 2. Catálogos de Servicios y Artículos para mapear nombres en los Tops
      let serviciosList = []
      let articulosList = []
      try {
        const [resServicios, resArticulos] = await Promise.all([
          supabase
            .from('servicios')
            .select('id, nombre')
            .eq('empresa_id', activeEmpresaId),
          supabase
            .from('articulos')
            .select('id, nombre')
            .eq('empresa_id', activeEmpresaId)
        ])
        serviciosList = resServicios.data || []
        articulosList = resArticulos.data || []
      } catch (errRef) {
        console.warn('Error fetching catalogos:', errRef)
      }

      // 3. Órdenes con detalles para métricas, gráficos y tops
      const { data: ordenesData, error: errOrdenes } = await supabase
        .from('ordenes_trabajo')
        .select(`
          id, 
          fecha_hora, 
          total_economico, 
          estado, 
          cliente_id,
          clientes (nombre, apellido), 
          usuarios (nombre_completo),
          ordenes_trabajo_detalles (*)
        `)
        .eq('empresa_id', activeEmpresaId)
        .order('fecha_hora', { ascending: false })

      if (errOrdenes) {
        console.error('Error fetching ordenes con detalles:', errOrdenes)
        // Fallback de contingencia: consultar órdenes sin detalles
        const { data: fallbackOrdenes } = await supabase
          .from('ordenes_trabajo')
          .select(`
            id, 
            fecha_hora, 
            total_economico, 
            estado, 
            cliente_id,
            clientes (nombre, apellido), 
            usuarios (nombre_completo)
          `)
          .eq('empresa_id', activeEmpresaId)
          .order('fecha_hora', { ascending: false })
        
        setRawOrdenes(fallbackOrdenes || [])
      } else {
        setRawOrdenes(ordenesData || [])
      }

      setServiciosDb(serviciosList)
      setArticulosDb(articulosList)
      setRawClientes(clientesData || [])
    } catch (error) {
      console.error('Error fetching dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  // Helper para determinar rango Date de inicio y fin según el período
  const getPeriodRange = () => {
    const now = new Date()
    let start = null
    let end = null

    if (periodo === 'mes') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else if (periodo === 'ano') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    } else if (periodo === 'ultimos30') {
      start = new Date(now)
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      end = new Date(now)
      end.setHours(23, 59, 59, 999)
    } else if (periodo === 'personalizado') {
      if (fechaDesde) {
        const [y, m, d] = fechaDesde.split('-').map(Number)
        start = new Date(y, m - 1, d, 0, 0, 0, 0)
      }
      if (fechaHasta) {
        const [y, m, d] = fechaHasta.split('-').map(Number)
        end = new Date(y, m - 1, d, 23, 59, 59, 999)
      }
    } else if (periodo === 'todo') {
      start = null
      end = null
    }

    return { start, end }
  }

  // Etiqueta legible del período activo
  const getPeriodoLabel = () => {
    const now = new Date()
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    if (periodo === 'mes') {
      return `${monthNames[now.getMonth()]} ${now.getFullYear()}`
    }
    if (periodo === 'ano') {
      return `Año ${now.getFullYear()}`
    }
    if (periodo === 'ultimos30') {
      return 'Últimos 30 días'
    }
    if (periodo === 'todo') {
      return 'Histórico Total'
    }
    if (periodo === 'personalizado') {
      return `${fechaDesde || '...'} a ${fechaHasta || '...'}`
    }
    return ''
  }

  // Filtrar órdenes por el período seleccionado
  const ordenesFiltradas = useMemo(() => {
    const { start, end } = getPeriodRange()
    return rawOrdenes.filter(orden => {
      if (orden.estado === 'eliminada') return false
      const d = new Date(orden.fecha_hora)
      if (start && d < start) return false
      if (end && d > end) return false
      return true
    })
  }, [rawOrdenes, periodo, fechaDesde, fechaHasta])

  // Métricas agregadas del período seleccionado
  const stats = useMemo(() => {
    const { start, end } = getPeriodRange()

    let totalOrdenes = 0
    let completadas = 0
    let pendientes = 0
    let canceladas = 0

    let totalIngresos = 0
    let ingresosServicios = 0
    let ingresosProductos = 0

    let cantidadServicios = 0
    let cantidadProductos = 0

    const clientesAtendidosSet = new Set()

    ordenesFiltradas.forEach(orden => {
      totalOrdenes++
      if (orden.cliente_id) {
        clientesAtendidosSet.add(orden.cliente_id)
      }

      if (orden.estado === 'cancelada') {
        canceladas++
      } else if (orden.estado === 'completada') {
        completadas++
        const totalVal = Number(orden.total_economico || 0)
        totalIngresos += totalVal

        if (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0) {
          orden.ordenes_trabajo_detalles.forEach(det => {
            const qty = Number(det.cantidad || 1)
            if (det.tipo_item === 'servicio') {
              ingresosServicios += Number(det.subtotal || 0)
              cantidadServicios += qty
            } else {
              ingresosProductos += Number(det.subtotal || 0)
              cantidadProductos += qty
            }
          })
        } else {
          ingresosServicios += totalVal
          cantidadServicios += 1
        }
      } else {
        pendientes++
      }
    })

    // Clientes nuevos registrados en el período
    let clientesNuevos = 0
    rawClientes.forEach(c => {
      if (c.created_at) {
        const cd = new Date(c.created_at)
        if (start && cd < start) return
        if (end && cd > end) return
        clientesNuevos++
      }
    })

    return {
      ordenes: {
        total: totalOrdenes,
        completadas,
        pendientes,
        canceladas
      },
      ingresos: {
        total: totalIngresos,
        servicios: ingresosServicios,
        productos: ingresosProductos
      },
      cantidades: {
        total: cantidadServicios + cantidadProductos,
        servicios: cantidadServicios,
        productos: cantidadProductos
      },
      clientes: {
        atendidos: clientesAtendidosSet.size,
        nuevos: clientesNuevos,
        totalGlobal: rawClientes.length
      }
    }
  }, [ordenesFiltradas, rawClientes, periodo, fechaDesde, fechaHasta])

  // Datos para el gráfico dinámico según el período
  const chartData = useMemo(() => {
    const { start, end } = getPeriodRange()
    const now = new Date()

    // 1. AÑO EN CURSO -> Agrupado por los 12 meses
    if (periodo === 'ano') {
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const months = []
      for (let m = 0; m < 12; m++) {
        months.push({
          dateStr: monthNamesShort[m],
          monthIdx: m,
          serviciosRevenue: 0,
          productosRevenue: 0,
          totalRevenue: 0,
          serviciosCount: 0,
          productosCount: 0,
          totalCount: 0
        })
      }

      ordenesFiltradas.forEach(orden => {
        if (orden.estado !== 'completada') return
        const d = new Date(orden.fecha_hora)
        const m = d.getMonth()
        const target = months[m]
        if (!target) return

        const totalVal = Number(orden.total_economico || 0)
        let servTotal = 0
        let prodTotal = 0
        let servQty = 0
        let prodQty = 0

        if (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0) {
          orden.ordenes_trabajo_detalles.forEach(det => {
            const qty = Number(det.cantidad || 1)
            if (det.tipo_item === 'servicio') {
              servTotal += Number(det.subtotal || 0)
              servQty += qty
            } else {
              prodTotal += Number(det.subtotal || 0)
              prodQty += qty
            }
          })
        } else {
          servTotal = totalVal
          servQty = 1
        }

        target.serviciosRevenue += servTotal
        target.productosRevenue += prodTotal
        target.totalRevenue += totalVal
        target.serviciosCount += servQty
        target.productosCount += prodQty
        target.totalCount += (servQty + prodQty)
      })

      return months.map(m => ({
        dateStr: m.dateStr,
        servicios: isOperator ? m.serviciosCount : m.serviciosRevenue,
        productos: isOperator ? m.productosCount : m.productosRevenue,
        total: isOperator ? m.totalCount : m.totalRevenue
      }))
    }

    // 2. VER TODO -> Agrupado cronológicamente por mes
    if (periodo === 'todo') {
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const map = {}

      ordenesFiltradas.forEach(orden => {
        if (orden.estado !== 'completada') return
        const d = new Date(orden.fecha_hora)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = `${monthNamesShort[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`

        if (!map[key]) {
          map[key] = {
            key,
            dateStr: label,
            serviciosRevenue: 0,
            productosRevenue: 0,
            totalRevenue: 0,
            serviciosCount: 0,
            productosCount: 0,
            totalCount: 0
          }
        }

        const totalVal = Number(orden.total_economico || 0)
        let servTotal = 0
        let prodTotal = 0
        let servQty = 0
        let prodQty = 0

        if (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0) {
          orden.ordenes_trabajo_detalles.forEach(det => {
            const qty = Number(det.cantidad || 1)
            if (det.tipo_item === 'servicio') {
              servTotal += Number(det.subtotal || 0)
              servQty += qty
            } else {
              prodTotal += Number(det.subtotal || 0)
              prodQty += qty
            }
          })
        } else {
          servTotal = totalVal
          servQty = 1
        }

        map[key].serviciosRevenue += servTotal
        map[key].productosRevenue += prodTotal
        map[key].totalRevenue += totalVal
        map[key].serviciosCount += servQty
        map[key].productosCount += prodQty
        map[key].totalCount += (servQty + prodQty)
      })

      const sorted = Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
      if (sorted.length === 0) {
        return [{ dateStr: 'Sin datos', servicios: 0, productos: 0, total: 0 }]
      }
      return sorted.map(m => ({
        dateStr: m.dateStr,
        servicios: isOperator ? m.serviciosCount : m.serviciosRevenue,
        productos: isOperator ? m.productosCount : m.productosRevenue,
        total: isOperator ? m.totalCount : m.totalRevenue
      }))
    }

    // 3. MES EN CURSO, ÚLTIMOS 30 DÍAS o PERSONALIZADO
    let sDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1)
    let eDate = end ? new Date(end) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const diffDays = Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24))

    // Si el rango personalizado supera 35 días, agrupar por mes
    if (diffDays > 35) {
      const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const map = {}
      const cur = new Date(sDate.getFullYear(), sDate.getMonth(), 1)
      while (cur <= eDate) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
        map[key] = {
          key,
          dateStr: `${monthNamesShort[cur.getMonth()]} ${String(cur.getFullYear()).slice(-2)}`,
          serviciosRevenue: 0,
          productosRevenue: 0,
          totalRevenue: 0,
          serviciosCount: 0,
          productosCount: 0,
          totalCount: 0
        }
        cur.setMonth(cur.getMonth() + 1)
      }

      ordenesFiltradas.forEach(orden => {
        if (orden.estado !== 'completada') return
        const d = new Date(orden.fecha_hora)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (map[key]) {
          const totalVal = Number(orden.total_economico || 0)
          let servTotal = 0
          let prodTotal = 0
          let servQty = 0
          let prodQty = 0

          if (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0) {
            orden.ordenes_trabajo_detalles.forEach(det => {
              const qty = Number(det.cantidad || 1)
              if (det.tipo_item === 'servicio') {
                servTotal += Number(det.subtotal || 0)
                servQty += qty
              } else {
                prodTotal += Number(det.subtotal || 0)
                prodQty += qty
              }
            })
          } else {
            servTotal = totalVal
            servQty = 1
          }

          map[key].serviciosRevenue += servTotal
          map[key].productosRevenue += prodTotal
          map[key].totalRevenue += totalVal
          map[key].serviciosCount += servQty
          map[key].productosCount += prodQty
          map[key].totalCount += (servQty + prodQty)
        }
      })

      return Object.values(map).map(m => ({
        dateStr: m.dateStr,
        servicios: isOperator ? m.serviciosCount : m.serviciosRevenue,
        productos: isOperator ? m.productosCount : m.productosRevenue,
        total: isOperator ? m.totalCount : m.totalRevenue
      }))
    }

    // Agrupar día a día
    const days = []
    const cur = new Date(sDate)
    cur.setHours(0, 0, 0, 0)
    const last = new Date(eDate)
    last.setHours(23, 59, 59, 999)

    while (cur <= last) {
      days.push({
        dateStr: cur.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        dateKey: cur.toDateString(),
        serviciosRevenue: 0,
        productosRevenue: 0,
        totalRevenue: 0,
        serviciosCount: 0,
        productosCount: 0,
        totalCount: 0
      })
      cur.setDate(cur.getDate() + 1)
    }

    ordenesFiltradas.forEach(orden => {
      if (orden.estado !== 'completada') return
      const ordenDate = new Date(orden.fecha_hora)
      const dayKey = ordenDate.toDateString()
      const target = days.find(d => d.dateKey === dayKey)
      if (!target) return

      const totalVal = Number(orden.total_economico || 0)
      let servTotal = 0
      let prodTotal = 0
      let servQty = 0
      let prodQty = 0

      if (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0) {
        orden.ordenes_trabajo_detalles.forEach(det => {
          const qty = Number(det.cantidad || 1)
          if (det.tipo_item === 'servicio') {
            servTotal += Number(det.subtotal || 0)
            servQty += qty
          } else {
            prodTotal += Number(det.subtotal || 0)
            prodQty += qty
          }
        })
      } else {
        servTotal = totalVal
        servQty = 1
      }

      target.serviciosRevenue += servTotal
      target.productosRevenue += prodTotal
      target.totalRevenue += totalVal
      target.serviciosCount += servQty
      target.productosCount += prodQty
      target.totalCount += (servQty + prodQty)
    })

    return days.map(d => ({
      dateStr: d.dateStr,
      servicios: isOperator ? d.serviciosCount : d.serviciosRevenue,
      productos: isOperator ? d.productosCount : d.productosRevenue,
      total: isOperator ? d.totalCount : d.totalRevenue
    }))
  }, [ordenesFiltradas, periodo, fechaDesde, fechaHasta, isOperator])

  // Valor máximo para escalar las barras proporcionalmente
  const maxBarValue = useMemo(() => {
    const maxVal = Math.max(...chartData.map(d => d.total), 0)
    return maxVal > 0 ? maxVal : 1000
  }, [chartData])

  const chartTitle = useMemo(() => {
    const pLabel = getPeriodoLabel()
    if (isOperator) {
      return `Volumen de Trabajo — ${pLabel}`
    }
    return `Ingresos — ${pLabel}`
  }, [isOperator, periodo, fechaDesde, fechaHasta])

  const chartSubtitle = useMemo(() => {
    if (periodo === 'ano' || periodo === 'todo') {
      return isOperator 
        ? 'Cantidad mensual de Servicios realizados y Productos consumidos' 
        : 'Ventas mensuales divididas en Servicios y Productos'
    }
    return isOperator 
      ? 'Cantidad diaria de Servicios realizados y Productos consumidos' 
      : 'Ventas diarias divididas en Servicios y Productos'
  }, [isOperator, periodo])

  // =========================================================================
  // CÁLCULO DE TOP SERVICIOS Y TOP PRODUCTOS (AFECTADOS POR EL PERÍODO)
  // =========================================================================
  const topItemsData = useMemo(() => {
    const servMap = {}
    serviciosDb.forEach(s => { servMap[s.id] = s.nombre })

    const artMap = {}
    articulosDb.forEach(a => { artMap[a.id] = a.nombre })

    const serviciosMap = {}
    const productosMap = {}

    ordenesFiltradas.forEach(orden => {
      if (orden.estado === 'cancelada' || orden.estado === 'eliminada') return

      if (orden.ordenes_trabajo_detalles && Array.isArray(orden.ordenes_trabajo_detalles)) {
        orden.ordenes_trabajo_detalles.forEach(d => {
          const qty = Number(d.cantidad || 1)
          const subtotal = Number(d.subtotal || 0)

          if (d.tipo_item === 'servicio') {
            const id = d.servicio_id || d.item_id || 'otro_servicio'
            const nombre = servMap[id] || 'Servicio'
            if (!serviciosMap[id]) {
              serviciosMap[id] = { id, nombre, cantidad: 0, ingresos: 0 }
            }
            serviciosMap[id].cantidad += qty
            serviciosMap[id].ingresos += subtotal
          } else {
            const id = d.articulo_id || d.item_id || 'otro_producto'
            const nombre = artMap[id] || 'Producto'
            if (!productosMap[id]) {
              productosMap[id] = { id, nombre, cantidad: 0, ingresos: 0 }
            }
            productosMap[id].cantidad += qty
            productosMap[id].ingresos += subtotal
          }
        })
      }
    })

    return {
      servicios: Object.values(serviciosMap),
      productos: Object.values(productosMap)
    }
  }, [ordenesFiltradas, serviciosDb, articulosDb])

  // Top Servicios procesados con porcentajes y colores
  const topServiciosProcessed = useMemo(() => {
    const list = [...topItemsData.servicios]
    const sortBy = (!isOperator && criterioServicios === 'monto') ? 'ingresos' : 'cantidad'
    list.sort((a, b) => b[sortBy] - a[sortBy])

    const totalMetric = list.reduce((acc, curr) => acc + curr[sortBy], 0)
    const totalQty = list.reduce((acc, curr) => acc + curr.cantidad, 0)
    const totalIngresos = list.reduce((acc, curr) => acc + curr.ingresos, 0)

    const top5 = list.slice(0, 5)
    const rest = list.slice(5)

    const formatted = top5.map((item, idx) => ({
      ...item,
      color: PALETTE[idx % PALETTE.length],
      pct: totalMetric > 0 ? Math.round((item[sortBy] / totalMetric) * 100) : 0,
      valueLabel: (!isOperator && criterioServicios === 'monto')
        ? `$${item.ingresos.toLocaleString()}`
        : `${item.cantidad} u.`
    }))

    if (rest.length > 0) {
      const restMetric = rest.reduce((acc, curr) => acc + curr[sortBy], 0)
      const restQty = rest.reduce((acc, curr) => acc + curr.cantidad, 0)
      const restIngresos = rest.reduce((acc, curr) => acc + curr.ingresos, 0)
      formatted.push({
        id: 'otros_servicios',
        nombre: `Otros servicios (${rest.length})`,
        cantidad: restQty,
        ingresos: restIngresos,
        color: PALETTE[PALETTE.length - 1],
        pct: totalMetric > 0 ? Math.max(1, Math.round((restMetric / totalMetric) * 100)) : 0,
        valueLabel: (!isOperator && criterioServicios === 'monto')
          ? `$${restIngresos.toLocaleString()}`
          : `${restQty} u.`
      })
    }

    return { items: formatted, totalMetric, totalQty, totalIngresos }
  }, [topItemsData.servicios, criterioServicios, isOperator])

  // Top Productos procesados con porcentajes y colores
  const topProductosProcessed = useMemo(() => {
    const list = [...topItemsData.productos]
    const sortBy = (!isOperator && criterioProductos === 'monto') ? 'ingresos' : 'cantidad'
    list.sort((a, b) => b[sortBy] - a[sortBy])

    const totalMetric = list.reduce((acc, curr) => acc + curr[sortBy], 0)
    const totalQty = list.reduce((acc, curr) => acc + curr.cantidad, 0)
    const totalIngresos = list.reduce((acc, curr) => acc + curr.ingresos, 0)

    const top5 = list.slice(0, 5)
    const rest = list.slice(5)

    const formatted = top5.map((item, idx) => ({
      ...item,
      color: PALETTE[idx % PALETTE.length],
      pct: totalMetric > 0 ? Math.round((item[sortBy] / totalMetric) * 100) : 0,
      valueLabel: (!isOperator && criterioProductos === 'monto')
        ? `$${item.ingresos.toLocaleString()}`
        : `${item.cantidad} u.`
    }))

    if (rest.length > 0) {
      const restMetric = rest.reduce((acc, curr) => acc + curr[sortBy], 0)
      const restQty = rest.reduce((acc, curr) => acc + curr.cantidad, 0)
      const restIngresos = rest.reduce((acc, curr) => acc + curr.ingresos, 0)
      formatted.push({
        id: 'otros_productos',
        nombre: `Otros productos (${rest.length})`,
        cantidad: restQty,
        ingresos: restIngresos,
        color: PALETTE[PALETTE.length - 1],
        pct: totalMetric > 0 ? Math.max(1, Math.round((restMetric / totalMetric) * 100)) : 0,
        valueLabel: (!isOperator && criterioProductos === 'monto')
          ? `$${restIngresos.toLocaleString()}`
          : `${restQty} u.`
      })
    }

    return { items: formatted, totalMetric, totalQty, totalIngresos }
  }, [topItemsData.productos, criterioProductos, isOperator])

  if (isOperator) {
    const todayOrdenes = rawOrdenes.filter(o => {
      const f = o.fecha_creacion || o.created_at
      if (!f) return false
      const d = new Date(f)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return ds === todayStr
    })

    const quickModules = [
      { to: '/agenda', title: 'Agenda de Turnos', desc: 'Ver y agendar turnos de clientas', icon: Calendar, color: '#B4612A' },
      { to: '/ordenes', title: 'Comandas y Cobros', desc: 'Registrar atenciones y cobrar en efectivo, tarjeta o transferencia', icon: FileText, color: '#10b981' },
      { to: '/caja', title: 'Caja Diaria y Cierre', desc: 'Ver movimientos del día, anotar gastos de caja chica y cerrar caja', icon: Wallet, color: '#f59e0b' },
      { to: '/clientes', title: 'Clientes', desc: 'Registrar nuevas clientas y consultar fichas', icon: Users, color: '#5E8C77' },
      { to: '/servicios', title: 'Catálogo de Servicios', desc: 'Agregar nuevos servicios o proponer actualización de precios', icon: Scissors, color: '#2F7F78' },
      { to: '/stock', title: 'Productos y Stock', desc: 'Agregar productos, registrar ingresos de stock o solicitar bajas', icon: Package, color: '#06b6d4' },
      { to: '/compras', title: 'Ingreso de Stock', desc: 'Registrar ingreso de mercadería e insumos recibidos', icon: ShoppingBag, color: '#3b82f6' }
    ]

    return (
      <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
        <header className="page-header" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h1 className="page-title">Panel Operativo Diario</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Hola {userProfile?.nombre_completo || 'Operador'}, seleccioná una sección para trabajar hoy.
            </p>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {quickModules.map(mod => {
            const IconComp = mod.icon
            return (
              <Link
                key={mod.to}
                to={mod.to}
                className="glass-panel"
                style={{
                  padding: '1.35rem',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  border: '1px solid var(--surface-border)',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
              >
                <div style={{
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: `${mod.color}20`,
                  color: mod.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconComp size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-primary)' }}>
                    {mod.title}
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    {mod.desc}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
              Comandas Registradas Hoy ({todayOrdenes.length})
            </h3>
            <Link to="/ordenes" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
              Ir a Comandas
            </Link>
          </div>
          {todayOrdenes.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Aún no se registraron comandas en el día de hoy.
            </p>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Clienta</th>
                    <th>Estado</th>
                    <th>Medio de Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {todayOrdenes.slice(0, 10).map(o => (
                    <tr key={o.id}>
                      <td>{new Date(o.fecha_creacion || o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ fontWeight: 600 }}>{o.clientes?.nombre || 'Cliente Eventual'}</td>
                      <td>
                        <span className={`badge ${o.estado === 'completado' ? 'badge-success' : 'badge-warning'}`}>
                          {String(o.estado || '').toUpperCase()}
                        </span>
                      </td>
                      <td>{o.metodo_pago || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </header>

      {/* Selector de Período y Filtros */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1rem 1.25rem', 
          marginBottom: '2rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1rem' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.25rem' }}>
            <Calendar size={17} style={{ color: 'var(--primary-color)' }} /> Período:
          </span>
          {[
            { id: 'mes', label: 'Mes en curso' },
            { id: 'ano', label: 'Año en curso' },
            { id: 'ultimos30', label: 'Últimos 30 días' },
            { id: 'todo', label: 'Ver todo' },
            { id: 'personalizado', label: 'Personalizado' }
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodo(opt.id)}
              className={periodo === opt.id ? "btn btn-primary" : "btn btn-secondary"}
              style={{ 
                padding: '0.35rem 0.85rem', 
                fontSize: '0.82rem',
                borderRadius: '8px',
                transition: 'all 0.15s'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Inputs de rango cuando es personalizado */}
        {periodo === 'personalizado' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Desde:</span>
              <input
                type="date"
                className="input-field"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.82rem', width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hasta:</span>
              <input
                type="date"
                className="input-field"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.82rem', width: 'auto' }}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos...</p>
      ) : (
        <>
          {/* Tarjetas de Métricas Afectadas por el Período */}
          <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
            
            {/* 1. Tarjeta de Órdenes */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>Órdenes de Trabajo</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                    {getPeriodoLabel()}
                  </span>
                </div>
                <div style={{ background: 'rgba(180, 97, 42, 0.1)', padding: '0.5rem', borderRadius: '10px' }}>
                  <FileText size={20} style={{ color: 'var(--primary-color)' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                  {stats.ordenes.total}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  comandas registradas en el período
                </div>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr', 
                gap: '0.4rem', 
                textAlign: 'center', 
                marginTop: '0.5rem', 
                borderTop: '1px solid var(--surface-border)', 
                paddingTop: '0.75rem' 
              }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success-color)' }}>
                    {stats.ordenes.completadas}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Completadas</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--surface-border)', borderRight: '1px solid var(--surface-border)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                    {stats.ordenes.pendientes}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>En proceso</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                    {stats.ordenes.canceladas}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Canceladas</div>
                </div>
              </div>
            </div>

            {/* 2. Tarjeta de Ingresos (Admin) o Tarjeta de Volumen en Cantidades (Operador / Empleado Base) */}
            {!isOperator ? (
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>Ingresos Totales</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--success-color)', fontWeight: 500 }}>
                      {getPeriodoLabel()}
                    </span>
                  </div>
                  <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.5rem', borderRadius: '10px' }}>
                    <TrendingUp size={20} style={{ color: 'var(--success-color)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--success-color)', lineHeight: 1.1 }}>
                    ${stats.ingresos.total.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {stats.ordenes.completadas > 0 
                      ? `Ticket promedio: $${Math.round(stats.ingresos.total / stats.ordenes.completadas).toLocaleString()}` 
                      : 'Sin ventas completadas'}
                  </div>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0.5rem', 
                  textAlign: 'center', 
                  marginTop: '0.5rem', 
                  borderTop: '1px solid var(--surface-border)', 
                  paddingTop: '0.75rem' 
                }}>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      ${stats.ingresos.servicios.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Servicios</div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#9DB8A8' }}>
                      ${stats.ingresos.productos.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Productos</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>Servicios y Productos</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                      {getPeriodoLabel()} (Cantidades)
                    </span>
                  </div>
                  <div style={{ background: 'rgba(180, 97, 42, 0.1)', padding: '0.5rem', borderRadius: '10px' }}>
                    <Scissors size={20} style={{ color: 'var(--primary-color)' }} />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {stats.cantidades.total.toLocaleString()} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>ítems</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    unidades totales en comandas completadas
                  </div>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0.5rem', 
                  textAlign: 'center', 
                  marginTop: '0.5rem', 
                  borderTop: '1px solid var(--surface-border)', 
                  paddingTop: '0.75rem' 
                }}>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      {stats.cantidades.servicios.toLocaleString()} u.
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Servicios realizados</div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#9DB8A8' }}>
                      {stats.cantidades.productos.toLocaleString()} u.
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Productos vendidos</div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Tarjeta de Clientes */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>Total Clientes</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                    {getPeriodoLabel()}
                  </span>
                </div>
                <div style={{ background: 'rgba(180, 97, 42, 0.1)', padding: '0.5rem', borderRadius: '10px' }}>
                  <Users size={20} style={{ color: 'var(--primary-color)' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '2.4rem', fontWeight: 'bold', color: 'var(--primary-color)', lineHeight: 1.1 }}>
                  {stats.clientes.atendidos}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  clientes atendidos en el período
                </div>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '0.5rem', 
                textAlign: 'center', 
                marginTop: '0.5rem', 
                borderTop: '1px solid var(--surface-border)', 
                paddingTop: '0.75rem' 
              }}>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {stats.clientes.nuevos}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Nuevos registrados</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--surface-border)' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {stats.clientes.totalGlobal}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Cartera total</div>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de barras acumulado / subdividido afectado por el período */}
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Calendar size={22} style={{ color: 'var(--primary-color)' }} />
                  {chartTitle}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.35rem', marginBottom: 0 }}>
                  {chartSubtitle}
                </p>
              </div>

              {/* Leyenda */}
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'linear-gradient(to top, var(--primary-color), #E39461)' }}></span>
                  <span>Servicios</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'linear-gradient(to top, var(--accent-color, #5E8C77), #9DB8A8)' }}></span>
                  <span>Productos</span>
                </div>
              </div>
            </div>

            {/* Contenedor del Gráfico de Barras */}
            <div style={{ 
              height: '280px', 
              display: 'flex', 
              alignItems: 'flex-end', 
              justifyContent: chartData.length <= 12 ? 'space-around' : 'space-between', 
              gap: chartData.length > 25 ? '3px' : '8px', 
              borderBottom: '1px solid var(--surface-border)', 
              paddingBottom: '0.5rem', 
              overflowX: 'auto' 
            }}>
              {chartData.map((item, idx) => {
                const servHeight = (item.servicios / maxBarValue) * 230
                const prodHeight = (item.productos / maxBarValue) * 230
                const totalHeight = Math.min(servHeight + prodHeight, 230)

                return (
                  <div key={idx} style={{ 
                    flex: chartData.length <= 12 ? '0 1 65px' : '1', 
                    minWidth: chartData.length > 25 ? '22px' : '36px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    position: 'relative'
                  }} className="chart-bar-group">
                    
                    {/* Tooltip flotante al hacer hover */}
                    <div style={{
                      position: 'absolute',
                      bottom: `${Math.max(totalHeight + 15, 40)}px`,
                      background: 'rgba(11, 31, 26, 0.95)',
                      border: '1px solid var(--surface-border)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      boxShadow: 'var(--shadow-lg)',
                      pointerEvents: 'none',
                      zIndex: 20,
                      display: 'none',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      whiteSpace: 'nowrap',
                      minWidth: '120px'
                    }} className="chart-tooltip">
                      <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                        {item.dateStr}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Servicios:</span>
                        <span style={{ fontWeight: 600 }}>{isOperator ? '' : '$'}{item.servicios.toLocaleString()}{isOperator ? ' u.' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Productos:</span>
                        <span style={{ fontWeight: 600 }}>{isOperator ? '' : '$'}{item.productos.toLocaleString()}{isOperator ? ' u.' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
                        <span>Total:</span>
                        <span style={{ color: 'var(--success-color)' }}>{isOperator ? '' : '$'}{item.total.toLocaleString()}{isOperator ? ' items' : ''}</span>
                      </div>
                    </div>

                    {/* Barra acumulada */}
                    <div style={{ 
                      width: '100%', 
                      maxWidth: chartData.length <= 12 ? '40px' : '22px', 
                      height: `${Math.max(totalHeight, 3)}px`, 
                      display: 'flex', 
                      flexDirection: 'column-reverse', 
                      borderRadius: '4px 4px 0 0',
                      overflow: 'hidden',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                      background: totalHeight === 0 ? 'rgba(255,255,255,0.06)' : 'transparent'
                    }} className="main-bar-render">
                      
                      {/* Segmento de Servicios (Abajo) */}
                      <div style={{ 
                        height: `${servHeight}px`, 
                        background: 'linear-gradient(to top, var(--primary-color), #E39461)',
                        width: '100%'
                      }} />
                      
                      {/* Segmento de Productos (Arriba) */}
                      <div style={{ 
                        height: `${prodHeight}px`, 
                        background: 'linear-gradient(to top, var(--accent-color, #5E8C77), #9DB8A8)',
                        width: '100%'
                      }} />
                    </div>

                    {/* Etiqueta del período/día */}
                    <div style={{ 
                      fontSize: chartData.length > 25 ? '0.65rem' : '0.72rem', 
                      color: 'var(--text-secondary)', 
                      marginTop: '0.5rem', 
                      textAlign: 'center', 
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.dateStr}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* CSS embebido para tooltips interactivos */}
            <style>{`
              .chart-bar-group:hover .chart-tooltip {
                display: flex !important;
              }
              .chart-bar-group:hover .main-bar-render {
                transform: scaleX(1.15);
                filter: brightness(1.1) drop-shadow(0 0 8px rgba(180, 97, 42, 0.4));
              }
            `}</style>
          </div>

          {/* ========================================================================= */}
          {/* NUEVAS SECCIONES: TOP SERVICIOS Y TOP PRODUCTOS (TORTA / CAJAS) */}
          {/* ========================================================================= */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', 
            gap: '1.5rem', 
            marginBottom: '2.5rem' 
          }}>

            {/* Card 1: Top Servicios */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ background: 'rgba(180, 97, 42, 0.12)', padding: '0.5rem', borderRadius: '10px' }}>
                    <Scissors size={20} style={{ color: 'var(--primary-color)' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Servicios Más Realizados
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 500 }}>
                      {getPeriodoLabel()}
                    </span>
                  </div>
                </div>

                {/* Alternador Cantidad vs Monto (Admin) */}
                {!isOperator && (
                  <div style={{ display: 'flex', background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setCriterioServicios('cantidad')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: criterioServicios === 'cantidad' ? 'var(--primary-color)' : 'transparent',
                        color: criterioServicios === 'cantidad' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Cantidad
                    </button>
                    <button
                      type="button"
                      onClick={() => setCriterioServicios('monto')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: criterioServicios === 'monto' ? 'var(--primary-color)' : 'transparent',
                        color: criterioServicios === 'monto' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Facturación
                    </button>
                  </div>
                )}
              </div>

              {/* Contenido Visual: Donut + Cajas de Ranking */}
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '140px', margin: '0 auto' }}>
                  <DonutChart 
                    items={topServiciosProcessed.items} 
                    totalValue={criterioServicios === 'monto' && !isOperator ? topServiciosProcessed.totalIngresos : topServiciosProcessed.totalQty} 
                    label={criterioServicios === 'monto' && !isOperator ? 'Facturado' : 'Servicios'}
                    isCurrency={criterioServicios === 'monto' && !isOperator}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {topServiciosProcessed.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No se registraron servicios en este período.
                    </div>
                  ) : (
                    topServiciosProcessed.items.map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        style={{ 
                          padding: '0.6rem 0.75rem', 
                          background: 'rgba(255, 255, 255, 0.02)', 
                          border: '1px solid var(--surface-border)', 
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                            <span style={{ 
                              width: '18px', 
                              height: '18px', 
                              borderRadius: '50%', 
                              background: item.color, 
                              color: '#fff', 
                              fontSize: '0.65rem', 
                              fontWeight: 'bold', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {idx + 1}
                            </span>
                            <span style={{ 
                              fontWeight: 600, 
                              fontSize: '0.85rem', 
                              color: 'var(--text-primary)', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {item.nombre}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                {item.cantidad} {item.cantidad === 1 ? 'vez' : 'veces'}
                              </div>
                              {!isOperator && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--success-color)' }}>
                                  ${item.ingresos.toLocaleString()}
                                </div>
                              )}
                            </div>
                            <span style={{ 
                              background: 'rgba(255,255,255,0.06)', 
                              padding: '0.15rem 0.4rem', 
                              borderRadius: '5px', 
                              fontSize: '0.72rem', 
                              fontWeight: 600,
                              color: 'var(--text-secondary)'
                            }}>
                              {item.pct}%
                            </span>
                          </div>
                        </div>

                        {/* Barra de progreso visual */}
                        <div style={{ height: '3px', width: '100%', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Top Productos */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ background: 'rgba(94, 140, 119, 0.12)', padding: '0.5rem', borderRadius: '10px' }}>
                    <ShoppingBag size={20} style={{ color: '#5E8C77' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Productos Más Vendidos
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#5E8C77', fontWeight: 500 }}>
                      {getPeriodoLabel()}
                    </span>
                  </div>
                </div>

                {/* Alternador Cantidad vs Monto (Admin) */}
                {!isOperator && (
                  <div style={{ display: 'flex', background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setCriterioProductos('cantidad')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: criterioProductos === 'cantidad' ? '#5E8C77' : 'transparent',
                        color: criterioProductos === 'cantidad' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Cantidad
                    </button>
                    <button
                      type="button"
                      onClick={() => setCriterioProductos('monto')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        background: criterioProductos === 'monto' ? '#5E8C77' : 'transparent',
                        color: criterioProductos === 'monto' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Facturación
                    </button>
                  </div>
                )}
              </div>

              {/* Contenido Visual: Donut + Cajas de Ranking */}
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '140px', margin: '0 auto' }}>
                  <DonutChart 
                    items={topProductosProcessed.items} 
                    totalValue={criterioProductos === 'monto' && !isOperator ? topProductosProcessed.totalIngresos : topProductosProcessed.totalQty} 
                    label={criterioProductos === 'monto' && !isOperator ? 'Facturado' : 'Productos'}
                    isCurrency={criterioProductos === 'monto' && !isOperator}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {topProductosProcessed.items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No se registraron productos en este período.
                    </div>
                  ) : (
                    topProductosProcessed.items.map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        style={{ 
                          padding: '0.6rem 0.75rem', 
                          background: 'rgba(255, 255, 255, 0.02)', 
                          border: '1px solid var(--surface-border)', 
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                            <span style={{ 
                              width: '18px', 
                              height: '18px', 
                              borderRadius: '50%', 
                              background: item.color, 
                              color: '#fff', 
                              fontSize: '0.65rem', 
                              fontWeight: 'bold', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {idx + 1}
                            </span>
                            <span style={{ 
                              fontWeight: 600, 
                              fontSize: '0.85rem', 
                              color: 'var(--text-primary)', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis' 
                            }}>
                              {item.nombre}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                {item.cantidad} {item.cantidad === 1 ? 'unidad' : 'unidades'}
                              </div>
                              {!isOperator && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--success-color)' }}>
                                  ${item.ingresos.toLocaleString()}
                                </div>
                              )}
                            </div>
                            <span style={{ 
                              background: 'rgba(255,255,255,0.06)', 
                              padding: '0.15rem 0.4rem', 
                              borderRadius: '5px', 
                              fontSize: '0.72rem', 
                              fontWeight: 600,
                              color: 'var(--text-secondary)'
                            }}>
                              {item.pct}%
                            </span>
                          </div>
                        </div>

                        {/* Barra de progreso visual */}
                        <div style={{ height: '3px', width: '100%', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Tabla de órdenes del período */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
                Órdenes del Período ({ordenesFiltradas.length})
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {ordenesFiltradas.length > 10 ? 'Mostrando las 10 más recientes del período' : 'Todas las órdenes del período'}
              </span>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Cliente</th>
                    <th>Responsable</th>
                    <th>{isOperator ? 'Ítems (Cant.)' : 'Total'}</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No hay órdenes registradas en este período.
                      </td>
                    </tr>
                  ) : (
                    ordenesFiltradas.slice(0, 10).map(orden => {
                      const cantItems = (orden.ordenes_trabajo_detalles && orden.ordenes_trabajo_detalles.length > 0)
                        ? orden.ordenes_trabajo_detalles.reduce((acc, d) => acc + Number(d.cantidad || 1), 0)
                        : 1
                      return (
                        <tr key={orden.id}>
                          <td>{new Date(orden.fecha_hora).toLocaleString()}</td>
                          <td>{orden.clientes?.nombre} {orden.clientes?.apellido}</td>
                          <td>{orden.usuarios?.nombre_completo}</td>
                          <td style={{ fontWeight: 600 }}>
                            {isOperator ? `${cantItems} u.` : `$ ${Number(orden.total_economico).toLocaleString()}`}
                          </td>
                          <td>
                            <span style={{ 
                              color: orden.estado === 'completada' ? 'var(--success-color)' : orden.estado === 'cancelada' ? '#ef4444' : 'var(--text-secondary)',
                              fontWeight: orden.estado === 'completada' ? 600 : 'normal'
                            }}>
                              {orden.estado.charAt(0).toUpperCase() + orden.estado.slice(1).replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
