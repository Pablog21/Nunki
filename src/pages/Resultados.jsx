import { useEffect, useMemo, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, Minus, MessageCircle, Info, Users, CalendarCheck, Scissors, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { esAdmin } from '../lib/roles'
import { linkWhatsApp } from '../lib/whatsapp'
import './Resultados.css'

const pesos = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')
const iso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const hoyAR = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))

function periodo(id) {
  const h = hoyAR()
  const y = h.getFullYear(); const m = h.getMonth()
  switch (id) {
    case 'mes_pasado': return [new Date(y, m - 1, 1), new Date(y, m, 0)]
    case '30': { const d = new Date(h); d.setDate(d.getDate() - 29); return [d, h] }
    case '90': { const d = new Date(h); d.setDate(d.getDate() - 89); return [d, h] }
    case 'anio': return [new Date(y, 0, 1), h]
    default: return [new Date(y, m, 1), h]
  }
}
const PERIODOS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: '30', label: 'Últimos 30 días' },
  { id: '90', label: 'Últimos 90 días' },
  { id: 'anio', label: 'Este año' },
]

function Variacion({ actual, anterior }) {
  if (!anterior) return <span className="rs-var rs-neutro"><Minus size={13} /> sin datos previos</span>
  const pct = Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
  const Icono = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus
  return <span className={`rs-var ${pct > 0 ? 'rs-sube' : pct < 0 ? 'rs-baja' : 'rs-neutro'}`}><Icono size={13} /> {pct > 0 ? '+' : ''}{pct}% vs. período anterior</span>
}

