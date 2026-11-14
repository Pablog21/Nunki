import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Calendar, Receipt, Wallet, Percent, Package, ShoppingCart,
  BarChart3, Mic, Send, Check, ChevronDown, X, MessageCircle,
  Scissors, Smartphone, ShieldCheck, Palette, Sparkles, Clock
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './Landing.css'
import { NunkiSymbol } from '../components/NunkiLogo'
import SashaFace from '../components/SashaFace'
import { TIPO_NEGOCIO } from '../lib/tipos'
import { PLANES, formatoPrecio, formatoMonto, PRUEBA_DIAS, DESCUENTO_ANUAL, PAQUETE_SASHA, detectarMoneda, extraPlan, notaPrecios } from '../lib/planes'

/* ====================================================================
   CONFIGURACIÓN COMERCIAL — cambiar aquí marca, contacto y precios.
   Todo el texto de la landing toma estos valores.
   ==================================================================== */
const BRAND = {
  nombre: 'Nunki',
  asistente: 'Sasha',
  // WhatsApp comercial en formato internacional sin "+" ni espacios, ej: '5493512345678'.
  // Si queda vacío, los botones usan el formulario + email.
  whatsapp: '',
  email: 'pablomgomez21@gmail.com',
}

// Dejar vacío para ocultar la sección de precios (se muestra "Pedí tu cotización").
// Ejemplo: { nombre: 'Salón', precio: '$ 00.000', periodo: '/mes', detalle: 'Hasta 5 profesionales', items: ['Agenda', 'Caja'], destacado: true }


// Videos del hero en 1080p (recomprimidos desde Videos_Raw)
const VIDEOS = ['hero-3998455.mp4', 'hero-8488854.mp4', 'hero-8331940.mp4', 'hero-5885774.mp4']

const ars = (n) => '$ ' + Math.round(n).toLocaleString('es-AR')

// Tipos de salón: cada tarjeta usa un video corto en loop. Si el archivo no existe, muestra un fondo de marca.
const TIPOS = [
  { titulo: 'Peluquerías', texto: 'Agenda por estilista y servicios largos sin superposiciones.', video: '/landing/tipo-8488854.mp4', poster: '/landing/tipo-8488854.jpg' },
  { titulo: 'Coloristas', texto: 'Recetas de insumos que descuentan el stock en cada color.', video: '/landing/tipo-3996899.mp4', poster: '/landing/tipo-3996899.jpg' },
  { titulo: 'Barberías', texto: 'Turnos cortos y seguidos, y la caja cerrada en minutos.', video: '/landing/tipo-barberia.mp4', poster: '/landing/tipo-barberia.jpg' },
  { titulo: 'Salones con equipo', texto: 'Comisiones compartidas, asistencias y permisos por persona.', video: '/landing/tipo-5885774.mp4', poster: '/landing/tipo-5885774.jpg' },
]

function TipoCard({ titulo, texto, video, poster }) {
  const [sinVideo, setSinVideo] = useState(!video)
  return (
    <article className="lp-type">
      {!sinVideo
        ? <video src={video} poster={poster} autoPlay muted loop playsInline preload="metadata" onError={() => setSinVideo(true)} aria-hidden="true" />
        : <div className="lp-type-fallback" aria-hidden="true"><NunkiSymbol size={72} color="#F3EFE7" /></div>}
      <div className="lp-type-txt">
        <h3>{titulo}</h3>
        <p>{texto}</p>
      </div>
    </article>
  )
}

const DOLORES = [
  { dolor: 'La caja no cierra y no sabés dónde está la diferencia.', solucion: 'Cada comanda registra efectivo, tarjeta y transferencia por separado. El cierre se calcula solo y queda controlado por el dueño.' },
  { dolor: 'Las comisiones se calculan a mano, en cuaderno o Excel.', solucion: 'El porcentaje de cada profesional se aplica al cobrar. La liquidación del período sale con un clic, incluso en trabajos compartidos.' },
  { dolor: 'La tintura se termina justo el día que la necesitás.', solucion: 'Cada servicio tiene su receta de insumos y descuenta el stock al cobrarse. Ves qué se está terminando antes de que falte.' },
  { dolor: 'No sabés qué clientas dejaron de venir.', solucion: 'Ficha de cada cliente con historial de servicios y última visita. Le preguntás a ' + BRAND.asistente + ' y te responde al instante.' },
]

