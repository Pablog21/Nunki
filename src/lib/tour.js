// Contenido del tutorial guiado por Sasha.
// Cada paso puede llevar a una pantalla (ruta) y resaltar un elemento real de la app (objetivo).
//   objetivo.nav   → link del menú lateral (en celular, la barra inferior si existe)
//   objetivo.boton → botón visible que contiene ese texto
//   objetivo.css   → selector CSS
//   accion: 'clic' → el botón "Mostrame" toca el elemento por el usuario (por ejemplo, abrir un formulario)
//   soloAdmin      → se saltea para empleados

export const TOUR_GENERAL = [
  {
    id: 'inicio', ruta: '/', objetivo: { nav: '/' }, soloAdmin: true,
    titulo: 'El resumen del día',
    texto: 'Acá ves de un vistazo cómo viene el salón: lo facturado, los turnos de hoy y las comisiones de cada profesional.',
  },
  {
    id: 'agenda', ruta: '/agenda', objetivo: { nav: '/agenda' },
    titulo: 'La agenda',
    texto: 'Todos los turnos del día y de la semana, por profesional. Podés verla por día, semana, mes o en lista.',
  },
  {
    id: 'agenda-nuevo', ruta: '/agenda', objetivo: { boton: 'Nuevo Turno' },
    titulo: 'Agendar un turno',
    texto: 'Con este botón cargás un turno en segundos: elegís cliente, servicio, profesional y horario. También podés tocar un hueco libre de la agenda.',
  },
  {
    id: 'reservas', ruta: '/reservas', objetivo: { nav: '/reservas' },
    titulo: 'Reservas y recordatorios',
    texto: 'Tus clientes pueden reservar solos desde tu página. Y la noche anterior, mandás los recordatorios por WhatsApp con un toque para que nadie falte.',
  },
  {
    id: 'clientes', ruta: '/clientes', objetivo: { nav: '/clientes' },
    titulo: 'Tus clientes',
    texto: 'La ficha de cada cliente con su historial, fórmulas de color, notas y visitas. Ideal para atender como si lo conocieras de siempre.',
  },
  {
    id: 'comandas', ruta: '/ordenes', objetivo: { nav: '/ordenes' },
    titulo: 'Comandas',
    texto: 'Cuando termina un servicio, se carga la comanda: qué se hizo, qué productos se usaron y cómo pagó. De acá salen la caja y las comisiones.',
  },
  {
    id: 'stock', ruta: '/stock', objetivo: { nav: '/stock' }, soloAdmin: true,
    titulo: 'Artículos y stock',
    texto: 'Los productos que vendés y los insumos que usás. El stock se descuenta solo con cada comanda.',
  },
  {
    id: 'servicios', ruta: '/servicios', objetivo: { nav: '/servicios' },
    titulo: 'Servicios',
    texto: 'Tu lista de servicios con precio y duración. La duración es la que usa la agenda para calcular los horarios libres.',
  },
  {
    id: 'caja', ruta: '/caja', objetivo: { nav: '/caja' },
    titulo: 'Caja',
    texto: 'El dinero del día por medio de pago. Al cerrar, queda el cierre de caja controlado para el dueño.',
  },
  {
    id: 'colaboradores', ruta: '/colaboradores', objetivo: { nav: '/colaboradores' }, soloAdmin: true,
    titulo: 'Tu equipo',
    texto: 'Cargá a tus profesionales con sus comisiones. Cada uno entra con su propio usuario y ve solo lo suyo.',
  },
  {
    id: 'mi-plan', ruta: '/mi-plan', objetivo: { nav: '/mi-plan' }, soloAdmin: true,
    titulo: 'Tu plan',
    texto: 'Acá ves tu plan, cuándo vence y tus pagos. Cuando quieras quedarte con Nunki, lo activás con Mercado Pago desde acá.',
  },
  {
    id: 'sasha', ruta: null, objetivo: { css: '.sasha-floating-trigger' },
    titulo: 'Y acá estoy yo',
    texto: 'Preguntame lo que necesites, por escrito o con la voz: "¿cuántos turnos tengo mañana?", "¿cuánto facturamos esta semana?". También me podés pedir que te muestre de nuevo este recorrido.',
  },
]

