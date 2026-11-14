import { Link } from 'react-router-dom'
import { AlertTriangle, Info, Lock, LogOut } from 'lucide-react'
import { textoAviso, fechaLarga } from '../lib/facturacion'
import ElegirPlan from './ElegirPlan'
import { miNegocio } from '../lib/tipos'
import { NunkiSymbol } from './NunkiLogo'
import './Pagos.css'

// Franja de aviso arriba de cada pantalla (prueba por terminar, pago por vencer o vencido)
export function BannerPago({ ep, esAdmin }) {
  const aviso = textoAviso(ep)
  if (!aviso) return null
  const Icono = aviso.nivel === 'info' ? Info : AlertTriangle
  return (
    <div className={`pg-banner pg-${aviso.nivel}`} role="status">
      <Icono size={18} />
      <span>{aviso.texto}{!esAdmin && ' Avisale al administrador del salón.'}</span>
      {esAdmin && !ep.debito_automatico && (
        <Link to="/mi-plan" className="pg-banner-btn">
          {ep.en_prueba ? `Quiero Nunki para ${miNegocio(ep.tipo_negocio)}` : 'Pagar ahora'}
        </Link>
      )}
    </div>
  )
}

// Pantalla que reemplaza al sistema cuando el acceso está suspendido
export function BloqueoPago({ ep, esAdmin, onSalir }) {
  const suspendida = ep?.estado === 'suspendida'
  return (
    <div className="pg-bloqueo">
      <div className="pg-bloqueo-card glass-panel">
        <div className="pg-bloqueo-head">
          <NunkiSymbol size={36} />
          <span className="pg-candado"><Lock size={16} /> Acceso suspendido</span>
        </div>
        <h1>{ep?.empresa ? `${ep.empresa} está en pausa` : 'Tu salón está en pausa'}</h1>
        {suspendida ? (
          <p>La cuenta está suspendida. Escribinos para reactivarla.</p>
        ) : (
          <p>
            {ep?.en_prueba ? 'La prueba gratis terminó' : `El pago venció el ${fechaLarga(ep?.vencimiento)}`} y pasó el período de gracia.
            Tus datos están guardados: apenas se acredite el pago, todo vuelve a funcionar como antes.
          </p>
        )}
        {esAdmin && !suspendida && <ElegirPlan ep={ep} compacto />}
        {!esAdmin && <p className="pg-muted">Pedile al administrador del salón que regularice el pago.</p>}
        <button className="btn btn-secondary pg-salir" onClick={onSalir}><LogOut size={16} /> Cerrar sesión</button>
      </div>
    </div>
  )
}
