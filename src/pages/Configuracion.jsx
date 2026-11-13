import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Upload, Save, Palette, Building, DollarSign } from 'lucide-react'
import { updateAppBranding } from '../lib/pwaBranding'

export default function Configuracion() {
  const { userProfile, activeEmpresaId, changeActiveEmpresaId } = useAuth()
  const [empresa, setEmpresa] = useState(null)
  const [allCompanies, setAllCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [selectedTheme, setSelectedTheme] = useState('dark')

  const [formData, setFormData] = useState({
    nombre: '',
    rut_cuit: ''
  })

  const isOperator = userProfile?.rol === 'operador'

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

  useEffect(() => {
    if (activeEmpresaId && !isOperator) {
      fetchEmpresaData()
    } else if (isOperator) {
      setLoading(false)
    }
  }, [activeEmpresaId, isOperator])

  const [descontarComisionesEnCaja, setDescontarComisionesEnCaja] = useState(false)

  const fetchEmpresaData = async () => {
    try {
      setLoading(true)

      // Get Empresa details
      const { data: empresaData } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', activeEmpresaId)
        .single()

      if (empresaData) {
        setEmpresa(empresaData)
        setFormData({
          nombre: empresaData.nombre || '',
          rut_cuit: empresaData.rut_cuit || ''
        })
        if (empresaData.logo_url) {
          setLogoPreview(empresaData.logo_url)
        } else {
          setLogoPreview(null)
        }
        const savedTheme = localStorage.getItem(`theme_empresa_${empresaData.id}`) || 'dark'
        setSelectedTheme(savedTheme)

        const config = empresaData.configuracion || {}
        const isDescontar = config.descontar_comisiones_en_caja ?? (localStorage.getItem(`descontar_comisiones_en_caja_${empresaData.id}`) === 'true')
        setDescontarComisionesEnCaja(isDescontar)
      } else {
        setEmpresa(null)
        setFormData({ nombre: '', rut_cuit: '' })
        setLogoPreview(null)
      }
    } catch (error) {
      console.error('Error fetching empresa:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setLogoFile(file)
      // Crear preview local
      const objectUrl = URL.createObjectURL(file)
      setLogoPreview(objectUrl)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!empresa) return alert('Selecciona un salón primero.')

    try {
      setSaving(true)
      
      let finalLogoUrl = empresa.logo_url

      // Upload logo if changed
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop()
        const fileName = `${empresa.id}_logo_${Math.random()}.${fileExt}`
        const filePath = `${empresa.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('logos_empresa')
          .upload(filePath, logoFile)

        if (uploadError) throw uploadError

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('logos_empresa')
          .getPublicUrl(filePath)

        finalLogoUrl = publicUrlData.publicUrl
      }

      // Update empresa record
      const updatedConfig = {
        ...(empresa.configuracion || {}),
        descontar_comisiones_en_caja: descontarComisionesEnCaja
      }

      let { error: updateError } = await supabase
        .from('empresas')
        .update({
          nombre: formData.nombre,
          rut_cuit: formData.rut_cuit,
          logo_url: finalLogoUrl,
          configuracion: updatedConfig
        })
        .eq('id', empresa.id)

      if (updateError && (updateError.message?.includes('configuracion') || updateError.code === 'PGRST204')) {
        // Fallback if configuracion column not created yet
        const { error: fallbackError } = await supabase
          .from('empresas')
          .update({
            nombre: formData.nombre,
            rut_cuit: formData.rut_cuit,
            logo_url: finalLogoUrl
          })
          .eq('id', empresa.id)
        updateError = fallbackError
      }

      if (updateError) throw updateError

      // Guardar el tema y configuracion localmente
      localStorage.setItem(`theme_empresa_${empresa.id}`, selectedTheme)
      localStorage.setItem(`descontar_comisiones_en_caja_${empresa.id}`, String(descontarComisionesEnCaja))
      if (selectedTheme === 'light') {
        document.body.classList.add('light-theme')
      } else {
        document.body.classList.remove('light-theme')
      }

      alert('Configuración y tema guardados correctamente.')
      
      // Update local state
      setEmpresa(prev => ({ ...prev, nombre: formData.nombre, rut_cuit: formData.rut_cuit, logo_url: finalLogoUrl, configuracion: updatedConfig }))
      updateAppBranding(formData.nombre, finalLogoUrl)
      
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <h1 className="page-title">Configuración de Empresa</h1>
      </header>

      {isOperator ? (
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto' }}>
          <h2 style={{ color: 'var(--danger-color)', marginBottom: '1rem', fontWeight: 600 }}>Acceso Denegado</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.5' }}>
            Tu perfil de <strong>Operador</strong> no tiene los permisos requeridos para ver o modificar los datos o temas visuales de la empresa.
          </p>
        </div>
      ) : (
        <div style={{ maxWidth: '600px' }}>
          {/* Selector de Salón para Super Admin */}
          {userProfile?.rol === 'super_admin' && (
            <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--primary-color)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                <Building size={18} style={{ color: 'var(--primary-color)' }} />
                Seleccionar Salón Activo (Contexto Super Admin)
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Como Super Administrador, puedes alternar entre las empresas registradas para visualizar y gestionar sus datos en tiempo real.
              </p>
              <select 
                value={activeEmpresaId || ''} 
                onChange={(e) => changeActiveEmpresaId(e.target.value)}
                className="input-field"
                style={{ width: '100%', padding: '0.75rem' }}
              >
                <option value="">Selecciona un salón...</option>
                {allCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {activeEmpresaId ? (
            loading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Cargando datos...</p>
            ) : (
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ 
                      width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      border: '2px dashed var(--surface-border)', marginBottom: '1rem', position: 'relative'
                    }}>
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>Sin Logo</span>
                      )}
                    </div>
                    
                    <div>
                      <input 
                        type="file" 
                        id="logoUpload" 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                        onChange={handleFileChange}
                      />
                      <label htmlFor="logoUpload" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                        <Upload size={16} /> Cambiar Logo
                      </label>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Nombre de la Empresa *</label>
                    <input required type="text" className="input-field" name="nombre" value={formData.nombre} onChange={handleInputChange} />
                  </div>

                  <div className="input-group">
                    <label>RUT / CUIT</label>
                    <input type="text" className="input-field" name="rut_cuit" value={formData.rut_cuit} onChange={handleInputChange} />
                  </div>

                  {/* Selector de Tema */}
                  <div className="input-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>
                      <Palette size={18} style={{ color: 'var(--primary-color)' }} />
                      Tema Visual del Salón (Sincronizado)
                    </label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      Establece la apariencia visual por defecto para los usuarios administradores y estilistas de tu empresa.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                      <button 
                        type="button" 
                        className={`btn ${selectedTheme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, padding: '0.75rem' }}
                        onClick={() => setSelectedTheme('dark')}
                      >
                        Modo Oscuro (Elegante)
                      </button>
                      <button 
                        type="button" 
                        className={`btn ${selectedTheme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, padding: '0.75rem' }}
                        onClick={() => setSelectedTheme('light')}
                      >
                        Modo Claro (Luminoso)
                      </button>
                    </div>
                  </div>

                  {/* Parámetros de Liquidación y Caja */}
                  <div className="input-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>
                      <DollarSign size={18} style={{ color: 'var(--primary-color)' }} />
                      Control de Caja y Comisiones
                    </label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                      Configura cómo se gestiona el pago de comisiones de colaboradores en relación con la caja diaria.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', background: 'var(--input-bg)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                      <input
                        type="checkbox"
                        checked={descontarComisionesEnCaja}
                        onChange={(e) => setDescontarComisionesEnCaja(e.target.checked)}
                        style={{ marginTop: '0.2rem', width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <div>
                        <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem', display: 'block' }}>
                          Incluir pago de comisiones en el Cierre Diario de Caja
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                          Si lo desmarcas (recomendado para liquidaciones mensuales o a demanda), el cierre de caja diario no descontará comisiones y se enfocará únicamente en el efectivo real.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div style={{ marginTop: '2.5rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
                      <Save size={18} /> {saving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                  </div>
                </form>
              </div>
            )
          ) : (
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Por favor, selecciona un salón arriba para ver y modificar su configuración.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