// Guías de primeros pasos: llevan de la mano sobre la pantalla real
export const GUIAS = [
  {
    id: 'servicios', titulo: 'Cargá tus servicios', progreso: 'servicios', soloAdmin: true,
    resumen: 'Corte, color, barba… con precio y duración.',
    pasos: [
      { ruta: '/servicios', objetivo: { boton: 'Nuevo Servicio' }, accion: 'clic', titulo: 'Paso 1 · Nuevo servicio', texto: 'Tocá "Nuevo Servicio". Si querés, lo abro yo con "Mostrame".' },
      { objetivo: { css: '.modal-content' }, titulo: 'Paso 2 · Completá los datos', texto: 'Poné el nombre (por ejemplo "Corte y peinado"), el precio y cuántos minutos dura. Si se puede reservar online, dejalo marcado.' },
      { objetivo: { css: '.modal-content button[type="submit"]' }, titulo: 'Paso 3 · Guardá', texto: 'Tocá Guardar y listo. Repetí con cada servicio; después los podés editar cuando quieras.' },
    ],
  },
  {
    id: 'colaboradores', titulo: 'Sumá a tu equipo', progreso: 'colaboradores', soloAdmin: true,
    resumen: 'Cada profesional con su usuario y su comisión.',
    pasos: [
      { ruta: '/colaboradores', objetivo: { boton: 'Nuevo Colaborador' }, accion: 'clic', titulo: 'Paso 1 · Nuevo colaborador', texto: 'Tocá "Nuevo Colaborador" para sumar a alguien de tu equipo.' },
      { objetivo: { css: '.modal-content' }, titulo: 'Paso 2 · Sus datos', texto: 'Nombre, email (va a ser su usuario), una contraseña inicial y el porcentaje de comisión por servicios y productos.' },
      { objetivo: { css: '.modal-content button[type="submit"]' }, titulo: 'Paso 3 · Guardá', texto: 'Al guardar ya puede entrar a Nunki desde su celular con su email y contraseña.' },
    ],
  },
  {
    id: 'articulos', titulo: 'Cargá tus productos', progreso: 'articulos', soloAdmin: true,
    resumen: 'Lo que vendés y los insumos que usás.',
    pasos: [
      { ruta: '/stock', objetivo: { boton: 'Nuevo Producto' }, accion: 'clic', titulo: 'Paso 1 · Nuevo producto', texto: 'Tocá "Nuevo Producto".' },
      { objetivo: { css: '.modal-content' }, titulo: 'Paso 2 · Datos y stock', texto: 'Nombre, costo, precio de venta y cuántas unidades tenés hoy. El stock se va a descontar solo con las comandas.' },
      { objetivo: { css: '.modal-content button[type="submit"]' }, titulo: 'Paso 3 · Guardá', texto: 'Guardá y seguí con el próximo. Si tenés muchos, empezá por los que más vendés.' },
    ],
  },
  {
    id: 'clientes', titulo: 'Cargá un cliente', progreso: 'clientes',
    resumen: 'Su ficha con contacto e historial.',
    pasos: [
      { ruta: '/clientes', objetivo: { boton: 'Nuevo Cliente' }, accion: 'clic', titulo: 'Paso 1 · Nuevo cliente', texto: 'Tocá "Nuevo Cliente".' },
      { objetivo: { css: '.modal-content' }, titulo: 'Paso 2 · Sus datos', texto: 'Nombre y WhatsApp alcanzan para empezar. El WhatsApp es el que se usa para los recordatorios.' },
      { objetivo: { css: '.modal-content button[type="submit"]' }, titulo: 'Paso 3 · Guardá', texto: 'Listo. Con el tiempo, su ficha va a sumar cada visita y lo que se hizo.' },
    ],
  },
  {
    id: 'turno', titulo: 'Agendá tu primer turno', progreso: 'turnos',
    resumen: 'Probá la agenda con un turno de prueba.',
    pasos: [
      { ruta: '/agenda', objetivo: { boton: 'Nuevo Turno' }, accion: 'clic', titulo: 'Paso 1 · Nuevo turno', texto: 'Tocá "Nuevo Turno".' },
      { objetivo: { css: '.modal-content' }, titulo: 'Paso 2 · Elegí', texto: 'Cliente, servicio, profesional, día y hora. La duración sale del servicio.' },
      { objetivo: { css: '.modal-content button[type="submit"]' }, titulo: 'Paso 3 · Confirmá', texto: 'Guardá y lo vas a ver en la agenda. Después lo podés mover o cancelar.' },
    ],
  },
  {
    id: 'reserva-online', titulo: 'Activá tu reserva online', progreso: 'reserva_online', soloAdmin: true,
    resumen: 'Tu link para que te reserven 24/7.',
    pasos: [
      { ruta: '/reservas', objetivo: { boton: 'Reserva online' }, accion: 'clic', titulo: 'Paso 1 · Reserva online', texto: 'Abrí la pestaña "Reserva online".' },
      { objetivo: { css: '.main-content form, .main-content .glass-panel' }, titulo: 'Paso 2 · Configurala', texto: 'Elegí la dirección de tu página, tus horarios y qué servicios se pueden reservar. Activala y guardá.' },
      { objetivo: null, titulo: 'Paso 3 · Compartila', texto: 'Poné el link en tu Instagram y en tu WhatsApp. Cada reserva cae directo en tu agenda.' },
    ],
  },
]

// Primer paso de la lista: los datos del salón (se completan en la bienvenida)
export const PASO_SALON = { id: 'salon', titulo: 'Completá los datos de tu salón', resumen: 'Logo, descripción y WhatsApp.', soloAdmin: true }
