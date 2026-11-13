// Utility to dynamically update the app title, favicon, iOS apple-touch-icon,
// and Web App Manifest based on the currently logged-in hair salon (empresa).

let currentManifestBlobUrl = null

/**
 * Renders an image URL into a square PNG data URL with a dark background
 * so iOS and Android home screen icons always look clean and non-transparent.
 */
function createSquareIconDataUrl(imageUrl, size = 180) {
  return new Promise((resolve) => {
    if (!imageUrl) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // Fill dark background so transparent PNGs or non-square logos look great on iOS
        ctx.fillStyle = '#121212'
        ctx.fillRect(0, 0, size, size)

        // Center-crop / cover fit
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        const x = (size - w) / 2
        const y = (size - h) / 2
        ctx.drawImage(img, x, y, w, h)

        resolve(canvas.toDataURL('image/png'))
      } catch {
        // Fallback to raw URL if canvas is tainted by CORS
        resolve(imageUrl)
      }
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}

export async function updateAppBranding(empresaNombre, logoUrl) {
  const cleanName = empresaNombre && empresaNombre !== 'Sin Salón Seleccionado'
    ? empresaNombre
    : 'Nunki'

  // 1. Update document title & iOS home screen title
  document.title = `${cleanName} · Nunki`

  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', cleanName)
  }

  // 2. Prepare square PNG icon (or fallback to default static icon)
  const icon180 = (await createSquareIconDataUrl(logoUrl, 180)) || `${window.location.origin}/apple-touch-icon.png`
  const icon192 = (await createSquareIconDataUrl(logoUrl, 192)) || `${window.location.origin}/icon-192.png`
  const icon512 = (await createSquareIconDataUrl(logoUrl, 512)) || `${window.location.origin}/icon-512.png`

  // 3. Update <link rel="apple-touch-icon"> and <link rel="icon">
  const appleTouchLinks = document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')
  appleTouchLinks.forEach((link) => {
    link.setAttribute('href', icon180)
  })

  const faviconLink = document.querySelector('link[rel="icon"]')
  if (faviconLink) {
    faviconLink.setAttribute('href', icon192)
  }

  // 4. Dynamically update Web App Manifest for Android / Chrome PWA installation
  const manifestLink = document.querySelector('link[rel="manifest"]')
  if (manifestLink) {
    if (currentManifestBlobUrl) {
      URL.revokeObjectURL(currentManifestBlobUrl)
    }
    const dynamicManifest = {
      name: `${cleanName} - Gestión de Peluquería`,
      short_name: cleanName.slice(0, 20),
      description: `Sistema de gestión para ${cleanName}`,
      start_url: window.location.origin + '/',
      scope: window.location.origin + '/',
      display: 'standalone',
      background_color: '#121212',
      theme_color: '#121212',
      icons: [
        {
          src: icon180,
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: icon192,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: icon512,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    }
    const blob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/manifest+json' })
    currentManifestBlobUrl = URL.createObjectURL(blob)
    manifestLink.setAttribute('href', currentManifestBlobUrl)
  }
}
