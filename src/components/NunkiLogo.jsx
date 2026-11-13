// Símbolo de Nunki: la flecha de Sagitario apuntando a la estrella Nunki.
// `color` pinta la flecha (por defecto el color de texto); `star` pinta la estrella.
export function NunkiSymbol({ size = 32, color = 'currentColor', star = 'var(--accent-color, #D9824A)', title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ flexShrink: 0 }}>
      <g stroke={color} strokeWidth="9" fill="none">
        <line x1="14" y1="86" x2="66" y2="34" />
        <polyline points="44,30 70,30 70,56" />
        <line x1="24" y1="52" x2="48" y2="76" />
      </g>
      <path d="M0 -1 C0.1 -0.3 0.3 -0.1 1 0 C0.3 0.1 0.1 0.3 0 1 C-0.1 0.3 -0.3 0.1 -1 0 C-0.3 -0.1 -0.1 -0.3 0 -1 Z" transform="translate(86 14) scale(13)" fill={star} />
    </svg>
  )
}

export function NunkiWordmark({ size = 28, color = 'currentColor', star, gap = 10 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, color }}>
      <NunkiSymbol size={size * 1.25} color={color} star={star} />
      <span style={{ fontFamily: "'Space Grotesk', Inter, sans-serif", fontWeight: 700, letterSpacing: '0.08em', fontSize: size, lineHeight: 1 }}>NUNKI</span>
    </span>
  )
}

export default NunkiSymbol
