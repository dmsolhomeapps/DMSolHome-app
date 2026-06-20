-- =========================================================
-- ESQUEMA v3: Compras e Inventario - Emprendimiento de muebles
-- Para correr en el SQL Editor de Supabase
-- Cambios vs v2: login con Google + allowlist de 3 usuarios,
-- who-columns (creado_por/creado_en/actualizado_por/actualizado_en)
-- en todas las tablas, igual que las who columns de Oracle.
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- A. USUARIOS Y AUTENTICACIÓN
-- =========================================================

-- Lista blanca de quién puede entrar a la app (aunque el login sea con
-- Google, solo estos emails van a poder leer/escribir datos).
-- Cargá aquí los 3 emails reales antes de usar la app, ej:
-- insert into emails_autorizados (email, nombre) values
--   ('cecilia@gmail.com', 'Cecilia'),
--   ('hermano@gmail.com', 'Tu hermano'),
--   ('tercera.persona@gmail.com', 'Tercera persona');
-- es_superusuario: marca a la única persona que puede definir y asignar
-- roles (las pantallas de Roles ni se le muestran a los demás).
create table emails_autorizados (
  email text primary key,
  nombre text not null,
  activo boolean not null default true,
  es_superusuario boolean not null default false,
  created_at timestamptz not null default now()
);

-- Perfil de cada usuario que efectivamente inició sesión alguna vez.
-- Se completa solo la primera vez que alguien hace login con Google.
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text default 'usuario', -- por ahora sin uso, queda para el futuro
  created_at timestamptz not null default now()
);

create or replace function fn_handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function fn_handle_new_user();

-- Roles (lista editable) y asignación de roles a perfiles
create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  descripcion text,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create trigger trg_who_roles
before insert or update on roles
for each row execute function fn_set_who_columns();

insert into roles (nombre, descripcion) values
  ('Editor de órdenes', 'Puede modificar órdenes de compra ya creadas'),
  ('Supervisor de compras', 'Recibe los avisos de órdenes próximas a vencer');

create table perfiles_roles (
  perfil_id uuid not null references perfiles(id) on delete cascade,
  rol_id uuid not null references roles(id) on delete cascade,
  primary key (perfil_id, rol_id)
);

create or replace function fn_es_superusuario()
returns boolean as $$
  select exists (
    select 1 from public.emails_autorizados
    where email = auth.email() and es_superusuario = true
  );
$$ language sql security definer stable set search_path = public;

create or replace function fn_tiene_rol(p_rol_nombre text)
returns boolean as $$
  select fn_es_superusuario() or exists (
    select 1
    from public.perfiles_roles pr
    join public.roles r on r.id = pr.rol_id
    where pr.perfil_id = auth.uid() and r.nombre = p_rol_nombre and r.activo
  );
$$ language sql security definer stable set search_path = public;

alter table emails_autorizados enable row level security;
alter table perfiles enable row level security;
alter table roles enable row level security;
alter table perfiles_roles enable row level security;

create policy "lectura_interna" on emails_autorizados for select to authenticated using (true);
create policy "emails_autorizados_alta_superusuario" on emails_autorizados
  for insert to authenticated with check (fn_es_superusuario());
create policy "emails_autorizados_edicion_superusuario" on emails_autorizados
  for update to authenticated using (fn_es_superusuario()) with check (fn_es_superusuario());
create policy "emails_autorizados_baja_superusuario" on emails_autorizados
  for delete to authenticated using (fn_es_superusuario());
create policy "lectura_perfiles" on perfiles for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on emails_autorizados to authenticated;
grant select on perfiles to authenticated;

-- ---------------------------------------------------------
-- Función helper: ¿el usuario logueado está autorizado?
-- ---------------------------------------------------------
create or replace function fn_usuario_autorizado()
returns boolean as $$
  select exists (
    select 1 from public.emails_autorizados
    where email = auth.email() and activo
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------
-- Who-columns: trigger genérico para creado_por/creado_en/
-- actualizado_por/actualizado_en, igual al patrón de Oracle.
-- ---------------------------------------------------------
create or replace function fn_set_who_columns()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
  elsif tg_op = 'UPDATE' then
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
    new.actualizado_por := auth.uid();
    new.actualizado_en := now();
  end if;
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- B. PROVEEDORES
-- =========================================================
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('carpintero','pintor','ambos','otro')),
  tipo_productos text,
  direccion text,
  metodos_contacto text[] not null default '{}',
  nombre_contacto text,
  telefono_contacto text,
  mail text,
  info_adicional text,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create trigger trg_who_proveedores
