import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Scissors } from 'lucide-react'
import { NunkiWordmark } from '../components/NunkiLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showCompanySelect, setShowCompanySelect] = useState(false)
  const [companies, setCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  
  const { signIn, userProfile, changeActiveEmpresaId } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const { data, error: signInError } = await signIn(email, password)
      if (signInError) throw signInError

      // After successful sign in, check if user is super_admin
      const { data: profile, error: profileError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError) throw profileError

      if (profile.rol === 'super_admin') {
        // Fetch all companies
        const { data: companiesList, error: companiesError } = await supabase
          .from('empresas')
          .select('id, nombre')
          .order('nombre')
        
        if (companiesError) throw companiesError
        setCompanies(companiesList || [])
        setShowCompanySelect(true)
      } else {
        changeActiveEmpresaId(profile.empresa_id)
        navigate('/')
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleCompanySelectSubmit = (e) => {
    e.preventDefault()
    if (!selectedCompanyId) return alert('Por favor selecciona una empresa.')
    changeActiveEmpresaId(selectedCompanyId)
    navigate('/')
  }

  return (
    <div className="auth-container animate-fade-in">
      <div className="glass-card auth-card">
        <div className="auth-header">
          <div className="auth-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <NunkiWordmark size={32} />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Gestión para peluquerías y barberías</p>
        </div>
        
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            {error}
          </div>
        )}

        {!showCompanySelect ? (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
              />
            </div>
            
            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCompanySelectSubmit}>
            <div style={{ background: 'rgba(180, 97, 42, 0.1)', border: '1px solid rgba(180, 97, 42, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              👋 Hola, <strong>{userProfile?.nombre_completo || 'Super Admin'}</strong>. Selecciona a qué salón deseas ingresar.
            </div>

            <div className="input-group" style={{ marginBottom: '2rem' }}>
              <label htmlFor="companySelect">Empresa / Salón Activo</label>
              <select
                id="companySelect"
                required
                className="input-field"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
              >
                <option value="">Selecciona un salón...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%' }}
            >
              Ingresar al Salón
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
