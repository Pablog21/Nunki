import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Inbox, Store, Settings, Plus, MessageCircle, Copy, CheckCircle2, X, RefreshCw, LogIn, Mail } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { esSuperAdmin } from '../lib/roles'
import { linkWhatsApp } from '../lib/whatsapp'
import { PLANES, planPorId, formatoMonto, formatoPrecio, precioPlan, PRUEBA_DIAS, MONEDAS } from '../lib/planes'
import Configuracion from './Configuracion'
import './SuperAdmin.css'

const ESTADOS = [
  { id: 'nuevo', label: 'Nuevas', uno: 'Nueva' },
  { id: 'contactado', label: 'Contactadas', uno: 'Contactada' },
  { id: 'demo_agendada', label: 'Demo agendada', uno: 'Demo agendada' },
  { id: 'ganado', label: 'Ganadas', uno: 'Ganada' },
  { id: 'perdido', label: 'Perdidas', uno: 'Perdida' },
]
const ESTADOS_CUENTA = [
  { id: 'prueba', label: 'En prueba' },
  { id: 'activa', label: 'Activa' },
  { id: 'suspendida', label: 'Suspendida' },
  { id: 'baja', label: 'Baja' },
  { id: 'interna', label: 'Interna / demo' },
]

const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—')
const haceCuanto = (f) => {
  if (!f) return ''
  const min = Math.round((Date.now() - new Date(f).getTime()) / 60000)
  if (min < 60) return `hace ${Math.max(min, 1)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export default function SuperAdmin() {
  const { userProfile } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = ['solicitudes', 'salones', 'config'].includes(params.get('tab')) ? params.get('tab') : 'solicitudes'
  const setTab = (t) => setParams(t === 'solicitudes' ? {} : { tab: t }, { replace: true })
  const [alta, setAlta] = useState(null) // datos para precargar el alta

  if (userProfile && !esSuperAdmin(userProfile)) return <Navigate to="/" replace />

  return (
    <div className="animate-fade-in sa" style={{ paddingBottom: '3rem' }}>
      <header className="page-header sa-head">
        <div>
          <h1 className="page-title">Panel Nunki</h1>
          <p className="sa-sub">Solicitudes de demo, salones y accesos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAlta({})}><Plus size={16} /> Nuevo salón</button>
      </header>

      <div className="sa-tabs">
        <button className={`btn ${tab === 'solicitudes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('solicitudes')}>
          <Inbox size={16} /> Solicitudes de demo
        </button>
        <button className={`btn ${tab === 'salones' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('salones')}>
          <Store size={16} /> Salones
        </button>
        <button className={`btn ${tab === 'config' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('config')}>
          <Settings size={16} /> Configuración del salón
        </button>
      </div>

      {tab === 'solicitudes' && <Solicitudes onCrearSalon={setAlta} />}
      {tab === 'salones' && <Salones />}
      {tab === 'config' && <ConfigSalon />}

      {alta && <AltaSalon inicial={alta} onClose={() => setAlta(null)} onCreado={() => setTab('salones')} />}
    </div>
  )
}

function Solicitudes({ onCrearSalon }) {
  const [items, setItems] = useState([])
  const [filtro, setFiltro] = useState('nuevo')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = async () => {
    setLoading(true)
    setError('')
    const { data, error: e } = await supabase.from('contactos_landing').select('*').order('created_at', { ascending: false }).limit(500)
    if (e) setError(e.message)
    setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const conteo = useMemo(() => {
    const c = {}
    items.forEach((i) => { const k = i.estado || 'nuevo'; c[k] = (c[k] || 0) + 1 })
    return c
  }, [items])

  const visibles = items.filter((i) => (filtro === 'todas' ? true : (i.estado || 'nuevo') === filtro))

  const actualizar = async (id, cambios) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...cambios } : i)))
    const { error: e } = await supabase.from('contactos_landing').update({ ...cambios, actualizado_at: new Date().toISOString() }).eq('id', id)
    if (e) setError(`No se pudo guardar: ${e.message}`)
  }

  return (
    <section>
      <div className="sa-filtros">
        {ESTADOS.map((e) => (
          <button key={e.id} className={`sa-chip ${filtro === e.id ? 'on' : ''}`} onClick={() => setFiltro(e.id)}>
            {e.label} <span>{conteo[e.id] || 0}</span>
          </button>
        ))}
        <button className={`sa-chip ${filtro === 'todas' ? 'on' : ''}`} onClick={() => setFiltro('todas')}>Todas <span>{items.length}</span></button>
        <button className="sa-icon" onClick={cargar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={16} /></button>
      </div>

      {error && <p className="sa-error">{error}</p>}
      {loading && <p className="sa-muted">Cargando…</p>}
      {!loading && visibles.length === 0 && (
        <div className="glass-panel sa-vacio">No hay solicitudes en este estado.</div>
      )}

      <div className="sa-leads">
        {visibles.map((l) => {
          const nombre = (l.nombre || '').split(' ')[0]
          const texto = `Hola ${nombre}! Soy Pablo, de Nunki. Vi que pediste una demo para ${l.salon || 'tu salón'}. ¿Qué día y horario te queda cómodo para mostrártelo en 20 minutos?`
          return (
            <article key={l.id} className="glass-panel sa-lead">
              <div className="sa-lead-top">
                <div>
                  <h3>{l.salon || 'Sin nombre de salón'}</h3>
                  <p className="sa-muted">{l.nombre}{l.profesionales ? ` · ${l.profesionales} profesionales` : ''}</p>
                </div>
                <span className="sa-muted sa-cuando" title={new Date(l.created_at).toLocaleString('es-AR')}>{haceCuanto(l.created_at)}</span>
              </div>
              <div className="sa-datos">
                {l.telefono && <span><MessageCircle size={14} /> {l.telefono}</span>}
                {l.email && <span><Mail size={14} /> {l.email}</span>}
              </div>
              {l.mensaje && <p className="sa-msg">{l.mensaje}</p>}
              <label className="sa-label">Notas internas
                <textarea className="input-field" rows="2" defaultValue={l.notas || ''} placeholder="Qué hablaron, próximo paso…"
                  onBlur={(e) => e.target.value !== (l.notas || '') && actualizar(l.id, { notas: e.target.value })} />
              </label>
              <div className="sa-acciones">
                <select className="input-field sa-select" value={l.estado || 'nuevo'} onChange={(e) => actualizar(l.id, { estado: e.target.value })} aria-label="Estado">
                  {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.uno}</option>)}
                </select>
                {l.telefono && (
                  <a className="btn btn-secondary" href={linkWhatsApp(l.telefono, texto)} target="_blank" rel="noopener noreferrer"
                    onClick={() => (l.estado || 'nuevo') === 'nuevo' && actualizar(l.id, { estado: 'contactado' })}>
                    <MessageCircle size={16} /> Escribir
                  </a>
                )}
                {l.empresa_id
                  ? <span className="sa-ok"><CheckCircle2 size={16} /> Salón creado</span>
                  : <button className="btn btn-primary" onClick={() => onCrearSalon({ contacto: l })}><Plus size={16} /> Crear salón</button>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function Salones() {
  const { changeActiveEmpresaId } = useAuth()
  const navigate = useNavigate()
  const [salones, setSalones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = async () => {
    setLoading(true)
    setError('')
    const { data, error: e } = await supabase.rpc('super_resumen_salones')
    if (e) setError(e.message)
    setSalones(data || [])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  const actualizar = async (id, cambios) => {
    setSalones((prev) => prev.map((s) => (s.id === id ? { ...s, ...cambios } : s)))
    const { error: e } = await supabase.from('empresas').update(cambios).eq('id', id)
    if (e) setError(`No se pudo guardar: ${e.message}`)
  }

  const totales = useMemo(() => {
    const activos = salones.filter((s) => s.estado_cuenta === 'activa')
    const suma = (lista, fn) => {
      const r = { ARS: 0, USD: 0 }
      lista.forEach((s) => { const m = s.moneda === 'USD' ? 'USD' : 'ARS'; r[m] += Number(fn(s, m) || 0) })
      return r
    }
    return {
      activos: activos.length,
      prueba: salones.filter((s) => s.estado_cuenta === 'prueba').length,
      mensual: suma(activos, (s, m) => precioPlan(planPorId(s.plan), m)),
      extras: suma(salones, (s) => s.extras_a_facturar),
      costoIa: salones.reduce((acc, s) => acc + Number(s.ia_costo_usd || 0), 0),
    }
  }, [salones])
  const ambas = (r) => [r.ARS > 0 || r.USD === 0 ? formatoMonto(r.ARS, 'ARS') : null, r.USD > 0 ? formatoMonto(r.USD, 'USD') : null].filter(Boolean).join(' + ')

  const marcarFacturado = async (id) => {
    const { error: e } = await supabase.rpc('super_extras_facturados', { p_empresa: id })
    if (e) return setError(`No se pudo marcar: ${e.message}`)
    setSalones((prev) => prev.map((s) => (s.id === id ? { ...s, extras_a_facturar: 0 } : s)))
  }

  const entrar = (id) => {
    changeActiveEmpresaId(id)
    navigate('/agenda')
  }

  const configurar = (id) => {
    changeActiveEmpresaId(id)
    navigate('/panel?tab=config')
  }

  return (
    <section>
      <div className="sa-kpis">
        <div className="glass-panel"><small>Salones activos</small><strong>{totales.activos}</strong></div>
        <div className="glass-panel"><small>En prueba</small><strong>{totales.prueba}</strong></div>
        <div className="glass-panel"><small>Facturación mensual estimada</small><strong>{ambas(totales.mensual)}</strong></div>
        <div className="glass-panel"><small>Extras de Sasha a facturar</small><strong>{ambas(totales.extras)}</strong><small>Costo de IA este mes: USD {totales.costoIa.toFixed(2)}</small></div>
      </div>

      {error && <p className="sa-error">{error}</p>}
      {loading && <p className="sa-muted">Cargando…</p>}

      <div className="glass-panel table-container sa-tabla">
        <table className="data-table">
          <thead>
            <tr><th>Salón</th><th>Plan</th><th>Cuenta</th><th>Sasha este mes</th><th>Administradores</th><th>Turnos 30 días</th><th>Alta</th><th /></tr>
          </thead>
          <tbody>
            {salones.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.nombre}</strong>{s.slug && <div className="sa-muted">/r/{s.slug}</div>}</td>
                <td>
                  <div className="sa-cuenta">
                    <select className="input-field sa-select" value={s.plan || 'esencial'} onChange={(e) => actualizar(s.id, { plan: e.target.value })} aria-label="Plan">
                      {PLANES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <select className="input-field sa-select" value={s.moneda || 'ARS'} onChange={(e) => actualizar(s.id, { moneda: e.target.value })} aria-label="Moneda">
                      {MONEDAS.map((m) => <option key={m} value={m}>{formatoPrecio(planPorId(s.plan), m)}/mes</option>)}
                    </select>
                  </div>
                </td>
                <td>
                  <div className="sa-cuenta">
                    <select className={`input-field sa-select sa-estado-${s.estado_cuenta}`} value={s.estado_cuenta || 'prueba'} onChange={(e) => actualizar(s.id, { estado_cuenta: e.target.value })} aria-label="Estado de la cuenta">
                      {ESTADOS_CUENTA.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </select>
                    {s.estado_cuenta === 'prueba' && (
                      <label className="sa-muted">hasta
                        <input type="date" className="input-field sa-select" value={s.prueba_hasta || ''} onChange={(e) => actualizar(s.id, { prueba_hasta: e.target.value || null })} />
                      </label>
                    )}
                  </div>
                </td>
                <td><UsoSasha s={s} onLimite={(v) => actualizar(s.id, { ia_limite_mensual: v })} onFacturado={() => marcarFacturado(s.id)} /></td>
                <td className="sa-admins">{s.admins || <span className="sa-muted">Sin administrador</span>}</td>
                <td>{s.turnos_30d}</td>
                <td>{fechaCorta(s.alta_at)}</td>
                <td>
                  <div className="sa-cuenta">
                    <button className="btn btn-secondary sa-entrar" onClick={() => entrar(s.id)}><LogIn size={15} /> Entrar</button>
                    <button type="button" className="sa-link" onClick={() => configurar(s.id)}>Configurar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && salones.length === 0 && <tr><td colSpan="8" className="sa-muted">Todavía no hay salones.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sa-muted sa-nota">"Entrar" te cambia al salón para ver su sistema como lo ve el administrador. Para cambiar la contraseña de alguien, entrá al salón y usá Colaboradores.</p>
    </section>
  )
}

function ConfigSalon() {
  const { activeEmpresaId, changeActiveEmpresaId } = useAuth()
  const [salones, setSalones] = useState([])
  useEffect(() => {
    supabase.from('empresas').select('id, nombre').order('nombre').then(({ data }) => setSalones(data || []))
  }, [])
  return (
    <section>
      <div className="glass-panel sa-selector">
        <label>Salón a configurar
          <select className="input-field" value={activeEmpresaId || ''} onChange={(e) => changeActiveEmpresaId(e.target.value)}>
            <option value="">Elegí un salón…</option>
            {salones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <p className="sa-muted">Lo que elijas acá también cambia el salón que ves en Agenda, Comandas y el resto del sistema.</p>
      </div>
      {activeEmpresaId ? <Configuracion key={activeEmpresaId} embebido /> : <p className="sa-muted">Elegí un salón para ver su configuración.</p>}
    </section>
  )
}

function UsoSasha({ s, onLimite, onFacturado }) {
  const usados = Number(s.ia_usados || 0)
  const limite = Number(s.ia_limite || 0)
  const pct = limite > 0 ? Math.min(100, Math.round((100 * usados) / limite)) : 0
  const nivel = pct >= 100 ? 'lleno' : pct >= 80 ? 'alto' : 'ok'
  const [editando, setEditando] = useState(false)
  return (
    <div className="sa-uso">
      <div className="sa-uso-num"><strong>{usados}</strong> / {limite}</div>
      <div className={`sa-uso-bar sa-uso-${nivel}`}><i style={{ width: `${pct}%` }} /></div>
      {editando ? (
        <input type="number" min="0" className="input-field sa-select" autoFocus defaultValue={s.ia_limite_mensual ?? ''} placeholder={`plan: ${planPorId(s.plan).sasha}`}
          onBlur={(e) => { setEditando(false); const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0); if (v !== (s.ia_limite_mensual ?? null)) onLimite(v) }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Tope mensual personalizado" />
      ) : (
        <button type="button" className="sa-link" onClick={() => setEditando(true)}>
          {s.ia_limite_mensual != null ? `Tope propio: ${s.ia_limite_mensual}` : 'Cambiar tope'}
        </button>
      )}
      {Number(s.extras_a_facturar) > 0 && (
        <button type="button" className="sa-link sa-extra" onClick={onFacturado} title="Marcar como facturado">
          {formatoMonto(s.extras_a_facturar, s.moneda)} a facturar ✓
        </button>
      )}
    </div>
  )
}

function AltaSalon({ inicial, onClose, onCreado }) {
  const c = inicial.contacto
  const [form, setForm] = useState({
    salon: c?.salon || '',
    slug: '',
    whatsapp: c?.telefono || '',
    plan: c?.plan_interes || 'esencial',
    moneda: 'ARS',
    dias_prueba: PRUEBA_DIAS,
    nombre_completo: c?.nombre || '',
    email: c?.email || '',
    telefono: c?.telefono || '',
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const crear = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const { data, error: err } = await supabase.functions.invoke('nunki-super-alta-salon', {
      body: {
        contacto_id: c?.id || null,
        salon: { nombre: form.salon, slug: form.slug, whatsapp: form.whatsapp, plan: form.plan, moneda: form.moneda, dias_prueba: Number(form.dias_prueba) },
        admin: { nombre_completo: form.nombre_completo, email: form.email, telefono: form.telefono },
      },
    })
    setEnviando(false)
    if (err || !data?.ok) {
      let msg = data?.error || err?.message || 'No se pudo crear el salón'
      try { const j = await err?.context?.json?.(); if (j?.error) msg = j.error } catch { /* sin detalle */ }
      setError(msg)
      return
    }
    setResultado(data)
    onCreado?.()
  }

  const urlApp = `${window.location.origin}/login`
  const mensaje = resultado
    ? `¡Hola ${resultado.acceso.nombre.split(' ')[0]}! Ya está listo ${resultado.empresa.nombre} en Nunki 🎉\n\n` +
      `Entrá desde: ${urlApp}\nUsuario: ${resultado.acceso.email}\nContraseña temporal: ${resultado.acceso.password}\n\n` +
      `Cuando entres, cambiá la contraseña desde tu perfil. Cualquier duda, escribime por acá.`
    : ''

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensaje); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sa-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nuevo salón">
        <div className="modal-header">
          <h2>{resultado ? 'Salón creado' : 'Nuevo salón'}</h2>
          <button className="sa-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {!resultado ? (
          <form className="modal-body sa-form" onSubmit={crear}>
            <fieldset>
              <legend>Salón</legend>
              <label className="sa-span2">Nombre del salón o barbería *<input className="input-field" required value={form.salon} onChange={set('salon')} /></label>
              <label>Dirección de reservas<input className="input-field" value={form.slug} onChange={set('slug')} placeholder="se arma sola si la dejás vacía" /></label>
              <label>WhatsApp del salón<input className="input-field" type="tel" value={form.whatsapp} onChange={set('whatsapp')} /></label>
              <label>Plan
                <select className="input-field" value={form.plan} onChange={set('plan')}>
                  {PLANES.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {formatoPrecio(p, form.moneda)}/mes</option>)}
                </select>
              </label>
              <label>Moneda
                <select className="input-field" value={form.moneda} onChange={set('moneda')}>
                  <option value="ARS">Pesos (Argentina)</option>
                  <option value="USD">Dólares (otros países)</option>
                </select>
              </label>
              <label>Días de prueba gratis
                <input className="input-field" type="number" min="0" max="90" value={form.dias_prueba} onChange={set('dias_prueba')} />
              </label>
            </fieldset>
            <fieldset>
              <legend>Administrador del salón</legend>
              <label className="sa-span2">Nombre y apellido *<input className="input-field" required value={form.nombre_completo} onChange={set('nombre_completo')} /></label>
              <label>Email (será su usuario) *<input className="input-field" type="email" required value={form.email} onChange={set('email')} /></label>
              <label>Teléfono<input className="input-field" type="tel" value={form.telefono} onChange={set('telefono')} /></label>
            </fieldset>
            {error && <p className="sa-error">{error}</p>}
            <div className="sa-form-foot">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Creando…' : 'Crear salón y acceso'}</button>
            </div>
          </form>
        ) : (
          <div className="modal-body sa-resultado">
            <p className="sa-ok"><CheckCircle2 size={18} /> {resultado.empresa.nombre} quedó creado{resultado.prueba_hasta ? `, con prueba hasta el ${new Date(resultado.prueba_hasta + 'T12:00').toLocaleDateString('es-AR')}` : ''}.</p>
            <div className="sa-cred">
              <div><small>Usuario</small><strong>{resultado.acceso.email}</strong></div>
              <div><small>Contraseña temporal</small><strong className="sa-mono">{resultado.acceso.password}</strong></div>
            </div>
            <p className="sa-muted">La contraseña se muestra una sola vez. Mandásela ahora.</p>
            <pre className="sa-mensaje">{mensaje}</pre>
            <div className="sa-form-foot">
              <button className="btn btn-secondary" onClick={copiar}><Copy size={16} /> {copiado ? 'Copiado' : 'Copiar mensaje'}</button>
              {form.telefono && (
                <a className="btn btn-primary" href={linkWhatsApp(form.telefono, mensaje)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={16} /> Enviar por WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