before insert or update on proveedores
for each row execute function fn_set_who_columns();

-- =========================================================
-- C. LISTAS DE VALORES (mantenidas por el usuario desde la app)
-- =========================================================
create table tipos_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create trigger trg_who_tipos_producto
before insert or update on tipos_producto
for each row execute function fn_set_who_columns();

create table tipos_madera (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create trigger trg_who_tipos_madera
before insert or update on tipos_madera
for each row execute function fn_set_who_columns();

-- precarga de los tipos que ya estaban sugeridos antes de tener esta tabla
insert into tipos_producto (nombre) values ('Bancos Materos'), ('Taburetes'), ('Racks')
on conflict (nombre) do nothing;

-- =========================================================
-- D. INVENTARIO
-- =========================================================
create table inventario (
  id uuid primary key default gen_random_uuid(),
  sku varchar(200) unique not null,
  descripcion text,
  tipo text,
  proveedor_id uuid references proveedores(id),
  tipo_madera text,
  largo_cm numeric,
  alto_cm numeric,
  profundidad_cm numeric,
  diametro_cm numeric,
  peso_fisico_kg numeric,
  peso_volumetrico_kg numeric generated always as (
    case
      when alto_cm is not null and largo_cm is not null and profundidad_cm is not null
        then round((alto_cm * largo_cm * profundidad_cm) / 4000.0, 2)
      when alto_cm is not null and diametro_cm is not null
        then round((alto_cm * diametro_cm * diametro_cm) / 4000.0, 2)
      else null
    end
  ) stored,
  color text,
  color_detalle text,
  laqueado boolean not null default false,
  info_adicional text,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_inventario_proveedor on inventario(proveedor_id);
create index idx_inventario_tipo on inventario(tipo);

create trigger trg_who_inventario
before insert or update on inventario
for each row execute function fn_set_who_columns();

-- =========================================================
-- E. ORDENES DE COMPRA
-- =========================================================
create table ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id) on delete restrict,
  tipo text not null check (tipo in ('carpinteria','pintura','laqueado','otro')),
  fecha_pedido date not null default current_date,
  fecha_necesidad date,
  fecha_estimada_entrega date,
  fecha_entrega_real date,
  dias_aviso integer,
  estado text not null default 'pendiente' check (estado in ('pendiente','parcial','completa','cancelada')),
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_oc_proveedor on ordenes_compra(proveedor_id);
create index idx_oc_estado on ordenes_compra(estado);

create trigger trg_who_ordenes_compra
before insert or update on ordenes_compra
for each row execute function fn_set_who_columns();

-- =========================================================
-- F. ITEMS DE LA ORDEN DE COMPRA
-- =========================================================
create table ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null references ordenes_compra(id) on delete cascade,
  inventario_id uuid references inventario(id),
  descripcion_personalizada text,
  cantidad_pedida numeric not null check (cantidad_pedida > 0),
  cantidad_recibida numeric not null default 0,
  costo_unitario numeric,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_oci_orden on ordenes_compra_items(orden_compra_id);
create index idx_oci_inventario on ordenes_compra_items(inventario_id);

create trigger trg_who_ordenes_compra_items
before insert or update on ordenes_compra_items
for each row execute function fn_set_who_columns();

-- =========================================================
-- G. RECEPCIONES
-- =========================================================
create table recepciones (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null references ordenes_compra(id) on delete restrict,
  proveedor_id uuid not null references proveedores(id),
  fecha_recepcion date not null default current_date,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_recepciones_oc on recepciones(orden_compra_id);

create trigger trg_who_recepciones
before insert or update on recepciones
for each row execute function fn_set_who_columns();

-- =========================================================
-- H. ITEMS DE LA RECEPCION
-- =========================================================
create table recepciones_items (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references recepciones(id) on delete cascade,
  orden_compra_item_id uuid not null references ordenes_compra_items(id),
  cantidad_recibida numeric not null check (cantidad_recibida > 0),
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_ri_recepcion on recepciones_items(recepcion_id);
create index idx_ri_oci on recepciones_items(orden_compra_item_id);

create trigger trg_who_recepciones_items
before insert or update on recepciones_items
for each row execute function fn_set_who_columns();

-- =========================================================
-- I. MOVIMIENTOS DE STOCK (entradas/salidas por cantidad, no por pieza)
-- =========================================================
create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventario(id),
  tipo text not null check (tipo in (
    'ingreso_compra','egreso_venta','ajuste_positivo','ajuste_negativo',
    'ingreso_laqueado','egreso_laqueado'
  )),
  cantidad numeric not null check (cantidad > 0),
  referencia_tipo text,
  referencia_id uuid,
  fecha timestamptz not null default now(),
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index idx_mov_inventario on movimientos_stock(inventario_id);
create index idx_mov_fecha on movimientos_stock(fecha);

create trigger trg_who_movimientos_stock
before insert or update on movimientos_stock
for each row execute function fn_set_who_columns();

-- =========================================================
-- VISTA: stock actual por cantidades (total y laqueado) por SKU
-- =========================================================
create view stock_actual
with (security_invoker = true) as
select
  i.id as inventario_id,
  i.sku,
  i.descripcion,
  i.tipo,
  i.color,
  i.laqueado,
  coalesce(sum(case
    when m.tipo in ('ingreso_compra','ajuste_positivo') then m.cantidad
    when m.tipo in ('egreso_venta','ajuste_negativo') then -m.cantidad
    else 0
  end), 0) as stock_total,
  coalesce(sum(case
    when m.tipo = 'ingreso_laqueado' then m.cantidad
    when m.tipo = 'egreso_laqueado' then -m.cantidad
    else 0
  end), 0) as stock_laqueado
from inventario i
left join movimientos_stock m on m.inventario_id = i.id
group by i.id, i.sku, i.descripcion, i.tipo, i.color, i.laqueado;

-- =========================================================
-- TRIGGER: recepción de items -> registra ingreso en movimientos_stock
-- y recalcula estado/fecha de entrega real de la OC
-- =========================================================
create or replace function fn_recepcion_item_after_insert()
returns trigger as $$
declare
  v_orden_id uuid;
  v_inventario_id uuid;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_fecha_recepcion date;
  v_nuevo_estado text;
begin
  update public.ordenes_compra_items
  set cantidad_recibida = cantidad_recibida + new.cantidad_recibida
  where id = new.orden_compra_item_id
  returning orden_compra_id, inventario_id into v_orden_id, v_inventario_id;

  if v_inventario_id is not null then
    insert into public.movimientos_stock (inventario_id, tipo, cantidad, referencia_tipo, referencia_id)
    values (v_inventario_id, 'ingreso_compra', new.cantidad_recibida, 'recepcion', new.id);
  end if;

  select sum(cantidad_pedida), sum(cantidad_recibida)
  into v_total_pedido, v_total_recibido
  from public.ordenes_compra_items
  where orden_compra_id = v_orden_id;

  v_nuevo_estado := case
    when v_total_recibido >= v_total_pedido then 'completa'
    when v_total_recibido > 0 then 'parcial'
    else 'pendiente'
  end;

  if v_nuevo_estado = 'completa' then
    select fecha_recepcion into v_fecha_recepcion
    from public.recepciones where id = new.recepcion_id;
  end if;

  update public.ordenes_compra
  set estado = v_nuevo_estado,
      fecha_entrega_real = case when v_nuevo_estado = 'completa' then v_fecha_recepcion else fecha_entrega_real end
  where id = v_orden_id;

  return new;
end;
$$ language plpgsql set search_path = public;

create trigger trg_recepcion_item_after_insert
after insert on recepciones_items
for each row execute function fn_recepcion_item_after_insert();

-- =========================================================
-- FUNCIÓN: recibir un producto escaneado, repartiendo por antigüedad
-- entre todas las órdenes abiertas que tengan ese producto pendiente
-- =========================================================
create or replace function fn_recibir_producto(
  p_inventario_id uuid,
  p_cantidad numeric,
  p_fecha_recepcion date default current_date,
  p_notas text default null
) returns table(orden_compra_id uuid, cantidad_asignada numeric) as $$
declare
  v_restante numeric := p_cantidad;
  v_item record;
  v_recepcion_id uuid;
  v_asignar numeric;
begin
  for v_item in
    select oci.id as oci_id, oci.orden_compra_id,
           (oci.cantidad_pedida - oci.cantidad_recibida) as pendiente, oc.proveedor_id
    from public.ordenes_compra_items oci
    join public.ordenes_compra oc on oc.id = oci.orden_compra_id
    where oci.inventario_id = p_inventario_id
      and oc.estado in ('pendiente','parcial')
      and oci.cantidad_pedida > oci.cantidad_recibida
    order by oc.fecha_pedido asc
  loop
    exit when v_restante <= 0;
    v_asignar := least(v_restante, v_item.pendiente);
    if v_asignar > 0 then
      insert into public.recepciones (orden_compra_id, proveedor_id, fecha_recepcion, notas)
      values (v_item.orden_compra_id, v_item.proveedor_id, p_fecha_recepcion, p_notas)
      returning id into v_recepcion_id;

      insert into public.recepciones_items (recepcion_id, orden_compra_item_id, cantidad_recibida)
      values (v_recepcion_id, v_item.oci_id, v_asignar);

      orden_compra_id := v_item.orden_compra_id;
      cantidad_asignada := v_asignar;
      return next;

      v_restante := v_restante - v_asignar;
    end if;
  end loop;

  if v_restante > 0 then
    insert into public.movimientos_stock (inventario_id, tipo, cantidad, referencia_tipo, notas)
    values (p_inventario_id, 'ingreso_compra', v_restante, 'recepcion_sin_orden', p_notas);

    orden_compra_id := null;
    cantidad_asignada := v_restante;
    return next;
  end if;
end;
$$ language plpgsql set search_path = public;

-- =========================================================
-- SEGURIDAD: RLS basado en la allowlist de emails_autorizados
-- (no alcanza con "estar logueado" - además hay que estar en la lista)
-- =========================================================

alter table proveedores enable row level security;
alter table tipos_producto enable row level security;
alter table tipos_madera enable row level security;
alter table inventario enable row level security;
alter table ordenes_compra enable row level security;
alter table ordenes_compra_items enable row level security;
alter table recepciones enable row level security;
alter table recepciones_items enable row level security;
alter table movimientos_stock enable row level security;

create policy "acceso_interno" on proveedores for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on tipos_producto for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on tipos_madera for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on inventario for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "roles_solo_superusuario" on roles for all to authenticated
  using (fn_es_superusuario()) with check (fn_es_superusuario());
create policy "perfiles_roles_solo_superusuario" on perfiles_roles for all to authenticated
  using (fn_es_superusuario()) with check (fn_es_superusuario());

create policy "ordenes_lectura" on ordenes_compra for select to authenticated
  using (fn_usuario_autorizado());
create policy "ordenes_alta" on ordenes_compra for insert to authenticated
  with check (fn_usuario_autorizado());
create policy "ordenes_baja" on ordenes_compra for delete to authenticated
  using (fn_usuario_autorizado());
create policy "ordenes_edicion_restringida" on ordenes_compra for update to authenticated
  using (fn_usuario_autorizado() and fn_tiene_rol('Editor de órdenes'))
  with check (fn_usuario_autorizado() and fn_tiene_rol('Editor de órdenes'));

create policy "acceso_interno" on ordenes_compra_items for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on recepciones for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on recepciones_items for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on movimientos_stock for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());

grant all on all tables in schema public to authenticated;
grant select on stock_actual to authenticated;
grant execute on function fn_recibir_producto(uuid, numeric, date, text) to authenticated;
grant execute on function fn_tiene_rol(text) to authenticated;
grant execute on function fn_es_superusuario() to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
