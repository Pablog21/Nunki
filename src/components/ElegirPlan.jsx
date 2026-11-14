import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, ExternalLink, Copy, Smartphone, CheckCircle2, CreditCard } from 'lucide-react'
import { PLANES, formatoMonto } from '../lib/planes'
import { iniciarSuscripcion, fechaLarga, precioTexto } from '../lib/facturacion'
import { miNegocio } from '../lib/tipos'
import './Pagos.css'

// Elegir plan y pagar con Mercado Pago (débito automático mensual), con link y QR.
export default function ElegirPlan({ ep, emailInicial = '', compacto = false }) {
  const [plan, setPlan] = useState(ep?.plan === 'premium' ? 'premium' : 'esencial')
  const [email, setEmail] = useState(emailInicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState(null)
  const [qr, setQr] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!link?.url) return
    QRCode.toDataURL(link.url, { margin: 1, width: 240, color: { dark: '#0B1F1A', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(''))
  }, [link])

  if (!ep) return null

  if (ep.debito_automatico) {
    return (
      <div className="pg-box pg-ok">
        <CheckCircle2 size={20} />
        <div>
          <strong>Débito automático activo</strong>
          <p>Mercado Pago cobra {precioTexto(ep)} cada mes. Tu acceso está cubierto hasta el {fechaLarga(ep.vencimiento)}.</p>
        </div>
      </div>
    )
  }

  if (ep.moneda === 'USD') {
    return (
      <div className="pg-box">
        <CreditCard size={20} />
        <div>
          <strong>Pago en dólares</strong>
          <p>Escribinos y te enviamos el link de pago para tu país; lo registramos apenas se acredita.</p>
        </div>
      </div>
    )
  }

  const precio = (id) => Number(ep.precios?.[id] ?? 0)

  const generar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    setLink(null)
    try {
      const url = await iniciarSuscripcion({ email, plan })
      setLink({ url, plan })
    } catch (err) {
      setError(err.message)
    }
    setEnviando(false)
  }

  const copiar = async () => {
    try { await navigator.clipboard.writeText(link.url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }

  return (
    <div className={`ep ${compacto ? 'ep-compacto' : ''}`}>
      {!compacto && (
        <div className="ep-head">
          <h2>Quiero Nunki para {miNegocio(ep.tipo_negocio)}</h2>
          <p className="pg-muted">Elegí tu plan y activá el pago mensual con Mercado Pago. Lo podés cambiar o cancelar cuando quieras.</p>
        </div>
      )}

      <div className="ep-planes" role="radiogroup" aria-label="Plan">
        {PLANES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={plan === p.id}
            className={`ep-plan ${plan === p.id ? 'on' : ''} ${p.destacado ? 'ep-destacado' : ''}`}
            onClick={() => { setPlan(p.id); setLink(null) }}>
            <span className="ep-radio" aria-hidden="true">{plan === p.id && <Check size={14} />}</span>
            <strong>{p.nombre}</strong>
            <span className="ep-precio">{formatoMonto(precio(p.id), ep.moneda)}<small>/mes</small></span>
            <span className="pg-muted">{p.detalle}</span>
            {!compacto && (
              <ul>
                {p.items.slice(0, 5).map((it) => (
                  <li key={it}><Check size={13} /> {it}{p.pronto?.includes(it) && <em className="ep-pronto">Pronto</em>}</li>
                ))}
              </ul>
            )}
          </button>
        ))}
      </div>

      {!compacto && (
        <ol className="ep-pasos">
          <li><strong>Elegí el plan</strong> que mejor le queda a tu negocio.</li>
          <li><strong>Pagá con Mercado Pago</strong> con tarjeta de crédito, débito o dinero en cuenta. Queda activado el débito automático mensual.</li>
          <li><strong>Listo:</strong> tu cuenta se activa sola en unos minutos.{ep.en_prueba ? ' No perdés los días de prueba que te quedan: el primer mes se cuenta desde que termina la prueba.' : ''}</li>
          <li>Te cobramos lo mismo cada mes. Podés cancelar el débito cuando quieras desde Mercado Pago.</li>
        </ol>
      )}

      {!link ? (
        <form className="ep-form" onSubmit={generar}>
          <label>Email de tu cuenta de Mercado Pago
            <input type="email" required className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
            <small className="pg-muted">Tiene que ser el email con el que entrás a Mercado Pago.</small>
          </label>
          {error && <p className="pg-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? 'Preparando el pago…' : `Pagar ${formatoMonto(precio(plan), ep.moneda)}/mes con Mercado Pago`}
          </button>
        </form>
      ) : (
        <div className="ep-link">
          <div className="ep-qr">
            {qr ? <img src={qr} alt="Código QR para pagar con Mercado Pago" width="200" height="200" /> : <div className="ep-qr-vacio" />}
            <small className="pg-muted"><Smartphone size={13} /> Escaneá con la cámara del celular</small>
          </div>
          <div className="ep-link-acciones">
            <p><strong>Plan {PLANES.find((p) => p.id === link.plan)?.nombre}</strong> · {formatoMonto(precio(link.plan), ep.moneda)}/mes</p>
            <p className="pg-muted">Abrí el link, iniciá sesión con tu cuenta de Mercado Pago y confirmá la suscripción. Cuando vuelvas, tu cuenta se actualiza sola en unos minutos.</p>
            <a className="btn btn-primary" href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Abrir Mercado Pago</a>
            <button type="button" className="btn btn-secondary" onClick={copiar}><Copy size={16} /> {copiado ? 'Link copiado' : 'Copiar link'}</button>
            <button type="button" className="sa-link ep-otro" onClick={() => setLink(null)}>Cambiar plan o email</button>
          </div>
        </div>
      )}
    </div>
  )
}
