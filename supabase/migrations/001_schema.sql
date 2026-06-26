-- ============================================================
-- ALMENIS — Cierre de Caja: Schema completo
-- ============================================================

-- Tabla de usuarios (espejo de auth.users con rol)
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre_completo text not null,
  rol text not null check (rol in ('admin', 'profesional')),
  profesional_nombre text,  -- debe coincidir exactamente con Box/Prof del PDF
  created_at timestamptz default now()
);

-- Tabla de tratamientos (cargada desde el Excel)
create table public.tratamientos (
  id bigint primary key,
  nombre text not null,
  categoria text,
  valor integer not null default 0,  -- en pesos chilenos
  gratuito boolean not null default false,
  created_at timestamptz default now()
);

-- Tabla de cierres diarios (resumen general del centro)
create table public.cierres_diarios (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  total_atenciones integer not null default 0,
  total_recaudado integer not null default 0,
  datos_json jsonb not null,  -- output completo de Claude
  creado_por uuid references public.usuarios(id),
  created_at timestamptz default now()
);

-- Tabla de cierres por profesional
create table public.cierres_profesional (
  id uuid primary key default gen_random_uuid(),
  cierre_diario_id uuid not null references public.cierres_diarios(id) on delete cascade,
  profesional_nombre text not null,
  profesional_id uuid references public.usuarios(id),
  total_atenciones integer not null default 0,
  total_recaudado integer not null default 0,
  atendidos integer not null default 0,
  detalle_json jsonb not null,
  fecha date not null,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.usuarios enable row level security;
alter table public.tratamientos enable row level security;
alter table public.cierres_diarios enable row level security;
alter table public.cierres_profesional enable row level security;

-- Helper: obtiene el rol del usuario autenticado
create or replace function public.get_user_rol()
returns text
language sql
security definer
stable
as $$
  select rol from public.usuarios where id = auth.uid();
$$;

-- USUARIOS: cada uno ve solo su propio perfil; admin ve todos
create policy "usuarios_self" on public.usuarios
  for select using (id = auth.uid() or public.get_user_rol() = 'admin');

create policy "usuarios_insert_self" on public.usuarios
  for insert with check (id = auth.uid());

create policy "usuarios_update_self" on public.usuarios
  for update using (id = auth.uid());

-- TRATAMIENTOS: todos los autenticados pueden leer
create policy "tratamientos_read" on public.tratamientos
  for select using (auth.uid() is not null);

-- Solo admin puede modificar tratamientos
create policy "tratamientos_admin_write" on public.tratamientos
  for all using (public.get_user_rol() = 'admin');

-- CIERRES DIARIOS: admin lee todo; profesional no tiene acceso directo
create policy "cierres_diarios_admin" on public.cierres_diarios
  for all using (public.get_user_rol() = 'admin');

-- CIERRES PROFESIONAL: admin lee todo; profesional solo el suyo
create policy "cierres_profesional_admin" on public.cierres_profesional
  for all using (public.get_user_rol() = 'admin');

create policy "cierres_profesional_own" on public.cierres_profesional
  for select using (
    profesional_id = auth.uid() and public.get_user_rol() = 'profesional'
  );

-- ============================================================
-- Trigger: crear usuario en public.usuarios al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.usuarios (id, email, nombre_completo, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    coalesce(new.raw_user_meta_data->>'rol', 'profesional')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Índices útiles
-- ============================================================
create index idx_cierres_profesional_fecha on public.cierres_profesional(fecha);
create index idx_cierres_profesional_id on public.cierres_profesional(profesional_id);
create index idx_cierres_diarios_fecha on public.cierres_diarios(fecha);
