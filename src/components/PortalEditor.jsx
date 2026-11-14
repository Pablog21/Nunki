import { useRef, useState } from 'react'
import { Upload, Check, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { ESTILOS_PORTAL } from '../lib/portal'
import PortalPortada from './PortalPortada'
import '../pages/Reserva.css'
import './PortalEditor.css'

const MAX_MB = 3

// Personalización de la página de reservas: logo, banner propio o estilo prediseñado, con vista previa.
export default function PortalEditor({ empresa, empresaId, onGuardado, link }) {
  const [estilo, setEstilo] = useState(empresa?.portal_estilo || 'bosque')
  const [banner, setBanner] = useState(empresa?.portal_banner_url || null)
  const [logo, setLogo] = useState(empresa?.logo_url || null)
  const [subiendo, setSubiendo] = useState('')
  const [estado, setEstado] = useState('')
  const bannerRef = useRef(null)
  const logoRef = useRef(null)

  const guardar = async (cambios) => {
    setEstado('Guardando…')
    const { data, error } = await supabase.from('empresas').update(cambios).eq('id', empresaId).select().maybeSingle()
    if (error) { setEstado(`No se pudo guardar: ${error.message}`); return false }
    onGuardado?.(data)
    window.dispatchEvent(new CustomEvent('nunki:empresa-actualizada'))
    setEstado('Guardado')
    setTimeout(() => setEstado(''), 1800)
    return true
  }

  const subir = async (archivo, tipo) => {
    if (!archivo) return
    if (!archivo.type.startsWith('image/')) { setEstado('Tiene que ser una imagen (JPG, PNG o WEBP).'); return }
    if (archivo.size > MAX_MB * 1024 * 1024) { setEstado(`La imagen puede pesar hasta ${MAX_MB} MB.`); return }
    setSubiendo(tipo)
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const ruta = `${empresaId}/${tipo}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos_empresa').upload(ruta, archivo, { contentType: archivo.type })
    if (error) { setSubiendo(''); setEstado(`No se pudo subir: ${error.message}`); return }
    const url = supabase.storage.from('logos_empresa').getPublicUrl(ruta).data.publicUrl
    if (tipo === 'banner') { setBanner(url); await guardar({ portal_banner_url: url }) }
    else { setLogo(url); await guardar({ logo_url: url }) }
    setSubiendo('')
  }

  const elegirEstilo = async (id) => {
    setEstilo(id)
    const cambios = { portal_estilo: id }
    if (banner) { setBanner(null); cambios.portal_banner_url = null }
    await guardar(cambios)
  }

  const quitarBanner = async () => { setBanner(null); await guardar({ portal_banner_url: null }) }

  return (
    <div className="glass-panel pe">
      <div className="pe-head">
        <h3>Personalizá tu página</h3>
        {estado && <span className={`pe-estado ${estado === 'Guardado' ? 'ok' : ''}`}>{estado === 'Guardado' && <Check size={14} />} {estado}</span>}
      </div>

      <div className="pe-preview" aria-label="Vista previa de tu página de reservas">
        <PortalPortada compacta nombre={empresa?.nombre} descripcion={empresa?.descripcion} logoUrl={logo} estilo={estilo} bannerUrl={banner} />
        <div className="pe-preview-pie">
          <span>Elegí un servicio</span>
          {link && <a href={link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver mi página</a>}
        </div>
      </div>

      <div className="pe-acciones">
        <button type="button" className="btn btn-secondary" onClick={() => logoRef.current?.click()} disabled={subiendo === 'logo'}>
          <Upload size={15} /> {subiendo === 'logo' ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => bannerRef.current?.click()} disabled={subiendo === 'banner'}>
          <Upload size={15} /> {subiendo === 'banner' ? 'Subiendo…' : 'Subir mi banner'}
        </button>
        {banner && <button type="button" className="btn btn-secondary" onClick={quitarBanner}><Trash2 size={15} /> Quitar banner</button>}
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => subir(e.target.files?.[0], 'logo')} />
        <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => subir(e.target.files?.[0], 'banner')} />
      </div>
      <p className="pe-ayuda">Banner: una foto horizontal de tu salón (ideal 1600 × 500). O elegí uno de estos estilos:</p>

      <div className="pe-estilos" role="radiogroup" aria-label="Estilo de la página">
        {ESTILOS_PORTAL.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={!banner && estilo === e.id}
            className={`pe-estilo ${!banner && estilo === e.id ? 'on' : ''}`} onClick={() => elegirEstilo(e.id)}>
            <span className="pe-muestra" style={{ backgroundImage: e.imagen ? `url("${e.imagen}")` : e.fondo }}>
              <i style={{ background: e.acento }} />
            </span>
            <small>{e.nombre}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
