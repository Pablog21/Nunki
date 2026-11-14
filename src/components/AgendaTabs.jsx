import { Link } from 'react-router-dom'
import { Calendar, Bell, Globe } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { esAdmin } from '../lib/roles'

// Pestañas de la sección Agenda: la agenda, los recordatorios y la reserva online.
export default function AgendaTabs({ actual }) {
  const { userProfile } = useAuth()
  const admin = esAdmin(userProfile)
  const tabs = [
    { id: 'agenda', label: 'Agenda', to: '/agenda', Icono: Calendar },
    { id: 'recordatorios', label: 'Recordatorios', to: '/reservas?tab=recordatorios', Icono: Bell },
    ...(admin ? [{ id: 'online', label: 'Reserva online', to: '/reservas?tab=online', Icono: Globe }] : []),
  ]
  return (
    <nav className="ag-tabs" aria-label="Secciones de la agenda">
      {tabs.map(({ id, label, to, Icono }) => (
        <Link key={id} to={to} className={`ag-tab ${actual === id ? 'on' : ''}`} aria-current={actual === id ? 'page' : undefined}>
          <Icono size={16} /> {label}
        </Link>
      ))}
    </nav>
  )
}
