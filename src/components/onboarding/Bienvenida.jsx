import { useEffect, useRef, useState } from 'react'
import { X, Moon, Sun, Upload, ArrowRight, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { TIPO_NEGOCIO } from '../../lib/tipos'
import SashaFace from '../SashaFace'

// Bienvenida del primer ingreso: saludo de Sasha, modo claro/oscuro, datos del salón y recorrido.
export default function Bienvenida({ esAdmin, onFin, onSalir }) {
  const { userProfile, activeEmpresaId } = useAuth()
  const pasos = esAdmin ? ['hola', 'tema', 'salon', 'listo'] : ['hola', 'tema', 'listo']
  const [i, setI] = useState(0)
  const [hablando, setHablando] = useState(true)
  const paso = pasos[i]
  const nombre = (userProfile?.nombre_completo || '').split(' ')[0]

  useEffect(() => {
    setHablando(true)
    const t = setTimeout(() => setHablando(false), 1600)
    return () => clearTimeout(t)
  }, [i])

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onSalir() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onSalir])

  const sig = () => setI((n) => Math.min(n + 1, pasos.length - 1))
  const ant = () => setI((n) => Math.max(n - 1, 0))

  return (
    <div className="ob-fondo" role="dialog" aria-modal="true" aria-label="Bienvenida a Nunki">
      <div className="ob-card">
        <button className="ob-x" onClick={onSalir} aria-label="Salir del tutorial" title="Salir del tutorial"><X size={18} /></button>
        <div className="ob-sasha">
          <SashaFace size={84} estado={hablando ? 'speaking' : 'idle'} />
        </div>

        {paso === 'hola' && (
          <div className="ob-cuerpo">
            <h2>¡Hola{nombre ? `, ${nombre}` : ''}! Soy Sasha</h2>
            <p>Voy a ser tu asistente en Nunki. En un par de minutos te ayudo a dejar todo listo y te muestro cómo funciona cada pantalla.</p>
            <p className="ob-muted">Podés salir del tutorial cuando quieras y volver a verlo desde el menú o pidiéndomelo.</p>
            <div className="ob-acciones">
              <button className="btn btn-secondary" onClick={onSalir}>Ahora no</button>
              <button className="btn btn-primary" onClick={sig}>Empecemos <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {paso === 'tema' && <PasoTema onAnt={ant} onSig={sig} empresaId={activeEmpresaId} />}
        {paso === 'salon' && <PasoSalon onAnt={ant} onSig={sig} empresaId={activeEmpresaId} />}

        {paso === 'listo' && (
          <div className="ob-cuerpo">
            <h2>¡Listo! ¿Te muestro la app?</h2>
            <p>Te llevo pantalla por pantalla y te cuento para qué sirve cada una. Tarda unos 2 minutos y lo podés cortar cuando quieras.</p>
            <div className="ob-opciones">
              <button className="ob-opcion ob-opcion-on" onClick={() => onFin('tour')}>
                <strong>Sí, mostrame la app</strong><span>Recorrido guiado · 2 minutos</span>
              </button>
              {esAdmin && (
                <button className="ob-opcion" onClick={() => onFin('pasos')}>
                  <strong>Prefiero cargar mis datos</strong><span>Servicios, equipo y productos, paso a paso</span>
                </button>
              )}
              <button className="ob-opcion" onClick={() => onFin(null)}>
                <strong>Más tarde</strong><span>Lo encontrás en el menú, en "Tutorial"</span>
              </button>
            </div>
            <button className="ob-volver" onClick={ant}><ArrowLeft size={14} /> Volver</button>
          </div>
        )}

        <div className="ob-puntos" aria-hidden="true">
          {pasos.map((p, n) => <span key={p} className={n === i ? 'on' : n < i ? 'hecho' : ''} />)}
        </div>
      </div>
    </div>
  )
}

function PasoTema({ onAnt, onSig, empresaId }) {
  const [tema, setTema] = useState(() => (document.body.classList.contains('light-theme') ? 'light' : 'dark'))
  const elegir = (t) => {
    setTema(t)
    document.body.classList.toggle('light-theme', t === 'light')
    try { if (empresaId) localStorage.setItem(`theme_empresa_${empresaId}`, t) } catch { /* sin almacenamiento */ }
  }
  return (
    <div className="ob-cuerpo">
      <h2>¿Cómo preferís ver Nunki?</h2>
      <p>Elegí el modo que te resulte más cómodo. Lo podés cambiar después desde Configuración.</p>
      <div className="ob-temas">
        <button className={`ob-tema ${tema === 'dark' ? 'on' : ''}`} onClick={() => elegir('dark')} aria-pressed={tema === 'dark'}>
          <span className="ob-tema-prev ob-prev-oscuro"><i /><i /><i /></span>
          <strong><Moon size={15} /> Oscuro</strong>
          <small>Descansa la vista, ideal con poca luz</small>
        </button>
        <button className={`ob-tema ${tema === 'light' ? 'on' : ''}`} onClick={() => elegir('light')} aria-pressed={tema === 'light'}>
          <span className="ob-tema-prev ob-prev-claro"><i /><i /><i /></span>
          <strong><Sun size={15} /> Claro</strong>
          <small>Se lee mejor con mucha luz</small>
        </button>
      </div>
      <div className="ob-acciones">
        <button className="btn btn-secondary" onClick={onAnt}><ArrowLeft size={16} /> Volver</button>
        <button className="btn btn-primary" onClick={onSig}>Seguir <ArrowRight size={16} /></button>
      </div>
    </div>
  )
}

function PasoSalon({ onAnt, onSig, empresaId }) {
  const [form, setForm] = useState({ nombre: '', tipo_negocio: '', descripcion: '', whatsapp: '' })
  const [logoActual, setLogoActual] = useState(null)
  const [logoArchivo, setLogoArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!empresaId) return
    supabase.from('empresas').select('nombre, tipo_negocio, descripcion, whatsapp, logo_url').eq('id', empresaId).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setForm({ nombre: data.nombre || '', tipo_negocio: data.tipo_negocio || '', descripcion: data.descripcion || '', whatsapp: data.whatsapp || '' })
        setLogoActual(data.logo_url || null)
      })
  }, [empresaId])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const elegirLogo = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('El logo tiene que ser una imagen (PNG o JPG).')
    if (f.size > 2 * 1024 * 1024) return setError('El logo puede pesar hasta 2 MB.')
    setError('')
    setLogoArchivo(f)
    setPreview(URL.createObjectURL(f))
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('Poné el nombre de tu salón.')
    setGuardando(true)
    setError('')
    try {
      let logoUrl = logoActual
      if (logoArchivo) {
        const ext = (logoArchivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
        const ruta = `${empresaId}/logo_${Date.now()}.${ext}`
        const { error: errSubida } = await supabase.storage.from('logos_empresa').upload(ruta, logoArchivo, { upsert: false, contentType: logoArchivo.type })
        if (errSubida) throw errSubida
        logoUrl = supabase.storage.from('logos_empresa').getPublicUrl(ruta).data.publicUrl
      }
      const { error: errUpd } = await supabase.from('empresas').update({
        nombre: form.nombre.trim(),
        tipo_negocio: form.tipo_negocio || null,
        descripcion: form.descripcion.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        logo_url: logoUrl,
      }).eq('id', empresaId)
      if (errUpd) throw errUpd
      window.dispatchEvent(new CustomEvent('nunki:empresa-actualizada'))
      onSig()
    } catch (err) {
      setError(`No se pudo guardar: ${err.message || err}`)
    }
    setGuardando(false)
  }

  const imagen = preview || logoActual
  return (
    <form className="ob-cuerpo" onSubmit={guardar}>
      <h2>Contame de tu salón</h2>
      <p>Esto aparece en el sistema y en tu página de reservas online.</p>
      <div className="ob-salon">
        <button type="button" className="ob-logo" onClick={() => inputRef.current?.click()} aria-label="Subir logo">
          {imagen ? <img src={imagen} alt="Logo del salón" /> : <span><Upload size={20} />Logo</span>}
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={elegirLogo} />
        <div className="ob-campos">
          <label>Nombre del salón *<input className="input-field" value={form.nombre} onChange={set('nombre')} required maxLength={120} /></label>
          <label>Tipo de negocio
            <select className="input-field" value={form.tipo_negocio} onChange={set('tipo_negocio')}>
              <option value="">Elegí una opción</option>
              {Object.entries(TIPO_NEGOCIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>
      <label className="ob-label">Descripción corta <small>{form.descripcion.length}/280</small>
        <textarea className="input-field" rows="2" maxLength={280} value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: Barbería clásica en Palermo. Cortes, barba y afeitado con navaja." />
      </label>
      <label className="ob-label">WhatsApp del salón
        <input className="input-field" type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="11 2345 6789" />
      </label>
      {error && <p className="ob-error">{error}</p>}
      <div className="ob-acciones">
        <button type="button" className="btn btn-secondary" onClick={onSig}>Lo completo después</button>
        <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y seguir'} <ArrowRight size={16} /></button>
      </div>
      <button type="button" className="ob-volver" onClick={onAnt}><ArrowLeft size={14} /> Volver</button>
    </form>
  )
}
