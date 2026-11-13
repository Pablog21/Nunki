import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Wallet, ArrowDownCircle, CheckSquare, Square, Check, AlertCircle, FileText, Calendar, Plus, Users, Eye, Edit3, Save, CreditCard } from 'lucide-react'
import { getDesglosePago, getCuotasPago, getReferenciaPagoLimpia, getTipoTarjetaPago } from '../lib/pagoUtils'

export default function Caja() {
  const { user, userProfile, activeEmpresaId } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Caja State
  const [latestCierre, setLatestCierre] = useState(null)
  const [unclosedOrders, setUnclosedOrders] = useState([])
  const [unclosedMovements, setUnclosedMovements] = useState([])
  const [allMovements, setAllMovements] = useState([])
  const [cierresHistory, setCierresHistory] = useState([])
  const [selectedCierreDetalle, setSelectedCierreDetalle] = useState(null)
  const [ordenesDeCierreDetalle, setOrdenesDeCierreDetalle] = useState([])
  const [loadingOrdenesCierre, setLoadingOrdenesCierre] = useState(false)

  useEffect(() => {
    if (!selectedCierreDetalle?.id) {
      setOrdenesDeCierreDetalle([])
      return
    }
    let active = true
    setLoadingOrdenesCierre(true)
    supabase
      .from('ordenes_trabajo')
      .select('id, fecha_hora, total_economico, pago_metodo, es_colaborativa, clientes(nombre, apellido), usuarios(nombre_completo)')
      .eq('pago_caja_cierre_id', selectedCierreDetalle.id)
      .neq('estado', 'eliminada')
      .order('fecha_hora', { ascending: true })
      .then(({ data }) => {
        if (active) {
          setOrdenesDeCierreDetalle(data || [])
          setLoadingOrdenesCierre(false)
        }
      })
      .catch(() => {
        if (active) setLoadingOrdenesCierre(false)
      })
    return () => { active = false }
  }, [selectedCierreDetalle?.id])

  // Checks and Counts for Cierre
  const [chkEfectivo, setChkEfectivo] = useState(false)
  const [chkTarjeta, setChkTarjeta] = useState(false)
  const [chkTransferencia, setChkTransferencia] = useState(false)
  
  const [efectivoReal, setEfectivoReal] = useState('')
  const [saldoCajaRestante, setSaldoCajaRestante] = useState('0')
  const [observaciones, setObservaciones] = useState('')
  const [firmaDigital, setFirmaDigital] = useState('')

  // Commissions & Owner Extraction State
  const [descontarComisionesEnCaja, setDescontarComisionesEnCaja] = useState(false)
  const [pendingCommissions, setPendingCommissions] = useState([])
  const [selectedCommissionsToPay, setSelectedCommissionsToPay] = useState([])
  const [extraccionDuena, setExtraccionDuena] = useState('0')

  // Retiros Modal State
  const [showRetiroModal, setShowRetiroModal] = useState(false)
  const [retiroMonto, setRetiroMonto] = useState('')
  const [retiroDescripcion, setRetiroDescripcion] = useState('')

  // Perfiles administrativos: desde el nivel del dueño (administrador/dueña) y super_admin
  const userRole = userProfile?.rol?.toLowerCase()
  const isOperator = userRole === 'operador'
  const canManageCaja = ['administrador', 'admin', 'super_admin', 'dueña', 'duena', 'gerente'].includes(userRole)
  const isAdminOrSuper = canManageCaja

  // Modal Corrección de Cierre (Para Administradores como el dueño y SuperAdmin)
  const [cierreToEdit, setCierreToEdit] = useState(null)
  const [editEfectivoReal, setEditEfectivoReal] = useState('')
  const [editExtraccionDuena, setEditExtraccionDuena] = useState('0')
  const [editSaldoRestante, setEditSaldoRestante] = useState('0')
  const [editAutoCalcRestante, setEditAutoCalcRestante] = useState(true)
  const [editMotivo, setEditMotivo] = useState('')
  const [isUpdatingCierre, setIsUpdatingCierre] = useState(false)

  // Estado para agregar un gasto detallado a un cierre pasado (ej. cierre de anteayer)
  const [nuevoGastoCierreDesc, setNuevoGastoCierreDesc] = useState('')
  const [nuevoGastoCierreMonto, setNuevoGastoCierreMonto] = useState('')
  const [descontarDeEsperadoAlAgregar, setDescontarDeEsperadoAlAgregar] = useState(true)
  const [showAddGastoEnDetalle, setShowAddGastoEnDetalle] = useState(false)

  // Modal Control de Caja Cerrada (Para pasar a "Controlada" con comentario y detalle de retiro por fila)
  const [cierreToControl, setCierreToControl] = useState(null)
  const [controlComentario, setControlComentario] = useState('')
  const [controlRetiroDinero, setControlRetiroDinero] = useState('retiro_uky') // 'retiro_uky' | 'queda_salon'
  const [isSavingControl, setIsSavingControl] = useState(false)
  const [filtroControlCierres, setFiltroControlCierres] = useState('todos') // 'todos' | 'pendientes' | 'controladas'

  // Helpers para leer/guardar estado "Controlada" con soporte de columnas dedicadas y fallback en observaciones
  const CTRL_TAG_REGEX = /\s*\[\[CTRL(?:_UKY)?:(\{.*?\})\]\]/s

  const getObservacionesSinTagControl = (obs) => {
    if (!obs) return ''
    return String(obs).replace(CTRL_TAG_REGEX, '').trim()
  }

  const getControlInfo = (cierre) => {
    if (!cierre) return { controlada: false, fecha: null, por: '', comentario: '', retiroUky: true }
    const rawObs = String(cierre.observaciones || '')
    const match = rawObs.match(CTRL_TAG_REGEX)
    let parsedTag = null
    if (match && match[1]) {
      try {
        parsedTag = JSON.parse(match[1])
      } catch {
        parsedTag = null
      }
    }

    if (cierre.controlada === true) {
      const com = cierre.controlada_comentario || parsedTag?.nota || ''
      const retiroUky = parsedTag?.retiroUky !== undefined
        ? Boolean(parsedTag.retiroUky)
        : !com.toLowerCase().includes('sin retiro')
      return {
        controlada: true,
        fecha: cierre.controlada_fecha || parsedTag?.fecha || null,
        por: cierre.controlada_por_nombre || parsedTag?.por || 'Dueño',
        comentario: com,
        retiroUky
      }
    }

    if (parsedTag && parsedTag.ok) {
      const com = parsedTag.nota || ''
      const retiroUky = parsedTag.retiroUky !== undefined
        ? Boolean(parsedTag.retiroUky)
        : !com.toLowerCase().includes('sin retiro')
      return {
        controlada: true,
        fecha: parsedTag.fecha || null,
        por: parsedTag.por || 'Dueño',
        comentario: com,
        retiroUky
      }
    }
    return { controlada: false, fecha: null, por: '', comentario: '', retiroUky: true }
  }

  const buildObservacionesConTagControl = (obsBase, ctrlPayload) => {
    const cleanObs = getObservacionesSinTagControl(obsBase)
    if (!ctrlPayload || !ctrlPayload.ok) {
      return cleanObs || null
    }
    const tag = `[[CTRL:${JSON.stringify({
      ok: true,
      fecha: ctrlPayload.fecha,
      por: ctrlPayload.por,
      nota: ctrlPayload.nota || '',
      retiroUky: ctrlPayload.retiroUky !== false
    })}]]`
    return cleanObs ? `${cleanObs} ${tag}` : tag
  }

  const handleOpenControlCierre = (c) => {
    if (!c) return
    const info = getControlInfo(c)
    setCierreToControl(c)
    setControlRetiroDinero(info.controlada ? (info.retiroUky ? 'retiro_uky' : 'queda_salon') : 'retiro_uky')
    // Limpiar prefijo automático previo si existe para que pueda editar su nota libremente
    const notaLimpia = (info.comentario || '')
      .replace(/^(Retiró el dueño|Retiro del dueño) \$[\d.,]+\s*[—\-·]?\s*/i, '')
      .replace(/^Controlada \(sin retiro de efectivo\)\s*[—\-·]?\s*/i, '')
    setControlComentario(notaLimpia)
  }

  const handleGuardarControlCierre = async (marcarControlada = true) => {
    if (!cierreToControl || !activeEmpresaId) return
    setIsSavingControl(true)
    try {
      const ahoraIso = new Date().toISOString()
      const nombreResponsable = userProfile?.nombre_completo || 'Dueño'
      const retiroSeparado = Math.max(0, Number(cierreToControl.efectivo_real || 0) - Number(cierreToControl.saldo_caja_restante || 0))
      const isRetiroUky = controlRetiroDinero === 'retiro_uky'
      const prefijoRetiro = isRetiroUky
        ? `Retiro del dueño $${retiroSeparado.toLocaleString()}`
        : 'Controlada (sin retiro de efectivo)'
      const notaExtra = controlComentario.trim()
      const comentarioLimpio = notaExtra ? `${prefijoRetiro} — ${notaExtra}` : prefijoRetiro

      const nuevasObsConTag = buildObservacionesConTagControl(
        cierreToControl.observaciones,
        marcarControlada
          ? { ok: true, fecha: ahoraIso, por: nombreResponsable, nota: comentarioLimpio, retiroUky: isRetiroUky }
          : { ok: false }
      )

      // 1. Intentar actualizar columnas dedicadas + respaldo en observaciones
      const { error: errFull } = await supabase
        .from('cajas_cierres')
        .update({
          controlada: marcarControlada,
          controlada_fecha: marcarControlada ? ahoraIso : null,
          controlada_por_id: marcarControlada && user?.id ? user.id : null,
          controlada_por_nombre: marcarControlada ? nombreResponsable : null,
          controlada_comentario: marcarControlada ? (comentarioLimpio || null) : null,
          observaciones: nuevasObsConTag
        })
        .eq('id', cierreToControl.id)

      // 2. Si aún no se corrió la migración SQL de columnas dedicadas, guardar mediante respaldo en observaciones
      if (errFull) {
        const { error: errFallback } = await supabase
          .from('cajas_cierres')
          .update({
            observaciones: nuevasObsConTag
          })
          .eq('id', cierreToControl.id)

        if (errFallback) throw errFallback
      }

      setCierreToControl(null)
      setControlComentario('')
      await fetchCajaData()
    } catch (err) {
      console.error('Error updating control status:', err)
      alert('Error al actualizar el estado de control de la caja: ' + err.message)
    } finally {
      setIsSavingControl(false)
    }
  }

  // Helper para obtener todos los gastos (retiros de caja chica) de un cierre (vinculados por ID o por rango horario)
  const getGastosDeCierre = (cierre, idxInHistory = -1) => {
    if (!cierre) return []
    const prevCierre = idxInHistory >= 0 ? cierresHistory[idxInHistory + 1] : null
    const startWindow = prevCierre?.fecha_cierre || cierre.fecha_apertura || null
    const endWindow = cierre.fecha_cierre || null

    return allMovements.filter(m => {
      if (m.tipo !== 'retiro') return false
      if (m.caja_cierre_id === cierre.id) return true
      if (!m.caja_cierre_id && startWindow && endWindow && m.fecha_hora) {
        const t = new Date(m.fecha_hora).getTime()
        const tStart = new Date(startWindow).getTime()
        const tEnd = new Date(endWindow).getTime() + 60000 // +1 min margen
        return t >= tStart && t <= tEnd
      }
      return false
    })
  }

  const handleAgregarGastoACierre = async (e) => {
    e.preventDefault()
    if (!selectedCierreDetalle || !activeEmpresaId || !user) return
    const montoNum = Number(nuevoGastoCierreMonto)
    if (!nuevoGastoCierreDesc.trim() || !montoNum || montoNum <= 0) {
      return alert('Ingrese una descripción (ej. Comida, Servilletas, Café) y un monto válido.')
    }

    setIsUpdatingCierre(true)
    try {
      const { error: errMov } = await supabase
        .from('cajas_movimientos')
        .insert([{
          empresa_id: activeEmpresaId,
          tipo: 'retiro',
          monto: montoNum,
          descripcion: nuevoGastoCierreDesc.trim(),
          usuario_responsable_id: user.id,
          caja_cierre_id: selectedCierreDetalle.id
        }])

      if (errMov) throw errMov

      let nuevoEsperado = Number(selectedCierreDetalle.efectivo_esperado || 0)
      if (descontarDeEsperadoAlAgregar) {
        nuevoEsperado = nuevoEsperado - montoNum
        const { error: errUpd } = await supabase
          .from('cajas_cierres')
          .update({ efectivo_esperado: nuevoEsperado })
          .eq('id', selectedCierreDetalle.id)
        if (errUpd) throw errUpd
      }

      setNuevoGastoCierreDesc('')
      setNuevoGastoCierreMonto('')
      setShowAddGastoEnDetalle(false)
      await fetchCajaData()
      setSelectedCierreDetalle(prev => prev ? { ...prev, efectivo_esperado: nuevoEsperado } : null)
      alert('Gasto de Caja Chica agregado y detallado en el cierre correctamente.')
    } catch (err) {
      console.error('Error adding expense to closure:', err)
      alert('Error al agregar gasto al cierre: ' + err.message)
    } finally {
      setIsUpdatingCierre(false)
    }
  }

  const handleOpenEditCierre = (c) => {
    if (!c) return
    const originalExtraccion = Math.max(0, Number(c.efectivo_real || 0) - Number(c.saldo_caja_restante || 0))
    setCierreToEdit(c)
    setEditEfectivoReal(String(c.efectivo_real ?? ''))
    setEditExtraccionDuena(String(originalExtraccion))
    setEditSaldoRestante(String(c.saldo_caja_restante ?? '0'))
    setEditAutoCalcRestante(true)
    setEditMotivo('')
  }

  const handleSaveEditCierre = async (e) => {
    e.preventDefault()
    if (!cierreToEdit || !activeEmpresaId) return
    setIsUpdatingCierre(true)

    try {
      const fechaHoy = new Date().toLocaleDateString('es-AR')
      const responsableCorreccion = userProfile?.nombre_completo || 'Administración'
      const notaAuditoria = `[Corregido el ${fechaHoy} por ${responsableCorreccion}${editMotivo ? `: ${editMotivo}` : ''}]`
      const obsLimpia = getObservacionesSinTagControl(cierreToEdit.observaciones)
      const obsConAuditoria = obsLimpia
        ? `${obsLimpia} | ${notaAuditoria}`
        : notaAuditoria
      const ctrlActual = getControlInfo(cierreToEdit)
      const observacionesFinales = buildObservacionesConTagControl(
        obsConAuditoria,
        ctrlActual.controlada
          ? { ok: true, fecha: ctrlActual.fecha, por: ctrlActual.por, nota: ctrlActual.comentario }
          : { ok: false }
      )

      const { error } = await supabase
        .from('cajas_cierres')
        .update({
          efectivo_real: Number(editEfectivoReal),
          saldo_caja_restante: Number(editSaldoRestante),
          observaciones: observacionesFinales
        })
        .eq('id', cierreToEdit.id)

      if (error) throw error

      alert('¡Cierre de caja corregido con éxito! Los fondos de caja y saldos se actualizaron automáticamente.')
      setCierreToEdit(null)
      setSelectedCierreDetalle(null)
      await fetchCajaData()
    } catch (err) {
      console.error('Error updating closure:', err)
      alert('Error al corregir el cierre: ' + err.message)
    } finally {
      setIsUpdatingCierre(false)
    }
  }

  useEffect(() => {
    if (activeEmpresaId) {
      fetchCajaData()
    }
  }, [activeEmpresaId])

  const fetchCajaData = async () => {
    try {
      setLoading(true)

      // 1. Obtener último cierre de caja
      const { data: latestCierreData, error: errCierre } = await supabase
        .from('cajas_cierres')
        .select('*')
        .eq('empresa_id', activeEmpresaId)
        .order('fecha_cierre', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (errCierre) console.error('Error fetching latest closure:', errCierre)
      setLatestCierre(latestCierreData || null)

      // 2. Obtener órdenes pagadas sin cerrar (excluyendo eliminadas o canceladas)
      const { data: orders, error: errOrders } = await supabase
        .from('ordenes_trabajo')
        .select(`
          *,
          clientes (nombre, apellido)
        `)
        .eq('empresa_id', activeEmpresaId)
        .eq('pago_estado', 'pagado')
        .neq('estado', 'eliminada')
        .neq('estado', 'cancelada')
        .is('pago_caja_cierre_id', null)

      if (errOrders) console.error('Error fetching unclosed orders:', errOrders)
      
      const validOrders = (orders || []).filter(o => 
        o.estado !== 'eliminada' && 
        o.estado !== 'cancelada' && 
        o.pago_estado !== 'cancelado' && 
        o.pago_estado !== 'anulado'
      )
      setUnclosedOrders(validOrders)

      // 3. Obtener movimientos de caja (tanto abiertos como asociados a cierres para mostrar costos en el historial)
      const { data: movements, error: errMovements } = await supabase
        .from('cajas_movimientos')
        .select(`
          id, tipo, monto, descripcion, fecha_hora, caja_cierre_id,
          usuarios (nombre_completo)
        `)
        .eq('empresa_id', activeEmpresaId)
        .order('fecha_hora', { ascending: false })

      if (errMovements) console.error('Error fetching movements:', errMovements)
      const allMovs = movements || []
      setAllMovements(allMovs)
      setUnclosedMovements(allMovs.filter(m => !m.caja_cierre_id))

      // 4. Cargar Historial de Cierres
      const { data: history, error: errHistory } = await supabase
        .from('cajas_cierres')
        .select(`
          *,
          usuarios (nombre_completo)
        `)
        .eq('empresa_id', activeEmpresaId)
        .order('fecha_cierre', { ascending: false })

      if (errHistory) console.error('Error fetching closures history:', errHistory)
      setCierresHistory(history || [])

      // 5. Obtener configuración de empresa y comisiones pendientes
      const { data: empresaData } = await supabase
        .from('empresas')
        .select('configuracion')
        .eq('id', activeEmpresaId)
        .single()

      const config = empresaData?.configuracion || {}
      const isDescontar = config.descontar_comisiones_en_caja ?? (localStorage.getItem(`descontar_comisiones_en_caja_${activeEmpresaId}`) === 'true')
      setDescontarComisionesEnCaja(isDescontar)

      const { data: pendingComs, error: errComs } = await supabase
        .from('comisiones')
        .select(`
          id, colaborador_id, concepto, monto_base, porcentaje, monto_comision, estado,
          usuarios (nombre_completo),
          ordenes_trabajo (estado, pago_estado)
        `)
        .eq('empresa_id', activeEmpresaId)
        .eq('estado', 'Pendiente')

      if (errComs) console.error('Error fetching pending commissions:', errComs)
      
      const validPendingComs = (pendingComs || []).filter(c => {
        const ot = c.ordenes_trabajo
        if (ot && (ot.estado === 'cancelada' || ot.estado === 'eliminada' || ot.pago_estado === 'cancelado' || ot.pago_estado === 'anulado')) {
          return false
        }
        return true
      })

      setPendingCommissions(validPendingComs)
      setSelectedCommissionsToPay(validPendingComs.map(c => c.id))

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Cálculos de caja actual
  const efectivoInicial = latestCierre ? Number(latestCierre.saldo_caja_restante) : 0
  
  const totalEfectivoVentas = unclosedOrders
    .reduce((sum, o) => sum + getDesglosePago(o).efectivo, 0)

  const totalTarjetaVentas = unclosedOrders
    .reduce((sum, o) => sum + getDesglosePago(o).tarjeta, 0)

  const totalCreditoVentas = unclosedOrders
    .reduce((sum, o) => sum + getDesglosePago(o).credito, 0)

  const totalDebitoVentas = unclosedOrders
    .reduce((sum, o) => sum + getDesglosePago(o).debito, 0)

  const totalTransferenciaVentas = unclosedOrders
    .reduce((sum, o) => sum + getDesglosePago(o).transferencia, 0)

  const totalRetiros = unclosedMovements
    .filter(m => m.tipo === 'retiro')
    .reduce((sum, m) => sum + Number(m.monto), 0)

  const totalExpectedCash = efectivoInicial + totalEfectivoVentas - totalRetiros

  const totalComisionesSeleccionadas = descontarComisionesEnCaja 
    ? pendingCommissions
        .filter(c => selectedCommissionsToPay.includes(c.id))
        .reduce((sum, c) => sum + Number(c.monto_comision), 0)
    : 0

  const saldoCajaPostComisiones = Math.max(0, (Number(efectivoReal) || 0) - totalComisionesSeleccionadas)
  const saldoFinalTurnoSiguiente = Math.max(0, saldoCajaPostComisiones - (Number(extraccionDuena) || 0))

  const handleCrearRetiro = async (e) => {
    e.preventDefault()
    if (!user || !activeEmpresaId) return
    setIsSubmitting(true)

    try {
      const { error } = await supabase
        .from('cajas_movimientos')
        .insert([{
          empresa_id: activeEmpresaId,
          tipo: 'retiro',
          monto: Number(retiroMonto),
          descripcion: retiroDescripcion,
          usuario_responsable_id: user.id
        }])

      if (error) throw error

      setShowRetiroModal(false)
      setRetiroMonto('')
      setRetiroDescripcion('')
      await fetchCajaData()
    } catch (err) {
      console.error('Error recording withdrawal:', err)
      alert('Error al registrar retiro: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmarCierre = async (e) => {
    e.preventDefault()
    if (!user || !activeEmpresaId) return
    if (!chkEfectivo || !chkTarjeta || !chkTransferencia) {
      return alert('Debe verificar físicamente los 3 tildes de efectivo, tarjetas y transferencias antes de cerrar.')
    }
    if (!firmaDigital.trim()) {
      return alert('Debe firmar con su nombre declarándose responsable.')
    }

    setIsSubmitting(true)
    try {
      const commsTotal = descontarComisionesEnCaja 
        ? pendingCommissions
            .filter(c => selectedCommissionsToPay.includes(c.id))
            .reduce((sum, c) => sum + Number(c.monto_comision), 0)
        : 0

      const saldoCajaPostComisiones = Math.max(0, (Number(efectivoReal) || 0) - commsTotal)
      const saldoFinalTurnoSiguiente = Math.max(0, saldoCajaPostComisiones - (Number(extraccionDuena) || 0))

      // 1. Crear el registro del cierre de caja
      const fechaApertura = latestCierre ? latestCierre.fecha_cierre : new Date(Date.now() - 24*60*60*1000).toISOString()
      
      const nuevoCierre = {
        empresa_id: activeEmpresaId,
        usuario_cierre_id: user.id,
        fecha_apertura: fechaApertura,
        fecha_cierre: new Date().toISOString(),
        efectivo_inicial: efectivoInicial,
        efectivo_esperado: totalExpectedCash,
        efectivo_real: Number(efectivoReal),
        tarjeta_esperado: totalTarjetaVentas,
        transferencia_esperado: totalTransferenciaVentas,
        observaciones: observaciones || null,
        responsabilidad_aceptada: true,
        firma_digital_nombre: firmaDigital,
        saldo_caja_restante: saldoFinalTurnoSiguiente
      }

      const { data: cierreCreado, error: errInsert } = await supabase
        .from('cajas_cierres')
        .insert([nuevoCierre])
        .select()

      if (errInsert) throw errInsert
      const cierreId = cierreCreado[0].id

      // 2. Asociar el ID del cierre a las órdenes de trabajo cerradas
      if (unclosedOrders.length > 0) {
        const orderIds = unclosedOrders.map(o => o.id)
        const { error: errUpdateO } = await supabase
          .from('ordenes_trabajo')
          .update({ pago_caja_cierre_id: cierreId })
          .in('id', orderIds)
        
        if (errUpdateO) console.error('Error linking orders to closure:', errUpdateO)
      }

      // 3. Asociar el ID del cierre a los movimientos de caja cerrados
      if (unclosedMovements.length > 0) {
        const movementIds = unclosedMovements.map(m => m.id)
        const { error: errUpdateM } = await supabase
          .from('cajas_movimientos')
          .update({ caja_cierre_id: cierreId })
          .in('id', movementIds)

        if (errUpdateM) console.error('Error linking movements to closure:', errUpdateM)
      }

      // 4. Liquidar y marcar comisiones pagadas con el ID de cierre (solo si descontarComisionesEnCaja está activo)
      if (descontarComisionesEnCaja && selectedCommissionsToPay.length > 0) {
        const { error: errComsUpdate } = await supabase
          .from('comisiones')
          .update({ 
            estado: 'Liquidada',
            caja_cierre_id: cierreId
          })
          .in('id', selectedCommissionsToPay)

        if (errComsUpdate) console.error('Error liquidating commissions:', errComsUpdate)
      }

      // Limpiar Formulario
      setChkEfectivo(false)
      setChkTarjeta(false)
      setChkTransferencia(false)
      setEfectivoReal('')
      setSaldoCajaRestante('0')
      setExtraccionDuena('0')
      setObservaciones('')
      setFirmaDigital('')

      alert('¡Cierre de Caja procesado con éxito y registrado de forma digital!')
      await fetchCajaData()
    } catch (err) {
      console.error('Error processing closure:', err)
      alert('Error al registrar cierre: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Control de Caja y Finanzas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Administra los flujos de dinero diario, retiros de efectivo y el cierre de caja de forma segura.</p>
        </div>
        <button className="btn btn-secondary" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }} onClick={() => setShowRetiroModal(true)}>
          <ArrowDownCircle size={18} style={{ marginRight: '6px' }} /> Registrar Gastos
        </button>
      </header>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos de caja...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* PANEL RESUMEN DE SALDOS ACTUALES */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-card" style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(180, 97, 42, 0.1)', padding: '1rem', borderRadius: '12px' }}>
                <Wallet size={24} style={{ color: 'var(--primary-color)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fondo de Caja Apertura</span>
                  {latestCierre && canManageCaja && (
                    <button 
                      type="button"
                      onClick={() => handleOpenEditCierre(latestCierre)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: 'var(--primary-color)', 
                        fontSize: '0.72rem', 
                        cursor: 'pointer', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.2rem',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                      title="Corregir el cierre anterior que define este fondo de apertura"
                    >
                      <Edit3 size={11} /> Corregir
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>$ {efectivoInicial.toLocaleString()}</div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '1rem', borderRadius: '12px' }}>
                <Check size={24} style={{ color: 'var(--success-color)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ingresos Efectivo Hoy</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success-color)' }}>$ {totalEfectivoVentas.toLocaleString()}</div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '12px' }}>
                <ArrowDownCircle size={24} style={{ color: 'var(--danger-color)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gastos (Egresos)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--danger-color)' }}>$ {totalRetiros.toLocaleString()}</div>
              </div>
            </div>

            <div className="glass-card" style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', border: '1px solid var(--primary-color)' }}>
              <div style={{ background: 'rgba(180, 97, 42, 0.15)', padding: '1rem', borderRadius: '12px' }}>
                <Wallet size={24} style={{ color: 'var(--primary-color)' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', textTransform: 'uppercase', fontWeight: 'bold' }}>Efectivo Esperado en Caja</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>$ {totalExpectedCash.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* ARQUEO DE CAJA - FORMULARIO DE CONCILIACIÓN */}
          <div className="responsive-split-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem', alignItems: 'start' }}>
            
            {/* SECCIÓN DE TILDAR / CONCILIAR */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Paso 1: Conciliación y Verificación de Comprobantes</h2>

              {/* Tarjeta Efectivo */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>🧾 Arqueo de Efectivo</div>
                    <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>
                      $ {totalEfectivoVentas.toLocaleString()}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: chkEfectivo ? 'var(--success-color)' : 'var(--text-secondary)' }}
                    onClick={() => setChkEfectivo(!chkEfectivo)}
                  >
                    {chkEfectivo ? <CheckSquare size={22} /> : <Square size={22} />}
                    <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Efectivo OK</span>
                  </button>
                </div>
                
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Apertura turno: <strong>$ {efectivoInicial.toLocaleString()}</strong>. Ventas registradas: <strong>$ {totalEfectivoVentas.toLocaleString()}</strong>. Gastos y egresos: <strong>$ {totalRetiros.toLocaleString()}</strong>.
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Comprobantes y comandas cobradas en efectivo durante el turno actual:
                </p>

                {unclosedOrders.filter(o => getDesglosePago(o).efectivo > 0).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>No hay cobros en efectivo en este periodo.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.50rem', maxHeight: '250px', overflowY: 'auto' }}>
                    {unclosedOrders.filter(o => getDesglosePago(o).efectivo > 0).map(o => {
                      const desglose = getDesglosePago(o)
                      return (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                          <div>
                            <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>OT ID: {o.id.substring(0, 8)} - {o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}` : 'Consumidor Final'}</span>
                              {o.pago_metodo === 'mixto' && (
                                <span style={{ fontSize: '0.7rem', background: 'rgba(180, 97, 42,0.2)', color: 'var(--primary-color)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                  🔀 Mixto ($ {Number(o.total_economico).toLocaleString()} tot)
                                </span>
                              )}
                            </div>
                            {o.pago_fecha_hora && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                Hora: {new Date(o.pago_fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hs
                              </div>
                            )}
                          </div>
                          <strong style={{ color: 'var(--success-color)', fontSize: '0.9rem' }}>$ {desglose.efectivo.toLocaleString()}</strong>
                        </div>
                      )
                    })}
                  </div>
                )}

                {unclosedMovements.length > 0 && (
                  <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Detalle de Gastos / Egresos en el turno:</span>
                    {unclosedMovements.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.25rem' }}>
                        <span>💸 Gasto: {m.descripcion} <em style={{ color: 'var(--text-secondary)' }}>({m.usuarios?.nombre_completo})</em></span>
                        <strong style={{ color: 'var(--danger-color)' }}>- $ {Number(m.monto).toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tarjeta Tarjetas de Crédito y Débito */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>💳 Comprobantes de Tarjetas</div>
                    <span style={{ background: 'rgba(180, 97, 42, 0.1)', color: 'var(--primary-color)', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>
                      Total: $ {totalTarjetaVentas.toLocaleString()}
                    </span>
                    {totalCreditoVentas > 0 && (
                      <span style={{ background: 'rgba(47, 127, 120, 0.14)', color: '#a78bfa', fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: '600' }}>
                        Crédito: $ {totalCreditoVentas.toLocaleString()}
                      </span>
                    )}
                    {totalDebitoVentas > 0 && (
                      <span style={{ background: 'rgba(14, 165, 233, 0.14)', color: '#38bdf8', fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '6px', fontWeight: '600' }}>
                        Débito: $ {totalDebitoVentas.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <button 
                    type="button" 
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: chkTarjeta ? 'var(--success-color)' : 'var(--text-secondary)' }}
                    onClick={() => setChkTarjeta(!chkTarjeta)}
                  >
                    {chkTarjeta ? <CheckSquare size={22} /> : <Square size={22} />}
                    <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Cupones OK</span>
                  </button>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Por favor, verifique físicamente que los cupones emitidos por el posnet coincidan con el monto esperado de tarjetas de crédito (y sus cuotas) y débito.
                </p>

                {unclosedOrders.filter(o => getDesglosePago(o).tarjeta > 0).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>No hay cobros con tarjeta en este periodo.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.50rem' }}>
                    {unclosedOrders.filter(o => getDesglosePago(o).tarjeta > 0).map(o => {
                      const desglose = getDesglosePago(o)
                      const tipoTarjeta = getTipoTarjetaPago(o)
                      const cuotas = getCuotasPago(o)
                      const refLimpia = getReferenciaPagoLimpia(o)
                      return (
                        <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(0,0,0,0.1)', padding: '0.55rem 0.65rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span>OT ID: {o.id.substring(0, 8)} - {o.clientes?.nombre} {o.clientes?.apellido}</span>
                              {tipoTarjeta === 'debito' ? (
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: '700',
                                  background: 'rgba(14, 165, 233, 0.18)',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(14, 165, 233, 0.35)',
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '4px'
                                }}>
                                  💳 Débito
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: '700',
                                  background: 'rgba(47, 127, 120, 0.2)',
                                  color: '#a78bfa',
                                  border: '1px solid rgba(47, 127, 120, 0.4)',
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '4px'
                                }}>
                                  💳 Crédito ({cuotas || 1} {(cuotas || 1) === 1 ? 'Cuota' : 'Cuotas'})
                                </span>
                              )}
                              {o.pago_metodo === 'mixto' && (
                                <span style={{ fontSize: '0.7rem', background: 'rgba(180, 97, 42,0.2)', color: 'var(--primary-color)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                  🔀 Mixto ($ {Number(o.total_economico).toLocaleString()} tot)
                                </span>
                              )}
                            </div>
                            <strong>$ {desglose.tarjeta.toLocaleString()}</strong>
                          </div>
                          {refLimpia && (
                            <div>
                              {refLimpia.startsWith('data:image') ? (
                                <a href={refLimpia} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', fontSize: '0.75rem', textDecoration: 'underline' }}>
                                  Ver Comprobante Imagen
                                </a>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Cupón / Ref: {refLimpia}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Tarjeta Transferencias */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>🏦 Transferencias Bancarias</div>
                    <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>
                      $ {totalTransferenciaVentas.toLocaleString()}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: chkTransferencia ? 'var(--success-color)' : 'var(--text-secondary)' }}
                    onClick={() => setChkTransferencia(!chkTransferencia)}
                  >
                    {chkTransferencia ? <CheckSquare size={22} /> : <Square size={22} />}
                    <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Transferencias OK</span>
                  </button>
                </div>
                
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Verifique que las transferencias adjuntas a continuación se encuentren correctamente acreditadas en su cuenta bancaria de la empresa.
                </p>

                {unclosedOrders.filter(o => getDesglosePago(o).transferencia > 0).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>No hay transferencias cobradas en este periodo.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.50rem' }}>
                    {unclosedOrders.filter(o => getDesglosePago(o).transferencia > 0).map(o => {
                      const desglose = getDesglosePago(o)
                      return (
                        <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(0,0,0,0.1)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span>OT ID: {o.id.substring(0,8)} - {o.clientes?.nombre} {o.clientes?.apellido}</span>
                              {o.pago_metodo === 'mixto' && (
                                <span style={{ fontSize: '0.7rem', background: 'rgba(180, 97, 42,0.2)', color: 'var(--primary-color)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                  🔀 Mixto ($ {Number(o.total_economico).toLocaleString()} tot)
                                </span>
                              )}
                            </div>
                            <strong>$ {desglose.transferencia.toLocaleString()}</strong>
                          </div>
                          {o.pago_comprobante_url && (
                            <div style={{ marginTop: '0.25rem' }}>
                              {o.pago_comprobante_url.startsWith('data:image') ? (
                                <a href={o.pago_comprobante_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', fontSize: '0.75rem', textDecoration: 'underline' }}>
                                  Ver Comprobante Imagen
                                </a>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ref: {o.pago_comprobante_url}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* FORMULARIO DE FIRMA Y CONFIRMACIÓN DE RESPONSABILIDAD */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.25rem 0' }}>Paso 2: Arqueo y Liquidación</h2>
              
              <form onSubmit={handleConfirmarCierre} style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>

                {/* RESUMEN DE COSTOS / EGRESOS Y FÓRMULA DE EFECTIVO ESPERADO AL CERRAR CAJA */}
                <div style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.22)',
                  borderRadius: '10px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      💸 Costos y Egresos del Turno ({unclosedMovements.filter(m => m.tipo === 'retiro').length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRetiroModal(true)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: 'var(--danger-color)',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Plus size={13} /> Cargar Costo / Gasto
                    </button>
                  </div>

                  {unclosedMovements.filter(m => m.tipo === 'retiro').length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      No se registraron costos ni gastos pagados con efectivo de caja en este turno.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto', background: 'rgba(0,0,0,0.18)', padding: '0.55rem 0.65rem', borderRadius: '6px' }}>
                      {unclosedMovements.filter(m => m.tipo === 'retiro').map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.25rem' }}>
                          <span style={{ color: 'var(--text-primary)' }}>
                            • {m.descripcion}
                            {m.usuarios?.nombre_completo && <em style={{ color: 'var(--text-secondary)', marginLeft: '0.3rem' }}>({m.usuarios.nombre_completo})</em>}
                          </span>
                          <strong style={{ color: 'var(--danger-color)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                            - $ {Number(m.monto).toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fórmula explícita del Efectivo Esperado */}
                  <div style={{
                    borderTop: '1px dashed rgba(255,255,255,0.12)',
                    paddingTop: '0.55rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                      <span>Fondo Inicial de Apertura:</span>
                      <span>$ {efectivoInicial.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success-color)' }}>
                      <span>+ Ventas en Efectivo del Turno:</span>
                      <span>+ $ {totalEfectivoVentas.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger-color)' }}>
                      <span>- Costos / Gastos en Efectivo:</span>
                      <strong>- $ {totalRetiros.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.35rem', marginTop: '0.15rem', fontSize: '0.88rem' }}>
                      <strong style={{ color: 'var(--primary-color)' }}>= Efectivo Esperado en Caja:</strong>
                      <strong style={{ color: 'var(--text-primary)' }}>$ {totalExpectedCash.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
                
                {/* SUB-PASO A: Efectivo Contado */}
                <div className="input-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>1. Efectivo Físico Real Contado *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)' }}>$</span>
                    <input 
                      type="number" 
                      required 
                      min="0" 
                      step="0.01" 
                      placeholder="0.00"
                      className="input-field" 
                      style={{ paddingLeft: '1.75rem', width: '100%', margin: 0 }}
                      value={efectivoReal} 
                      onChange={(e) => setEfectivoReal(e.target.value)}
                    />
                  </div>
                  {efectivoReal && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Diferencia de Caja:</span>
                      <strong style={{ color: Number(efectivoReal) - totalExpectedCash >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        {Number(efectivoReal) - totalExpectedCash >= 0 ? 'Sobrante' : 'Faltante'}: $ {Math.abs(Number(efectivoReal) - totalExpectedCash).toLocaleString()}
                      </strong>
                    </div>
                  )}
                </div>

                {/* SUB-PASO B: Pago de Comisiones (solo si está configurado para descontarse en caja) */}
                {descontarComisionesEnCaja && (
                  <>
                    <div className="input-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>2. Liquidación de Comisiones Pendientes</label>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem' }}>
                        Seleccione qué comisiones desea pagarle hoy a cada miembro directamente con efectivo de la caja:
                      </span>

                      {pendingCommissions.length === 0 ? (
                        <div style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          No hay comisiones pendientes de pago.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {Object.entries(
                            pendingCommissions.reduce((acc, c) => {
                              const name = c.usuarios?.nombre_completo || 'Colaborador'
                              if (!acc[c.colaborador_id]) {
                                acc[c.colaborador_id] = { name, total: 0, itemIds: [] }
                              }
                              acc[c.colaborador_id].total += Number(c.monto_comision)
                              acc[c.colaborador_id].itemIds.push(c.id)
                              return acc
                            }, {})
                          ).map(([colabId, data]) => {
                            const allSelected = data.itemIds.every(id => selectedCommissionsToPay.includes(id))
                            const someSelected = data.itemIds.some(id => selectedCommissionsToPay.includes(id)) && !allSelected

                            return (
                              <div key={colabId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <button
                                    type="button"
                                    style={{ background: 'transparent', border: 'none', color: allSelected ? 'var(--success-color)' : someSelected ? 'var(--primary-color)' : 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                                    onClick={() => {
                                      if (allSelected) {
                                        // Deseleccionar todas de este colaborador
                                        setSelectedCommissionsToPay(prev => prev.filter(id => !data.itemIds.includes(id)))
                                      } else {
                                        // Seleccionar todas de este colaborador
                                        setSelectedCommissionsToPay(prev => [...new Set([...prev, ...data.itemIds])])
                                      }
                                    }}
                                  >
                                    {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                  </button>
                                  <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>{data.name}</span>
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--success-color)' }}>
                                  $ {data.total.toLocaleString()}
                                </span>
                              </div>
                            )
                          })}

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total Comisiones Seleccionadas:</span>
                            <strong style={{ color: 'var(--danger-color)' }}>- $ {totalComisionesSeleccionadas.toLocaleString()}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* SUB-PASO C: Ganancia Neta Peluquería */}
                    <div style={{ background: 'rgba(180, 97, 42,0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(180, 97, 42,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Queda en Peluquería (tras comisiones):</span>
                        <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Efectivo físico menos comisiones pagadas</span>
                      </div>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--primary-color)' }}>
                        $ {saldoCajaPostComisiones.toLocaleString()}
                      </strong>
                    </div>
                  </>
                )}

                {/* SUB-PASO D: Extracción de la Dueña */}
                <div className="input-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>3. Efectivo Separado para Retiro de Dueña (Sobre / Gomita)</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)' }}>$</span>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      className="input-field" 
                      style={{ paddingLeft: '1.75rem', width: '100%', margin: 0 }}
                      value={extraccionDuena} 
                      onChange={(e) => setExtraccionDuena(e.target.value)}
                    />
                  </div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.25rem' }}>
                    Efectivo que se separa con gomita o en sobre para que retire el dueño, dejando únicamente la caja chica fija para mañana.
                  </span>
                </div>

                {/* SUB-PASO E: Fondo Siguiente Apertura */}
                <div style={{ background: 'rgba(34,197,94,0.08)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--success-color)', display: 'block' }}>4. Caja Chica Fija que Queda para Mañana</strong>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>Efectivo físico contado menos el retiro separado para la dueña</span>
                  </div>
                  <strong style={{ fontSize: '1.4rem', color: 'var(--success-color)' }}>
                    $ {saldoFinalTurnoSiguiente.toLocaleString()}
                  </strong>
                </div>

                {/* Observaciones */}
                <div className="input-group">
                  <label>Observaciones / Comentarios</label>
                  <textarea 
                    className="input-field" 
                    rows="2" 
                    style={{ width: '100%', margin: 0 }}
                    placeholder="Escriba aquí si hubo alguna anomalía o comentario sobre el balance..."
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                  />
                </div>

                {/* Firma Digital */}
                <div className="input-group" style={{ borderTop: '1px dashed var(--surface-border)', paddingTop: '1.25rem' }}>
                  <label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Firma de Responsabilidad Digital *</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field" 
                    style={{ width: '100%', margin: 0, fontStyle: 'italic', fontSize: '1.1rem', letterSpacing: '1px' }}
                    placeholder="Escriba su Nombre Completo"
                    value={firmaDigital}
                    onChange={(e) => setFirmaDigital(e.target.value)}
                  />
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.5rem' }}>
                    Al escribir su nombre y hacer clic en el botón de abajo, usted declara bajo juramento haber realizado el arqueo físico y se responsabiliza del control de caja.
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {(!chkEfectivo || !chkTarjeta || !chkTransferencia) && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.15)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.75rem', color: '#f59e0b' }}>
                      <AlertCircle size={16} style={{ flexShrink: 0 }} />
                      <span>Debe tildar como OK las 3 tarjetas de arqueo arriba para habilitar el cierre.</span>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ 
                      width: '100%', 
                      padding: '1rem', 
                      fontSize: '1rem', 
                      fontWeight: 'bold', 
                      background: 'linear-gradient(135deg, var(--primary-color), #E39461)',
                      border: 'none',
                      boxShadow: '0 4px 15px rgba(180, 97, 42, 0.3)'
                    }}
                    disabled={isSubmitting || !chkEfectivo || !chkTarjeta || !chkTransferencia}
                  >
                    {isSubmitting ? 'Registrando Cierre...' : '📝 Cerrar Caja de Forma Responsable'}
                  </button>
                </div>
              </form>
            </div>

          </div>

          {/* HISTORIAL DE CIERRES DE CAJA (SOLO ADMIN/SUPERADMIN) */}
          {isAdminOrSuper && (() => {
            const cierresConMeta = cierresHistory.map((c, idx) => {
              const prevCierre = cierresHistory[idx + 1]
              const inicioDia = c.efectivo_inicial !== null && c.efectivo_inicial !== undefined
                ? Number(c.efectivo_inicial)
                : (prevCierre ? Number(prevCierre.saldo_caja_restante) : 0)
              const retiroDuenaCalculado = Math.max(0, Number(c.efectivo_real || 0) - Number(c.saldo_caja_restante || 0))
              const ctrlInfo = getControlInfo(c)
              return { c, idx, inicioDia, retiroDuenaCalculado, ctrlInfo }
            })

            const pendientesList = cierresConMeta.filter(item => !item.ctrlInfo.controlada)
            const controladasList = cierresConMeta.filter(item => item.ctrlInfo.controlada)
            const totalSobresPendientes = pendientesList.reduce((acc, item) => acc + item.retiroDuenaCalculado, 0)
            const totalSobresControlados = controladasList.reduce((acc, item) => acc + (item.ctrlInfo.retiroUky ? item.retiroDuenaCalculado : 0), 0)

            const filteredCierresConMeta = cierresConMeta.filter(item => {
              if (filtroControlCierres === 'pendientes') return !item.ctrlInfo.controlada
              if (filtroControlCierres === 'controladas') return item.ctrlInfo.controlada
              return true
            })

            return (
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={20} style={{ color: 'var(--primary-color)' }} />
                      Historial de Cierres de Caja y Control de Sobres
                    </h2>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Identifica qué cajas cerradas tienes pendientes de controlar/retirar el efectivo y cuáles ya retiraste.
                    </span>
                  </div>

                  {/* Botones de filtro rápido */}
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={filtroControlCierres === 'todos' ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '8px' }}
                      onClick={() => setFiltroControlCierres('todos')}
                    >
                      📋 Todas ({cierresConMeta.length})
                    </button>
                    <button
                      type="button"
                      className={filtroControlCierres === 'pendientes' ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.78rem',
                        borderRadius: '8px',
                        borderColor: filtroControlCierres === 'pendientes' ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)',
                        background: filtroControlCierres === 'pendientes' ? '#f59e0b' : 'rgba(245, 158, 11, 0.1)',
                        color: filtroControlCierres === 'pendientes' ? '#ffffff' : '#f59e0b',
                        fontWeight: 700
                      }}
                      onClick={() => setFiltroControlCierres('pendientes')}
                    >
                      ⏳ Pendientes ({pendientesList.length})
                    </button>
                    <button
                      type="button"
                      className={filtroControlCierres === 'controladas' ? 'btn btn-primary' : 'btn btn-secondary'}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.78rem',
                        borderRadius: '8px',
                        borderColor: filtroControlCierres === 'controladas' ? 'var(--success-color)' : 'rgba(34, 197, 94, 0.4)',
                        background: filtroControlCierres === 'controladas' ? 'var(--success-color)' : 'rgba(34, 197, 94, 0.1)',
                        color: filtroControlCierres === 'controladas' ? '#ffffff' : 'var(--success-color)',
                        fontWeight: 700
                      }}
                      onClick={() => setFiltroControlCierres('controladas')}
                    >
                      ✅ Controladas / Retiradas ({controladasList.length})
                    </button>
                  </div>
                </div>

                {/* PANEL RESUMEN DE SOBRES ACUMULADOS PARA UKY */}
                {cierresHistory.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div
                      onClick={() => setFiltroControlCierres(filtroControlCierres === 'pendientes' ? 'todos' : 'pendientes')}
                      style={{
                        background: pendientesList.length > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.06)',
                        border: pendientesList.length > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(34, 197, 94, 0.25)',
                        borderRadius: '10px',
                        padding: '1rem 1.15rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: pendientesList.length > 0 ? '#f59e0b' : 'var(--success-color)' }}>
                          {pendientesList.length > 0 ? '⏳ Sobres / Cajas Pendientes de Control y Retiro' : '🎉 Todas las Cajas al Día'}
                        </span>
                        <span style={{
                          background: pendientesList.length > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: pendientesList.length > 0 ? '#f59e0b' : 'var(--success-color)',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {pendientesList.length} {pendientesList.length === 1 ? 'caja' : 'cajas'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        $ {totalSobresPendientes.toLocaleString()} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>acumulado en sobres p/ retirar</span>
                      </div>
                      {pendientesList.length > 0 && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.4rem', lineHeight: 1.4 }}>
                          <strong>Fechas pendientes:</strong>{' '}
                          {pendientesList.slice(0, 6).map(item =>
                            new Date(item.c.fecha_cierre).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                          ).join(' • ')}
                          {pendientesList.length > 6 ? ` (+${pendientesList.length - 6} más)` : ''}
                        </div>
                      )}
                    </div>

                    <div
                      onClick={() => setFiltroControlCierres(filtroControlCierres === 'controladas' ? 'todos' : 'controladas')}
                      style={{
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        borderRadius: '10px',
                        padding: '1rem 1.15rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--success-color)' }}>
                          ✅ Cajas ya Controladas / Retiradas por el dueño
                        </span>
                        <span style={{
                          background: 'rgba(34, 197, 94, 0.18)',
                          color: 'var(--success-color)',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}>
                          {controladasList.length} {controladasList.length === 1 ? 'caja' : 'cajas'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        $ {totalSobresControlados.toLocaleString()} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>total retirado en cajas controladas</span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                        Haz clic en cualquier botón de la columna <strong>Control Caja</strong> para registrar el retiro o ver el detalle.
                      </div>
                    </div>
                  </div>
                )}

                {cierresHistory.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No se registran cierres de caja previos.</p>
                ) : filteredCierresConMeta.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                    No hay cajas cerradas en el filtro seleccionado.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Fecha Cierre</th>
                          <th>Responsable</th>
                          <th>Caja Chica Inicial</th>
                          <th>Gastos Caja Chica</th>
                          <th>Esperado</th>
                          <th>Contado Real</th>
                          <th>Separado p/ Retiro Dueña</th>
                          <th>Queda en Caja Chica</th>
                          <th style={{ textAlign: 'center' }}>Control Caja / Retiro del dueño</th>
                          <th style={{ textAlign: 'center' }}>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCierresConMeta.map(({ c, idx, inicioDia, retiroDuenaCalculado, ctrlInfo }) => {
                          const diff = Number(c.efectivo_real) - Number(c.efectivo_esperado)
                          const gastosCierre = getGastosDeCierre(c, idx)
                          const totalGastosCierre = gastosCierre.reduce((acc, m) => acc + Number(m.monto || 0), 0)

                          return (
                            <tr key={c.id}>
                              <td>{new Date(c.fecha_cierre).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                              <td>{c.usuarios?.nombre_completo || c.firma_digital_nombre}</td>
                              <td>
                                <span style={{ 
                                  background: 'rgba(180, 97, 42, 0.1)', 
                                  color: 'var(--primary-color)', 
                                  padding: '0.2rem 0.55rem', 
                                  borderRadius: '6px', 
                                  fontWeight: '600' 
                                }}>
                                  $ {inicioDia.toLocaleString()}
                                </span>
                              </td>
                              <td>
                                {totalGastosCierre > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <strong style={{ color: 'var(--danger-color)', fontSize: '0.88rem' }}>
                                      - $ {totalGastosCierre.toLocaleString()}
                                    </strong>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={gastosCierre.map(g => `${g.descripcion}: $${Number(g.monto).toLocaleString()}`).join(' | ')}>
                                      {gastosCierre.map(g => `${g.descripcion} ($${Number(g.monto).toLocaleString()})`).join(', ')}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>$ 0</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                $ {Number(c.efectivo_esperado).toLocaleString()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                    $ {Number(c.efectivo_real).toLocaleString()}
                                  </strong>
                                  <span style={{ 
                                    fontSize: '0.72rem',
                                    color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--success-color)' : 'var(--danger-color)',
                                    fontWeight: '600'
                                  }}>
                                    {diff === 0 ? 'Exacto OK' : `${diff > 0 ? 'Sobrante +' : 'Faltante -'}$ ${Math.abs(diff).toLocaleString()}`}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: '#f59e0b',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  fontWeight: '700'
                                }}>
                                  $ {retiroDuenaCalculado.toLocaleString()}
                                </span>
                              </td>
                              <td>
                                <span style={{ 
                                  background: 'rgba(34, 197, 94, 0.1)', 
                                  color: 'var(--success-color)', 
                                  padding: '0.2rem 0.55rem', 
                                  borderRadius: '6px', 
                                  fontWeight: 'bold' 
                                }}>
                                  $ {Number(c.saldo_caja_restante).toLocaleString()}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {ctrlInfo.controlada ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenControlCierre(c)}
                                      style={{
                                        background: 'rgba(34, 197, 94, 0.14)',
                                        color: 'var(--success-color)',
                                        border: '1px solid rgba(34, 197, 94, 0.4)',
                                        padding: '0.28rem 0.65rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={ctrlInfo.comentario ? `Controlada (${ctrlInfo.por}): ${ctrlInfo.comentario}` : `Controlada por ${ctrlInfo.por}. Clic para ver o editar comentario`}
                                    >
                                      <Check size={14} />
                                      {ctrlInfo.retiroUky ? 'Controlada • Retiró el dueño' : 'Controlada'}
                                    </button>
                                    {ctrlInfo.comentario && (
                                      <span
                                        style={{
                                          fontSize: '0.68rem',
                                          color: 'var(--text-secondary)',
                                          maxWidth: '175px',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          fontStyle: 'italic'
                                        }}
                                        title={ctrlInfo.comentario}
                                      >
                                        "{ctrlInfo.comentario}"
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.18rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenControlCierre(c)}
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.14)',
                                        color: '#f59e0b',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        padding: '0.28rem 0.65rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title="Marcar que el dueño controló y retiró el dinero de esta caja cerrada"
                                    >
                                      <CheckSquare size={14} />
                                      ⏳ Controlar / Retirar
                                    </button>
                                    <span style={{ fontSize: '0.67rem', color: '#f59e0b', fontWeight: 600 }}>
                                      Pendiente de retiro
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                                  <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => {
                                      setShowAddGastoEnDetalle(false)
                                      setSelectedCierreDetalle({ ...c, inicioCalculado: inicioDia, idxInHistory: idx })
                                    }}
                                    title="Ver desglose completo de caja chica, gastos detallados y retiro"
                                  >
                                    <Eye size={14} />
                                    Ver Detalle
                                  </button>
                                  {canManageCaja && (
                                    <button 
                                      type="button" 
                                      className="btn btn-secondary" 
                                      style={{ 
                                        padding: '0.3rem 0.6rem', 
                                        fontSize: '0.75rem', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '0.35rem',
                                        color: 'var(--primary-color)',
                                        borderColor: 'rgba(180, 97, 42, 0.3)'
                                      }}
                                      onClick={() => handleOpenEditCierre({ ...c, inicioCalculado: inicioDia })}
                                      title="Corregir montos de este cierre"
                                    >
                                      <Edit3 size={14} />
                                      Corregir
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
            )
          })()}

        </div>
      )}

      {/* PORTAL PARA REGISTRAR GASTO / EGRESO */}
      {showRetiroModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Registrar Gasto de Caja Chica</h2>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setShowRetiroModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleCrearRetiro}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="input-group">
                  <label>Monto del Gasto *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)' }}>$</span>
                    <input 
                      type="number" 
                      required 
                      min="0.01" 
                      step="0.01"
                      className="input-field" 
                      style={{ paddingLeft: '1.75rem', width: '100%', margin: 0 }}
                      placeholder="0.00"
                      value={retiroMonto}
                      onChange={(e) => setRetiroMonto(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label>Concepto / Detalle del Gasto *</label>
                  <textarea 
                    required 
                    className="input-field" 
                    rows="3"
                    style={{ width: '100%', margin: 0 }}
                    placeholder="Ej: Comida, Servilletas, Café, Artículos de limpieza..."
                    value={retiroDescripcion}
                    onChange={(e) => setRetiroDescripcion(e.target.value)}
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px' }}>
                  🚨 Al registrar el gasto, este se descontará automáticamente del efectivo esperado en caja y quedará detallado ítem por ítem en el cierre del día bajo el nombre de: <strong>{userProfile?.nombre_completo}</strong>.
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRetiroModal(false)} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--danger-color)', borderColor: 'var(--danger-color)' }} disabled={isSubmitting}>
                  {isSubmitting ? 'Registrando...' : 'Confirmar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL DETALLE DE CIERRE DE CAJA */}
      {selectedCierreDetalle && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Wallet size={24} style={{ color: 'var(--primary-color)' }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Comprobante y Desglose de Cierre de Caja</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Cerrado el {new Date(selectedCierreDetalle.fecha_cierre).toLocaleString()}
                  </span>
                </div>
              </div>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setSelectedCierreDetalle(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', overflowY: 'auto', flex: 1 }}>
              {(() => {
                const idxHist = selectedCierreDetalle.idxInHistory ?? cierresHistory.findIndex(x => x.id === selectedCierreDetalle.id)
                const movsCierre = getGastosDeCierre(selectedCierreDetalle, idxHist)
                const totalGastosCierre = movsCierre.reduce((acc, m) => acc + Number(m.monto || 0), 0)
                const inicioCajaChica = Number(selectedCierreDetalle.inicioCalculado ?? selectedCierreDetalle.efectivo_inicial ?? 0)
                const esperadoEfectivo = Number(selectedCierreDetalle.efectivo_esperado || 0)
                const ventasEfectivoDia = Math.max(0, esperadoEfectivo - inicioCajaChica + totalGastosCierre)
                const efectivoContadoReal = Number(selectedCierreDetalle.efectivo_real || 0)
                const quedaCajaChicaManana = Number(selectedCierreDetalle.saldo_caja_restante || 0)
                const separadoRetiroDuena = Math.max(0, efectivoContadoReal - quedaCajaChicaManana)
                const diff = efectivoContadoReal - esperadoEfectivo

                return (
                  <>
                    {/* Tarjetas Principales: Inicio vs Cierre vs Retiro Dueña */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.85rem' }}>
                      <div style={{ background: 'rgba(180, 97, 42, 0.08)', border: '1px solid rgba(180, 97, 42, 0.22)', padding: '0.9rem', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                          1. Caja Chica Inicial
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                          $ {inicioCajaChica.toLocaleString()}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fondo fijo con el que abrió</span>
                      </div>

                      <div style={{ background: 'rgba(245, 158, 11, 0.09)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0.9rem', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 'bold' }}>
                          2. Separado p/ Retiro del dueño
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '0.2rem' }}>
                          $ {separadoRetiroDuena.toLocaleString()}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Efectivo separado con gomita</span>
                      </div>

                      <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.22)', padding: '0.9rem', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--success-color)', fontWeight: 'bold' }}>
                          3. Quedó en Caja Chica
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success-color)', marginTop: '0.2rem' }}>
                          $ {quedaCajaChicaManana.toLocaleString()}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fondo fijo para el día siguiente</span>
                      </div>
                    </div>

                    {/* PASO A PASO DE LA CUENTA DE EFECTIVO Y CAJA CHICA */}
                    <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.84rem' }}>
                      <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--primary-color)', fontWeight: '700', marginBottom: '0.15rem' }}>
                        Cuenta Paso a Paso del Efectivo del Día
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Fondo Fijo Inicial (Caja Chica al abrir):</span>
                        <strong>$ {inicioCajaChica.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success-color)' }}>
                        <span>+ Ventas Cobradas en Efectivo en el Día:</span>
                        <strong>+ $ {ventasEfectivoDia.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger-color)' }}>
                        <span>- Suma de Gastos Pagados por Caja Chica ({movsCierre.length}):</span>
                        <strong>- $ {totalGastosCierre.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>= Total Efectivo Esperado en Caja:</span>
                        <strong style={{ fontSize: '0.95rem' }}>$ {esperadoEfectivo.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Efectivo Físico Contado al Cerrar:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>$ {efectivoContadoReal.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Diferencia de Arqueo:</span>
                        <strong style={{ color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                          {diff === 0 ? '$ 0 (Balance exacto)' : `${diff > 0 ? '+ $' : '- $'}${Math.abs(diff).toLocaleString()} (${diff > 0 ? 'Sobrante' : 'Faltante'})`}
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem', color: '#f59e0b' }}>
                        <span>- Efectivo Separado para Retiro del dueño (Sobre / Gomita):</span>
                        <strong>- $ {separadoRetiroDuena.toLocaleString()}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                        <span style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>= Caja Chica Fija que Quedó para el Día Siguiente:</span>
                        <strong style={{ color: 'var(--success-color)', fontSize: '0.95rem' }}>$ {quedaCajaChicaManana.toLocaleString()}</strong>
                      </div>
                    </div>

                    {/* DETALLE ITEMIZADO DE GASTOS DE CAJA CHICA (Y BOTÓN PARA AGREGAR GASTO FALTANTE) */}
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.22)',
                      borderRadius: '10px',
                      padding: '0.95rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      fontSize: '0.82rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          💸 Detalle de Gastos de Caja Chica ({movsCierre.length}):
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <strong style={{ color: 'var(--danger-color)', fontSize: '0.9rem' }}>
                            Total Gastos: - $ {totalGastosCierre.toLocaleString()}
                          </strong>
                          <button
                            type="button"
                            onClick={() => setShowAddGastoEnDetalle(!showAddGastoEnDetalle)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.14)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              color: 'var(--danger-color)',
                              padding: '0.22rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.73rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <Plus size={12} /> {showAddGastoEnDetalle ? 'Cancelar' : 'Detallar Gasto'}
                          </button>
                        </div>
                      </div>

                      {movsCierre.length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem' }}>
                          No se detallaron gastos de caja chica en este cierre. Si hubo un gasto (ej. comida, servilletas, café), puede detallarlo con el botón "+ Detallar Gasto".
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '150px', overflowY: 'auto', marginTop: '0.15rem', background: 'rgba(0,0,0,0.18)', padding: '0.55rem 0.7rem', borderRadius: '6px' }}>
                          {movsCierre.map(m => (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.22rem' }}>
                              <span>
                                • <strong>{m.descripcion}</strong>
                                {m.usuarios?.nombre_completo ? <em style={{ color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>({m.usuarios.nombre_completo})</em> : ''}
                              </span>
                              <strong style={{ color: 'var(--danger-color)' }}>- $ {Number(m.monto).toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {showAddGastoEnDetalle && (
                        <form onSubmit={handleAgregarGastoACierre} style={{ marginTop: '0.4rem', padding: '0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div style={{ fontSize: '0.76rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                            Agregar ítem de gasto a este cierre:
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '0.5rem' }}>
                            <input
                              type="text"
                              required
                              className="input-field"
                              placeholder="Ej: Comida, Servilletas, Café..."
                              style={{ margin: 0, fontSize: '0.8rem', padding: '0.45rem 0.6rem' }}
                              value={nuevoGastoCierreDesc}
                              onChange={(e) => setNuevoGastoCierreDesc(e.target.value)}
                            />
                            <input
                              type="number"
                              required
                              min="1"
                              step="0.01"
                              className="input-field"
                              placeholder="Monto $"
                              style={{ margin: 0, fontSize: '0.8rem', padding: '0.45rem 0.6rem' }}
                              value={nuevoGastoCierreMonto}
                              onChange={(e) => setNuevoGastoCierreMonto(e.target.value)}
                            />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={descontarDeEsperadoAlAgregar}
                              onChange={(e) => setDescontarDeEsperadoAlAgregar(e.target.checked)}
                            />
                            Descontar este gasto del Efectivo Esperado del cierre
                          </label>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={isUpdatingCierre} style={{ padding: '0.35rem 0.75rem', fontSize: '0.76rem', background: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}>
                              {isUpdatingCierre ? 'Guardando...' : 'Guardar Gasto en el Cierre'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* Resumen de Tarjetas y Transferencias del Cierre */}
                    <div style={{ background: 'rgba(0,0,0,0.12)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.82rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Ventas con Tarjetas (Cupones): </span>
                        <strong>$ {Number(selectedCierreDetalle.tarjeta_esperado || 0).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Ventas por Transferencia: </span>
                        <strong>$ {Number(selectedCierreDetalle.transferencia_esperado || 0).toLocaleString()}</strong>
                      </div>
                    </div>

                    {/* COMANDAS INCLUIDAS EN ESTE CIERRE DE CAJA */}
                    <div style={{
                      background: 'rgba(180, 97, 42, 0.05)',
                      border: '1px solid rgba(180, 97, 42, 0.22)',
                      borderRadius: '10px',
                      padding: '0.95rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      fontSize: '0.82rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>
                          🧾 Comandas Incluidas en esta Caja ({ordenesDeCierreDetalle.length}):
                        </strong>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCierreDetalle(null)
                            navigate('/ordenes', { state: { openNewComandaPast: true } })
                          }}
                          style={{
                            background: 'rgba(245, 158, 11, 0.14)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            color: 'var(--warning-color)',
                            padding: '0.22rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.73rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <Plus size={12} /> Cargar Comanda Faltante
                        </button>
                      </div>

                      {loadingOrdenesCierre ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Cargando comandas de la caja...</span>
                      ) : ordenesDeCierreDetalle.length === 0 ? (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.78rem' }}>
                          No hay comandas vinculadas a este cierre de caja.
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '185px', overflowY: 'auto', background: 'rgba(0,0,0,0.18)', padding: '0.55rem 0.7rem', borderRadius: '6px' }}>
                          {ordenesDeCierreDetalle.map(o => {
                            const cliName = o.clientes ? `${o.clientes.nombre || ''} ${o.clientes.apellido || ''}`.trim() : 'Cliente Eventual'
                            return (
                              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.3rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {cliName}
                                    {o.es_colaborativa && (
                                      <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', background: 'rgba(180, 97, 42,0.2)', color: 'var(--primary-color)', padding: '0.08rem 0.35rem', borderRadius: '4px' }}>
                                        👥 Colaborativo
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                    Resp: {o.usuarios?.nombre_completo || '-'} • Pago: {(o.pago_metodo || 'efectivo').toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                  <strong style={{ color: 'var(--success-color)', whiteSpace: 'nowrap' }}>
                                    $ {Number(o.total_economico || 0).toLocaleString()}
                                  </strong>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCierreDetalle(null)
                                      navigate('/ordenes', { state: { editOrdenId: o.id } })
                                    }}
                                    style={{
                                      background: 'rgba(180, 97, 42, 0.14)',
                                      border: '1px solid rgba(180, 97, 42, 0.35)',
                                      color: 'var(--primary-color)',
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '5px',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    ✏️ Editar
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Responsable, Firma y Observaciones */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Responsable del Cierre: </span>
                        <strong>{selectedCierreDetalle.usuarios?.nombre_completo || 'Usuario'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Firma Digital de Juramento: </span>
                        <span style={{ fontStyle: 'italic', fontWeight: '600', color: 'var(--primary-color)' }}>{selectedCierreDetalle.firma_digital_nombre}</span>
                      </div>
                      {getObservacionesSinTagControl(selectedCierreDetalle.observaciones) && (
                        <div style={{ marginTop: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Observaciones:</span>
                          <p style={{ margin: '0.2rem 0 0 0', fontStyle: 'italic' }}>"{getObservacionesSinTagControl(selectedCierreDetalle.observaciones)}"</p>
                        </div>
                      )}
                      {(() => {
                        const ctrlDetalle = getControlInfo(selectedCierreDetalle)
                        if (!ctrlDetalle.controlada) return null
                        return (
                          <div style={{ marginTop: '0.4rem', borderTop: '1px dashed rgba(34, 197, 94, 0.25)', paddingTop: '0.45rem', color: 'var(--success-color)' }}>
                            <span style={{ fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Check size={14} /> Caja Controlada por {ctrlDetalle.por}
                              {ctrlDetalle.fecha ? ` (${new Date(ctrlDetalle.fecha).toLocaleDateString('es-AR')})` : ''}
                            </span>
                            {ctrlDetalle.comentario && (
                              <p style={{ margin: '0.2rem 0 0 0', fontStyle: 'italic', color: 'var(--text-primary)' }}>
                                "{ctrlDetalle.comentario}"
                              </p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderTop: '1px solid var(--surface-border)', flexShrink: 0 }}>
              {canManageCaja ? (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.4rem', 
                    color: 'var(--primary-color)', 
                    borderColor: 'rgba(180, 97, 42, 0.4)' 
                  }}
                  onClick={() => {
                    const c = selectedCierreDetalle
                    setSelectedCierreDetalle(null)
                    handleOpenEditCierre(c)
                  }}
                  title="Abrir formulario para corregir los montos de este cierre"
                >
                  <Edit3 size={15} />
                  Corregir Montos del Cierre
                </button>
              ) : <div />}
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedCierreDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL CORREGIR CIERRE DE CAJA (DESDE EL NIVEL DE UKY Y SUPERADMIN) */}
      {cierreToEdit && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px', width: '92%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Edit3 size={22} style={{ color: 'var(--primary-color)' }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Corregir Cierre de Caja</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Cierre del {new Date(cierreToEdit.fecha_cierre).toLocaleString()} (Registrado por {cierreToEdit.usuarios?.nombre_completo || cierreToEdit.firma_digital_nombre})
                  </span>
                </div>
              </div>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setCierreToEdit(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEditCierre} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', overflowY: 'auto', flex: 1 }}>
                
                <div style={{ background: 'rgba(180, 97, 42, 0.06)', border: '1px solid rgba(180, 97, 42, 0.2)', padding: '0.85rem', borderRadius: '8px', fontSize: '0.82rem' }}>
                  ℹ️ <strong>Valores del sistema para este turno:</strong>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                    <span>Efectivo Teórico Esperado:</span>
                    <strong>$ {Number(cierreToEdit.efectivo_esperado || 0).toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                    <span>Fondo Inicial de Apertura:</span>
                    <strong>$ {Number(cierreToEdit.inicioCalculado || cierreToEdit.efectivo_inicial || 0).toLocaleString()}</strong>
                  </div>
                </div>

                <div className="input-group">
                  <label style={{ fontWeight: '600', fontSize: '0.88rem' }}>1. Efectivo Físico Real Contado *</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                    El dinero total que había físicamente en el cajón antes de los retiros.
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                    <input 
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      className="input-field"
                      style={{ paddingLeft: '1.85rem', width: '100%', margin: 0, fontWeight: 'bold', fontSize: '1.05rem' }}
                      value={editEfectivoReal}
                      onChange={(e) => {
                        const val = e.target.value
                        setEditEfectivoReal(val)
                        if (editAutoCalcRestante) {
                          const ext = Number(editExtraccionDuena) || 0
                          setEditSaldoRestante(String(Math.max(0, (Number(val) || 0) - ext)))
                        }
                      }}
                    />
                  </div>
                  {/* Indicador de Diferencia */}
                  {(() => {
                    const diff = (Number(editEfectivoReal) || 0) - Number(cierreToEdit.efectivo_esperado || 0)
                    return (
                      <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>Diferencia con el esperado:</span>
                        <strong style={{ color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                          {diff === 0 ? '$ 0 (Balance exacto OK)' : `${diff > 0 ? '+ $' : '- $'}${Math.abs(diff).toLocaleString()} (${diff > 0 ? 'Sobrante' : 'Faltante'})`}
                        </strong>
                      </div>
                    )
                  })()}
                </div>

                <div className="input-group">
                  <label style={{ fontWeight: '600', fontSize: '0.88rem' }}>2. Retiro / Extracción de Efectivo (Dueña / Salón)</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                    Monto retirado por el dueño de la caja.
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      className="input-field"
                      style={{ paddingLeft: '1.85rem', width: '100%', margin: 0 }}
                      value={editExtraccionDuena}
                      onChange={(e) => {
                        const val = e.target.value
                        setEditExtraccionDuena(val)
                        if (editAutoCalcRestante) {
                          const real = Number(editEfectivoReal) || 0
                          setEditSaldoRestante(String(Math.max(0, real - (Number(val) || 0))))
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="input-group" style={{ background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.25)', padding: '0.85rem', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.88rem', color: 'var(--success-color)', margin: 0 }}>
                      💵 Saldo que queda en caja (Apertura del turno siguiente) *
                    </label>
                    <button 
                      type="button" 
                      onClick={() => setEditAutoCalcRestante(!editAutoCalcRestante)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {editAutoCalcRestante ? 'Ajustar manualmente' : 'Calcular automático'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>$</span>
                    <input 
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      readOnly={editAutoCalcRestante}
                      className="input-field"
                      style={{ 
                        paddingLeft: '1.85rem', 
                        width: '100%', 
                        margin: 0, 
                        fontWeight: 'bold', 
                        fontSize: '1.1rem',
                        color: 'var(--success-color)',
                        background: editAutoCalcRestante ? 'rgba(0,0,0,0.05)' : 'transparent'
                      }}
                      value={editSaldoRestante}
                      onChange={(e) => setEditSaldoRestante(e.target.value)}
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem', display: 'block' }}>
                    Este monto será el fondo de apertura con el que arrancará automáticamente el siguiente día.
                  </span>
                </div>

                <div className="input-group">
                  <label style={{ fontWeight: '600', fontSize: '0.85rem' }}>Motivo de la corrección</label>
                  <input 
                    type="text"
                    className="input-field"
                    placeholder="Ej: Corrección por error de tipeo en conteo de efectivo"
                    style={{ width: '100%', margin: 0, fontSize: '0.85rem' }}
                    value={editMotivo}
                    onChange={(e) => setEditMotivo(e.target.value)}
                  />
                </div>

              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--surface-border)', flexShrink: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCierreToEdit(null)} disabled={isUpdatingCierre}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={isUpdatingCierre} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Save size={15} />
                  {isUpdatingCierre ? 'Guardando...' : 'Guardar Corrección'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL PARA MARCAR CAJA CERRADA COMO "CONTROLADA" CON COMENTARIOS */}
      {cierreToControl && createPortal(
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CheckSquare size={22} style={{ color: 'var(--success-color)' }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Control de Caja Cerrada</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Cierre del {new Date(cierreToControl.fecha_cierre).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} ({cierreToControl.usuarios?.nombre_completo || cierreToControl.firma_digital_nombre})
                  </span>
                </div>
              </div>
              <button className="btn" style={{ padding: '0.5rem', background: 'transparent' }} onClick={() => setCierreToControl(null)}>✕</button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleGuardarControlCierre(true)
              }}
            >
              <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {(() => {
                  const retiroSeparado = Math.max(0, Number(cierreToControl.efectivo_real || 0) - Number(cierreToControl.saldo_caja_restante || 0))
                  const obsOriginal = getObservacionesSinTagControl(cierreToControl.observaciones)
                  return (
                    <>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Efectivo Contado Real:</span>
                          <strong>$ {Number(cierreToControl.efectivo_real || 0).toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f59e0b' }}>
                          <span>Separado p/ Retiro Dueña (Sobre):</span>
                          <strong>$ {retiroSeparado.toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Tarjetas / Transferencias:</span>
                          <strong>$ {Number(cierreToControl.tarjeta_esperado || 0).toLocaleString()} / $ {Number(cierreToControl.transferencia_esperado || 0).toLocaleString()}</strong>
                        </div>
                        {obsOriginal && (
                          <div style={{ marginTop: '0.25rem', paddingTop: '0.35rem', borderTop: '1px dashed rgba(255,255,255,0.08)', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                            Obs. cierre: "{obsOriginal}"
                          </div>
                        )}
                      </div>

                      {/* Selector claro de retiro de efectivo del dueño */}
                      <div className="input-group" style={{ margin: 0 }}>
                        <label style={{ fontWeight: '600', fontSize: '0.88rem', marginBottom: '0.45rem', display: 'block' }}>
                          ¿Qué se hizo con el efectivo de este sobre? *
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setControlRetiroDinero('retiro_uky')}
                            style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '8px',
                              border: controlRetiroDinero === 'retiro_uky' ? '2px solid var(--success-color)' : '1px solid var(--surface-border)',
                              background: controlRetiroDinero === 'retiro_uky' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(255,255,255,0.02)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              textAlign: 'left',
                              fontSize: '0.84rem',
                              fontWeight: controlRetiroDinero === 'retiro_uky' ? 700 : 500
                            }}
                          >
                            <span>💵 Retiró el dueño el dinero del sobre ($ {retiroSeparado.toLocaleString()})</span>
                            {controlRetiroDinero === 'retiro_uky' && <Check size={16} style={{ color: 'var(--success-color)' }} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => setControlRetiroDinero('queda_salon')}
                            style={{
                              padding: '0.65rem 0.85rem',
                              borderRadius: '8px',
                              border: controlRetiroDinero === 'queda_salon' ? '2px solid var(--primary-color)' : '1px solid var(--surface-border)',
                              background: controlRetiroDinero === 'queda_salon' ? 'rgba(180, 97, 42, 0.14)' : 'rgba(255,255,255,0.02)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              textAlign: 'left',
                              fontSize: '0.84rem',
                              fontWeight: controlRetiroDinero === 'queda_salon' ? 700 : 500
                            }}
                          >
                            <span>📌 Caja controlada (sin retiro de efectivo)</span>
                            {controlRetiroDinero === 'queda_salon' && <Check size={16} style={{ color: 'var(--primary-color)' }} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )
                })()}

                <div className="input-group" style={{ margin: 0 }}>
                  <label style={{ fontWeight: '600', fontSize: '0.88rem', marginBottom: '0.35rem', display: 'block' }}>
                    Comentarios del Control (Opcional)
                  </label>
                  <textarea
                    className="input-field"
                    rows="3"
                    style={{ width: '100%', margin: 0 }}
                    placeholder="Ej: Sobre y comandas controladas OK, todo coincide..."
                    value={controlComentario}
                    onChange={(e) => setControlComentario(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                <div>
                  {getControlInfo(cierreToControl).controlada && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleGuardarControlCierre(false)}
                      disabled={isSavingControl}
                      style={{ fontSize: '0.78rem', color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                    >
                      Volver a Pendiente
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setCierreToControl(null)} disabled={isSavingControl}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSavingControl}
                    style={{ background: 'var(--success-color)', borderColor: 'var(--success-color)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}
                  >
                    <Check size={16} />
                    {isSavingControl ? 'Guardando...' : 'Pasar a Controlada'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}
