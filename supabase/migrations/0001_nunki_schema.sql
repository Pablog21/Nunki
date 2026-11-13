-- ====================================================================
-- NUNKI · 0001 · Esquema propio dentro del proyecto Supabase existente
-- --------------------------------------------------------------------
-- Crea el esquema `nunki` clonando la ESTRUCTURA (no los datos) de las
-- tablas actuales de h.A.I.r en `public`. Las tablas de Uky no se tocan.
-- Ejecutar una sola vez en el SQL Editor de Supabase. Es idempotente.
--
-- Después de ejecutarla:
--   Project Settings › API › Exposed schemas → agregar `nunki`.
-- ====================================================================

create schema if not exists nunki;
grant usage on schema nunki to anon, authenticated, service_role;

-- --------------------------------------------------------------------
-- 1. Clonar estructura de tablas (columnas, defaults, checks, índices)
-- --------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'empresas','usuarios','clientes','servicios','articulos','servicio_insumos',
    'ordenes_trabajo','ordenes_trabajo_detalles','ordenes_trabajo_ayudantes','turnos','comisiones','liquidaciones',
    'cajas_cierres','cajas_movimientos','asistencias','movimientos_stock',
    'compras_proveedores','compras_detalles','contactos_landing'];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'public.% no existe, se omite', t;
      continue;
    end if;
    if to_regclass('nunki.' || t) is null then
      execute format('create table nunki.%I (like public.%I including all)', t, t);
    end if;
  end loop;
end $$;

-- --------------------------------------------------------------------
-- 2. Recrear claves foráneas apuntando a las tablas de `nunki`
--    (las referencias a auth.users se mantienen)
-- --------------------------------------------------------------------
do $$
declare
  r record;
  def text;
begin
  for r in
    select c.conname, cl.relname as tabla, pg_get_constraintdef(c.oid) as definicion,
           rn.nspname as ref_esquema, rc.relname as ref_tabla
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rc on rc.oid = c.confrelid
    join pg_namespace rn on rn.oid = rc.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and to_regclass('nunki.' || cl.relname) is not null
  loop
    def := r.definicion;
    if r.ref_esquema = 'public' then
      if to_regclass('nunki.' || r.ref_tabla) is null then
        continue;
      end if;
      def := regexp_replace(def, 'REFERENCES (public\.)?"?' || r.ref_tabla || '"?\(',
                            'REFERENCES nunki.' || r.ref_tabla || '(');
    end if;
    if not exists (
      select 1 from pg_constraint
      where conname = r.conname and conrelid = format('nunki.%I', r.tabla)::regclass
    ) then
      execute format('alter table nunki.%I add constraint %I %s', r.tabla, r.conname, def);
    end if;
  end loop;
end $$;

