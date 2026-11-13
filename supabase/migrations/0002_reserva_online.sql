-- ====================================================================
-- NUNKI · 0002 · Reserva online pública (link por salón)
-- --------------------------------------------------------------------
-- El público nunca lee tablas: solo llama a estas tres funciones, que
-- devuelven lo mínimo (sin datos de otros clientes).
-- ====================================================================

-- Datos del salón para la página pública
create or replace function nunki.reserva_salon(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id,
    'nombre', to_jsonb(e) ->> 'nombre',
    'logo_url', to_jsonb(e) ->> 'logo_url',
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

-- Horarios ocupados de un día (sin nombres de clientes)
create or replace function nunki.reserva_ocupados(p_slug text, p_dia date) returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object(
           'colaborador_id', t.colaborador_id,
           'inicio', t.fecha_hora_inicio,
           'fin', t.fecha_hora_fin)), '[]'::json)
  from nunki.turnos t
  join nunki.empresas e on e.id = t.empresa_id
  where lower(e.slug) = lower(p_slug) and e.reserva_online_activa
    and coalesce(t.estado, '') <> 'Cancelado'
    and (t.fecha_hora_inicio at time zone 'America/Argentina/Buenos_Aires')::date = p_dia
$$;

-- Crear la reserva
create or replace function nunki.reserva_crear(
  p_slug text,
  p_servicio uuid,
  p_colaborador uuid,
  p_inicio timestamptz,
  p_nombre text,
  p_telefono text,
  p_notas text default null
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  v_emp nunki.empresas%rowtype;
  v_dur int;
  v_fin timestamptz;
  v_local timestamp;
  v_colab uuid;
  v_turno uuid;
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  select * into v_emp from nunki.empresas
   where lower(slug) = lower(p_slug) and reserva_online_activa;
  if not found then
    raise exception 'El salón no tiene la reserva online activa';
  end if;

  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'Ingresá tu nombre';
  end if;
  if length(v_tel) < 8 or length(v_tel) > 15 then
    raise exception 'Ingresá un WhatsApp válido';
  end if;

  select coalesce((to_jsonb(s) ->> 'tiempo_aprox_minutos')::int, 30) into v_dur
    from nunki.servicios s
   where s.id = p_servicio and s.empresa_id = v_emp.id and s.reservable_online;
  if v_dur is null then
    raise exception 'Servicio no disponible';
  end if;

  v_fin := p_inicio + make_interval(mins => v_dur);
  v_local := p_inicio at time zone 'America/Argentina/Buenos_Aires';

  if p_inicio < now() + make_interval(mins => v_emp.reserva_anticipacion_min) then
    raise exception 'Ese horario ya no se puede reservar';
  end if;
  if p_inicio > now() + interval '60 days' then
    raise exception 'Solo se puede reservar hasta 60 días adelante';
  end if;
  if not (extract(isodow from v_local)::int = any (v_emp.dias_abierto)) then
    raise exception 'El salón no abre ese día';
  end if;
  if v_local::time < v_emp.horario_apertura
     or (v_fin at time zone 'America/Argentina/Buenos_Aires')::time > v_emp.horario_cierre then
    raise exception 'Fuera del horario del salón';
  end if;

  -- Límite anti-abuso: hasta 3 reservas online por teléfono por día
  if (select count(*) from nunki.turnos
       where empresa_id = v_emp.id and origen = 'online'
         and cliente_telefono = v_tel and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Ya hiciste varias reservas hoy. Escribile al salón por WhatsApp';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_emp.id::text));

  for v_colab in
    select u.id from nunki.usuarios u
     where u.empresa_id = v_emp.id
       and (p_colaborador is null or u.id = p_colaborador)
       and lower(coalesce(u.rol, '')) <> 'super_admin'
       and coalesce((to_jsonb(u) ->> 'activo')::boolean, true)
     order by to_jsonb(u) ->> 'nombre_completo'
  loop
    if not exists (
      select 1 from nunki.turnos t
       where t.colaborador_id = v_colab
         and coalesce(t.estado, '') <> 'Cancelado'
         and tstzrange(t.fecha_hora_inicio, t.fecha_hora_fin) && tstzrange(p_inicio, v_fin)
    ) then
      insert into nunki.turnos (empresa_id, colaborador_id, servicio_id, cliente_nombre_rapido,
                                cliente_telefono, fecha_hora_inicio, fecha_hora_fin, notas, estado, origen)
      values (v_emp.id, v_colab, p_servicio, v_nombre, v_tel, p_inicio, v_fin,
              nullif(left(btrim(coalesce(p_notas, '')), 300), ''), 'Pendiente', 'online')
      returning id into v_turno;

      return json_build_object(
        'turno_id', v_turno,
        'inicio', p_inicio,
        'fin', v_fin,
        'profesional', (select to_jsonb(u) ->> 'nombre_completo' from nunki.usuarios u where u.id = v_colab),
        'whatsapp_salon', v_emp.whatsapp);
    end if;
  end loop;

  raise exception 'Ese horario se acaba de ocupar. Elegí otro';
end $$;

revoke all on function nunki.reserva_salon(text), nunki.reserva_ocupados(text, date),
  nunki.reserva_crear(text, uuid, uuid, timestamptz, text, text, text) from public;
grant execute on function nunki.reserva_salon(text), nunki.reserva_ocupados(text, date),
  nunki.reserva_crear(text, uuid, uuid, timestamptz, text, text, text) to anon, authenticated;
