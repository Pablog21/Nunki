import { X, Check, PlayCircle, Compass, Store } from 'lucide-react'
import { GUIAS, PASO_SALON } from '../../lib/tour'
import SashaFace from '../SashaFace'

// Lista de primeros pasos con progreso real del salón y guías paso a paso.
export default function PrimerosPasos({ progreso, esAdmin, onGuia, onTour, onSalon, onCerrar }) {
  const guias = GUIAS.filter((g) => !(g.soloAdmin && !esAdmin))
  const hecho = (g) => {
    const v = progreso?.[g.progreso]
    return typeof v === 'boolean' ? v : Number(v) > 0
  }
  const salonHecho = Boolean(progreso?.logo || progreso?.descripcion)
  const items = [...(esAdmin ? [{ ...PASO_SALON, hecho: salonHecho }] : []), ...guias.map((g) => ({ ...g, hecho: hecho(g) }))]
  const completos = items.filter((x) => x.hecho).length

  return (
    <div className="pp" role="dialog" aria-label="Primeros pasos">
      <div className="pp-cabeza">
        <SashaFace size={40} estado="idle" />
        <div>
          <h3>Primeros pasos</h3>
          <small>{completos} de {items.length} listos</small>
        </div>
        <button className="tg-x" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div className="tg-barra"><i style={{ width: `${(completos / items.length) * 100}%` }} /></div>
      <ul className="pp-lista">
        {items.map((x) => (
          <li key={x.id} className={x.hecho ? 'ok' : ''}>
            <span className="pp-check" aria-hidden="true">{x.hecho && <Check size={13} />}</span>
            <div>
              <strong>{x.titulo}</strong>
              <small>{x.resumen}</small>
            </div>
            {x.id === 'salon' ? (
              <button className="pp-guia" onClick={onSalon}><Store size={14} /> {x.hecho ? 'Editar' : 'Completar'}</button>
            ) : (
              <button className="pp-guia" onClick={() => onGuia(x.id)}><PlayCircle size={14} /> {x.hecho ? 'Repasar' : 'Guiame'}</button>
            )}
          </li>
        ))}
      </ul>
      <button className="pp-tour" onClick={onTour}><Compass size={15} /> Ver el recorrido por toda la app</button>
    </div>
  )
}
