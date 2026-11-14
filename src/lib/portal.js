// Estilos prediseñados para la página de reservas de cada salón.
// fondo: CSS de la portada · acento: color de botones · oscuro: si la portada es oscura (texto claro)
export const ESTILOS_PORTAL = [
  { id: 'bosque', nombre: 'Bosque', fondo: 'linear-gradient(135deg, #0F2A24 0%, #21503F 60%, #2F6B55 100%)', acento: '#B4612A', oscuro: true },
  { id: 'cobre', nombre: 'Cobre', fondo: 'linear-gradient(135deg, #5C2A0C 0%, #A3561F 55%, #E39461 100%)', acento: '#7A3A12', oscuro: true },
  { id: 'arena', nombre: 'Arena', fondo: 'linear-gradient(135deg, #F3EFE7 0%, #E6D5BF 60%, #D8BFA0 100%)', acento: '#A3561F', oscuro: false },
  { id: 'noche', nombre: 'Noche', fondo: 'radial-gradient(circle at 80% 20%, #3B2F63 0%, #15121F 60%, #0B0A10 100%)', acento: '#7C5CC4', oscuro: true },
  { id: 'rosa', nombre: 'Rosa', fondo: 'linear-gradient(135deg, #FBE7EC 0%, #F2B8C6 60%, #E38FA6 100%)', acento: '#A63A5C', oscuro: false },
  { id: 'carbon', nombre: 'Carbón', fondo: 'linear-gradient(135deg, #111111 0%, #2B2B2B 100%)', acento: '#C8A35A', oscuro: true },
  { id: 'foto-peluqueria', nombre: 'Peluquería', imagen: '/landing/tipo-8488854.jpg', acento: '#B4612A', oscuro: true },
  { id: 'foto-barberia', nombre: 'Barbería', imagen: '/landing/tipo-barberia.jpg', acento: '#B4612A', oscuro: true },
  { id: 'foto-color', nombre: 'Color', imagen: '/landing/tipo-3996899.jpg', acento: '#A63A5C', oscuro: true },
  { id: 'foto-equipo', nombre: 'Salón', imagen: '/landing/tipo-5885774.jpg', acento: '#B4612A', oscuro: true },
]

export const estiloPorId = (id) => ESTILOS_PORTAL.find((e) => e.id === id) || ESTILOS_PORTAL[0]

// Fondo de la portada: banner propio > foto prediseñada > degradé
export function fondoPortada({ estilo, bannerUrl }) {
  const e = estiloPorId(estilo)
  const capa = 'linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.45) 100%)'
  if (bannerUrl) return { backgroundImage: `${capa}, url("${bannerUrl}")`, oscuro: true, acento: e.acento }
  if (e.imagen) return { backgroundImage: `${capa}, url("${e.imagen}")`, oscuro: true, acento: e.acento }
  return { backgroundImage: e.fondo, oscuro: e.oscuro, acento: e.acento }
}
