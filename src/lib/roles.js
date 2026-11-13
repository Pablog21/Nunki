// Roles de Nunki. La seguridad real está en las políticas RLS de la base;
// esto solo decide qué se muestra en pantalla.
export const ROLES_ADMIN = ['administrador', 'admin', 'super_admin', 'dueña', 'duena', 'gerente']

export const normalizarRol = (rol) => (rol || '').toLowerCase().trim()
export const esAdmin = (perfil) => ROLES_ADMIN.includes(normalizarRol(perfil?.rol))
export const esOperador = (perfil) => !esAdmin(perfil)
export const esSuperAdmin = (perfil) => normalizarRol(perfil?.rol) === 'super_admin'
