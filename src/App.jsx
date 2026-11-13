import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
const Landing = lazy(() => import('./pages/Landing'))
const Layout = lazy(() => import('./components/Layout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clientes = lazy(() => import('./pages/Clientes'))
const OrdenesTrabajo = lazy(() => import('./pages/OrdenesTrabajo'))
const Configuracion = lazy(() => import('./pages/Configuracion'))
const Articulos = lazy(() => import('./pages/Articulos'))
const Servicios = lazy(() => import('./pages/Servicios'))
const Compras = lazy(() => import('./pages/Compras'))
const Colaboradores = lazy(() => import('./pages/Colaboradores'))
const Asistencias = lazy(() => import('./pages/Asistencias'))
const Caja = lazy(() => import('./pages/Caja'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Reservas = lazy(() => import('./pages/Reservas'))
const Reserva = lazy(() => import('./pages/Reserva'))
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
