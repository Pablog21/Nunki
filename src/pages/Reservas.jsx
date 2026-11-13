import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, CheckCircle2, Link2, Copy, Calendar, Globe, Bell } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { esAdmin } from '../lib/roles'
import { armarRecordatorio, formatearDia, formatearHora, linkWhatsApp, PLANTILLA_RECORDATORIO } from '../lib/whatsapp'

const DIAS = [
  { n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mié' }, { n: 4, label: 'Jue' },
  { n: 5, label: 'Vie' }, { n: 6, label: 'Sáb' }, { n: 7, label: 'Dom' },
]

const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDia(d) }
const slugify = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export default function Reservas() {
  const { userProfile, activeEmpresaId } = useAuth()
  const admin = esAdmin(userProfile)
  const [tab, setTab] = useState('recordatorios')
  const [empresa, setEmpresa] = useState(null)

  useEffect(() => {
    if (!activeEmpresaId) return
    supabase.from('empresas').select('*').eq('id', activeEmpresaId).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [activeEmpresaId])

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header className="page-header">
        <h1 className="page-title">Reservas y recordatorios</h1>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className={`btn ${tab === 'recordatorios' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('recordatorios')}>
          <Bell size={16} /> Recordatorios por WhatsApp
        </button>
        {admin && (
          <button className={`btn ${tab === 'online' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('online')}>
            <Globe size={16} /> Reserva online
          </button>
        )}
      </div>

      {tab === 'recordatorios' && <Recordatorios empresa={empresa} empresaId={activeEmpresaId} />}
      {tab === 'online' && admin && <ConfigOnline empresa={empresa} setEmpresa={setEmpresa} empresaId={activeEmpresaId} />}
    </div>
  )
}

