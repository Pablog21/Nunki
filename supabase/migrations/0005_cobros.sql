-- Nunki · Cobro de membresías: vencimientos, período de gracia y bloqueo de acceso
-- Reglas:
--   * Cada salón tiene "pagado_hasta". Mientras no venza, está al día.
--   * Vencido: entra en período de gracia (30 días si ya era cliente, 7 si venía de la prueba gratis).
--     Puede seguir usando el sistema, con avisos para pagar.
--   * Pasada la gracia, o si la cuenta está suspendida/de baja, se bloquea el acceso a los datos del salón
--     (lo aplica la base de datos, no solo la pantalla). Las cuentas "interna" nunca se bloquean.
-- Idempotente. Requiere 0004.

-- --------------------------------------------------------------------
-- 1. Columnas y tabla de pagos
-- --------------------------------------------------------------------
alter table nunki.empresas
  add column if not exists pagado_hasta date,
  add column if not exists precio_mensual numeric(12, 2),
  add column if not exists mp_preapproval_id text,
  add column if not exists mp_preapproval_estado text,
  add column if not exists mp_payer_email text;

create table if not exists nunki.pagos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references nunki.empresas(id) on delete cascade,
  created_at timestamptz not null default now(),
  monto numeric(12, 2) not null,
  moneda text not null default 'ARS',
  meses integer not null default 1,
  estado text not null default 'aprobado',
  origen text not null default 'manual',
  referencia text,
  nota text,
  pagado_hasta_nuevo date,
  registrado_por uuid,
  detalle jsonb
);
do $$ begin
  alter table nunki.pagos add constraint pagos_estado_chk check (estado in ('aprobado','rechazado','pendiente','reintegrado'));
exception when duplicate_object then null; end $$;
create unique index if not exists pagos_origen_ref_uidx on nunki.pagos (origen, referencia) where referencia is not null;
create index if not exists pagos_empresa_idx on nunki.pagos (empresa_id, created_at desc);

alter table nunki.pagos enable row level security;
drop policy if exists pagos_leer on nunki.pagos;
create policy pagos_leer on nunki.pagos for select to authenticated using (nunki.puede_administrar(empresa_id));
revoke all on nunki.pagos from anon;
grant select on nunki.pagos to authenticated;
grant all on nunki.pagos to service_role;

-- --------------------------------------------------------------------
-- 2. Reglas de vencimiento y precio
-- --------------------------------------------------------------------
create or replace function nunki.dias_gracia() returns integer language sql immutable set search_path = '' as $$ select 30 $$;
create or replace function nunki.dias_gracia_prueba() returns integer language sql immutable set search_path = '' as $$ select 7 $$;

create or replace function nunki.precio_plan(p_plan text, p_moneda text) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when lower(coalesce(p_plan, '')) = 'premium' then case when p_moneda = 'USD' then 50 else 78900 end
    else case when p_moneda = 'USD' then 17 else 25900 end
  end
$$;

-- Fecha hasta la que el salón tiene el servicio cubierto
create or replace function nunki.vencimiento(p_pagado_hasta date, p_prueba_hasta date, p_alta timestamptz) returns date
language sql stable set search_path = '' as $$
  select coalesce(p_pagado_hasta, p_prueba_hasta, (p_alta at time zone 'America/Argentina/Buenos_Aires')::date, current_date)
$$;

