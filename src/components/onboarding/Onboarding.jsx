import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { esOperador } from '../../lib/roles'
import { TOUR_GENERAL, GUIAS } from '../../lib/tour'
import Bienvenida from './Bienvenida'
import TourGuiado from './TourGuiado'
import PrimerosPasos from './PrimerosPasos'
import './Onboarding.css'

// Bienvenida, recorrido guiado y primeros pasos, todo con Sasha.
const OnboardingCtx = createContext(null)
export const useOnboarding = () => useContext(OnboardingCtx) || {}

async function guardar(cambios) {
  const { error } = await supabase.rpc('mi_onboarding_guardar', { p_cambios: cambios })
  if (error) console.warn('No se pudo guardar el progreso del tutorial', error)
}

export function OnboardingProvider({ children }) {
  const { userProfile, activeEmpresaId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [modo, setModo] = useState(null) // 'bienvenida' | 'tour' | 'pasos'
  const [pasos, setPasos] = useState([])
  const [indice, setIndice] = useState(0)
  const [guiaActual, setGuiaActual] = useState(null)
  const [progreso, setProgreso] = useState(null)

  const rol = (userProfile?.rol || '').toLowerCase()
  const esSuper = rol === 'super_admin'
  const operador = esOperador(userProfile)
  const filtrar = useCallback((lista) => lista.filter((p) => !(p.soloAdmin && operador)), [operador])

  const cargarProgreso = useCallback(async () => {
    const { data } = await supabase.rpc('mi_progreso')
    setProgreso(data || null)
  }, [])

  // Primer ingreso: abrir la bienvenida una sola vez
  useEffect(() => {
    if (!userProfile || esSuper || !activeEmpresaId) return
    const visto = userProfile.onboarding?.bienvenida
    if (!visto && location.pathname !== '/mi-plan') setModo('bienvenida')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id, esSuper, activeEmpresaId])

  const cerrar = useCallback(() => {
    if (modo === 'tour' && !guiaActual) guardar({ tour_salido: new Date().toISOString() })
    setModo(null)
    setGuiaActual(null)
  }, [modo, guiaActual])

  const iniciarTour = useCallback(() => {
    setGuiaActual(null)
    setPasos(filtrar(TOUR_GENERAL))
    setIndice(0)
    setModo('tour')
  }, [filtrar])

  const iniciarGuia = useCallback((id) => {
    const g = GUIAS.find((x) => x.id === id)
    if (!g) return
    setGuiaActual(g)
    setPasos(g.pasos)
    setIndice(0)
    setModo('tour')
  }, [])

  const abrirPrimerosPasos = useCallback(() => { cargarProgreso(); setModo('pasos') }, [cargarProgreso])

  const terminarTour = useCallback(() => {
    if (guiaActual) {
      guardar({ [`guia_${guiaActual.id}`]: new Date().toISOString() })
      setGuiaActual(null)
      abrirPrimerosPasos()
    } else {
      guardar({ tour_completo: new Date().toISOString() })
      abrirPrimerosPasos()
    }
  }, [guiaActual, abrirPrimerosPasos])

  const finBienvenida = useCallback((siguiente) => {
    guardar({ bienvenida: new Date().toISOString() })
    if (siguiente === 'tour') iniciarTour()
    else if (siguiente === 'pasos') abrirPrimerosPasos()
    else setModo(null)
  }, [iniciarTour, abrirPrimerosPasos])

  // Sasha u otros componentes pueden pedir el tutorial con un evento
  useEffect(() => {
    const abrir = (e) => {
      const que = e.detail || 'tour'
      if (que === 'pasos') abrirPrimerosPasos()
      else if (que === 'bienvenida') setModo('bienvenida')
      else iniciarTour()
    }
    window.addEventListener('nunki:tutorial', abrir)
    return () => window.removeEventListener('nunki:tutorial', abrir)
  }, [abrirPrimerosPasos, iniciarTour])

  const valor = useMemo(() => ({ iniciarTour, iniciarGuia, abrirPrimerosPasos, abrirBienvenida: () => setModo('bienvenida') }),
    [iniciarTour, iniciarGuia, abrirPrimerosPasos])

  return (
    <OnboardingCtx.Provider value={valor}>
      {children}
      {modo === 'bienvenida' && <Bienvenida esAdmin={!operador} onFin={finBienvenida} onSalir={() => finBienvenida(null)} />}
      {modo === 'tour' && (
        <TourGuiado
          pasos={pasos}
          indice={indice}
          setIndice={setIndice}
          guia={guiaActual}
          navigate={navigate}
          onSalir={cerrar}
          onFin={terminarTour}
        />
      )}
      {modo === 'pasos' && (
        <PrimerosPasos
          progreso={progreso}
          esAdmin={!operador}
          onGuia={iniciarGuia}
          onTour={iniciarTour}
          onSalon={() => setModo('bienvenida')}
          onCerrar={() => setModo(null)}
        />
      )}
    </OnboardingCtx.Provider>
  )
}