function Recordatorios({ empresa, empresaId }) {
  const [dia, setDia] = useState(manana())
  const [turnos, setTurnos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cargar = async () => {
    if (!empresaId) return
    setLoading(true)
    setError('')
    const desde = new Date(`${dia}T00:00:00-03:00`).toISOString()
    const hasta = new Date(`${dia}T23:59:59-03:00`).toISOString()
    const { data, error } = await supabase
      .from('turnos')
      .select('id, fecha_hora_inicio, estado, origen, cliente_nombre_rapido, cliente_telefono, recordatorio_enviado_at, confirmado_at, clientes(nombre, apellido, telefono), servicios(nombre), usuarios(nombre_completo)')
      .eq('empresa_id', empresaId)
      .gte('fecha_hora_inicio', desde)
      .lte('fecha_hora_inicio', hasta)
      .neq('estado', 'Cancelado')
      .order('fecha_hora_inicio')
    if (error) setError(error.message)
    setTurnos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [dia, empresaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filas = useMemo(() => turnos.map((t) => {
    const nombre = t.clientes ? `${t.clientes.nombre || ''} ${t.clientes.apellido || ''}`.trim() : (t.cliente_nombre_rapido || 'Cliente')
    const telefono = t.clientes?.telefono || t.cliente_telefono || ''
    const texto = armarRecordatorio(empresa?.recordatorio_plantilla || PLANTILLA_RECORDATORIO, {
      nombre: nombre.split(' ')[0],
      servicio: t.servicios?.nombre || 'tu servicio',
      dia: formatearDia(t.fecha_hora_inicio),
      hora: formatearHora(t.fecha_hora_inicio),
      profesional: t.usuarios?.nombre_completo?.split(' ')[0] || 'nuestro equipo',
      salon: empresa?.nombre || 'el salón',
    })
    return { ...t, nombre, telefono, texto }
  }), [turnos, empresa])

  const pendientes = filas.filter((f) => !f.recordatorio_enviado_at && f.telefono).length

  const enviar = async (fila) => {
    window.open(linkWhatsApp(fila.telefono, fila.texto), '_blank', 'noopener')
    const ahora = new Date().toISOString()
    await supabase.from('turnos').update({ recordatorio_enviado_at: ahora }).eq('id', fila.id)
    setTurnos((ts) => ts.map((t) => (t.id === fila.id ? { ...t, recordatorio_enviado_at: ahora } : t)))
  }

  const confirmar = async (fila) => {
    const ahora = new Date().toISOString()
    await supabase.from('turnos').update({ estado: 'Confirmado', confirmado_at: ahora }).eq('id', fila.id)
    setTurnos((ts) => ts.map((t) => (t.id === fila.id ? { ...t, estado: 'Confirmado', confirmado_at: ahora } : t)))
  }

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Turnos del {formatearDia(`${dia}T12:00:00-03:00`)}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
            {loading ? 'Cargando…' : `${filas.length} turnos · ${pendientes} recordatorios por enviar`}
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <Calendar size={16} />
          <input type="date" className="input-field" value={dia} onChange={(e) => setDia(e.target.value)} style={{ width: 'auto' }} />
        </label>
      </div>

      {error && <p style={{ color: 'var(--danger-color)' }}>{error}</p>}
      {!loading && filas.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No hay turnos para ese día.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {filas.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.85rem 1rem', border: '1px solid var(--surface-border)', borderRadius: 12 }}>
            <strong style={{ width: 52 }}>{formatearHora(f.fecha_hora_inicio)}</strong>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {f.nombre} {f.origen === 'online' && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary-color)', marginLeft: 6 }}>RESERVA ONLINE</span>}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {f.servicios?.nombre || 'Servicio'} · {f.usuarios?.nombre_completo || 'Sin asignar'} · {f.telefono || 'sin teléfono'}
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', color: f.estado === 'Confirmado' ? 'var(--success-color)' : 'var(--text-secondary)' }}>
              {f.estado === 'Confirmado' ? 'Confirmado' : f.recordatorio_enviado_at ? 'Recordatorio enviado' : 'Sin recordar'}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" disabled={!f.telefono} onClick={() => enviar(f)} title={f.telefono ? 'Abrir WhatsApp con el mensaje listo' : 'Cargá el teléfono del cliente'}>
                <MessageCircle size={16} /> {f.recordatorio_enviado_at ? 'Reenviar' : 'Recordar'}
              </button>
              {f.estado !== 'Confirmado' && (
                <button className="btn btn-secondary" onClick={() => confirmar(f)}>
                  <CheckCircle2 size={16} /> Confirmó
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfigOnline({ empresa, setEmpresa, empresaId }) {
  const [form, setForm] = useState(null)
  const [servicios, setServicios] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (!empresa) return
    setForm({
      slug: empresa.slug || slugify(empresa.nombre),
      reserva_online_activa: Boolean(empresa.reserva_online_activa),
      whatsapp: empresa.whatsapp || '',
      horario_apertura: (empresa.horario_apertura || '09:00').slice(0, 5),
      horario_cierre: (empresa.horario_cierre || '20:00').slice(0, 5),
      dias_abierto: empresa.dias_abierto || [1, 2, 3, 4, 5, 6],
      reserva_anticipacion_min: empresa.reserva_anticipacion_min ?? 60,
      recordatorio_plantilla: empresa.recordatorio_plantilla || PLANTILLA_RECORDATORIO,
    })
  }, [empresa])

  useEffect(() => {
    if (!empresaId) return
    supabase.from('servicios').select('id, nombre, reservable_online').eq('empresa_id', empresaId).order('nombre').then(({ data }) => setServicios(data || []))
  }, [empresaId])

  if (!form) return <div className="glass-panel" style={{ padding: '1.5rem' }}>Cargando…</div>

  const link = `${window.location.origin}/r/${form.slug}`
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggleDia = (n) => setForm((f) => ({ ...f, dias_abierto: f.dias_abierto.includes(n) ? f.dias_abierto.filter((d) => d !== n) : [...f.dias_abierto, n].sort() }))

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje('')
    const payload = { ...form, slug: slugify(form.slug), reserva_anticipacion_min: Number(form.reserva_anticipacion_min) || 0 }
    const { data, error } = await supabase.from('empresas').update(payload).eq('id', empresaId).select().maybeSingle()
    setGuardando(false)
    if (error) {
      setMensaje(error.message.includes('empresas_slug_key') ? 'Ese link ya lo usa otro salón. Probá con otro.' : error.message)
      return
    }
    setEmpresa(data)
    setMensaje('Guardado')
  }

  const toggleServicio = async (s) => {
    const valor = !s.reservable_online
    setServicios((ss) => ss.map((x) => (x.id === s.id ? { ...x, reservable_online: valor } : x)))
    await supabase.from('servicios').update({ reservable_online: valor }).eq('id', s.id)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
      <form className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={guardar}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
          <input type="checkbox" checked={form.reserva_online_activa} onChange={set('reserva_online_activa')} />
          Recibir reservas online
        </label>
        <label>Link del salón
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>/r/</span>
            <input className="input-field" value={form.slug} onChange={set('slug')} required />
          </div>
        </label>
        <label>WhatsApp del salón
          <input className="input-field" value={form.whatsapp} onChange={set('whatsapp')} placeholder="11 2345 6789" style={{ marginTop: 6 }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label>Abre<input type="time" className="input-field" value={form.horario_apertura} onChange={set('horario_apertura')} style={{ marginTop: 6 }} /></label>
          <label>Cierra<input type="time" className="input-field" value={form.horario_cierre} onChange={set('horario_cierre')} style={{ marginTop: 6 }} /></label>
        </div>
        <div>
          <span>Días de atención</span>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: 6 }}>
            {DIAS.map((d) => (
              <button type="button" key={d.n} onClick={() => toggleDia(d.n)} className={`btn ${form.dias_abierto.includes(d.n) ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.45rem 0.7rem' }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <label>Anticipación mínima (minutos)
          <input type="number" min="0" className="input-field" value={form.reserva_anticipacion_min} onChange={set('reserva_anticipacion_min')} style={{ marginTop: 6 }} />
        </label>
        <label>Mensaje de recordatorio
          <textarea className="input-field" rows="4" value={form.recordatorio_plantilla} onChange={set('recordatorio_plantilla')} style={{ marginTop: 6 }} />
          <small style={{ color: 'var(--text-secondary)' }}>Podés usar {'{nombre}'}, {'{servicio}'}, {'{dia}'}, {'{hora}'}, {'{profesional}'} y {'{salon}'}.</small>
        </label>
        <button className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        {mensaje && <p style={{ color: mensaje === 'Guardado' ? 'var(--success-color)' : 'var(--danger-color)' }}>{mensaje}</p>}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={18} /> Tu link de reservas</h3>
          <p style={{ wordBreak: 'break-all', fontWeight: 600 }}>{link}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(link)}><Copy size={16} /> Copiar</button>
            <a className="btn btn-secondary" href={link} target="_blank" rel="noreferrer">Abrir</a>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Pegalo en la bio de Instagram, en Google Maps y en tu respuesta automática de WhatsApp.
            {!empresa?.reserva_online_activa && ' Activá la reserva online y guardá para que funcione.'}
          </p>
        </div>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Servicios que se pueden reservar</h3>
          {servicios.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Todavía no cargaste servicios.</p>}
          {servicios.map((s) => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0' }}>
              <input type="checkbox" checked={s.reservable_online !== false} onChange={() => toggleServicio(s)} />
              {s.nombre}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