export default function Resultados() {
  const { userProfile, activeEmpresaId } = useAuth()
  const [per, setPer] = useState('mes')
  const [datos, setDatos] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeEmpresaId) return
    supabase.from('empresas').select('nombre, slug, reserva_online_activa').eq('id', activeEmpresaId).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [activeEmpresaId])

  useEffect(() => {
    if (!activeEmpresaId) return
    const [d, h] = periodo(per)
    setCargando(true)
    setError('')
    supabase.rpc('reporte_resultados', { p_empresa: activeEmpresaId, p_desde: iso(d), p_hasta: iso(h) })
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        setDatos(data || null)
        setCargando(false)
      })
  }, [activeEmpresaId, per])

  const r = datos
  const margen = r && r.ventas > 0 ? Math.round((r.ganancia / r.ventas) * 100) : 0
  const ocupacion = r?.agenda?.horas_disponibles > 0 ? Math.min(100, Math.round((r.agenda.horas_reservadas / r.agenda.horas_disponibles) * 100)) : null
  const maxDia = useMemo(() => Math.max(1, ...(r?.por_dia || []).map((d) => Number(d.ventas))), [r])

  if (userProfile && !esAdmin(userProfile)) return <Navigate to="/" replace />

  const cascada = r ? [
    { label: 'Ventas de servicios', monto: r.ventas_servicios, tipo: 'mas' },
    { label: 'Ventas de productos', monto: r.ventas_productos, tipo: 'mas' },
    { label: 'Comisiones del equipo', monto: r.comisiones, tipo: 'menos' },
    { label: 'Costo de los servicios (insumos)', monto: r.costo_servicios, tipo: 'menos' },
    { label: 'Costo de los productos vendidos', monto: r.costo_productos, tipo: 'menos' },
    { label: 'Gastos del salón (alquiler, luz, etc.)', monto: r.gastos_operativos, tipo: 'menos' },
  ] : []
  const maxCascada = Math.max(1, ...cascada.map((c) => Number(c.monto)))

  const textoRecuperar = (c) =>
    `Hola ${c.nombre.split(' ')[0]}! Hace un tiempo que no te vemos por ${empresa?.nombre || 'el salón'} y te extrañamos. ¿Querés que te reservemos un turno?` +
    (empresa?.reserva_online_activa && empresa?.slug ? ` Podés elegir el horario acá: ${window.location.origin}/r/${empresa.slug}` : '')

  return (
    <div className="animate-fade-in rs" style={{ paddingBottom: '3rem' }}>
      <header className="page-header rs-head">
        <div>
          <h1 className="page-title">Resultados</h1>
          <p className="rs-sub">Cuánto ganó el salón, de dónde viene y qué mejorar.</p>
        </div>
        <div className="rs-periodos" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} role="tab" aria-selected={per === p.id} className={`rs-chip ${per === p.id ? 'on' : ''}`} onClick={() => setPer(p.id)}>{p.label}</button>
          ))}
        </div>
      </header>

      {error && <p className="rs-error">{error}</p>}
      {cargando && !r && <p className="rs-muted">Calculando…</p>}

      {r && (
        <div className={cargando ? 'rs-cargando' : ''}>
          <section className="rs-kpis">
            <div className="glass-panel rs-kpi rs-kpi-principal">
              <small>Ganancia del período</small>
              <strong className={r.ganancia < 0 ? 'rs-negativo' : ''}>{pesos(r.ganancia)}</strong>
              <Variacion actual={r.ganancia} anterior={r.anterior?.ganancia} />
            </div>
            <div className="glass-panel rs-kpi">
              <small>Ventas</small>
              <strong>{pesos(r.ventas)}</strong>
              <Variacion actual={r.ventas} anterior={r.anterior?.ventas} />
            </div>
            <div className="glass-panel rs-kpi">
              <small>Margen</small>
              <strong>{margen}%</strong>
              <span className="rs-muted">de cada $100 vendidos te quedan ${margen}</span>
            </div>
            <div className="glass-panel rs-kpi">
              <small>Ticket promedio</small>
              <strong>{pesos(r.ticket_promedio)}</strong>
              <span className="rs-muted">{r.comandas} comandas · {r.clientes_atendidos} clientes</span>
            </div>
          </section>

          {Number(r.costo_servicios) === 0 && r.ventas_servicios > 0 && (
            <p className="rs-aviso"><Info size={16} /> Tus servicios no tienen costo cargado, así que la ganancia puede verse más alta de lo real. <Link to="/servicios">Cargá el costo estimado de cada servicio</Link> (los insumos que usa).</p>
          )}

          <div className="rs-grid">
            <section className="glass-panel rs-card">
              <h3>Cómo se forma tu ganancia</h3>
              <ul className="rs-cascada">
                {cascada.map((c) => (
                  <li key={c.label} className={`rs-${c.tipo}`}>
                    <span>{c.label}</span>
                    <span className="rs-barra"><i style={{ width: `${(Number(c.monto) / maxCascada) * 100}%` }} /></span>
                    <strong>{c.tipo === 'menos' && Number(c.monto) > 0 ? '−' : ''}{pesos(c.monto)}</strong>
                  </li>
                ))}
                <li className="rs-total">
                  <span>Ganancia</span><span />
                  <strong className={r.ganancia < 0 ? 'rs-negativo' : ''}>{pesos(r.ganancia)}</strong>
                </li>
              </ul>
              {Number(r.compras_stock) > 0 && (
                <p className="rs-nota">Además compraste mercadería por {pesos(r.compras_stock)}. No se resta acá: se descuenta a medida que vendés o usás esos productos.</p>
              )}
            </section>

            <section className="glass-panel rs-card">
              <h3>Ventas por día</h3>
              <div className="rs-chart" role="img" aria-label="Ventas por día del período">
                {(r.por_dia || []).map((d) => {
                  const fecha = new Date(`${d.dia}T12:00:00`)
                  return (
                    <div key={d.dia} className="rs-col" title={`${fecha.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}: ${pesos(d.ventas)}`}>
                      <i style={{ height: `${(Number(d.ventas) / maxDia) * 100}%` }} />
                    </div>
                  )
                })}
              </div>
              <div className="rs-chart-eje">
                <span>{new Date(`${r.desde}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                <span>{new Date(`${r.hasta}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
              </div>
            </section>
          </div>

          <div className="rs-grid">
            <section className="glass-panel rs-card">
              <h3><Scissors size={16} /> Servicios que más dejan</h3>
              {(r.por_servicio || []).length === 0 ? <p className="rs-muted">Sin servicios vendidos en el período.</p> : (
                <table className="rs-tabla">
                  <thead><tr><th>Servicio</th><th>Cant.</th><th>Ventas</th><th>Te queda</th></tr></thead>
                  <tbody>
                    {r.por_servicio.map((s) => (
                      <tr key={s.nombre}>
                        <td>{s.nombre}</td><td>{s.cantidad}</td><td>{pesos(s.ventas)}</td>
                        <td><strong>{pesos(s.margen)}</strong> <span className={`rs-pct ${s.margen_pct < 25 ? 'bajo' : ''}`}>{s.margen_pct}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="glass-panel rs-card">
              <h3><UserRound size={16} /> Por profesional</h3>
              {(r.por_profesional || []).length === 0 ? <p className="rs-muted">Sin datos en el período.</p> : (
                <table className="rs-tabla">
                  <thead><tr><th>Profesional</th><th>Servicios</th><th>Ventas</th><th>Comisión</th><th>Aporte</th></tr></thead>
                  <tbody>
                    {r.por_profesional.map((p) => (
                      <tr key={p.nombre}><td>{p.nombre}</td><td>{p.servicios}</td><td>{pesos(p.ventas)}</td><td>{pesos(p.comision)}</td><td><strong>{pesos(p.aporte)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="rs-nota">Aporte: lo que le queda al salón de lo que vendió cada profesional, después de su comisión y los insumos.</p>
            </section>
          </div>

          <div className="rs-grid">
            <section className="glass-panel rs-card">
              <h3><CalendarCheck size={16} /> Agenda</h3>
              <div className="rs-mini">
                <div><small>Ocupación</small><strong>{ocupacion === null ? '—' : `${ocupacion}%`}</strong><span className="rs-muted">{r.agenda?.horas_reservadas ?? 0} h reservadas</span></div>
                <div><small>Turnos</small><strong>{r.agenda?.turnos ?? 0}</strong><span className="rs-muted">{r.agenda?.online ?? 0} reservados online</span></div>
                <div><small>Cancelados</small><strong className={(r.agenda?.ausentismo_pct ?? 0) > 15 ? 'rs-negativo' : ''}>{r.agenda?.ausentismo_pct ?? 0}%</strong><span className="rs-muted">{r.agenda?.cancelados ?? 0} turnos</span></div>
              </div>
              {(r.agenda?.ausentismo_pct ?? 0) > 15 && (
                <p className="rs-aviso"><Info size={16} /> Se cancelan muchos turnos. Mandar los <Link to="/reservas?tab=recordatorios">recordatorios por WhatsApp</Link> el día anterior ayuda a bajarlos.</p>
              )}
              {ocupacion === null && <p className="rs-nota">Para medir la ocupación, cargá a tu equipo en Colaboradores y tus horarios en Reserva online.</p>}
            </section>

            <section className="glass-panel rs-card">
              <h3><Users size={16} /> Clientes</h3>
              <div className="rs-mini">
                <div><small>Nuevos</small><strong>{r.clientes?.nuevos ?? 0}</strong></div>
                <div><small>Volvieron</small><strong>{r.clientes?.recurrentes ?? 0}</strong></div>
                <div><small>Para recuperar</small><strong>{r.clientes?.para_recuperar_total ?? 0}</strong><span className="rs-muted">sin venir hace 45 a 120 días</span></div>
              </div>
              {(r.clientes?.para_recuperar || []).length > 0 && (
                <ul className="rs-recuperar">
                  {r.clientes.para_recuperar.map((c) => (
                    <li key={c.id}>
                      <div><strong>{c.nombre}</strong><small>{c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'} · última el {new Date(`${c.ultima}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</small></div>
                      {c.telefono && (
                        <a className="rs-wa" href={linkWhatsApp(c.telefono, textoRecuperar(c))} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> Escribirle</a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {(r.gastos_por_categoria || []).length > 0 && (
            <section className="glass-panel rs-card">
              <h3>Gastos por categoría</h3>
              <ul className="rs-gastos">
                {r.gastos_por_categoria.map((g) => (
                  <li key={g.categoria}><span>{g.categoria}</span><strong>{pesos(g.monto)}</strong></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