-- Contactos de la landing (no existe en h.A.I.r)
create table if not exists nunki.contactos_landing (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  salon text,
  telefono text,
  email text,
  mensaje text,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- 3. Columnas nuevas de Nunki
-- --------------------------------------------------------------------
alter table nunki.empresas
  add column if not exists slug text,
  add column if not exists whatsapp text,
  add column if not exists reserva_online_activa boolean not null default false,
  add column if not exists reserva_anticipacion_min integer not null default 60,
  add column if not exists horario_apertura time not null default '09:00',
  add column if not exists horario_cierre time not null default '20:00',
  add column if not exists dias_abierto integer[] not null default '{1,2,3,4,5,6}',
  add column if not exists recordatorio_plantilla text;

create unique index if not exists empresas_slug_key on nunki.empresas (lower(slug));

alter table nunki.cajas_cierres
  add column if not exists controlada boolean not null default false,
  add column if not exists controlada_fecha timestamptz,
  add column if not exists controlada_por_id uuid references nunki.usuarios(id) on delete set null,
  add column if not exists controlada_por_nombre text,
  add column if not exists controlada_comentario text;

alter table nunki.servicios
  add column if not exists reservable_online boolean not null default true;

alter table nunki.turnos
  add column if not exists origen text not null default 'interno',
  add column if not exists cliente_telefono text,
  add column if not exists recordatorio_enviado_at timestamptz,
  add column if not exists confirmado_at timestamptz;

create index if not exists turnos_empresa_inicio_idx on nunki.turnos (empresa_id, fecha_hora_inicio);

-- --------------------------------------------------------------------
-- 4. Permisos de tabla (RLS decide qué filas)
-- --------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema nunki to authenticated;
grant all on all tables in schema nunki to service_role;
alter default privileges in schema nunki grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema nunki grant all on tables to service_role;
grant insert on nunki.contactos_landing to anon;

-- --------------------------------------------------------------------
-- 5. Funciones de ayuda para RLS (evitan subconsultas repetidas)
-- --------------------------------------------------------------------
create or replace function nunki.mi_empresa() returns uuid
language sql stable security definer set search_path = '' as $$
  select empresa_id from nunki.usuarios where id = auth.uid()
$$;

create or replace function nunki.mi_rol() returns text
language sql stable security definer set search_path = '' as $$
  select lower(coalesce(rol, '')) from nunki.usuarios where id = auth.uid()
$$;

create or replace function nunki.es_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(nunki.mi_rol() = 'super_admin', false)
$$;

create or replace function nunki.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(nunki.mi_rol() in ('administrador', 'super_admin'), false)
$$;

create or replace function nunki.puede_ver(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_empresa = nunki.mi_empresa() or nunki.es_super()
$$;

create or replace function nunki.puede_administrar(p_empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_empresa = nunki.mi_empresa() and nunki.es_admin()) or nunki.es_super()
$$;

revoke execute on function nunki.mi_empresa(), nunki.mi_rol(), nunki.es_super(), nunki.es_admin(),
  nunki.puede_ver(uuid), nunki.puede_administrar(uuid) from anon;

-- --------------------------------------------------------------------
-- 6. RLS
-- --------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select table_name from information_schema.tables where table_schema = 'nunki' and table_type = 'BASE TABLE' loop
    execute format('alter table nunki.%I enable row level security', t);
  end loop;
end $$;

-- 6.a Tablas operativas: cualquier miembro del salón lee y escribe
do $$
declare t text;
begin
  foreach t in array array['clientes','servicios','articulos','ordenes_trabajo','turnos',
                           'cajas_movimientos','asistencias','movimientos_stock','compras_proveedores'] loop
    if to_regclass('nunki.' || t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'nunki' and table_name = t and column_name = 'empresa_id') then
      raise notice 'nunki.% no tiene empresa_id: revisar políticas a mano', t;
      continue;
    end if;
    execute format('drop policy if exists miembros_todo on nunki.%I', t);
    execute format('create policy miembros_todo on nunki.%I for all to authenticated
                    using (nunki.puede_ver(empresa_id)) with check (nunki.puede_ver(empresa_id))', t);
  end loop;
end $$;

-- 6.b Comisiones: los miembros leen y generan al cobrar; solo admin corrige o borra
drop policy if exists comisiones_leer on nunki.comisiones;
drop policy if exists comisiones_crear on nunki.comisiones;
drop policy if exists comisiones_admin_mod on nunki.comisiones;
drop policy if exists comisiones_admin_del on nunki.comisiones;
create policy comisiones_leer on nunki.comisiones for select to authenticated using (nunki.puede_ver(empresa_id));
create policy comisiones_crear on nunki.comisiones for insert to authenticated with check (nunki.puede_ver(empresa_id));
create policy comisiones_admin_mod on nunki.comisiones for update to authenticated
  using (nunki.puede_administrar(empresa_id)) with check (nunki.puede_administrar(empresa_id));
create policy comisiones_admin_del on nunki.comisiones for delete to authenticated using (nunki.puede_administrar(empresa_id));

-- 6.c Liquidaciones: solo administradores escriben
drop policy if exists liquidaciones_leer on nunki.liquidaciones;
drop policy if exists liquidaciones_admin on nunki.liquidaciones;
create policy liquidaciones_leer on nunki.liquidaciones for select to authenticated using (nunki.puede_ver(empresa_id));
create policy liquidaciones_admin on nunki.liquidaciones for all to authenticated
  using (nunki.puede_administrar(empresa_id)) with check (nunki.puede_administrar(empresa_id));

-- 6.d Cierres de caja: el equipo cierra; un cierre controlado solo lo toca el admin
drop policy if exists cierres_leer on nunki.cajas_cierres;
drop policy if exists cierres_crear on nunki.cajas_cierres;
drop policy if exists cierres_modificar on nunki.cajas_cierres;
drop policy if exists cierres_borrar on nunki.cajas_cierres;
create policy cierres_leer on nunki.cajas_cierres for select to authenticated using (nunki.puede_ver(empresa_id));
create policy cierres_crear on nunki.cajas_cierres for insert to authenticated with check (nunki.puede_ver(empresa_id));
create policy cierres_modificar on nunki.cajas_cierres for update to authenticated
  using (nunki.puede_administrar(empresa_id) or (nunki.puede_ver(empresa_id) and not coalesce(controlada, false)))
  with check (nunki.puede_ver(empresa_id));
create policy cierres_borrar on nunki.cajas_cierres for delete to authenticated using (nunki.puede_administrar(empresa_id));

-- 6.e Tablas de detalle: heredan el permiso de su cabecera
drop policy if exists detalle_orden on nunki.ordenes_trabajo_detalles;
create policy detalle_orden on nunki.ordenes_trabajo_detalles for all to authenticated
  using (exists (select 1 from nunki.ordenes_trabajo o where o.id = orden_trabajo_id and nunki.puede_ver(o.empresa_id)))
  with check (exists (select 1 from nunki.ordenes_trabajo o where o.id = orden_trabajo_id and nunki.puede_ver(o.empresa_id)));

drop policy if exists detalle_ayudantes on nunki.ordenes_trabajo_ayudantes;
create policy detalle_ayudantes on nunki.ordenes_trabajo_ayudantes for all to authenticated
  using (exists (select 1 from nunki.ordenes_trabajo o where o.id = orden_trabajo_id and nunki.puede_ver(o.empresa_id)))
  with check (exists (select 1 from nunki.ordenes_trabajo o where o.id = orden_trabajo_id and nunki.puede_ver(o.empresa_id)));

drop policy if exists detalle_compra on nunki.compras_detalles;
create policy detalle_compra on nunki.compras_detalles for all to authenticated
  using (exists (select 1 from nunki.compras_proveedores c where c.id = compra_id and nunki.puede_ver(c.empresa_id)))
  with check (exists (select 1 from nunki.compras_proveedores c where c.id = compra_id and nunki.puede_ver(c.empresa_id)));

drop policy if exists receta_leer on nunki.servicio_insumos;
drop policy if exists receta_admin on nunki.servicio_insumos;
create policy receta_leer on nunki.servicio_insumos for select to authenticated
  using (exists (select 1 from nunki.servicios s where s.id = servicio_id and nunki.puede_ver(s.empresa_id)));
create policy receta_admin on nunki.servicio_insumos for all to authenticated
  using (exists (select 1 from nunki.servicios s where s.id = servicio_id and nunki.puede_administrar(s.empresa_id)))
  with check (exists (select 1 from nunki.servicios s where s.id = servicio_id and nunki.puede_administrar(s.empresa_id)));

-- 6.f Empresas
drop policy if exists empresas_leer on nunki.empresas;
drop policy if exists empresas_admin on nunki.empresas;
drop policy if exists empresas_super on nunki.empresas;
create policy empresas_leer on nunki.empresas for select to authenticated using (nunki.puede_ver(id));
create policy empresas_admin on nunki.empresas for update to authenticated
  using (nunki.puede_administrar(id)) with check (nunki.puede_administrar(id));
create policy empresas_super on nunki.empresas for all to authenticated
  using (nunki.es_super()) with check (nunki.es_super());

-- 6.g Usuarios: nadie puede subirse de rol ni cambiarse de salón
drop policy if exists usuarios_leer on nunki.usuarios;
drop policy if exists usuarios_crear on nunki.usuarios;
drop policy if exists usuarios_modificar on nunki.usuarios;
drop policy if exists usuarios_borrar on nunki.usuarios;
create policy usuarios_leer on nunki.usuarios for select to authenticated
  using (id = auth.uid() or nunki.puede_ver(empresa_id));
create policy usuarios_crear on nunki.usuarios for insert to authenticated
  with check (nunki.puede_administrar(empresa_id) and (lower(coalesce(rol, '')) <> 'super_admin' or nunki.es_super()));
create policy usuarios_modificar on nunki.usuarios for update to authenticated
  using (id = auth.uid() or nunki.puede_administrar(empresa_id))
  with check (id = auth.uid() or nunki.puede_administrar(empresa_id));
create policy usuarios_borrar on nunki.usuarios for delete to authenticated
  using (id <> auth.uid() and nunki.puede_administrar(empresa_id));

create or replace function nunki.proteger_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'service_role' or nunki.es_super() then
    return new;
  end if;
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'No se puede cambiar el salón de un usuario';
  end if;
  if new.rol is distinct from old.rol then
    if not nunki.es_admin() or old.id = auth.uid() then
      raise exception 'Solo un administrador puede cambiar el rol de otra persona';
    end if;
    if lower(coalesce(new.rol, '')) = 'super_admin' or lower(coalesce(old.rol, '')) = 'super_admin' then
      raise exception 'No se puede asignar ni quitar el rol super_admin';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proteger_usuario on nunki.usuarios;
create trigger proteger_usuario before update on nunki.usuarios
  for each row execute function nunki.proteger_usuario();

-- 6.h Contactos de la landing: cualquiera escribe, solo super_admin lee
drop policy if exists contactos_insertar on nunki.contactos_landing;
drop policy if exists contactos_leer on nunki.contactos_landing;
create policy contactos_insertar on nunki.contactos_landing for insert to anon, authenticated with check (true);
create policy contactos_leer on nunki.contactos_landing for select to authenticated using (nunki.es_super());

-- --------------------------------------------------------------------
-- 7. Triggers heredados de h.A.I.r
-- --------------------------------------------------------------------
-- Cada movimiento de stock actualiza el stock del artículo
create or replace function nunki.actualizar_stock_articulo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update nunki.articulos set stock_actual = stock_actual + new.cantidad where id = new.articulo_id;
  return new;
end $$;

drop trigger if exists trg_actualizar_stock on nunki.movimientos_stock;
create trigger trg_actualizar_stock after insert on nunki.movimientos_stock
  for each row execute function nunki.actualizar_stock_articulo();

-- Al completar una comanda, su turno pasa a "Realizado"
create or replace function nunki.orden_completada_turno() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'completada' and new.turno_id is not null then
    update nunki.turnos set estado = 'Realizado' where id = new.turno_id and estado <> 'Realizado';
  end if;
  return new;
end $$;

drop trigger if exists tr_orden_completada_turno on nunki.ordenes_trabajo;
create trigger tr_orden_completada_turno after insert or update on nunki.ordenes_trabajo
  for each row execute function nunki.orden_completada_turno();

revoke execute on function nunki.actualizar_stock_articulo(), nunki.orden_completada_turno() from anon, authenticated;
