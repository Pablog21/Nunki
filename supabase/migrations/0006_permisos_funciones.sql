-- Nunki · Permisos de funciones una vez expuesto el esquema por la API
-- Ayudas de permisos: solo usuarios logueados (las políticas las usan)
revoke execute on function nunki.mi_empresa(), nunki.mi_rol(), nunki.es_super(), nunki.es_admin(),
  nunki.puede_ver(uuid), nunki.puede_administrar(uuid) from public, anon;
grant execute on function nunki.mi_empresa(), nunki.mi_rol(), nunki.es_super(), nunki.es_admin(),
  nunki.puede_ver(uuid), nunki.puede_administrar(uuid) to authenticated, service_role;

-- Funciones de triggers: no se llaman por la API
revoke execute on function nunki.actualizar_stock_articulo(), nunki.orden_completada_turno(), nunki.proteger_empresa(),
  nunki.proteger_usuario(), nunki.bloquear_reserva_salon_bloqueado() from public, anon, authenticated;

-- Funciones de superadmin y del salón: nunca anónimas
revoke execute on function nunki.super_extras_facturados(uuid), nunki.super_registrar_pago(uuid, numeric, text, integer, text),
  nunki.super_resumen_salones(), nunki.ia_estado(uuid), nunki.ia_comprar_extra(uuid), nunki.estado_pago(uuid),
  nunki.mi_estado_pago(), nunki.mis_pagos() from public, anon;