const MODULOS = [
  { icon: Calendar, titulo: 'Agenda y reserva online', texto: 'Turnos por profesional y un link propio para que tus clientes reserven solos, las 24 horas.' },
  { icon: MessageCircle, titulo: 'Recordatorios por WhatsApp', texto: 'Los turnos de mañana, con el mensaje listo para enviar con un toque. Incluido, sin costo por mensaje.' },
  { icon: Receipt, titulo: 'Comandas', texto: 'Servicios y productos de cada visita, con trabajos compartidos entre profesionales.' },
  { icon: Wallet, titulo: 'Caja diaria', texto: 'Pagos mixtos, movimientos, retiros y cierre con control del dueño.' },
  { icon: Percent, titulo: 'Comisiones y liquidaciones', texto: 'Porcentajes por profesional y liquidaciones del período sin planillas.' },
  { icon: Package, titulo: 'Stock por receta', texto: 'Insumos asociados a cada servicio que se descuentan automáticamente.' },
  { icon: ShoppingCart, titulo: 'Compras y gastos', texto: 'Facturas de proveedores, gastos con tarjeta y su impacto en el mes.' },
  { icon: BarChart3, titulo: 'Tablero y equipo', texto: 'Facturación, rendimiento de cada profesional y asistencias del equipo.' },
]

const DEMO_CHAT = [
  {
    pregunta: 'Agendá a Lucía mañana a las 15 con Marcos, corte y color',
    respuesta: 'Listo para confirmar: Lucía Fernández, mañana 15:00 con Marcos. Corte + Color (2 h 30 min). ¿Lo agendo?',
    accion: 'Turno propuesto',
  },
  {
    pregunta: '¿Hace cuánto no viene Ana Martín?',
    respuesta: 'Ana Martín vino por última vez hace 47 días. Se hizo Balayage + Nutrición con Sofía.',
    accion: 'Historial consultado',
  },
  {
    pregunta: '¿Cuánto facturamos hoy?',
    respuesta: 'Hoy van 14 comandas por ' + ars(386500) + ': efectivo ' + ars(152000) + ', tarjeta ' + ars(141500) + ' y transferencia ' + ars(93000) + '.',
    accion: 'Resumen de caja',
  },
  {
    pregunta: 'Armá la comanda de Julia: brushing y un shampoo',
    respuesta: 'Comanda lista: Julia Pérez — Brushing ' + ars(18000) + ' + Shampoo Hidratante ' + ars(24500) + '. Total ' + ars(42500) + '. ¿La guardo?',
    accion: 'Comanda propuesta',
  },
]

const PASOS = [
  { titulo: 'Te lo mostramos', texto: 'Una demo corta, con ejemplos de un salón real, para ver si se adapta a cómo trabajás.' },
  { titulo: 'Cargamos tu salón', texto: 'Servicios, precios, equipo, comisiones y tu logo. Lo configuramos con vos.' },
  { titulo: 'Tu equipo lo usa', texto: 'Desde el celular, la tablet de recepción o la PC. Cada uno con su usuario y permisos.' },
]

const FAQS = [
  { q: '¿Tengo que instalar algo?', a: 'No. Funciona desde el navegador y se puede agregar a la pantalla de inicio del celular como una app, con el logo de tu salón.' },
  { q: '¿Mis clientes pueden sacar turno solos?', a: 'Sí. Cada salón tiene su link de reservas para poner en Instagram, Google Maps o WhatsApp. El cliente elige servicio, profesional y horario libre, y el turno aparece en tu agenda.' },
  { q: '¿Sirve para barberías?', a: 'Sí. Agenda, comandas, caja y comisiones funcionan igual para peluquerías, barberías y salones con varios profesionales.' },
  { q: '¿Mis empleados ven la caja y las ganancias?', a: 'No, salvo que vos lo decidas. Hay perfiles de administrador y de operador: el equipo carga turnos y comandas; los números del negocio los ve el dueño.' },
  { q: '¿Mis datos están separados de otros salones?', a: 'Sí. Cada salón tiene su propio espacio, su logo y sus usuarios, y solo accede a su información.' },
  { q: '¿Qué es ' + BRAND.asistente + '?', a: 'Es la asistente con inteligencia artificial del sistema. Le hablás o le escribís y agenda turnos, arma comandas y responde consultas sobre clientes y facturación. Siempre te pide confirmación antes de guardar.' },
  { q: '¿Cuánto cuesta?', a: (m) => `El plan Esencial cuesta ${formatoPrecio(PLANES[0], m)} por mes y el Premium ${formatoPrecio(PLANES[1], m)}. Los dos tienen ${PRUEBA_DIAS} días de prueba gratis. Si tenés varias sucursales, escribinos.` },
]