create or replace function nunki.hoy_ar() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create or replace function nunki.empresa_bloqueada(p_estado text, p_pagado_hasta date, p_prueba_hasta date, p_alta timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_estado = 'interna' then false
    when p_estado in ('suspendida', 'baja') then true
    else nunki.hoy_ar() > nunki.vencimiento(p_pagado_hasta, p_prueba_hasta, p_alta)
           + case when p_pagado_hasta is null and p_prueba_hasta is not null then nunki.dias_gracia_prueba() else nunki.dias_gracia() end
  end
$$;

-- --------------------------------------------------------------------
-- 3. Bloqueo real: un usuario de un salón bloqueado deja de "pertenecer" a su salón para las reglas de acceso
--    (todas las políticas usan mi_empresa). El superadmin no se ve afectado.
-- --------------------------------------------------------------------
create or replace function nunki.mi_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.empresa_id
  from nunki.usuarios u
  join nunki.empresas e on e.id = u.empresa_id
  where u.id = auth.uid()
    and not nunki.empresa_bloqueada(e.estado_cuenta, e.pagado_hasta, e.prueba_hasta, e.alta_at)
$$;

-- Reservas online: un salón bloqueado no toma turnos nuevos desde su página pública
create or replace function nunki.bloquear_reserva_salon_bloqueado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bloq boolean;
begin
  if coalesce(new.origen, '') = 'online' then
    select nunki.empresa_bloqueada(e.estado_cuenta, e.pagado_hasta, e.prueba_hasta, e.alta_at) into v_bloq
    from nunki.empresas e where e.id = new.empresa_id;
    if coalesce(v_bloq, false) then
      raise exception 'Este salón no está tomando reservas online en este momento.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_reserva_salon_bloqueado on nunki.turnos;
create trigger trg_reserva_salon_bloqueado before insert on nunki.turnos
  for each row execute function nunki.bloquear_reserva_salon_bloqueado();

-- --------------------------------------------------------------------
-- 4. Estado de pago (para avisos en la app, la página "Mi plan" y el panel)
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
    'estado', v_estado,
    'bloqueado', v_bloq,
    'en_prueba', v_en_prueba,
    'vencimiento', v_venc,
    'dias_para_vencer', v_venc - v_hoy,
    'dias_vencido', greatest(v_hoy - v_venc, 0),
    'bloqueo_el', v_venc + v_gracia,
    'dias_para_bloqueo', greatest(v_venc + v_gracia - v_hoy, 0),
    'debito_automatico', v_debito,
    'mp_estado', e.mp_preapproval_estado,
    'plan', e.plan,
    'moneda', e.moneda,
    'precio', coalesce(e.precio_mensual, nunki.precio_plan(e.plan, e.moneda)),
    'pagado_hasta', e.pagado_hasta,
    'prueba_hasta', e.prueba_hasta
  );
end $$;

-- Lo puede consultar un usuario del salón (aunque esté bloqueado, para ver cómo pagar) o el superadmin
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
  return nunki.estado_pago_calc(e) || jsonb_build_object('empresa', e.nombre);
end $$;

-- El salón del usuario logueado (sirve aunque el salón esté bloqueado)
create or replace function nunki.mi_estado_pago() returns jsonb
language sql stable security definer set search_path = '' as $$
  select nunki.estado_pago(u.empresa_id) from nunki.usuarios u where u.id = auth.uid()
$$;

-- Historial de pagos del propio salón, visible también si está bloqueado (para el administrador)
create or replace function nunki.mis_pagos() returns setof nunki.pagos
language sql stable security definer set search_path = '' as $$
  select p.* from nunki.pagos p
  join nunki.usuarios u on u.empresa_id = p.empresa_id
  where u.id = auth.uid() and lower(coalesce(u.rol, '')) in ('administrador', 'super_admin')
  order by p.created_at desc limit 50
$$;

