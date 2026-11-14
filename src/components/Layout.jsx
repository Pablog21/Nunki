import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Users, Scissors, Package, LayoutDashboard, LogOut, FileText, ShoppingCart, Settings, Building, UserCheck, Clock, Wallet, Calendar, Sparkles, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Menu, X, Bell, ShieldCheck, CreditCard, GraduationCap } from 'lucide-react'
import SashaAssistant from './SashaAssistant'
import { updateAppBranding } from '../lib/pwaBranding'
import { esOperador } from '../lib/roles'
import { NunkiSymbol } from './NunkiLogo'
import { BannerPago, BloqueoPago } from './AvisoPago'
import { fetchMiEstadoPago } from '../lib/facturacion'
import { OnboardingProvider } from './onboarding/Onboarding'

export default function Layout() {
  const { signOut, user, userProfile, activeEmpresaId, changeActiveEmpresaId } = useAuth()
  const [logoUrl, setLogoUrl] = useState(null)
  const [empresaNombre, setEmpresaNombre] = useState('Nunki')
  const [bgVideo, setBgVideo] = useState('')
  const [allCompanies, setAllCompanies] = useState([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [refrescoEmpresa, setRefrescoEmpresa] = useState(0)

  // Cuando la bienvenida guarda los datos del salón, refrescar nombre y logo
  useEffect(() => {
    const refrescar = () => setRefrescoEmpresa((n) => n + 1)
    window.addEventListener('nunki:empresa-actualizada', refrescar)
    return () => window.removeEventListener('nunki:empresa-actualizada', refrescar)
  }, [])
  const navigate = useNavigate()
  const location = useLocation()
  const mainContentRef = useRef(null)

  // Cerrar menú móvil y resetear scroll al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false)
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0
    }
  }, [location.pathname])

  // Estado para Cambio de Contraseña de Usuario
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassText, setShowPassText] = useState(false)
  const [passLoading, setPassLoading] = useState(false)
  const [passError, setPassError] = useState('')
  const [passSuccess, setPassSuccess] = useState('')

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setPassError('')
    setPassSuccess('')

    if (newPassword.length < 8) {
      setPassError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPassError('Las contraseñas no coinciden.')
      return
    }

    setPassLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      if (error) throw error

      setPassSuccess('¡Tu contraseña ha sido actualizada con éxito!')
      setTimeout(() => {
        setShowPasswordModal(false)
        setNewPassword('')
        setConfirmPassword('')
        setPassSuccess('')
      }, 1600)
    } catch (err) {
      console.error('Error al actualizar contraseña:', err)
      setPassError(err.message || 'Error al actualizar la contraseña.')
    } finally {
      setPassLoading(false)
    }
  }

  useEffect(() => {
    const videoList = [
      '3996899-uhd_2160_4096_25fps.mp4',
      '5885774-hd_1080_1920_25fps.mp4',
      '6663336-uhd_2160_3744_30fps.mp4',
      '7440200-uhd_2160_4096_25fps.mp4',
      '7450929-uhd_2160_4096_25fps.mp4',
      '8102244-uhd_2160_4096_25fps.mp4',
      '8331940-uhd_2160_4096_25fps.mp4',
      '8488854-hd_1080_1920_25fps.mp4'
    ]
    const randomVideo = videoList[Math.floor(Math.random() * videoList.length)]
    setBgVideo(`/videos/${randomVideo}`)
  }, [])

  // Fetch list of companies only for super_admin
  useEffect(() => {
    if (userProfile?.rol === 'super_admin') {
      const fetchCompanies = async () => {
        const { data } = await supabase.from('empresas').select('id, nombre').order('nombre')
        setAllCompanies(data || [])
      }
      fetchCompanies()
    }
  }, [userProfile])

  // Reactive company info fetching based on activeEmpresaId
  useEffect(() => {
    const fetchEmpresaInfo = async () => {
      if (!activeEmpresaId) {
        setEmpresaNombre('Sin Salón Seleccionado')
        setLogoUrl(null)
        updateAppBranding('Nunki', null)
        return
      }
      try {
        const { data: empresaData } = await supabase
          .from('empresas')
          .select('nombre, logo_url')
          .eq('id', activeEmpresaId)
          .single()
          
        if (empresaData) {
          setEmpresaNombre(empresaData.nombre)
          setLogoUrl(empresaData.logo_url || null)
          updateAppBranding(empresaData.nombre, empresaData.logo_url || null)

          // Cargar y aplicar el tema visual de la empresa
          const savedTheme = localStorage.getItem(`theme_empresa_${activeEmpresaId}`) || 'dark'
          if (savedTheme === 'light') {
            document.body.classList.add('light-theme')
          } else {
            document.body.classList.remove('light-theme')
          }
        }
      } catch (e) {
        console.error('Error fetching empresa info:', e)
      }
    }
    fetchEmpresaInfo()
  }, [activeEmpresaId, refrescoEmpresa])

  const handleCompanyChangeInSidebar = (e) => {
    changeActiveEmpresaId(e.target.value)
    // Redirigir al dashboard para actualizar la pantalla
    navigate('/')
  }

  const rawRol = (userProfile?.rol || '').toLowerCase().trim()
  const isOperator = esOperador(userProfile)
  const esSuper = rawRol === 'super_admin'

  // Estado de la membresía del salón (el superadmin no tiene avisos ni bloqueo)
  const [estadoPago, setEstadoPago] = useState(null)
  useEffect(() => {
    if (!userProfile || esSuper) { setEstadoPago(null); return }
    let vivo = true
    const cargar = () => fetchMiEstadoPago().then((ep) => { if (vivo) setEstadoPago(ep) })
    cargar()
    const t = setInterval(cargar, 10 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [userProfile, esSuper, location.pathname === '/mi-plan'])

  if (estadoPago?.bloqueado && !esSuper) {
    return <BloqueoPago ep={estadoPago} esAdmin={!isOperator} onSalir={() => signOut()} />
  }

  return (
    <div className="app-container">
      {/* Mobile TopBar */}
      <header className="mobile-topbar">
        <button 
          type="button" 
          className="btn btn-secondary" 
          style={{ padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>

        <Link to={isOperator ? "/agenda" : "/"} className="mobile-topbar-brand">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ width: '30px', height: '30px', borderRadius: '6px', objectFit: 'cover' }} />
          ) : (
            <NunkiSymbol size={28} title="Nunki" />
          )}
          <span>{empresaNombre}</span>
        </Link>

        <div className="mobile-topbar-actions">
          <button 
            type="button"
            className="btn" 
            style={{ 
              padding: '0.45rem 0.65rem',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(180, 97, 42, 0.25) 0%, rgba(47, 127, 120, 0.25) 100%)',
              border: '1px solid rgba(180, 97, 42, 0.4)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}
            onClick={() => window.dispatchEvent(new CustomEvent('open-sasha'))}
            title="Abrir Sasha"
          >
            <Sparkles size={15} color="#E39461" />
            <span>Sasha</span>
          </button>
        </div>
      </header>

      {/* Backdrop Overlay para Sidebar Drawer en móviles */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)} 
      />

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {bgVideo && (
          <video 
            src={bgVideo} 
            autoPlay 
            loop 
            muted 
            playsInline 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
              opacity: 'var(--sidebar-video-opacity, 0.08)',
              pointerEvents: 'none'
            }}
          />
        )}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo Empresa" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <NunkiSymbol size={36} title="Nunki" />
              )}
              <span style={{ fontSize: '1.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{empresaNombre}</span>
            </div>
            <button 
              type="button" 
              className="sidebar-mobile-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú"
            >
              <X size={18} />
            </button>
          </div>

          <button 
            type="button"
            className="btn" 
            style={{ 
              margin: '0.5rem 0.8rem 1rem', 
              background: 'linear-gradient(135deg, rgba(180, 97, 42, 0.25) 0%, rgba(47, 127, 120, 0.25) 100%)',
              border: '1px solid rgba(180, 97, 42, 0.4)',
              color: 'var(--text-primary, #fff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: '600',
              padding: '8px 12px',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
            onClick={() => {
              setMobileMenuOpen(false)
              window.dispatchEvent(new CustomEvent('open-sasha'))
            }}
            title="Abrir Asistente Sasha"
          >
            <Sparkles size={16} color="#E39461" />
            Asistente Sasha
          </button>
          
          <nav style={{ flex: 1, overflowY: 'auto' }}>
            {userProfile?.rol === 'super_admin' && (
              <NavLink to="/panel" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                <ShieldCheck size={20} />
                Panel Nunki
              </NavLink>
            )}
            {!isOperator && (
              <NavLink to="/" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                <LayoutDashboard size={20} />
                Dashboard
              </NavLink>
            )}
            <NavLink to="/agenda" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Calendar size={20} />
              Agenda / Turnos
            </NavLink>
            <NavLink to="/reservas" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Bell size={20} />
              Reservas y recordatorios
            </NavLink>
            <NavLink to="/clientes" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Users size={20} />
              Clientes
            </NavLink>
            <NavLink to="/ordenes" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <FileText size={20} />
              Comandas
            </NavLink>
            <NavLink to="/stock" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Package size={20} />
              Artículos / Stock
            </NavLink>
            <NavLink to="/servicios" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Scissors size={20} />
              Servicios
            </NavLink>
            <NavLink to="/compras" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <ShoppingCart size={20} />
              {isOperator ? 'Ingreso de Stock' : 'Compras / Gastos'}
            </NavLink>
            <NavLink to="/asistencias" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Clock size={20} />
              Asistencias
            </NavLink>
            <NavLink to="/caja" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Wallet size={20} />
              {isOperator ? 'Caja Diaria' : 'Caja / Finanzas'}
            </NavLink>
            {!isOperator && (
              <NavLink to="/colaboradores" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                <UserCheck size={20} />
                Colaboradores
              </NavLink>
            )}
            {!isOperator && !esSuper && (
              <NavLink to="/mi-plan" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                <CreditCard size={20} />
                Mi plan
              </NavLink>
            )}
            {!isOperator && userProfile?.rol !== 'super_admin' && (
              <NavLink to="/configuracion" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
                <Settings size={20} />
                Configuración
              </NavLink>
            )}
            {!esSuper && (
              <button type="button" className="nav-link nav-link-boton" onClick={() => { setMobileMenuOpen(false); window.dispatchEvent(new CustomEvent('nunki:tutorial', { detail: 'pasos' })) }}>
                <GraduationCap size={20} />
                Tutorial
              </button>
            )}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <div 
                style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-color)', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  maxWidth: '160px'
                }} 
                title={userProfile?.nombre_completo || 'Usuario'}
              >
                {userProfile?.nombre_completo || 'Usuario'}
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setShowPasswordModal(true)
                  setPassError('')
                  setPassSuccess('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
                title="Cambiar mi contraseña"
                className="btn btn-secondary"
                style={{ 
                  padding: '0.35rem 0.45rem', 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  border: '1px solid var(--surface-border)'
                }}
              >
                <KeyRound size={14} style={{ color: 'var(--primary-color)' }} />
              </button>
            </div>
            <div style={{ marginBottom: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              {userProfile?.rol?.replace('_', ' ') || 'Rol'}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => {
              document.body.classList.remove('light-theme')
              signOut()
            }}>
              <LogOut size={18} />
              Salir
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content" ref={mainContentRef}>
        {!esSuper && location.pathname !== '/mi-plan' && <BannerPago ep={estadoPago} esAdmin={!isOperator} />}
        <Outlet />
      </main>

      {/* Barra de Navegación Inferior Rápida para Celulares */}
      <nav className="mobile-bottom-nav">
        <NavLink to="/agenda" className={({ isActive }) => (isActive ? "mobile-bottom-nav-item active" : "mobile-bottom-nav-item")}>
          <Calendar size={19} />
          <span>Agenda</span>
        </NavLink>
        <NavLink to="/ordenes" className={({ isActive }) => (isActive ? "mobile-bottom-nav-item active" : "mobile-bottom-nav-item")}>
          <FileText size={19} />
          <span>Comandas</span>
        </NavLink>
        <NavLink to="/clientes" className={({ isActive }) => (isActive ? "mobile-bottom-nav-item active" : "mobile-bottom-nav-item")}>
          <Users size={19} />
          <span>Clientes</span>
        </NavLink>
        <NavLink to="/caja" className={({ isActive }) => (isActive ? "mobile-bottom-nav-item active" : "mobile-bottom-nav-item")}>
          <Wallet size={19} />
          <span>Caja</span>
        </NavLink>
        <button 
          type="button" 
          className={`mobile-bottom-nav-item ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <Menu size={19} />
          <span>Menú</span>
        </button>
      </nav>

      {/* Asistente Inteligente Sasha (Audio & Texto) */}
      <SashaAssistant />

      {/* Bienvenida, recorrido guiado y primeros pasos */}
      {!esSuper && <OnboardingProvider />}

      {/* MODAL CAMBIO DE CONTRASEÑA */}
      {showPasswordModal && createPortal(
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '420px', width: '90%' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <KeyRound size={22} style={{ color: 'var(--primary-color)' }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Cambiar Mi Contraseña</h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {userProfile?.nombre_completo || user?.email}
                  </span>
                </div>
              </div>
              <button 
                className="btn" 
                style={{ padding: '0.4rem', background: 'transparent' }} 
                onClick={() => {
                  setShowPasswordModal(false)
                  setPassError('')
                  setPassSuccess('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePassword}>
              <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {passError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{passError}</span>
                  </div>
                )}

                {passSuccess && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>{passSuccess}</span>
                  </div>
                )}

                <div className="input-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '500' }}>Nueva Contraseña *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showPassText ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Mínimo 8 caracteres"
                      className="input-field"
                      style={{ width: '100%', margin: 0, paddingRight: '2.5rem' }}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassText(!showPassText)}
                      style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                      tabIndex={-1}
                    >
                      {showPassText ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="input-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '500' }}>Confirmar Nueva Contraseña *</label>
                  <input
                    type={showPassText ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Reingrese la contraseña"
                    className="input-field"
                    style={{ width: '100%', margin: 0 }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  🔒 Tu sesión se mantendrá activa. Usa esta nueva clave la próxima vez que inicies sesión.
                </span>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.25rem', borderTop: '1px solid var(--surface-border)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowPasswordModal(false)
                    setPassError('')
                    setPassSuccess('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  disabled={passLoading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={passLoading || !newPassword || !confirmPassword}
                >
                  {passLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