function waLink(texto) {
  if (!BRAND.whatsapp) return null
  return `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(texto)}`
}

export default function Landing() {
  const navigate = useNavigate()
  const [videoIndex, setVideoIndex] = useState(() => Math.floor(Math.random() * VIDEOS.length))
  const [videoVisible, setVideoVisible] = useState(true)
  const [chatUsed, setChatUsed] = useState([])
  const [showSticky, setShowSticky] = useState(false)
  const [chatLog, setChatLog] = useState([])
  const [moneda] = useState(detectarMoneda)
  const [typing, setTyping] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [contactOpen, setContactOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [form, setForm] = useState({ nombre: '', salon: '', tipo: '', telefono: '', email: '', profesionales: '', mensaje: '', plan: '' })

  // Calculadora: tiempo administrativo recuperado
  const [profesionales, setProfesionales] = useState(4)
  const [minCaja, setMinCaja] = useState(30)
  const [hsComisiones, setHsComisiones] = useState(4)

  useEffect(() => {
    document.body.classList.add('light-theme')
    document.title = `${BRAND.nombre} — Gestión para peluquerías y barberías`
    const onScroll = () => setShowSticky(window.scrollY > 520)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.body.classList.remove('light-theme')
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const horasMes = useMemo(() => {
    const caja = (minCaja * 26) / 60
    const comisiones = hsComisiones
    const consultas = profesionales * 0.75
    return Math.round(caja + comisiones + consultas)
  }, [profesionales, minCaja, hsComisiones])

  const nextVideo = () => {
    setVideoVisible(false)
    setTimeout(() => {
      setVideoIndex((i) => (i + 1) % VIDEOS.length)
      setVideoVisible(true)
    }, 600)
  }

  const estadoSasha = typing ? 'thinking' : hablando ? 'speaking' : 'idle'

  const runChat = (i) => {
    if (typing) return
    const item = DEMO_CHAT[i]
    setChatUsed((u) => [...u, i])
    setChatLog((log) => [...log, { from: 'user', text: item.pregunta }])
    setTyping(true)
    setTimeout(() => {
      setChatLog((log) => [...log, { from: 'bot', text: item.respuesta, accion: item.accion }])
      setTyping(false)
      setHablando(true)
      setTimeout(() => setHablando(false), 2200)
    }, 900)
  }

  const elegirPlan = (id) => {
    setForm((f) => ({ ...f, plan: id }))
    setSent(false)
    setContactOpen(true)
  }

  const abrirContacto = () => {
    setSent(false)
    setContactOpen(true)
  }

  const ctaPrincipal = () => {
    const link = waLink(`Hola! Tengo un salón y quiero ver una demo de ${BRAND.nombre}.`)
    if (link) window.open(link, '_blank', 'noopener')
    else abrirContacto()
  }

  const enviar = async (e) => {
    e.preventDefault()
    setSending(true)
    setErrorEnvio('')
    // La solicitud queda guardada y aparece en el Panel Nunki; no se abre ningún mail ni WhatsApp
    const { error } = await supabase.from('contactos_landing').insert([{
      nombre: form.nombre.trim(),
      salon: form.salon.trim(),
      tipo_negocio: form.tipo || null,
      telefono: form.telefono.trim(),
      email: form.email.trim().toLowerCase(),
      profesionales: form.profesionales || null,
      plan_interes: form.plan || null,
      mensaje: form.mensaje.trim() || null,
    }])
    setSending(false)
    if (error) {
      console.warn('No se pudo guardar la solicitud:', error)
      setErrorEnvio('No pudimos enviar tu solicitud. Revisá tu conexión y probá de nuevo en un minuto.')
      return
    }
    setSent(true)
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="lp">
      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <a href="#top" className="lp-brand">
            <NunkiSymbol size={34} />
            <span>{BRAND.nombre}</span>
          </a>
          <nav className="lp-links">
            <a href="#funciones">Funciones</a>
            <a href="#asistente">{BRAND.asistente}</a>
            <a href="#planes">Planes</a>
            <a href="#como">Cómo empezar</a>
            <a href="#faq">Preguntas</a>
          </nav>
          <div className="lp-nav-cta">
            <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/login')}>Ingresar</button>
            <button className="lp-btn lp-btn-dark lp-hide-sm" onClick={ctaPrincipal}>Pedir demo</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero" id="top">
        <video
          key={videoIndex}
          className="lp-hero-video"
          style={{ opacity: videoVisible ? 1 : 0 }}
          src={`/landing/${VIDEOS[videoIndex]}`}
          autoPlay muted playsInline
          onEnded={nextVideo}
        />
        <div className="lp-hero-veil" />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow"><Scissors size={14} /> Para peluquerías y barberías</span>
            <h1>
              Turnos, caja y comisiones.<br />
              <em>Tu salón o barbería, bajo control.</em>
            </h1>
            <p className="lp-lead">
              {BRAND.nombre} reemplaza el cuaderno, el Excel y las cuentas de fin de mes.
              Tus clientes reservan online, les recordás el turno por WhatsApp con un toque y, con {BRAND.asistente}, tu asistente con IA, armás comandas con solo hablarle.
            </p>
            <div className="lp-hero-cta">
              <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={ctaPrincipal}>
                {BRAND.whatsapp ? <MessageCircle size={18} /> : null}
                Quiero ver una demo <ArrowRight size={18} />
              </button>
              <a href="#reserva-online" className="lp-btn lp-btn-glass lp-btn-lg">Ver cómo funciona</a>
            </div>
            <ul className="lp-trust">
              <li><Smartphone size={15} /> Celular, tablet o PC</li>
              <li><Palette size={15} /> Con el logo de tu salón</li>
              <li><ShieldCheck size={15} /> Permisos por empleado</li>
            </ul>
          </div>

          <div className="lp-devices" aria-hidden="true">
            <div className="lp-laptop">
              <div className="lp-laptop-bar"><i /><i /><i /></div>
              <img src="/landing/app-reservas-dark.webp" alt="" width="1280" height="800" />
            </div>
            <div className="lp-phone lp-phone-hero">
              <img src="/landing/reserva-servicios.webp" alt="" width="390" height="844" />
            </div>
          </div>
        </div>
      </section>

      {/* FRANJA DE DIFERENCIALES */}
      <section className="lp-band" aria-label="Lo que incluye">
        <div className="lp-wrap lp-band-in">
          <span><Calendar size={18} /> Reserva online 24/7</span>
          <span><MessageCircle size={18} /> Recordatorios por WhatsApp incluidos</span>
          <span><Mic size={18} /> {BRAND.asistente}, asistente con IA por voz</span>
          <span><Wallet size={18} /> Caja y comisiones automáticas</span>
        </div>
      </section>

      {/* TIPOS DE SALÓN */}
      <section className="lp-section lp-types-sec">
        <div className="lp-wrap">
          <span className="lp-kicker">Hecho para tu rubro</span>
          <h2 className="lp-h2">Un sistema, cada estilo de salón</h2>
          <div className="lp-types">
            {TIPOS.map((t) => <TipoCard key={t.titulo} {...t} />)}
          </div>
        </div>
      </section>

      {/* DOLORES */}
      <section className="lp-section lp-pains">
        <div className="lp-wrap">
          <h2 className="lp-h2">¿Te suena alguna de estas?</h2>
          <div className="lp-pain-grid">
            {DOLORES.map((d) => (
              <article key={d.dolor} className="lp-pain">
                <p className="lp-pain-q">“{d.dolor}”</p>
                <p className="lp-pain-a"><Check size={16} /> {d.solucion}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* RESERVA ONLINE */}
      <section className="lp-section lp-show" id="reserva-online">
        <div className="lp-wrap lp-show-grid">
          <div className="lp-show-copy">
            <span className="lp-kicker">Reserva online</span>
            <h2 className="lp-h2">Tus clientes sacan turno solos, a cualquier hora</h2>
            <p className="lp-sub">Un link propio para la bio de Instagram, Google Maps y WhatsApp. Eligen servicio, profesional y horario libre, y el turno aparece en tu agenda.</p>
            <ul className="lp-checks">
              <li><Check size={16} /> Solo muestra horarios realmente libres de cada profesional</li>
              <li><Check size={16} /> Sin app que descargar: funciona desde el navegador del celular</li>
              <li><Check size={16} /> Vos decidís qué servicios se reservan online y con cuánta anticipación</li>
            </ul>
          </div>
          <div className="lp-phones" aria-hidden="true">
            <div className="lp-phone"><img src="/landing/reserva-dia.webp" alt="" width="390" height="844" loading="lazy" /></div>
            <div className="lp-phone lp-phone-up"><img src="/landing/reserva-ok.webp" alt="" width="390" height="844" loading="lazy" /></div>
          </div>
        </div>
      </section>

      {/* RECORDATORIOS */}
      <section className="lp-section lp-show lp-tint">
        <div className="lp-wrap lp-show-grid lp-show-rev">
          <div className="lp-laptop lp-laptop-light" aria-hidden="true">
            <div className="lp-laptop-bar"><i /><i /><i /></div>
            <img src="/landing/app-reservas-light.webp" alt="" width="1280" height="800" loading="lazy" />
          </div>
          <div className="lp-show-copy">
            <span className="lp-kicker">Recordatorios por WhatsApp</span>
            <h2 className="lp-h2">Menos sillas vacías, sin pagar por mensaje</h2>
            <p className="lp-sub">Cada tarde ves los turnos de mañana con el mensaje listo. Un toque y se abre WhatsApp con el nombre, el servicio y la hora. Marcás quién confirmó y listo.</p>
            <ul className="lp-checks">
              <li><Check size={16} /> Incluido en el plan, sin créditos ni paquetes de mensajes</li>
              <li><Check size={16} /> Mensaje personalizable con el tono de tu salón</li>
              <li><Check size={16} /> Las reservas online quedan marcadas para que las veas al instante</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FUNCIONES */}
      <section className="lp-section" id="funciones">
        <div className="lp-wrap">
          <span className="lp-kicker">Todo lo que incluye</span>
          <h2 className="lp-h2">Un solo sistema para el salón entero</h2>
          <p className="lp-sub">Sin módulos sueltos ni planillas paralelas: lo que se cobra en la comanda impacta en la caja, las comisiones y el stock al mismo tiempo.</p>
          <div className="lp-mod-grid">
            {MODULOS.map(({ icon: Icon, titulo, texto }) => (
              <div className="lp-mod" key={titulo}>
                <div className="lp-mod-icon"><Icon size={20} /></div>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ASISTENTE */}
      <section className="lp-section lp-dark" id="asistente">
        <div className="lp-wrap lp-ai-grid">
          <div>
            <span className="lp-kicker lp-kicker-light"><Sparkles size={14} /> Asistente con IA</span>
            <h2 className="lp-h2">Conocé a {BRAND.asistente}: le hablás y lo hace</h2>
            <p className="lp-sub lp-sub-light">
              Con las manos ocupadas, le pedís por voz que agende un turno o arme la comanda.
              {' '}{BRAND.asistente} entiende nombres, servicios y horarios, y siempre te muestra lo que va a guardar antes de confirmarlo.
            </p>
            <ul className="lp-ai-list">
              <li><Mic size={16} /> Dictado por voz y respuesta hablada</li>
              <li><Calendar size={16} /> Agenda turnos con profesional y horario</li>
              <li><Receipt size={16} /> Arma comandas con servicios y productos</li>
              <li><Clock size={16} /> Responde última visita, último servicio y facturación</li>
            </ul>
          </div>
          <div className="lp-chat">
            <div className="lp-chat-head">
              <SashaFace size={36} estado={estadoSasha} animada={false} />
              <div className="lp-chat-who">
                <strong>{BRAND.asistente}</strong>
                <span><span className={`lp-dot lp-dot-${estadoSasha}`} /> {estadoSasha === 'thinking' ? 'Pensando…' : estadoSasha === 'speaking' ? 'Hablando…' : 'Lista para ayudarte'}</span>
              </div>
              <small>Demo · tocá una pregunta</small>
            </div>
            <div className="lp-chat-stage">
              <SashaFace size={104} estado={estadoSasha} />
            </div>
            <div className="lp-chat-body">
              {chatLog.length === 0 && (
                <div className="lp-msg lp-msg-bot">¡Buen día, Caro! Hoy tenés 9 turnos; el próximo es a las 10:30 con Martina. Mañana hay 4 sin recordatorio. ¿Te los preparo?</div>
              )}
              {chatLog.map((m, i) => (
                <div key={i} className={`lp-msg ${m.from === 'user' ? 'lp-msg-user' : 'lp-msg-bot'}`}>
                  {m.text}
                  {m.accion && <span className="lp-msg-tag"><Check size={12} /> {m.accion}</span>}
                </div>
              ))}
              {typing && <div className="lp-msg lp-msg-bot lp-typing"><i /><i /><i /></div>}
            </div>
            <div className="lp-chat-chips">
              {DEMO_CHAT.map((c, i) => (
                <button key={c.pregunta} disabled={typing || chatUsed.includes(i)} onClick={() => runChat(i)}>
                  <Send size={12} /> {c.pregunta}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CALCULADORA */}
      <section className="lp-section lp-tint">
        <div className="lp-wrap lp-calc">
          <div>
            <span className="lp-kicker">Hacé la cuenta</span>
            <h2 className="lp-h2">¿Cuántas horas por mes se van en administrar?</h2>
            <p className="lp-sub">Mové los valores según tu salón. Es el tiempo que hoy se va en cerrar la caja, calcular comisiones y buscar datos de clientes.</p>
          </div>
          <div className="lp-calc-card">
            <label>
              <span>Profesionales en el salón <b>{profesionales}</b></span>
              <input type="range" min="1" max="20" value={profesionales} onChange={(e) => setProfesionales(+e.target.value)} />
            </label>
            <label>
              <span>Minutos por día cerrando la caja <b>{minCaja}</b></span>
              <input type="range" min="5" max="90" step="5" value={minCaja} onChange={(e) => setMinCaja(+e.target.value)} />
            </label>
            <label>
              <span>Horas por mes calculando comisiones <b>{hsComisiones}</b></span>
              <input type="range" min="0" max="20" value={hsComisiones} onChange={(e) => setHsComisiones(+e.target.value)} />
            </label>
            <div className="lp-calc-out">
              <strong>{horasMes} h</strong>
              <span>por mes de trabajo administrativo que el sistema hace por vos</span>
            </div>
            <small className="lp-note">Estimación con 26 días hábiles y unos 45 minutos mensuales por profesional en consultas y planillas.</small>
          </div>
        </div>
      </section>

      {/* PLANES */}
      <section className="lp-section" id="planes">
        <div className="lp-wrap">
          <span className="lp-kicker">Planes</span>
          <h2 className="lp-h2">Un precio claro, sin sorpresas</h2>
          <p className="lp-sub">Probalo {PRUEBA_DIAS} días gratis, sin tarjeta. Te ayudamos a cargar tus servicios y tu equipo.</p>
          <div className="lp-plan-grid">
            {PLANES.map((p) => (
              <div key={p.id} className={`lp-plan ${p.destacado ? 'is-featured' : ''}`}>
                {p.destacado && <span className="lp-plan-badge">WhatsApp automático</span>}
                <h3>{p.nombre}</h3>
                <div className="lp-plan-price">{formatoPrecio(p, moneda)}<small>{p.periodo}</small></div>
                <p className="lp-plan-detalle">{p.detalle}</p>
                <ul>
                  {p.items.map((it) => (
                    <li key={it}><Check size={15} /> <span>{it}{p.pronto?.includes(it) && <em className="lp-pronto">Pronto</em>}</span></li>
                  ))}
                </ul>
                {extraPlan(p, moneda) && <small className="lp-note">{extraPlan(p, moneda)}</small>}
                <button className={`lp-btn ${p.destacado ? 'lp-btn-primary' : 'lp-btn-dark'}`} onClick={() => elegirPlan(p.id)}>
                  Quiero el plan {p.nombre}
                </button>
              </div>
            ))}
          </div>
          <p className="lp-note lp-plan-pie">{notaPrecios(moneda)} {DESCUENTO_ANUAL}. ¿Necesitás más consultas a {BRAND.asistente}? Sumás {PAQUETE_SASHA.consultas} por {formatoMonto(PAQUETE_SASHA.precios[moneda], moneda)} cuando quieras.</p>
        </div>
      </section>

      {/* CÓMO EMPEZAR */}
      <section className="lp-section" id="como">
        <div className="lp-wrap">
          <h2 className="lp-h2">Empezar es simple</h2>
          <ol className="lp-steps">
            {PASOS.map((p, i) => (
              <li key={p.titulo}>
                <span className="lp-step-n">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section lp-tint" id="faq">
        <div className="lp-wrap lp-faq-wrap">
          <h2 className="lp-h2">Preguntas frecuentes</h2>
          <div className="lp-faq">
            {FAQS.map((f, i) => (
              <div key={f.q} className={`lp-faq-item ${openFaq === i ? 'is-open' : ''}`}>
                <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                  {f.q} <ChevronDown size={18} />
                </button>
                {openFaq === i && <p>{typeof f.a === 'function' ? f.a(moneda) : f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="lp-final">
        <video className="lp-final-video" src="/landing/hero-8331940.mp4" autoPlay muted loop playsInline preload="none" aria-hidden="true" />
        <div className="lp-wrap">
          <h2>Ordená tu salón esta semana</h2>
          <p>Contanos cuántos profesionales son y te mostramos {BRAND.nombre} funcionando con ejemplos de tu rubro.</p>
          <div className="lp-hero-cta lp-center">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={ctaPrincipal}>
              Quiero ver una demo <ArrowRight size={18} />
            </button>
            <button className="lp-btn lp-btn-light lp-btn-lg" onClick={abrirContacto}>Dejar mis datos</button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="lp-brand lp-brand-sm"><NunkiSymbol size={24} /> {BRAND.nombre}</span>
          <span>© {new Date().getFullYear()} {BRAND.nombre}. Gestión para peluquerías y barberías.</span>
          <button className="lp-link" onClick={() => navigate('/login')}>Ingresar al sistema</button>
        </div>
      </footer>

      {/* Barra fija en celular */}
      <div className={`lp-sticky ${showSticky ? 'is-visible' : ''}`}>
        <button className="lp-btn lp-btn-primary" onClick={ctaPrincipal}>Quiero ver una demo <ArrowRight size={16} /></button>
      </div>

      {/* MODAL CONTACTO */}
      {contactOpen && (
        <div className="lp-modal-bg" onClick={() => setContactOpen(false)}>
          <div className="lp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="lp-modal-x" onClick={() => setContactOpen(false)} aria-label="Cerrar"><X size={20} /></button>
            {!sent ? (
              <form onSubmit={enviar}>
                <h3>Pedí tu demo</h3>
                <p className="lp-modal-sub">Te contactamos para mostrarte el sistema con ejemplos de tu salón.</p>
                <div className="lp-form-grid">
                  <label>Tu nombre *<input required value={form.nombre} onChange={set('nombre')} /></label>
                  <label>Nombre del salón o barbería *<input required value={form.salon} onChange={set('salon')} /></label>
                  <label>Tipo de negocio *
                    <select required value={form.tipo} onChange={set('tipo')}>
                      <option value="">Elegí una opción</option>
                      {Object.entries(TIPO_NEGOCIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label>WhatsApp *<input required type="tel" value={form.telefono} onChange={set('telefono')} placeholder="11 2345 6789" /></label>
                  <label>Email *<input required type="email" value={form.email} onChange={set('email')} placeholder="Va a ser tu usuario en Nunki" /></label>
                  <label>¿Cuántos profesionales son?
                    <select value={form.profesionales} onChange={set('profesionales')}>
                      <option value="">Elegí una opción</option>
                      <option>1 a 3</option>
                      <option>4 a 8</option>
                      <option>9 a 15</option>
                      <option>Más de 15 o varias sucursales</option>
                    </select>
                  </label>
                  <label>Plan que te interesa
                    <select value={form.plan} onChange={set('plan')}>
                      <option value="">Todavía no sé</option>
                      {PLANES.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {formatoPrecio(p, moneda)}/mes</option>)}
                    </select>
                  </label>
                  <label className="lp-span2">¿Algo que quieras resolver primero?<textarea rows="3" value={form.mensaje} onChange={set('mensaje')} placeholder="Ej: la caja, las comisiones, los turnos…" /></label>
                </div>
                {errorEnvio && <p className="lp-form-error" role="alert">{errorEnvio}</p>}
                <button className="lp-btn lp-btn-primary lp-btn-block" disabled={sending}>
                  {sending ? 'Enviando…' : 'Pedir mi demo'} <ArrowRight size={16} />
                </button>
              </form>
            ) : (
              <div className="lp-sent">
                <div className="lp-sent-icon"><Check size={28} /></div>
                <h3>¡Gracias, {form.nombre.split(' ')[0] || 'listo'}!</h3>
                <p>Recibimos tu solicitud para {form.salon || 'tu negocio'}. Te escribimos por WhatsApp a la brevedad para coordinar la demo y darte acceso a tu prueba gratis.</p>
                <button className="lp-btn lp-btn-dark" onClick={() => setContactOpen(false)}>Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
