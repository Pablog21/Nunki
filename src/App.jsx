import lazyConRecarga from './lib/lazyConRecarga'
import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
const Landing = lazyConRecarga(() => import('./pages/Landing'))
const Layout = lazyConRecarga(() => import('./components/Layout'))
const Dashboard = lazyConRecarga(() => import('./pages/Dashboard'))
const Clientes = lazyConRecarga(() => import('./pages/Clientes'))
const OrdenesTrabajo = lazyConRecarga(() => import('./pages/OrdenesTrabajo'))
const Configuracion = lazyConRecarga(() => import('./pages/Configuracion'))
const Articulos = lazyConRecarga(() => import('./pages/Articulos'))
const Servicios = lazyConRecarga(() => import('./pages/Servicios'))
const Compras = lazyConRecarga(() => import('./pages/Compras'))
const Colaboradores = lazyConRecarga(() => import('./pages/Colaboradores'))
const Asistencias = lazyConRecarga(() => import('./pages/Asistencias'))
const Caja = lazyConRecarga(() => import('./pages/Caja'))
const Agenda = lazyConRecarga(() => import('./pages/Agenda'))
const Reservas = lazyConRecarga(() => import('./pages/Reservas'))
const Reserva = lazyConRecarga(() => import('./pages/Reserva'))
const SuperAdmin = lazyConRecarga(() => import('./pages/SuperAdmin'))
const MiPlan = lazyConRecarga(() => import('./pages/MiPlan'))
import './index.css'

// Componente para proteger las rutas (solo usuarios logueados)
const ProtectedRoute = ({ children }) => {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Cargando...</div>
  if (!session) return <Navigate to="/" />
  return children
}

function AppContent() {
  const { session, loading } = useAuth()

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Cargando...</div>

  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Cargando...</div>}>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" /> : <Login />} />
        <Route path="/r/:slug" element={<Reserva />} />
        
        {!session ? (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          /* Rutas Protegidas que comparten el Layout (Sidebar) */
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="ordenes" element={<OrdenesTrabajo />} />
            <Route path="stock" element={<Articulos />} />
            <Route path="servicios" element={<Servicios />} />
            <Route path="compras" element={<Compras />} />
            <Route path="colaboradores" element={<Colaboradores />} />
            <Route path="asistencias" element={<Asistencias />} />
            <Route path="caja" element={<Caja />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="panel" element={<SuperAdmin />} />
            <Route path="mi-plan" element={<MiPlan />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        )}
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
