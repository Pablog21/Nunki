import { lazy } from 'react'

// Si se publicó una versión nueva mientras la pestaña estaba abierta, los archivos viejos ya no existen.
// En ese caso recargamos la página una vez para traer la versión nueva, en vez de dejar la pantalla en blanco.
const CLAVE = 'nunki_recarga_version'

function recargarUnaVez() {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) || 0)
    if (Date.now() - ultima < 30000) return false
    sessionStorage.setItem(CLAVE, String(Date.now()))
  } catch { /* sin sessionStorage: recargamos igual */ }
  window.location.reload()
  return true
}

export default function lazyConRecarga(importar) {
  return lazy(() =>
    importar().catch((err) => {
      if (recargarUnaVez()) return new Promise(() => {}) // la página se está recargando
      throw err
    }),
  )
}

// Precargas de Vite que fallan por el mismo motivo
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (recargarUnaVez()) e.preventDefault()
  })
}
