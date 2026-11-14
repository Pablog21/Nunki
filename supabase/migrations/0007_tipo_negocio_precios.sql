-- Nunki · Tipo de negocio (peluquería / barbería) y precios de cobro configurables
-- Idempotente. Requiere 0005.

-- --------------------------------------------------------------------
-- 1. Tipo de negocio: se pide en el formulario de demo y pasa al salón al darlo de alta
-- --------------------------------------------------------------------
alter table nunki.contactos_landing add column if not exists tipo_negocio text;
alter table nunki.empresas add column if not exists tipo_negocio text;

do $$ begin
  alter table nunki.contactos_landing add constraint contactos_tipo_chk
    check (tipo_negocio is null or tipo_negocio in ('peluqueria','barberia','ambos','estetica'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table nunki.empresas add constraint empresas_tipo_chk
    check (tipo_negocio is null or tipo_negocio in ('peluqueria','barberia','ambos','estetica'));
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------
-- 2. Precios que se cobran (los de la web son solo de exhibición)
-- --------------------------------------------------------------------
create table if not exists nunki.precios_planes (
  plan text not null,
  moneda text not null,
  precio numeric(12, 2) not null,
  actualizado_at timestamptz not null default now(),
  primary key (plan, moneda)
);
alter table nunki.precios_planes enable row level security;
revoke all on nunki.precios_planes from anon, authenticated;
grant all on nunki.precios_planes to service_role;

insert into nunki.precios_planes (plan, moneda, precio) values
  ('esencial', 'ARS', 25900), ('premium', 'ARS', 78900),
  ('esencial', 'USD', 17), ('premium', 'USD', 50)
on conflict (plan, moneda) do nothing;

create or replace function nunki.precio_plan(p_plan text, p_moneda text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select precio from nunki.precios_planes
      where plan = lower(coalesce(p_plan, 'esencial')) and moneda = case when p_moneda = 'USD' then 'USD' else 'ARS' end),
    case
      when lower(coalesce(p_plan, '')) = 'premium' then case when p_moneda = 'USD' then 50 else 78900 end
      else case when p_moneda = 'USD' then 17 else 25900 end
    end)
$$;
revoke all on function nunki.precio_plan(text, text) from public, anon;
grant execute on function nunki.precio_plan(text, text) to authenticated, service_role;

-- --------------------------------------------------------------------
-- 3. Estado de pago con tipo de negocio y precios de ambos planes
-- --------------------------------------------------------------------
create or replace function nunki.estado_pago_calc(e nunki.empresas) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_venc date := nunki.vencimiento(e.pagado_hasta, e.prueba_hasta, e.alta_at);
  v_hoy date := nunki.hoy_ar();
  v_en_prueba boolean := e.pagado_hasta is null and e.prueba_hasta is not null;
  v_gracia integer := case when v_en_prueba then nunki.dias_gracia_prueba() else nunki.dias_gracia() end;
  v_bloq boolean := nunki.empresa_bloqueada(e.estado_cuenta, e.pagado_hasta, e.prueba_hasta, e.alta_at);
  v_debito boolean := coalesce(e.mp_preapproval_estado, '') = 'authorized';
  v_estado text;
begin
  v_estado := case
    when e.estado_cuenta = 'interna' then 'interna'
    when e.estado_cuenta in ('suspendida', 'baja') then 'suspendida'
    when v_bloq then 'bloqueado'
    when v_hoy > v_venc then 'vencido'
    when v_en_prueba and v_venc - v_hoy <= 5 then 'prueba_por_vencer'
    when v_en_prueba then 'prueba'
    when not v_debito and v_venc - v_hoy <= 5 then 'por_vencer'
    else 'al_dia'
  end;
  return jsonb_build_object(
    'estado', v_estado, 'bloqueado', v_bloq, 'en_prueba', v_en_prueba, 'vencimiento', v_venc,
    'dias_para_vencer', v_venc - v_hoy, 'dias_vencido', greatest(v_hoy - v_venc, 0),
    'bloqueo_el', v_venc + v_gracia, 'dias_para_bloqueo', greatest(v_venc + v_gracia - v_hoy, 0),
    'debito_automatico', v_debito, 'mp_estado', e.mp_preapproval_estado, 'plan', e.plan, 'moneda', e.moneda,
    'precio', coalesce(e.precio_mensual, nunki.precio_plan(e.plan, e.moneda)),
    'precios', jsonb_build_object(
      'esencial', coalesce(e.precio_mensual, nunki.precio_plan('esencial', e.moneda)),
      'premium', coalesce(e.precio_mensual, nunki.precio_plan('premium', e.moneda))),
    'tipo_negocio', e.tipo_negocio,
    'pagado_hasta', e.pagado_hasta, 'prueba_hasta', e.prueba_hasta
  );
end $$;
revoke all on function nunki.estado_pago_calc(nunki.empresas) from public, anon;

-- El administrador del salón no puede cambiarse el tipo ni el plan por su cuenta (el plan lo fija el pago)
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
  return new;
end $$;
revoke execute on function nunki.proteger_empresa() from public, anon, authenticated;
