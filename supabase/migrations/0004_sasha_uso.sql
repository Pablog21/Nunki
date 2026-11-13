-- Nunki · Medición y tope de uso de Sasha (IA) por salón, con paquetes extra
-- Idempotente. Requiere 0003.

-- --------------------------------------------------------------------
-- 0. Ayudas de permisos sin nulos: un usuario sin perfil en Nunki da "false", nunca null
-- --------------------------------------------------------------------
create or replace function nunki.puede_ver(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_empresa = nunki.mi_empresa(), false) or nunki.es_super()
$$;

create or replace function nunki.puede_administrar(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_empresa = nunki.mi_empresa() and nunki.es_admin(), false) or nunki.es_super()
$$;

-- --------------------------------------------------------------------
-- 1. Parámetros
-- --------------------------------------------------------------------
-- Tope mensual personalizado por salón (null = el del plan)
alter table nunki.empresas add column if not exists ia_limite_mensual integer;

-- Consultas incluidas por plan
create or replace function nunki.ia_limite_plan(p_plan text) returns integer
language sql immutable as $$
  select case lower(coalesce(p_plan, 'esencial')) when 'premium' then 1500 else 300 end
$$;

-- Paquete extra: cuántas consultas suma y cuánto se agrega a la próxima factura (ARS)
create or replace function nunki.ia_paquete() returns jsonb
language sql immutable as $$ select jsonb_build_object('consultas', 200, 'precio_ars', 4900, 'max_por_mes', 5) $$;

-- Tope diario por usuario (protege contra abuso o un error que repita consultas)
create or replace function nunki.ia_limite_diario_usuario() returns integer
language sql immutable as $$ select 150 $$;

-- Mes en curso en hora argentina, formato YYYY-MM
create or replace function nunki.ia_periodo(p_ts timestamptz default now()) returns text
language sql stable as $$ select to_char(p_ts at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') $$;

-- --------------------------------------------------------------------
-- 2. Registro de uso y paquetes
-- --------------------------------------------------------------------
create table if not exists nunki.ia_uso (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references nunki.empresas(id) on delete cascade,
  usuario_id uuid,
  periodo text not null default nunki.ia_periodo(),
  created_at timestamptz not null default now(),
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  costo_usd numeric(12, 6) not null default 0
);
create index if not exists ia_uso_empresa_periodo_idx on nunki.ia_uso (empresa_id, periodo);
create index if not exists ia_uso_usuario_dia_idx on nunki.ia_uso (usuario_id, created_at);

create table if not exists nunki.ia_extras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references nunki.empresas(id) on delete cascade,
  periodo text not null default nunki.ia_periodo(),
  consultas integer not null,
  precio_ars integer not null,
  solicitado_por uuid,
  solicitado_nombre text,
  created_at timestamptz not null default now(),
  facturado boolean not null default false,
  facturado_at timestamptz
);
create index if not exists ia_extras_empresa_periodo_idx on nunki.ia_extras (empresa_id, periodo);

alter table nunki.ia_uso enable row level security;
alter table nunki.ia_extras enable row level security;
drop policy if exists ia_uso_leer on nunki.ia_uso;
drop policy if exists ia_extras_leer on nunki.ia_extras;
drop policy if exists ia_extras_super on nunki.ia_extras;
-- Solo lectura para administradores del salón; las escrituras pasan por funciones
create policy ia_uso_leer on nunki.ia_uso for select to authenticated using (nunki.puede_administrar(empresa_id));
create policy ia_extras_leer on nunki.ia_extras for select to authenticated using (nunki.puede_administrar(empresa_id));
create policy ia_extras_super on nunki.ia_extras for update to authenticated using (nunki.es_super()) with check (nunki.es_super());
revoke all on nunki.ia_uso, nunki.ia_extras from anon;
grant select on nunki.ia_uso, nunki.ia_extras to authenticated;
grant update (facturado, facturado_at) on nunki.ia_extras to authenticated;

-- --------------------------------------------------------------------
-- 3. Estado del cupo del salón en el mes
-- --------------------------------------------------------------------
create or replace function nunki.ia_estado(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = nunki, public as $$
declare
  v_plan text; v_override integer; v_base integer; v_extras integer; v_usados integer;
  v_periodo text := nunki.ia_periodo(); v_paquetes integer; v_limite integer;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or nunki.puede_ver(p_empresa)) then
    raise exception 'Sin permiso';
  end if;
  select plan, ia_limite_mensual into v_plan, v_override from nunki.empresas where id = p_empresa;
  v_base := coalesce(v_override, nunki.ia_limite_plan(v_plan));
  select coalesce(sum(consultas), 0), count(*) into v_extras, v_paquetes from nunki.ia_extras where empresa_id = p_empresa and periodo = v_periodo;
  select count(*) into v_usados from nunki.ia_uso where empresa_id = p_empresa and periodo = v_periodo;
  v_limite := v_base + v_extras;
  return jsonb_build_object(
    'periodo', v_periodo,
    'plan', coalesce(v_plan, 'esencial'),
    'incluidas', v_base,
    'extras', v_extras,
    'limite', v_limite,
    'usados', v_usados,
    'disponibles', greatest(v_limite - v_usados, 0),
    'porcentaje', case when v_limite > 0 then round(100.0 * v_usados / v_limite) else 100 end,
    'bloqueado', v_usados >= v_limite,
    'paquetes_mes', v_paquetes,
    'paquete', nunki.ia_paquete()
  );
