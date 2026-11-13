import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [activeEmpresaId, setActiveEmpresaId] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch user profile from Database
  const fetchUserProfile = async (currentUser) => {
    if (!currentUser) {
      setUserProfile(null)
      setActiveEmpresaId(null)
      return
    }
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', currentUser.id)
        .single()

      if (error) throw error

      const rawRol = (data?.rol || '').toLowerCase().trim()
      const isAdminRole = ['administrador', 'admin', 'super_admin'].includes(rawRol)

      const normalizedProfile = {
        ...data,
        rol: isAdminRole ? (rawRol === 'admin' ? 'administrador' : rawRol) : 'operador'
      }

      setUserProfile(normalizedProfile)
      
      // Initialize activeEmpresaId
      if (normalizedProfile.rol === 'super_admin') {
        const cached = sessionStorage.getItem('super_admin_active_empresa_id')
        setActiveEmpresaId(cached || null)
      } else {
        setActiveEmpresaId(normalizedProfile.empresa_id)
      }
    } catch (err) {
      console.error('Error fetching user profile:', err)
    }
  }

  const changeActiveEmpresaId = (empresaId) => {
    setActiveEmpresaId(empresaId)
    if (userProfile?.rol === 'super_admin') {
      if (empresaId) {
        sessionStorage.setItem('super_admin_active_empresa_id', empresaId)
      } else {
        sessionStorage.removeItem('super_admin_active_empresa_id')
      }
    }
  }

  useEffect(() => {
    const initSession = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession)
      const currentUser = currentSession?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await fetchUserProfile(currentUser)
      }
      setLoading(false)
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession)
      const currentUser = currentSession?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await fetchUserProfile(currentUser)
      } else {
        setUserProfile(null)
        setActiveEmpresaId(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const res = await supabase.auth.signInWithPassword({ email, password })
    if (res.data?.user) {
      await fetchUserProfile(res.data.user)
    }
    return res
  }

  const signOut = async () => {
    sessionStorage.removeItem('super_admin_active_empresa_id')
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, userProfile, activeEmpresaId, changeActiveEmpresaId, signIn, signOut, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  return useContext(AuthContext)
}
