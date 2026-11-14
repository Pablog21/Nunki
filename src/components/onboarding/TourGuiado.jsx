import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, ArrowLeft, ArrowRight, MousePointerClick } from 'lucide-react'
import SashaFace from '../SashaFace'

// Busca en la pantalla el elemento real que hay que resaltar
function buscarObjetivo(objetivo) {
  if (!objetivo) return null
  const visible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    const st = window.getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  if (objetivo.nav) {
    const href = objetivo.nav
    const candidatos = [
      ...document.querySelectorAll(`.sidebar a[href="${href}"]`),
      ...document.querySelectorAll(`.mobile-bottom-nav a[href="${href}"]`),
    ]
    return candidatos.find(visible) || null
  }
  if (objetivo.boton) {
    const texto = objetivo.boton.toLowerCase()
    const botones = [...document.querySelectorAll('.main-content button, .main-content a.btn')]
    return botones.find((b) => visible(b) && b.textContent.trim().toLowerCase().includes(texto)) || null
  }
  if (objetivo.css) {
    const lista = [...document.querySelectorAll(objetivo.css)]
    return lista.find(visible) || null
  }
  return null
}

const MARGEN = 8

// Recorrido paso a paso: resalta el elemento, mueve una "mano" hasta él y Sasha explica.
export default function TourGuiado({ pasos, indice, setIndice, guia, navigate, onSalir, onFin }) {
  const paso = pasos[indice]
  const [rect, setRect] = useState(null)
  const [hablando, setHablando] = useState(true)
  const [buscando, setBuscando] = useState(true)
  const elRef = useRef(null)

  // Ir a la pantalla del paso
  useEffect(() => {
    if (paso?.ruta && window.location.pathname !== paso.ruta) navigate(paso.ruta)
  }, [paso, navigate])

  // Buscar el elemento (puede tardar en aparecer mientras carga la pantalla)
  useEffect(() => {
    let vivo = true
    let intentos = 0
    setBuscando(true)
    setRect(null)
    elRef.current = null
    setHablando(true)
    const tHablar = setTimeout(() => vivo && setHablando(false), 1800)
    const probar = () => {
      if (!vivo) return
      const el = buscarObjetivo(paso?.objetivo)
      if (el) {
        elRef.current = el
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        setTimeout(() => { if (vivo) { setRect(el.getBoundingClientRect()); setBuscando(false) } }, 350)
        return
      }
      if (++intentos < 20 && paso?.objetivo) setTimeout(probar, 150)
      else setBuscando(false)
    }
    setTimeout(probar, 120)
    return () => { vivo = false; clearTimeout(tHablar) }
  }, [paso])

  // Seguir al elemento si cambia el tamaño o se scrollea
  useLayoutEffect(() => {
    const actualizar = () => { if (elRef.current) setRect(elRef.current.getBoundingClientRect()) }
    window.addEventListener('resize', actualizar)
    window.addEventListener('scroll', actualizar, true)
    return () => { window.removeEventListener('resize', actualizar); window.removeEventListener('scroll', actualizar, true) }
  }, [])

  const ultimo = indice >= pasos.length - 1
  const siguiente = useCallback(() => { if (ultimo) onFin(); else setIndice(indice + 1) }, [ultimo, onFin, setIndice, indice])
  const anterior = () => setIndice(Math.max(indice - 1, 0))

  const mostrarme = () => {
    if (elRef.current) elRef.current.click()
    setTimeout(siguiente, 400)
  }

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onSalir()
      if (e.key === 'ArrowRight') siguiente()
      if (e.key === 'ArrowLeft') setIndice((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onSalir, siguiente, setIndice])

  if (!paso) return null

  // Posición de la burbuja de Sasha: al lado del elemento, o centrada si no hay
  const ancho = Math.min(360, window.innerWidth - 32)
  const movil = window.innerWidth < 700
  let estilo = { width: ancho }
  if (rect && !movil) {
    const derecha = rect.right + 16 + ancho < window.innerWidth
    const izquierda = rect.left - 16 - ancho > 0
    const top = Math.min(Math.max(rect.top + rect.height / 2 - 110, 16), window.innerHeight - 280)
    if (derecha) estilo = { ...estilo, left: rect.right + 16, top }
    else if (izquierda) estilo = { ...estilo, left: rect.left - 16 - ancho, top }
    else if (rect.bottom + 260 < window.innerHeight) estilo = { ...estilo, left: Math.max(16, Math.min(rect.left, window.innerWidth - ancho - 16)), top: rect.bottom + 14 }
    else estilo = { ...estilo, left: Math.max(16, Math.min(rect.left, window.innerWidth - ancho - 16)), top: Math.max(16, rect.top - 270) }
  } else {
    estilo = { ...estilo, left: '50%', bottom: movil ? 84 : '50%', transform: movil ? 'translateX(-50%)' : 'translate(-50%, 50%)' }
  }

  return (
    <div className="tg" aria-live="polite">
      {/* Oscurecer todo menos el elemento resaltado */}
      {rect ? (
        <div className="tg-agujero" style={{
          top: rect.top - MARGEN, left: rect.left - MARGEN, width: rect.width + MARGEN * 2, height: rect.height + MARGEN * 2,
        }} />
      ) : (
        <div className="tg-velo" />
      )}

      {/* Mano animada que va hasta el elemento */}
      {rect && (
        <div className="tg-mano" key={`${indice}-${Math.round(rect.top)}`} style={{
          '--x': `${rect.left + Math.min(rect.width * 0.6, rect.width - 12)}px`,
          '--y': `${rect.top + rect.height * 0.55}px`,
        }}>
          <MousePointerClick size={26} />
          <span className="tg-onda" />
        </div>
      )}

      <div className="tg-burbuja" style={estilo} role="dialog" aria-label={paso.titulo}>
        <button className="tg-x" onClick={onSalir} aria-label="Salir del tutorial" title="Salir del tutorial"><X size={16} /></button>
        <div className="tg-cabeza">
          <SashaFace size={44} estado={hablando ? 'speaking' : 'idle'} />
          <div>
            <small>{guia ? guia.titulo : 'Recorrido por Nunki'} · {indice + 1} de {pasos.length}</small>
            <h3>{paso.titulo}</h3>
          </div>
        </div>
        <p>{paso.texto}</p>
        {!rect && !buscando && paso.objetivo && (
          <p className="tg-nota">En esta pantalla no lo encuentro, pero podés seguir.</p>
        )}
        <div className="tg-barra"><i style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} /></div>
        <div className="tg-acciones">
          <button className="tg-salir" onClick={onSalir}>Salir</button>
          <div>
            {indice > 0 && <button className="btn btn-secondary tg-btn" onClick={anterior}><ArrowLeft size={15} /></button>}
            {paso.accion === 'clic' && rect && (
              <button className="btn btn-secondary tg-btn" onClick={mostrarme}>Mostrame</button>
            )}
            <button className="btn btn-primary tg-btn" onClick={siguiente}>
              {ultimo ? (guia ? 'Terminar' : '¡Listo!') : 'Siguiente'} {!ultimo && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
