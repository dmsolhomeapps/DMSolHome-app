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
create table emails_autorizados (
  email text primary key,
  nombre text not null,
  activo boolean not null default true,
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

alter table emails_autorizados enable row level security;
alter table perfiles enable row level security;

create policy "lectura_interna" on emails_autorizados for select to authenticated using (true);
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
-- I. UNIDADES (una fila por mueble físico, con su QR)
-- =========================================================
create table unidades (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  codigo_qr text generated always as ('U-' || lpad(numero::text, 6, '0')) stored,
  inventario_id uuid not null references inventario(id),
  recepcion_item_id uuid references recepciones_items(id),
  fecha_ingreso timestamptz not null default now(),
  pintado boolean not null default false,
  proveedor_pintor_id uuid references proveedores(id),
  fecha_pintado timestamptz,
  laqueado boolean not null default false,
  fecha_laqueado timestamptz,
  estado text not null default 'en_stock' check (estado in (
    'en_stock','en_pintura','en_laqueado','vendido','reservado','danado','baja'
  )),
  fecha_venta timestamptz,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (numero)
);

create unique index idx_unidades_codigo_qr on unidades(codigo_qr);
create index idx_unidades_inventario on unidades(inventario_id);
create index idx_unidades_estado on unidades(estado);

create trigger trg_who_unidades
before insert or update on unidades
for each row execute function fn_set_who_columns();

-- =========================================================
-- VISTA: stock actual = unidades en estado "en_stock" por SKU
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
  count(u.id) filter (where u.estado = 'en_stock') as stock
from inventario i
left join unidades u on u.inventario_id = i.id
group by i.id, i.sku, i.descripcion, i.tipo, i.color, i.laqueado;

-- =========================================================
-- TRIGGER: recepción de items -> genera unidades + recalcula estado OC
-- =========================================================
create or replace function fn_recepcion_item_after_insert()
returns trigger as $$
declare
  v_orden_id uuid;
  v_inventario_id uuid;
  v_total_pedido numeric;
  v_total_recibido numeric;
  v_cantidad_int int;
  v_fecha_recepcion date;
  v_nuevo_estado text;
begin
  update public.ordenes_compra_items
  set cantidad_recibida = cantidad_recibida + new.cantidad_recibida
  where id = new.orden_compra_item_id
  returning orden_compra_id, inventario_id into v_orden_id, v_inventario_id;

  if v_inventario_id is not null then
    v_cantidad_int := round(new.cantidad_recibida)::int;
    insert into public.unidades (inventario_id, recepcion_item_id)
    select v_inventario_id, new.id
    from generate_series(1, v_cantidad_int);
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
alter table unidades enable row level security;

create policy "acceso_interno" on proveedores for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on tipos_producto for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on tipos_madera for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on inventario for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on ordenes_compra for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on ordenes_compra_items for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on recepciones for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on recepciones_items for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());
create policy "acceso_interno" on unidades for all to authenticated
  using (fn_usuario_autorizado()) with check (fn_usuario_autorizado());

grant all on all tables in schema public to authenticated;
grant select on stock_actual to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
