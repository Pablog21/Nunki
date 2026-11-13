import { useState } from 'react'
import { CreditCard, CheckCircle2 } from 'lucide-react'
import { iniciarSuscripcion, fechaLarga, precioTexto } from '../lib/facturacion'
import './Pagos.css'

// Bloque para que el administrador del salón active o regularice su membresía con Mercado Pago
export default function PanelPago({ ep, emailInicial = '', compacto = false }) {
  const [email, setEmail] = useState(emailInicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  if (!ep) return null
  const usd = ep.moneda === 'USD'

  const pagar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const url = await iniciarSuscripcion({ email })
      window.location.href = url
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  if (ep.debito_automatico) {
    return (
      <div className="pg-box pg-ok">
        <CheckCircle2 size={20} />
        <div>
          <strong>Débito automático activo</strong>
          <p>Mercado Pago cobra {precioTexto(ep)} cada mes. Próximo vencimiento: {fechaLarga(ep.vencimiento)}.</p>
        </div>
      </div>
    )
  }

  if (usd) {
    return (
      <div className="pg-box">
        <CreditCard size={20} />
        <div>
          <strong>Pago en dólares</strong>
          <p>Tu plan es de {precioTexto(ep)}. Escribinos y te enviamos el link de pago; lo registramos apenas se acredita.</p>
        </div>
      </div>
    )
  }

  return (
    <form className={`pg-box pg-form ${compacto ? 'pg-compacto' : ''}`} onSubmit={pagar}>
      <CreditCard size={20} />
      <div>
        <strong>Activá el débito automático con Mercado Pago</strong>
        <p>Se cobra {precioTexto(ep)} con tarjeta de crédito, débito o dinero en cuenta. El primer cobro se hace al confirmar y extiende tu acceso un mes. Podés darlo de baja cuando quieras.</p>
        <label>Email de tu cuenta de Mercado Pago
          <input type="email" required className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
        </label>
        {error && <p className="pg-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Abriendo Mercado Pago…' : 'Pagar con Mercado Pago'}</button>
      </div>
    </form>
  )
}
