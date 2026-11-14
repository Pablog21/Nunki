import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CalendarClock, Receipt } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { esAdmin as esAdminFn, esSuperAdmin } from '../lib/roles'
import { fetchMiEstadoPago, fetchMisPagos, fechaLarga, fechaCorta, textoAviso, precioTexto } from '../lib/facturacion'
import { planPorId, formatoMonto } from '../lib/planes'
import ElegirPlan from '../components/ElegirPlan'
import '../components/Pagos.css'

const ETIQUETA = {
  al_dia: 'Al día', por_vencer: 'Por vencer', prueba: 'Prueba gratis', prueba_por_vencer: 'Prueba por terminar',
  vencido: 'Pago vencido', bloqueado: 'Suspendido', suspendida: 'Suspendida', interna: 'Cuenta interna',
}

export default function MiPlan() {
  const { userProfile, user } = useAuth()
  const [ep, setEp] = useState(null)
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([fetchMiEstadoPago(), fetchMisPagos()]).then(([e, p]) => { setEp(e); setPagos(p); setCargando(false) })
  }, [])

  if (userProfile && esSuperAdmin(userProfile)) return <Navigate to="/panel?tab=salones" replace />
  if (userProfile && !esAdminFn(userProfile)) return <Navigate to="/" replace />

  const plan = ep ? planPorId(ep.plan) : null
  const aviso = textoAviso(ep)
  const volvioDeMp = new URLSearchParams(window.location.search).has('preapproval_id')

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header className="page-header"><h1 className="page-title">Mi plan</h1></header>
      {cargando && <p className="pg-muted">Cargando…</p>}
      {!cargando && !ep && <p className="pg-muted">No pudimos cargar el estado de tu plan.</p>}
      {ep && (
        <div className="pg-grid">
          <section className="glass-panel pg-resumen">
            <div className="pg-resumen-top">
              <div>
                <small>Plan</small>
                <h2>{plan?.nombre}</h2>
                <p className="pg-muted">{precioTexto(ep)}</p>
              </div>
              <span className={`pg-chip pg-chip-${ep.estado}`}>{ETIQUETA[ep.estado] ?? ep.estado}</span>
            </div>
            <div className="pg-datos">
              <div><CalendarClock size={16} /> {ep.en_prueba ? 'Prueba hasta' : 'Pagado hasta'}: <strong>{fechaLarga(ep.vencimiento)}</strong></div>
              {ep.estado === 'vencido' && <div>Se suspende el <strong>{fechaLarga(ep.bloqueo_el)}</strong> si no se regulariza.</div>}
            </div>
            {aviso && <p className={`pg-inline pg-${aviso.nivel}`}>{aviso.texto}</p>}
            {volvioDeMp && !ep.debito_automatico && (
              <p className="pg-inline pg-info">Estamos esperando la confirmación de Mercado Pago. Puede tardar unos minutos; actualizá la página en un rato.</p>
            )}
          </section>

          {ep.estado !== 'interna' && (
            <section className="glass-panel pg-elegir">
              <ElegirPlan ep={ep} emailInicial={user?.email || ''} />
            </section>
          )}

          <section className="glass-panel pg-historial">
            <h3><Receipt size={16} /> Pagos</h3>
            {pagos.length === 0 && <p className="pg-muted">Todavía no hay pagos registrados.</p>}
            <ul>
              {pagos.map((p) => (
                <li key={p.id}>
                  <span>{fechaCorta(p.created_at)}</span>
                  <span>{formatoMonto(p.monto, p.moneda)}</span>
                  <span className={`pg-chip pg-chip-${p.estado === 'aprobado' ? 'al_dia' : 'vencido'}`}>{p.estado === 'aprobado' ? 'Aprobado' : p.estado === 'rechazado' ? 'Rechazado' : p.estado}</span>
                  <small className="pg-muted">{p.origen === 'mercadopago' ? 'Mercado Pago' : 'Registrado por Nunki'}{p.pagado_hasta_nuevo ? ` · cubre hasta ${fechaCorta(p.pagado_hasta_nuevo)}` : ''}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
