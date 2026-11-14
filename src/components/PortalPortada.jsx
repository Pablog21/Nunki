import { fondoPortada } from '../lib/portal'
import { NunkiSymbol } from './NunkiLogo'

// Portada de la página de reservas: banner o estilo, logo, nombre y descripción.
export default function PortalPortada({ nombre, descripcion, logoUrl, estilo, bannerUrl, compacta = false }) {
  const f = fondoPortada({ estilo, bannerUrl })
  return (
    <div className={`pp-portada ${f.oscuro ? 'pp-oscura' : 'pp-clara'} ${compacta ? 'pp-compacta' : ''}`}>
      <div className="pp-banner" style={{ backgroundImage: f.backgroundImage }} />
      <div className="pp-identidad">
        <div className="pp-logo">{logoUrl ? <img src={logoUrl} alt="" /> : <NunkiSymbol size={compacta ? 26 : 34} />}</div>
        <div className="pp-textos">
          <h1>{nombre || 'Tu salón'}</h1>
          <p>{descripcion || 'Reservá tu turno online'}</p>
        </div>
      </div>
    </div>
  )
}
