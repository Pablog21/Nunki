/**
 * Utilidades para cálculo, desglose y visualización de pagos simples y mixtos.
 */

export const getTipoTarjetaPago = (orden) => {
  if (!orden) return null
  const metodo = (orden.pago_metodo || '').toLowerCase()
  if (metodo === 'credito' || metodo === 'tarjeta_credito') return 'credito'
  if (metodo === 'debito' || metodo === 'tarjeta_debito') return 'debito'

  if (orden.pago_detalles) {
    try {
      const d = typeof orden.pago_detalles === 'string' ? JSON.parse(orden.pago_detalles) : orden.pago_detalles
      if (d?.tipo_tarjeta === 'credito' || d?.tipo_tarjeta === 'debito') {
        return d.tipo_tarjeta
      }
      if (Number(d?.credito || 0) > 0) return 'credito'
      if (Number(d?.debito || 0) > 0) return 'debito'
    } catch {
      // ignore parse errors
    }
  }

  if (typeof orden.pago_comprobante_url === 'string') {
    if (/\[Cr[eé]dito/i.test(orden.pago_comprobante_url) || /_TT:CREDITO/i.test(orden.pago_comprobante_url)) return 'credito'
    if (/\[D[eé]bito\]/i.test(orden.pago_comprobante_url) || /_TT:DEBITO/i.test(orden.pago_comprobante_url)) return 'debito'
  }

  if (metodo === 'tarjeta') {
    // Retrocompatibilidad: si tenía cuotas asignadas, asumimos crédito
    if (orden.pago_detalles) {
      try {
        const d = typeof orden.pago_detalles === 'string' ? JSON.parse(orden.pago_detalles) : orden.pago_detalles
        if (d?.cuotas) return 'credito'
      } catch {
        // ignore
      }
    }
    if (typeof orden.pago_comprobante_url === 'string' && (/\[(\d+)\s*cuotas?\]/i.test(orden.pago_comprobante_url) || /_CUO:(\d+)/.test(orden.pago_comprobante_url))) {
      return 'credito'
    }
  }

  return null
}

export const getCuotasPago = (orden) => {
  if (!orden) return null
  const metodo = (orden.pago_metodo || '').toLowerCase()
  const tipoTarjeta = getTipoTarjetaPago(orden)

  // Si es explícitamente débito, efectivo o transferencia, no lleva cuotas
  if (metodo === 'debito' || metodo === 'tarjeta_debito' || metodo === 'efectivo' || metodo === 'transferencia') {
    return null
  }
  if (tipoTarjeta === 'debito') {
    return null
  }
  if (metodo !== 'credito' && metodo !== 'tarjeta_credito' && metodo !== 'tarjeta' && metodo !== 'mixto') {
    return null
  }

  if (orden.pago_detalles) {
    try {
      const d = typeof orden.pago_detalles === 'string' ? JSON.parse(orden.pago_detalles) : orden.pago_detalles
      if (d && d.cuotas) {
        const c = Number(d.cuotas)
        if (c >= 1 && c <= 3) return c
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof orden.pago_comprobante_url === 'string') {
    const matchCuo =
      orden.pago_comprobante_url.match(/\[(?:Cr[eé]dito\s*-\s*)?(\d+)\s*cuotas?\]/i) ||
      orden.pago_comprobante_url.match(/_CUO:(\d+)/)
    if (matchCuo) {
      const c = Number(matchCuo[1])
      if (c >= 1 && c <= 3) return c
    }
  }

  if (metodo === 'credito' || metodo === 'tarjeta_credito' || tipoTarjeta === 'credito') {
    return 1
  }

  return null
}

export const getDesglosePago = (orden) => {
  if (!orden) return { efectivo: 0, tarjeta: 0, credito: 0, debito: 0, transferencia: 0 }
  const total = Number(orden.total_economico || 0)
  const metodo = (orden.pago_metodo || '').toLowerCase()
  const tipoTarjeta = getTipoTarjetaPago(orden)

  if (metodo === 'mixto') {
    // 1. Probar columnas dedicadas
    let efec = orden.pago_efectivo !== null && orden.pago_efectivo !== undefined ? Number(orden.pago_efectivo) : NaN
    let tarj = orden.pago_tarjeta !== null && orden.pago_tarjeta !== undefined ? Number(orden.pago_tarjeta) : NaN
    let trans = orden.pago_transferencia !== null && orden.pago_transferencia !== undefined ? Number(orden.pago_transferencia) : NaN
    let cred = NaN
    let deb = NaN

    // 2. Probar json pago_detalles
    if (orden.pago_detalles) {
      try {
        const d = typeof orden.pago_detalles === 'string' ? JSON.parse(orden.pago_detalles) : orden.pago_detalles
        if (d) {
          if (isNaN(efec) || (efec === 0 && tarj === 0 && trans === 0)) {
            efec = Number(d.efectivo || 0)
            tarj = Number(d.tarjeta || 0)
            trans = Number(d.transferencia || 0)
          }
          if (d.credito !== undefined) cred = Number(d.credito || 0)
          if (d.debito !== undefined) deb = Number(d.debito || 0)
        }
      } catch {
        // ignore
      }
    }

    // 3. Probar fallback en comprobante url (MIXT_EF:15000_TA:15000_TR:0)
    if ((isNaN(efec) || (efec === 0 && tarj === 0 && trans === 0)) && orden.pago_comprobante_url?.includes('MIXT_EF:')) {
      const matchEf = orden.pago_comprobante_url.match(/MIXT_EF:([0-9.]+)/)
      const matchTa = orden.pago_comprobante_url.match(/_TA:([0-9.]+)/)
      const matchTr = orden.pago_comprobante_url.match(/_TR:([0-9.]+)/)
      if (matchEf) efec = Number(matchEf[1])
      if (matchTa) tarj = Number(matchTa[1])
      if (matchTr) trans = Number(matchTr[1])
    }

    const efecVal = isNaN(efec) ? 0 : efec
    const tarjVal = isNaN(tarj) ? 0 : tarj
    const transVal = isNaN(trans) ? 0 : trans

    let credVal = !isNaN(cred) ? cred : 0
    let debVal = !isNaN(deb) ? deb : 0
    if (tarjVal > 0 && credVal === 0 && debVal === 0) {
      if (tipoTarjeta === 'debito') {
        debVal = tarjVal
      } else {
        credVal = tarjVal
      }
    }

    return {
      efectivo: efecVal,
      tarjeta: tarjVal,
      credito: credVal,
      debito: debVal,
      transferencia: transVal
    }
  }

  if (metodo === 'credito' || metodo === 'tarjeta_credito') {
    return { efectivo: 0, tarjeta: total, credito: total, debito: 0, transferencia: 0 }
  }
  if (metodo === 'debito' || metodo === 'tarjeta_debito') {
    return { efectivo: 0, tarjeta: total, credito: 0, debito: total, transferencia: 0 }
  }
  if (metodo === 'tarjeta') {
    if (tipoTarjeta === 'debito') {
      return { efectivo: 0, tarjeta: total, credito: 0, debito: total, transferencia: 0 }
    }
    return { efectivo: 0, tarjeta: total, credito: total, debito: 0, transferencia: 0 }
  }
  if (metodo === 'transferencia') {
    return { efectivo: 0, tarjeta: 0, credito: 0, debito: 0, transferencia: total }
  }
  // Por defecto (efectivo u otros)
  return { efectivo: total, tarjeta: 0, credito: 0, debito: 0, transferencia: 0 }
}

export const getReferenciaPagoLimpia = (orden) => {
  if (!orden || !orden.pago_comprobante_url) return ''
  const raw = String(orden.pago_comprobante_url)
  if (raw.startsWith('data:image')) return raw
  return raw
    .replace(/^MIXT_EF:[0-9.]+_TA:[0-9.]+_TR:[0-9.]+(?:_TT:[A-Z]+)?(?:_CUO:\d+)?\s*\|\s*/i, '')
    .replace(/^\[(?:Cr[eé]dito\s*-\s*)?\d+\s*cuotas?\]\s*/i, '')
    .replace(/^\[D[eé]bito\]\s*/i, '')
    .trim()
}

export const formatMetodoPagoLabel = (orden, short = false) => {
  if (!orden) return '-'
  const metodo = (orden.pago_metodo || '').toLowerCase()
  const tipoTarjeta = getTipoTarjetaPago(orden)
  const cuotas = getCuotasPago(orden)

  if (metodo === 'mixto') {
    const desglose = getDesglosePago(orden)
    const parts = []
    if (desglose.efectivo > 0) {
      parts.push(short ? `$${(desglose.efectivo / 1000).toFixed(0)}k Ef.` : `$${Number(desglose.efectivo).toLocaleString()} Efec.`)
    }
    if (desglose.tarjeta > 0) {
      const esDebito = tipoTarjeta === 'debito'
      const cardName = esDebito ? (short ? 'Déb.' : 'Débito') : (short ? 'Créd.' : 'Crédito')
      const cuotasTag = !esDebito && cuotas ? ` (${cuotas} ${cuotas === 1 ? 'cuota' : 'cuotas'})` : ''
      parts.push(
        short
          ? `$${(desglose.tarjeta / 1000).toFixed(0)}k ${cardName}${cuotasTag}`
          : `$${Number(desglose.tarjeta).toLocaleString()} ${cardName}${cuotasTag}`
      )
    }
    if (desglose.transferencia > 0) {
      parts.push(short ? `$${(desglose.transferencia / 1000).toFixed(0)}k Transf.` : `$${Number(desglose.transferencia).toLocaleString()} Transf.`)
    }
    return `🔀 Mixto (${parts.join(' + ')})`
  }

  if (metodo === 'credito' || metodo === 'tarjeta_credito' || (metodo === 'tarjeta' && tipoTarjeta === 'credito')) {
    const c = cuotas || 1
    return `💳 Crédito (${c} ${c === 1 ? 'cuota' : 'cuotas'})`
  }
  if (metodo === 'debito' || metodo === 'tarjeta_debito' || (metodo === 'tarjeta' && tipoTarjeta === 'debito')) {
    return '💳 Débito'
  }
  if (metodo === 'tarjeta') {
    if (cuotas) {
      return `💳 Crédito (${cuotas} ${cuotas === 1 ? 'cuota' : 'cuotas'})`
    }
    return '💳 Tarjeta'
  }
  if (metodo === 'transferencia') return '🏦 Transferencia'
  if (metodo === 'efectivo') return '💵 Efectivo'

  return orden.pago_metodo || 'Pendiente'
}

