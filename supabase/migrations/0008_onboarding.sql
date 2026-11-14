-- Nunki · Bienvenida y tutorial guiado por Sasha
-- Idempotente. Requiere 0007.

-- Progreso del tutorial por usuario (pasos vistos, recorrido terminado, etc.)
alter table nunki.usuarios add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- Descripción corta del salón (se muestra en la página de reservas)
alter table nunki.empresas add column if not exists descripcion text;
do $$ begin
  alter table nunki.empresas add constraint empresas_descripcion_len check (descripcion is null or char_length(descripcion) <= 280);
exception when duplicate_object then null; end $$;

-- El usuario guarda su propio progreso (mezcla con lo que ya tenía)
create or replace function nunki.mi_onboarding_guardar(p_cambios jsonb) returns jsonb
language sql volatile security definer set search_path = '' as $$
  update nunki.usuarios
     set onboarding = coalesce(onboarding, '{}'::jsonb) || coalesce(p_cambios, '{}'::jsonb)
   where id = auth.uid()
  returning onboarding
$$;

-- Primeros pasos del salón: qué ya cargó y qué falta
create or replace function nunki.mi_progreso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'servicios',     (select count(*) from nunki.servicios s where s.empresa_id = e.id),
    'colaboradores', (select count(*) from nunki.usuarios u where u.empresa_id = e.id and u.id <> auth.uid()
                        and lower(coalesce(u.rol, '')) <> 'super_admin'),
    'articulos',     (select count(*) from nunki.articulos a where a.empresa_id = e.id),
    'clientes',      (select count(*) from nunki.clientes c where c.empresa_id = e.id),
    'turnos',        (select count(*) from nunki.turnos t where t.empresa_id = e.id),
    'reserva_online', coalesce(e.reserva_online_activa, false),
    'logo',          (to_jsonb(e) ->> 'logo_url') is not null,
    'descripcion',   e.descripcion is not null and e.descripcion <> ''
  )
  from nunki.empresas e
  where e.id = nunki.mi_empresa()
$$;

revoke all on function nunki.mi_onboarding_guardar(jsonb), nunki.mi_progreso() from public, anon;
grant execute on function nunki.mi_onboarding_guardar(jsonb), nunki.mi_progreso() to authenticated;

-- Página pública de reservas: suma la descripción del salón
create or replace function nunki.reserva_salon(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id,
    'nombre', to_jsonb(e) ->> 'nombre',
    'logo_url', to_jsonb(e) ->> 'logo_url',
    'descripcion', e.descripcion,
    'whatsapp', e.whatsapp,
    'apertura', to_char(e.horario_apertura, 'HH24:MI'),
    'cierre', to_char(e.horario_cierre, 'HH24:MI'),
    'dias', e.dias_abierto,
    'anticipacion_min', e.reserva_anticipacion_min,
    'servicios', coalesce((
      select json_agg(json_build_object(
               'id', s.id,
               'nombre', to_jsonb(s) ->> 'nombre',
               'precio', (to_jsonb(s) ->> 'precio')::numeric,
               'duracion', coalesce((to_jsonb(s) ->> 'tiempo_aprox_minutos')::int, 30))
             order by to_jsonb(s) ->> 'nombre')
      from nunki.servicios s
      where s.empresa_id = e.id and s.reservable_online), '[]'::json),
    'profesionales', coalesce((
      select json_agg(json_build_object('id', u.id, 'nombre', to_jsonb(u) ->> 'nombre_completo')
             order by to_jsonb(u) ->> 'nombre_completo')
      from nunki.usuarios u
      where u.empresa_id = e.id
        and lower(coalesce(u.rol, '')) <> 'super_admin'
        and coalesce((to_jsonb(u) ->> 'activo')::boolean, true)), '[]'::json))
  from nunki.empresas e
  where lower(e.slug) = lower(p_slug) and e.reserva_online_activa
$$;
