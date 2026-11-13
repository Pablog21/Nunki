// Cara animada de Sasha, la asistente de Nunki.
// estado: 'idle' | 'listening' | 'thinking' | 'speaking'
import './SashaFace.css'

export default function SashaFace({ size = 96, estado = 'idle', animada = true }) {
  return (
    <div
      className={`sf sf-${estado} ${animada ? 'sf-anim' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        estado === 'listening' ? 'Sasha te está escuchando'
          : estado === 'thinking' ? 'Sasha está pensando'
            : estado === 'speaking' ? 'Sasha está hablando'
              : 'Sasha'
      }
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <defs>
          <radialGradient id="sfCara" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#21503F" />
            <stop offset="70%" stopColor="#123A31" />
            <stop offset="100%" stopColor="#0B1F1A" />
          </radialGradient>
          <linearGradient id="sfAro" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F2B98D" />
            <stop offset="100%" stopColor="#B4612A" />
          </linearGradient>
        </defs>

        {/* Halo que respira o late al escuchar */}
        <circle className="sf-halo" cx="60" cy="62" r="54" fill="none" stroke="#D9824A" strokeWidth="2" />

        {/* Aro exterior: tres cuartos en cobre, el resto en salvia */}
        <circle cx="60" cy="62" r="47" fill="none" stroke="#9DB8A8" strokeOpacity="0.35" strokeWidth="6" />
        <circle className="sf-aro" cx="60" cy="62" r="47" fill="none" stroke="url(#sfAro)" strokeWidth="6"
          strokeLinecap="round" strokeDasharray="221 295" transform="rotate(-140 60 62)" />

        {/* Cara */}
        <circle cx="60" cy="62" r="40" fill="url(#sfCara)" />
        <ellipse cx="48" cy="44" rx="16" ry="8" fill="#F3EFE7" opacity="0.06" />

        {/* Ojos */}
        <g className="sf-ojos">
          <rect className="sf-ojo" x="41" y="49" width="12" height="17" rx="6" fill="#F3EFE7" />
          <rect className="sf-ojo" x="67" y="49" width="12" height="17" rx="6" fill="#F3EFE7" />
        </g>

        {/* Boca: barras de voz al hablar, sonrisa en reposo */}
        <path className="sf-sonrisa" d="M50 77 Q60 84 70 77" fill="none" stroke="#E39461" strokeWidth="3" strokeLinecap="round" />
        <g className="sf-voz" fill="#E39461">
          <rect x="48" y="74" width="4" height="8" rx="2" />
          <rect x="54" y="72" width="4" height="12" rx="2" />
          <rect x="60" y="70" width="4" height="16" rx="2" />
          <rect x="66" y="72" width="4" height="12" rx="2" />
        </g>

        {/* Puntos de "pensando" */}
        <g className="sf-puntos" fill="#E39461">
          <circle cx="51" cy="79" r="2.6" />
          <circle cx="60" cy="79" r="2.6" />
          <circle cx="69" cy="79" r="2.6" />
        </g>

        {/* La estrella Nunki */}
        <path className="sf-estrella"
          d="M0 -1 C0.1 -0.3 0.3 -0.1 1 0 C0.3 0.1 0.1 0.3 0 1 C-0.1 0.3 -0.3 0.1 -1 0 C-0.3 -0.1 -0.1 -0.3 0 -1 Z"
          transform="translate(98 22) scale(11)" fill="#D9824A" />
      </svg>
    </div>
  )
}
