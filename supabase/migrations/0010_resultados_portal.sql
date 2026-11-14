-- Nunki · Informe de resultados y portal de reservas personalizable
-- Idempotente. Requiere 0009.

-- --------------------------------------------------------------------
-- 1. Portal de reservas: estilo prediseñado o banner propio
-- --------------------------------------------------------------------
alter table nunki.empresas
  add column if not exists portal_estilo text not null default 'bosque',
  add column if not exists portal_banner_url text;

create or replace function nunki.reserva_salon(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id,
    'nombre', to_jsonb(e) ->> 'nombre',
    'logo_url', to_jsonb(e) ->> 'logo_url',
    'descripcion', e.descripcion,
    'portal_estilo', e.portal_estilo,
    'portal_banner_url', e.portal_banner_url,
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

-- --------------------------------------------------------------------
-- 2. Informe de resultados del salón para un período
--    Ganancia = ventas - costo de servicios - costo de productos vendidos - comisiones - gastos operativos
-- --------------------------------------------------------------------
create or replace function nunki.reporte_resultados(p_empresa uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_dias integer;
  v_prev_desde date;
  v_prev_hasta date;
  v_res jsonb;
begin
  if not nunki.puede_administrar(p_empresa) then
    raise exception 'Solo el administrador del salón puede ver los resultados';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Período inválido';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'El período puede ser de hasta un año';
  end if;
  v_dias := p_hasta - p_desde + 1;
  v_prev_hasta := p_desde - 1;
  v_prev_desde := p_desde - v_dias;

  with
  lineas as (
    select o.id orden_id, o.cliente_id, (o.fecha_hora at time zone v_tz)::date dia,
           d.tipo_item, d.servicio_id, d.articulo_id, coalesce(d.colaborador_id, o.usuario_responsable_id) colaborador_id,
           coalesce(d.cantidad, 1) cantidad, coalesce(d.subtotal, 0) subtotal, coalesce(d.monto_comision, 0) comision,
           case
             when coalesce(d.precio_costo, 0) > 0 then coalesce(d.cantidad, 1) * d.precio_costo
             when d.tipo_item = 'servicio' then coalesce(d.cantidad, 1) * coalesce(s.costo_estimado, 0)
             else 0
           end costo,
           (o.fecha_hora at time zone v_tz)::date between p_desde and p_hasta actual
    from nunki.ordenes_trabajo o
    join nunki.ordenes_trabajo_detalles d on d.orden_trabajo_id = o.id
    left join nunki.servicios s on s.id = d.servicio_id
    where o.empresa_id = p_empresa
      and lower(coalesce(o.estado, '')) = 'completada'
      and lower(coalesce(o.pago_estado, '')) <> 'cancelado'
      and (o.fecha_hora at time zone v_tz)::date between v_prev_desde and p_hasta
  ),
  act as (select * from lineas where actual),
  gastos as (
    select c.fecha, coalesce(c.total_compra, 0) monto, coalesce(nullif(c.categoria, ''), 'otros') categoria,
           coalesce(c.tipo_gasto, 'gasto_operativo') tipo,
           c.fecha between p_desde and p_hasta actual
    from nunki.compras_proveedores c
    where c.empresa_id = p_empresa and c.fecha between v_prev_desde and p_hasta
  ),
  tot as (
    select
      coalesce(sum(subtotal) filter (where tipo_item = 'servicio'), 0) ventas_servicios,
      coalesce(sum(subtotal) filter (where tipo_item <> 'servicio'), 0) ventas_productos,
      coalesce(sum(costo) filter (where tipo_item = 'servicio'), 0) costo_servicios,
      coalesce(sum(costo) filter (where tipo_item <> 'servicio'), 0) costo_productos,
      coalesce(sum(comision), 0) comisiones,
      count(distinct orden_id) comandas,
      count(distinct cliente_id) clientes
    from act
  ),
  tot_prev as (
    select coalesce(sum(subtotal), 0) ventas, coalesce(sum(costo + comision), 0) costos
    from lineas where not actual
  ),
  g as (
    select coalesce(sum(monto) filter (where actual and tipo <> 'compra_stock'), 0) operativos,
           coalesce(sum(monto) filter (where actual and tipo = 'compra_stock'), 0) compras_stock,
           coalesce(sum(monto) filter (where not actual and tipo <> 'compra_stock'), 0) operativos_prev
    from gastos
  ),
  turnos as (
    select t.*, coalesce(t.fecha_hora_fin, t.fecha_hora_inicio + interval '30 minutes') fin
    from nunki.turnos t
    where t.empresa_id = p_empresa and (t.fecha_hora_inicio at time zone v_tz)::date between p_desde and p_hasta
  ),
  e as (select * from nunki.empresas where id = p_empresa),
  prof as (
    select count(*) n from nunki.usuarios u
    where u.empresa_id = p_empresa and lower(coalesce(u.rol, '')) <> 'super_admin'
      and coalesce((to_jsonb(u) ->> 'activo')::boolean, true)
  ),
  dias_abiertos as (
    select count(*) n from generate_series(p_desde, p_hasta, interval '1 day') d, e
    where extract(isodow from d)::int = any(coalesce(e.dias_abierto, array[1,2,3,4,5,6]))
  ),
  ultima as (
    select o.cliente_id, max((o.fecha_hora at time zone v_tz)::date) ultima, count(*) visitas,
           min((o.fecha_hora at time zone v_tz)::date) primera
    from nunki.ordenes_trabajo o
    where o.empresa_id = p_empresa and o.cliente_id is not null and lower(coalesce(o.estado, '')) = 'completada'
    group by o.cliente_id
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta, 'dias', v_dias,
    'ventas_servicios', tot.ventas_servicios,
    'ventas_productos', tot.ventas_productos,
    'ventas', tot.ventas_servicios + tot.ventas_productos,
    'costo_servicios', tot.costo_servicios,
    'costo_productos', tot.costo_productos,
    'comisiones', tot.comisiones,
    'gastos_operativos', g.operativos,
    'compras_stock', g.compras_stock,
    'ganancia', tot.ventas_servicios + tot.ventas_productos - tot.costo_servicios - tot.costo_productos - tot.comisiones - g.operativos,
    'comandas', tot.comandas,
    'clientes_atendidos', tot.clientes,
    'ticket_promedio', case when tot.comandas > 0 then round((tot.ventas_servicios + tot.ventas_productos) / tot.comandas) else 0 end,
    'anterior', jsonb_build_object(
      'desde', v_prev_desde, 'hasta', v_prev_hasta,
      'ventas', tot_prev.ventas,
      'ganancia', tot_prev.ventas - tot_prev.costos - g.operativos_prev),
    'gastos_por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', monto) order by monto desc)
      from (select categoria, sum(monto) monto from gastos where actual and tipo <> 'compra_stock' group by categoria) x), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d::date, 'ventas', coalesce(v.ventas, 0)) order by d)
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join (select dia, sum(subtotal) ventas from act group by dia) v on v.dia = d::date), '[]'::jsonb),
    'por_servicio', coalesce((
      select jsonb_agg(x order by (x->>'ventas')::numeric desc)
      from (
        select jsonb_build_object(
          'nombre', coalesce(s.nombre, 'Servicio'), 'cantidad', sum(a.cantidad), 'ventas', sum(a.subtotal),
          'costo', sum(a.costo), 'comision', sum(a.comision),
          'margen', sum(a.subtotal) - sum(a.costo) - sum(a.comision),
          'margen_pct', case when sum(a.subtotal) > 0 then round(100 * (sum(a.subtotal) - sum(a.costo) - sum(a.comision)) / sum(a.subtotal)) else 0 end) x
        from act a left join nunki.servicios s on s.id = a.servicio_id
        where a.tipo_item = 'servicio'
        group by s.nombre
        order by sum(a.subtotal) desc limit 12) y), '[]'::jsonb),
    'por_profesional', coalesce((
      select jsonb_agg(x order by (x->>'ventas')::numeric desc)
      from (
        select jsonb_build_object(
          'nombre', coalesce(u.nombre_completo, 'Sin asignar'),
          'servicios', count(*) filter (where a.tipo_item = 'servicio'),
          'ventas', sum(a.subtotal), 'comision', sum(a.comision),
          'aporte', sum(a.subtotal) - sum(a.costo) - sum(a.comision)) x
        from act a left join nunki.usuarios u on u.id = a.colaborador_id
        group by u.nombre_completo) y), '[]'::jsonb),
    'agenda', (
      select jsonb_build_object(
        'turnos', count(*),
        'realizados', count(*) filter (where lower(coalesce(estado, '')) = 'realizado'),
        'cancelados', count(*) filter (where lower(coalesce(estado, '')) = 'cancelado'),
        'online', count(*) filter (where origen = 'online'),
        'ausentismo_pct', case when count(*) > 0 then round(100.0 * count(*) filter (where lower(coalesce(estado, '')) = 'cancelado') / count(*)) else 0 end,
        'horas_reservadas', round(coalesce(sum(extract(epoch from fin - fecha_hora_inicio)) filter (where lower(coalesce(estado, '')) <> 'cancelado'), 0) / 3600.0, 1),
        'horas_disponibles', round((select n from prof) * (select n from dias_abiertos)
                               * coalesce(extract(epoch from (select horario_cierre - horario_apertura from e)) / 3600.0, 10), 1))
      from turnos),
    'clientes', jsonb_build_object(
      'nuevos', (select count(*) from ultima where primera between p_desde and p_hasta),
      'recurrentes', (select count(*) from ultima where primera < p_desde and ultima between p_desde and p_hasta),
      'para_recuperar', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, ''))),
                                            'telefono', c.telefono, 'ultima', u.ultima, 'visitas', u.visitas) order by u.visitas desc, u.ultima desc)
        from (select * from ultima where ultima between nunki.hoy_ar() - 120 and nunki.hoy_ar() - 45 order by visitas desc, ultima desc limit 8) u
        join nunki.clientes c on c.id = u.cliente_id), '[]'::jsonb),
      'para_recuperar_total', (select count(*) from ultima where ultima between nunki.hoy_ar() - 120 and nunki.hoy_ar() - 45))
  )
  into v_res
  from tot, tot_prev, g;

  return v_res;
end $$;

revoke all on function nunki.reporte_resultados(uuid, date, date) from public, anon;
grant execute on function nunki.reporte_resultados(uuid, date, date) to authenticated;
