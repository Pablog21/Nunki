// Tipos de negocio que se piden en la demo y se guardan en el salón
export const TIPO_NEGOCIO = {
  peluqueria: 'Peluquería',
  barberia: 'Barbería',
  ambos: 'Peluquería y barbería',
  estetica: 'Estética / uñas',
}

// Texto para el botón "Quiero Nunki para mi …"
export const MI_NEGOCIO = {
  peluqueria: 'mi peluquería',
  barberia: 'mi barbería',
  ambos: 'mi salón',
  estetica: 'mi centro de estética',
}

export const miNegocio = (tipo) => MI_NEGOCIO[tipo] || 'mi salón'
