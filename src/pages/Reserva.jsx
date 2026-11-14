import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Check, Clock, MessageCircle, User } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { NunkiSymbol } from '../components/NunkiLogo'
import PortalPortada from '../components/PortalPortada'
import { fondoPortada } from '../lib/portal'
import { formatearDia, formatearHora, linkWhatsApp } from '../lib/whatsapp'
import './Reserva.css'

const PASO_MIN = 15
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const ars = (n) => (n == null ? '' : '$ ' + Number(n).toLocaleString('es-AR'))
// Argentina no usa horario de verano: -03:00 todo el año
const fechaAR = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`)

export default function Reserva() {
  const { slug } = useParams()
  const [salon, setSalon] = useState(undefined)
  const [servicio, setServicio] = useState(null)
  const [profesional, setProfesional] = useState('cualquiera')
  const [dia, setDia] = useState(null)
  const [ocupados, setOcupados] = useState([])
  const [hora, setHora] = useState(null)
  const [form, setForm] = useState({ nombre: '', telefono: '', notas: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    document.body.classList.add('light-theme')
    supabase.rpc('reserva_salon', { p_slug: slug }).then(({ data, error }) => {
      setSalon(error ? null : data)
      if (data?.nombre) document.title = `Reservá en ${data.nombre}`
    })
    return () => document.body.classList.remove('light-theme')
  }, [slug])

  const dias = useMemo(() => {
    if (!salon) return []
    const out = []
    const d = new Date()
    for (let i = 0; out.length < 14 && i < 30; i++) {
      const isoDow = d.getDay() === 0 ? 7 : d.getDay()
      if ((salon.dias || []).includes(isoDow)) out.push(isoDia(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [salon])

  useEffect(() => {
    if (!dia) return
    setOcupados([])
    supabase.rpc('reserva_ocupados', { p_slug: slug, p_dia: dia }).then(({ data }) => setOcupados(data || []))
  }, [dia, slug])

  const horarios = useMemo(() => {
    if (!salon || !servicio || !dia) return []
    const dur = servicio.duracion || 30
    const minimo = Date.now() + (salon.anticipacion_min || 0) * 60000
    const pros = profesional === 'cualquiera' ? salon.profesionales.map((p) => p.id) : [profesional]
    const out = []
    for (let m = aMin(salon.apertura); m + dur <= aMin(salon.cierre); m += PASO_MIN) {
      const ini = fechaAR(dia, hhmm(m))
      const fin = new Date(ini.getTime() + dur * 60000)
      if (ini.getTime() < minimo) continue
      const libre = pros.some((pid) => !ocupados.some((o) => o.colaborador_id === pid && new Date(o.inicio) < fin && new Date(o.fin) > ini))
      if (libre) out.push(hhmm(m))
    }
    return out
  }, [salon, servicio, dia, profesional, ocupados])

  const confirmar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const { data, error } = await supabase.rpc('reserva_crear', {
      p_slug: slug,
      p_servicio: servicio.id,
      p_colaborador: profesional === 'cualquiera' ? null : profesional,
      p_inicio: fechaAR(dia, hora).toISOString(),
      p_nombre: form.nombre,
      p_telefono: form.telefono,
      p_notas: form.notas,
    })
    setEnviando(false)
    if (error) {
      setError(error.message || 'No se pudo reservar. Probá otro horario.')
      if (/ocup/i.test(error.message || '')) {
        setHora(null)
        supabase.rpc('reserva_ocupados', { p_slug: slug, p_dia: dia }).then(({ data }) => setOcupados(data || []))
      }
      return
    }
    setResultado(data)
  }

  if (salon === undefined) return <div className="rv"><div className="rv-card rv-center">Cargando…</div></div>
  if (salon === null) {
    return (
      <div className="rv"><div className="rv-card rv-center">
        <NunkiSymbol size={40} title="Nunki" />
        <h1>Este link de reservas todavía no está activo</h1>
        <p>Consultá con el salón por WhatsApp o redes mientras tanto.</p>
        <p className="rv-inactivo-dueno">¿Sos el dueño del salón? Activala desde Nunki, en <strong>Agenda → Reserva online</strong>: marcá "Recibir reservas online", elegí qué servicios se pueden reservar y guardá.</p>
      </div></div>
    )
  }

  if (resultado) {
    const aviso = `Hola! Acabo de reservar ${servicio.nombre} el ${formatearDia(resultado.inicio)} a las ${formatearHora(resultado.inicio)} con ${resultado.profesional}. Soy ${form.nombre}.`
    return (
      <div className="rv"><div className="rv-card rv-center">
        <div className="rv-ok"><Check size={28} /></div>
        <h1>¡Listo, {form.nombre.split(' ')[0]}!</h1>
        <p className="rv-big">{servicio.nombre}</p>
        <p>{formatearDia(resultado.inicio)} · {formatearHora(resultado.inicio)} · con {resultado.profesional}</p>
        <p className="rv-muted">{salon.nombre} te va a confirmar por WhatsApp.</p>
        {resultado.whatsapp_salon && (
          <a className="rv-btn" href={linkWhatsApp(resultado.whatsapp_salon, aviso)} target="_blank" rel="noreferrer">
            <MessageCircle size={18} /> Avisar al salón por WhatsApp
          </a>
        )}
      </div></div>
    )
  }

  const paso = !servicio ? 1 : !dia || !hora ? 2 : 3

  return (
    <div className="rv" style={{ '--rv-acento': fondoPortada({ estilo: salon.portal_estilo, bannerUrl: salon.portal_banner_url }).acento }}>
      <div className="rv-card">
        <PortalPortada nombre={salon.nombre} descripcion={salon.descripcion} logoUrl={salon.logo_url}
          estilo={salon.portal_estilo} bannerUrl={salon.portal_banner_url} />

        <ol className="rv-steps" aria-label="Pasos">
          <li className={paso >= 1 ? 'on' : ''}>Servicio</li>
          <li className={paso >= 2 ? 'on' : ''}>Día y hora</li>
          <li className={paso >= 3 ? 'on' : ''}>Tus datos</li>
        </ol>

        {paso === 1 && (
          <section>
            <h2>¿Qué te querés hacer?</h2>
            <div className="rv-list">
              {salon.servicios.length === 0 && <p className="rv-muted">El salón todavía no publicó servicios.</p>}
              {salon.servicios.map((s) => (
                <button key={s.id} className="rv-item" onClick={() => setServicio(s)}>
                  <span><strong>{s.nombre}</strong><small><Clock size={13} /> {s.duracion} min</small></span>
                  <span className="rv-price">{ars(s.precio)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {paso === 2 && (
          <section>
            <button className="rv-back" onClick={() => { setServicio(null); setDia(null); setHora(null) }}><ArrowLeft size={16} /> {servicio.nombre}</button>
            <h2>¿Con quién?</h2>
            <div className="rv-chips">
              <button className={profesional === 'cualquiera' ? 'on' : ''} onClick={() => { setProfesional('cualquiera'); setHora(null) }}>Cualquiera</button>
              {salon.profesionales.map((p) => (
                <button key={p.id} className={profesional === p.id ? 'on' : ''} onClick={() => { setProfesional(p.id); setHora(null) }}><User size={14} /> {p.nombre}</button>
              ))}
            </div>
            <h2>¿Qué día?</h2>
            <div className="rv-days">
              {dias.map((d) => {
                const f = fechaAR(d, '12:00')
                return (
                  <button key={d} className={dia === d ? 'on' : ''} onClick={() => { setDia(d); setHora(null) }}>
                    <small>{f.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'America/Argentina/Buenos_Aires' })}</small>
                    <strong>{f.toLocaleDateString('es-AR', { day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })}</strong>
                    <small>{f.toLocaleDateString('es-AR', { month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })}</small>
                  </button>
                )
              })}
            </div>
            {dia && (
              <>
                <h2>¿A qué hora?</h2>
                {horarios.length === 0 ? <p className="rv-muted">No quedan horarios libres ese día. Probá con otro.</p> : (
                  <div className="rv-hours">
                    {horarios.map((h) => <button key={h} className={hora === h ? 'on' : ''} onClick={() => setHora(h)}>{h}</button>)}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {paso === 3 && (
          <form onSubmit={confirmar}>
            <button type="button" className="rv-back" onClick={() => setHora(null)}><ArrowLeft size={16} /> {servicio.nombre} · {formatearDia(fechaAR(dia, hora))} · {hora}</button>
            <h2>Tus datos</h2>
            <label>Nombre y apellido<input required minLength={2} maxLength={80} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoComplete="name" /></label>
            <label>WhatsApp<input required type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="11 2345 6789" autoComplete="tel" /></label>
            <label>¿Algo que el salón deba saber? (opcional)<textarea rows="2" maxLength={300} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>
            {error && <p className="rv-error">{error}</p>}
            <button className="rv-btn" disabled={enviando}>{enviando ? 'Reservando…' : 'Confirmar reserva'}</button>
          </form>
        )}
        {paso !== 3 && error && <p className="rv-error">{error}</p>}
      </div>
      <p className="rv-foot">Reservas con <strong>Nunki</strong></p>
    </div>
  )
}