-- --------------------------------------------------------------------
-- 5. Registrar un pago (Mercado Pago o manual): extiende el período cubierto
-- --------------------------------------------------------------------
create or replace function nunki.registrar_pago(
  p_empresa uuid, p_monto numeric, p_moneda text, p_meses integer, p_origen text,
  p_referencia text default null, p_nota text default null, p_estado text default 'aprobado', p_detalle jsonb default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  e nunki.empresas;
  v_venc date; v_base date; v_nuevo date; v_hoy date := nunki.hoy_ar();
begin
  if not (coalesce(auth.role(), '') = 'service_role' or nunki.es_super()) then
    raise exception 'Sin permiso';
  end if;
  -- Idempotencia: el mismo pago de Mercado Pago no se registra dos veces
  if p_referencia is not null and exists (select 1 from nunki.pagos where origen = p_origen and referencia = p_referencia) then
    return nunki.estado_pago(p_empresa) || jsonb_build_object('duplicado', true);
  end if;

  select * into e from nunki.empresas where id = p_empresa for update;
  if not found then raise exception 'Salón inexistente'; end if;

  if p_estado = 'aprobado' then
    v_venc := nunki.vencimiento(e.pagado_hasta, e.prueba_hasta, e.alta_at);
    -- Si pagó a tiempo o dentro de la gracia, se respeta su ciclo; si estaba bloqueado, arranca desde hoy.
    -- Si paga durante la prueba gratis, el primer mes empieza cuando termina la prueba.
    v_base := case when v_venc >= v_hoy - nunki.dias_gracia() then v_venc else v_hoy end;
    v_nuevo := (v_base + make_interval(months => greatest(coalesce(p_meses, 1), 1)))::date;
    update nunki.empresas
       set pagado_hasta = v_nuevo,
           estado_cuenta = case when estado_cuenta in ('prueba', 'suspendida') then 'activa' else estado_cuenta end
     where id = p_empresa;
  end if;

  insert into nunki.pagos (empresa_id, monto, moneda, meses, estado, origen, referencia, nota, pagado_hasta_nuevo, registrado_por, detalle)
  values (p_empresa, p_monto, coalesce(p_moneda, e.moneda), greatest(coalesce(p_meses, 1), 1), p_estado, p_origen,
          p_referencia, p_nota, v_nuevo, auth.uid(), p_detalle);

  return nunki.estado_pago(p_empresa);
end $$;

revoke all on function nunki.registrar_pago(uuid, numeric, text, integer, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function nunki.registrar_pago(uuid, numeric, text, integer, text, text, text, text, jsonb) to service_role;

-- El superadmin registra pagos manuales (transferencia, efectivo, pagos en dólares)
create or replace function nunki.super_registrar_pago(p_empresa uuid, p_monto numeric, p_moneda text, p_meses integer, p_nota text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not nunki.es_super() then raise exception 'Solo superadministradores'; end if;
  return nunki.registrar_pago(p_empresa, p_monto, p_moneda, p_meses, 'manual', null, p_nota);
end $$;

revoke all on function nunki.estado_pago(uuid), nunki.mi_estado_pago(), nunki.mis_pagos(), nunki.super_registrar_pago(uuid, numeric, text, integer, text) from public, anon;
grant execute on function nunki.estado_pago(uuid), nunki.mi_estado_pago(), nunki.mis_pagos(), nunki.super_registrar_pago(uuid, numeric, text, integer, text) to authenticated;
grant execute on function nunki.estado_pago(uuid) to service_role;
revoke all on function nunki.estado_pago_calc(nunki.empresas) from public, anon;

-- --------------------------------------------------------------------
-- 6. Protección: el administrador del salón no puede tocar sus datos de cobro
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 7. Resumen de salones para el panel, con estado de pago
-- --------------------------------------------------------------------
drop function if exists nunki.super_resumen_salones();
create function nunki.super_resumen_salones()
returns table (
  id uuid, nombre text, slug text, plan text, estado_cuenta text, moneda text, prueba_hasta date,
  alta_at timestamptz, usuarios bigint, admins text, turnos_30d bigint,
  ia_limite_mensual integer, ia_usados bigint, ia_limite bigint, ia_costo_usd numeric, extras_a_facturar numeric,
  pagado_hasta date, precio_mensual numeric, pago jsonb
)
language plpgsql stable security definer set search_path = nunki, public as $$
declare v_periodo text := nunki.ia_periodo();
begin
  if not nunki.es_super() then
    raise exception 'Solo superadministradores';
  end if;
  return query
  select e.id, e.nombre::text, e.slug, e.plan, e.estado_cuenta, e.moneda, e.prueba_hasta, e.alta_at,
    (select count(*) from nunki.usuarios u where u.empresa_id = e.id),
    (select string_agg(coalesce(u.nombre_completo, u.email) || ' <' || coalesce(u.email,'') || '>', ', ')
       from nunki.usuarios u where u.empresa_id = e.id and lower(coalesce(u.rol,'')) in ('administrador','admin')),
    (select count(*) from nunki.turnos t where t.empresa_id = e.id and t.fecha_hora_inicio > now() - interval '30 days'),
    e.ia_limite_mensual,
    (select count(*) from nunki.ia_uso x where x.empresa_id = e.id and x.periodo = v_periodo),
    (coalesce(e.ia_limite_mensual, nunki.ia_limite_plan(e.plan))
      + coalesce((select sum(x.consultas) from nunki.ia_extras x where x.empresa_id = e.id and x.periodo = v_periodo), 0))::bigint,
    (select coalesce(sum(x.costo_usd), 0) from nunki.ia_uso x where x.empresa_id = e.id and x.periodo = v_periodo),
    (select coalesce(sum(x.precio), 0) from nunki.ia_extras x where x.empresa_id = e.id and not x.facturado),
    e.pagado_hasta, e.precio_mensual, nunki.estado_pago_calc(e)
  from nunki.empresas e
  order by e.alta_at desc nulls last, e.nombre;
end $$;
revoke all on function nunki.super_resumen_salones() from public, anon;
grant execute on function nunki.super_resumen_salones() to authenticated;
