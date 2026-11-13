-- Nunki · Panel de superadministrador y planes
-- Idempotente: se puede volver a correr sin romper nada.

-- --------------------------------------------------------------------
-- 1. Solicitudes de demo (embudo comercial)
-- --------------------------------------------------------------------
alter table nunki.contactos_landing
  add column if not exists estado text not null default 'nuevo',
  add column if not exists notas text,
  add column if not exists plan_interes text,
  add column if not exists profesionales text,
  add column if not exists origen text default 'landing',
  add column if not exists empresa_id uuid references nunki.empresas(id) on delete set null,
  add column if not exists actualizado_at timestamptz;

do $$ begin
  alter table nunki.contactos_landing add constraint contactos_estado_chk
    check (estado in ('nuevo','contactado','demo_agendada','ganado','perdido'));
exception when duplicate_object then null; end $$;

create index if not exists contactos_landing_estado_idx on nunki.contactos_landing (estado, created_at desc);

alter table nunki.contactos_landing enable row level security;
drop policy if exists contactos_anon_insert on nunki.contactos_landing;
drop policy if exists contactos_super on nunki.contactos_landing;
-- Desde la web solo se puede crear la solicitud, en estado "nuevo" y sin vincular a un salón
create policy contactos_anon_insert on nunki.contactos_landing for insert to anon, authenticated
  with check (estado = 'nuevo' and empresa_id is null and notas is null
              and char_length(coalesce(nombre,'')) <= 120 and char_length(coalesce(salon,'')) <= 160
              and char_length(coalesce(telefono,'')) <= 40 and char_length(coalesce(email,'')) <= 160
              and char_length(coalesce(mensaje,'')) <= 2000);
create policy contactos_super on nunki.contactos_landing for all to authenticated
  using (nunki.es_super()) with check (nunki.es_super());
grant insert on nunki.contactos_landing to anon;
grant select, insert, update, delete on nunki.contactos_landing to authenticated;

-- --------------------------------------------------------------------
-- 2. Plan y estado de la cuenta de cada salón
-- --------------------------------------------------------------------
alter table nunki.empresas
  add column if not exists plan text not null default 'esencial',
  add column if not exists estado_cuenta text not null default 'prueba',
  add column if not exists prueba_hasta date,
  add column if not exists notas_comerciales text,
  add column if not exists alta_at timestamptz default now();

do $$ begin
  alter table nunki.empresas add constraint empresas_plan_chk check (plan in ('esencial','premium'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table nunki.empresas add constraint empresas_estado_cuenta_chk check (estado_cuenta in ('prueba','activa','suspendida','baja'));
exception when duplicate_object then null; end $$;

-- Los administradores del salón editan su empresa, pero no pueden cambiarse el plan ni el estado
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
  return new;
end $$;

drop trigger if exists trg_proteger_empresa on nunki.empresas;
create trigger trg_proteger_empresa before update on nunki.empresas
  for each row execute function nunki.proteger_empresa();

-- --------------------------------------------------------------------
-- 3. Resumen de salones para el panel (solo superadmin)
-- --------------------------------------------------------------------
drop function if exists nunki.super_resumen_salones();
create function nunki.super_resumen_salones()
returns table (
  id uuid, nombre text, slug text, plan text, estado_cuenta text, prueba_hasta date,
  alta_at timestamptz, usuarios bigint, admins text, turnos_30d bigint
)
language plpgsql stable security definer set search_path = nunki, public as $$
begin
  if not nunki.es_super() then
    raise exception 'Solo superadministradores';
  end if;
  return query
  select e.id, e.nombre::text, e.slug, e.plan, e.estado_cuenta, e.prueba_hasta, e.alta_at,
    (select count(*) from nunki.usuarios u where u.empresa_id = e.id),
    (select string_agg(coalesce(u.nombre_completo, u.email) || ' <' || coalesce(u.email,'') || '>', ', ')
       from nunki.usuarios u where u.empresa_id = e.id and lower(coalesce(u.rol,'')) in ('administrador','admin')),
    (select count(*) from nunki.turnos t where t.empresa_id = e.id and t.fecha_hora_inicio > now() - interval '30 days')
  from nunki.empresas e
  order by e.alta_at desc nulls last, e.nombre;
end $$;

revoke all on function nunki.super_resumen_salones() from public, anon;
grant execute on function nunki.super_resumen_salones() to authenticated;