end $$;

-- --------------------------------------------------------------------
-- 4. El administrador suma un paquete a su próxima factura y se desbloquea al instante
-- --------------------------------------------------------------------
create or replace function nunki.ia_comprar_extra(p_empresa uuid) returns jsonb
language plpgsql volatile security definer set search_path = nunki, public as $$
declare v_paq jsonb := nunki.ia_paquete(); v_cant integer; v_nombre text;
begin
  if not nunki.puede_administrar(p_empresa) then
    raise exception 'Solo el administrador del salón puede sumar consultas';
  end if;
  -- Un pedido a la vez por salón
  perform pg_advisory_xact_lock(hashtext('ia_extra:' || p_empresa::text));
  select count(*) into v_cant from nunki.ia_extras where empresa_id = p_empresa and periodo = nunki.ia_periodo();
  if v_cant >= (v_paq->>'max_por_mes')::int then
    raise exception 'Llegaste al máximo de paquetes extra de este mes. Escribinos y lo resolvemos.';
  end if;
  select nombre_completo into v_nombre from nunki.usuarios where id = auth.uid();
  insert into nunki.ia_extras (empresa_id, consultas, precio_ars, solicitado_por, solicitado_nombre)
  values (p_empresa, (v_paq->>'consultas')::int, (v_paq->>'precio_ars')::int, auth.uid(), v_nombre);
  return nunki.ia_estado(p_empresa);
end $$;

revoke all on function nunki.ia_estado(uuid), nunki.ia_comprar_extra(uuid) from public, anon;
grant execute on function nunki.ia_estado(uuid), nunki.ia_comprar_extra(uuid) to authenticated, service_role;
grant execute on function nunki.ia_periodo(timestamptz), nunki.ia_paquete(), nunki.ia_limite_plan(text), nunki.ia_limite_diario_usuario() to authenticated, service_role;

-- --------------------------------------------------------------------
-- 5. Resumen de salones para el panel, ahora con uso de Sasha y extras a facturar
-- --------------------------------------------------------------------
drop function if exists nunki.super_resumen_salones();
create function nunki.super_resumen_salones()
returns table (
  id uuid, nombre text, slug text, plan text, estado_cuenta text, prueba_hasta date,
  alta_at timestamptz, usuarios bigint, admins text, turnos_30d bigint,
  ia_limite_mensual integer, ia_usados bigint, ia_limite bigint, ia_costo_usd numeric, extras_a_facturar bigint
)
language plpgsql stable security definer set search_path = nunki, public as $$
declare v_periodo text := nunki.ia_periodo();
begin
  if not nunki.es_super() then
    raise exception 'Solo superadministradores';
  end if;
  return query
  select e.id, e.nombre::text, e.slug, e.plan, e.estado_cuenta, e.prueba_hasta, e.alta_at,
    (select count(*) from nunki.usuarios u where u.empresa_id = e.id),
    (select string_agg(coalesce(u.nombre_completo, u.email) || ' <' || coalesce(u.email,'') || '>', ', ')
       from nunki.usuarios u where u.empresa_id = e.id and lower(coalesce(u.rol,'')) in ('administrador','admin')),
    (select count(*) from nunki.turnos t where t.empresa_id = e.id and t.fecha_hora_inicio > now() - interval '30 days'),
    e.ia_limite_mensual,
    (select count(*) from nunki.ia_uso x where x.empresa_id = e.id and x.periodo = v_periodo),
    (coalesce(e.ia_limite_mensual, nunki.ia_limite_plan(e.plan))
      + coalesce((select sum(x.consultas) from nunki.ia_extras x where x.empresa_id = e.id and x.periodo = v_periodo), 0))::bigint,
    (select coalesce(sum(x.costo_usd), 0) from nunki.ia_uso x where x.empresa_id = e.id and x.periodo = v_periodo),
    (select coalesce(sum(x.precio_ars), 0) from nunki.ia_extras x where x.empresa_id = e.id and not x.facturado)::bigint
  from nunki.empresas e
  order by e.alta_at desc nulls last, e.nombre;
end $$;
revoke all on function nunki.super_resumen_salones() from public, anon;
grant execute on function nunki.super_resumen_salones() to authenticated;

-- El superadmin marca como facturados los extras pendientes de un salón
create or replace function nunki.super_extras_facturados(p_empresa uuid) returns integer
language plpgsql volatile security definer set search_path = nunki, public as $$
declare n integer;
begin
  if not nunki.es_super() then raise exception 'Solo superadministradores'; end if;
  update nunki.ia_extras set facturado = true, facturado_at = now() where empresa_id = p_empresa and not facturado;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function nunki.super_extras_facturados(uuid) from public, anon;
grant execute on function nunki.super_extras_facturados(uuid) to authenticated;

-- Los administradores del salón no pueden cambiarse el tope
create or replace function nunki.proteger_empresa() returns trigger
language plpgsql security definer set search_path = nunki, public as $$
begin
  if auth.role() = 'service_role' or nunki.es_super() then
    return new;
  end if;
  new.plan := old.plan;
  new.estado_cuenta := old.estado_cuenta;
  new.prueba_hasta := old.prueba_hasta;
  new.notas_comerciales := old.notas_comerciales;
  new.alta_at := old.alta_at;
  new.ia_limite_mensual := old.ia_limite_mensual;
  return new;
end $$;
