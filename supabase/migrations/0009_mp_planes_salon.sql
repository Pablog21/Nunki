-- Nunki · Plan de suscripción de Mercado Pago propio de cada salón (pago sin pedir email)
-- Idempotente. Requiere 0008.

alter table nunki.empresas
  add column if not exists mp_plan_id text,
  add column if not exists mp_plan_url text,
  add column if not exists mp_plan_monto numeric(12, 2),
  add column if not exists mp_plan_tipo text;

create index if not exists empresas_mp_plan_idx on nunki.empresas (mp_plan_id) where mp_plan_id is not null;
create index if not exists empresas_mp_preapproval_idx on nunki.empresas (mp_preapproval_id) where mp_preapproval_id is not null;

-- Código corto del salón para rastrear pagos (NK-XXXXXXXX), visible en Mi plan y en el panel
create or replace function nunki.codigo_salon(p_id uuid) returns text
language sql immutable set search_path = '' as $$ select 'NK-' || upper(left(replace(p_id::text, '-', ''), 8)) $$;

-- El estado de pago incluye el código del salón
create or replace function nunki.estado_pago(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e nunki.empresas;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or nunki.es_super()
          or exists (select 1 from nunki.usuarios u where u.id = auth.uid() and u.empresa_id = p_empresa)) then
    raise exception 'Sin permiso';
  end if;
  select * into e from nunki.empresas where id = p_empresa;
  if not found then return null; end if;
  return nunki.estado_pago_calc(e) || jsonb_build_object('empresa', e.nombre, 'codigo', nunki.codigo_salon(e.id));
end $$;

-- Los datos de Mercado Pago tampoco los puede tocar el administrador del salón
create or replace function nunki.proteger_empresa() returns trigger
language plpgsql security definer set search_path = nunki, public as $$
begin
  if auth.role() = 'service_role' or nunki.es_super() then
    return new;
  end if;
  new.plan := old.plan;
  new.estado_cuenta := old.estado_cuenta;
  new.prueba_hasta := old.prueba_hasta;
  new.moneda := old.moneda;
  new.notas_comerciales := old.notas_comerciales;
  new.alta_at := old.alta_at;
  new.ia_limite_mensual := old.ia_limite_mensual;
  new.pagado_hasta := old.pagado_hasta;
  new.precio_mensual := old.precio_mensual;
  new.mp_preapproval_id := old.mp_preapproval_id;
  new.mp_preapproval_estado := old.mp_preapproval_estado;
  new.mp_payer_email := old.mp_payer_email;
  new.mp_plan_id := old.mp_plan_id;
  new.mp_plan_url := old.mp_plan_url;
  new.mp_plan_monto := old.mp_plan_monto;
  new.mp_plan_tipo := old.mp_plan_tipo;
  return new;
end $$;
revoke execute on function nunki.proteger_empresa() from public, anon, authenticated;
