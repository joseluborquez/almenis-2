-- ============================================================
-- Cierre mensual: rollup de los cierres diarios aceptados del mes
-- ============================================================
-- Espeja el patron de cierres_diarios/cierres_profesional: se genera una
-- vez (snapshot persistido en datos_json/dias_json), no se recalcula en
-- cada vista. El monto de cada profesional se arma sumando los dias
-- ACEPTADOS de cierres_profesional en el mes, mas los ajustes manuales que
-- el admin haya cargado explicitamente para dias faltantes o pendientes
-- (con motivo, para trazabilidad) — la Edge Function generar-cierre-mensual
-- es quien decide esa combinacion, aqui solo se persiste el resultado.

create table public.cierres_mensuales (
  id uuid primary key default gen_random_uuid(),
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  dias_esperados integer not null default 0,
  dias_con_cierre integer not null default 0,
  dias_aceptados integer not null default 0,
  total_atenciones integer not null default 0,
  total_recaudado integer not null default 0,
  datos_json jsonb not null,
  generado_por uuid references public.usuarios(id),
  created_at timestamptz default now(),
  unique (anio, mes)
);

create table public.cierres_profesional_mensual (
  id uuid primary key default gen_random_uuid(),
  cierre_mensual_id uuid not null references public.cierres_mensuales(id) on delete cascade,
  profesional_nombre text not null,
  profesional_id uuid references public.usuarios(id) on delete set null,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  total_atenciones integer not null default 0,
  atendidos integer not null default 0,
  total_recaudado integer not null default 0,
  -- Snapshot de la config vigente al generar el cierre mensual.
  modalidad_pago text check (modalidad_pago is null or modalidad_pago in ('porcentaje', 'arriendo', 'sueldo_fijo')),
  porcentaje_almenis integer check (porcentaje_almenis is null or porcentaje_almenis between 0 and 100),
  monto_arriendo integer,
  monto_sueldo_fijo integer,
  -- Resultado calculado (ver generar-cierre-mensual): null si no hay
  -- modalidad registrada, nunca se asume un valor por defecto.
  monto_almenis integer,
  monto_profesional integer,
  -- Detalle dia a dia: [{fecha, origen: 'aceptado'|'no_aceptado'|'ajuste_manual', monto, motivo?}]
  dias_json jsonb not null default '[]'::jsonb,
  aceptado boolean not null default false,
  aceptado_at timestamptz,
  comentario_profesional text,
  created_at timestamptz default now(),
  unique (cierre_mensual_id, profesional_nombre)
);

create index idx_cierres_profesional_mensual_periodo on public.cierres_profesional_mensual(anio, mes);
create index idx_cierres_profesional_mensual_profesional on public.cierres_profesional_mensual(profesional_id);
create index idx_cierres_mensuales_periodo on public.cierres_mensuales(anio, mes);

-- ============================================================
-- Row Level Security (espejo de cierres_diarios / cierres_profesional)
-- ============================================================

alter table public.cierres_mensuales enable row level security;
alter table public.cierres_profesional_mensual enable row level security;

create policy "cierres_mensuales_admin" on public.cierres_mensuales
  for all using (private.get_user_rol() = 'admin');

create policy "cierres_profesional_mensual_admin" on public.cierres_profesional_mensual
  for all using (private.get_user_rol() = 'admin');

create policy "cierres_profesional_mensual_own" on public.cierres_profesional_mensual
  for select using (
    profesional_id = auth.uid() and private.get_user_rol() = 'profesional'
  );

create policy "cierres_profesional_mensual_own_accept" on public.cierres_profesional_mensual
  for update using (
    profesional_id = auth.uid() and private.get_user_rol() = 'profesional'
  );

-- Un profesional solo puede modificar aceptado/aceptado_at/comentario_profesional
-- de su propia fila (mismo mecanismo que 006_fix_rls_privilege_escalation.sql).
create or replace function private.restringir_update_cierre_profesional_mensual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.get_user_rol() = 'profesional' then
    if new.profesional_id       is distinct from old.profesional_id
      or new.profesional_nombre is distinct from old.profesional_nombre
      or new.cierre_mensual_id  is distinct from old.cierre_mensual_id
      or new.anio               is distinct from old.anio
      or new.mes                is distinct from old.mes
      or new.total_atenciones   is distinct from old.total_atenciones
      or new.atendidos          is distinct from old.atendidos
      or new.total_recaudado    is distinct from old.total_recaudado
      or new.modalidad_pago     is distinct from old.modalidad_pago
      or new.porcentaje_almenis is distinct from old.porcentaje_almenis
      or new.monto_arriendo     is distinct from old.monto_arriendo
      or new.monto_sueldo_fijo  is distinct from old.monto_sueldo_fijo
      or new.monto_almenis      is distinct from old.monto_almenis
      or new.monto_profesional  is distinct from old.monto_profesional
      or new.dias_json          is distinct from old.dias_json
    then
      raise exception 'Un profesional solo puede modificar aceptado, aceptado_at y comentario_profesional';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_restringir_update_cierre_profesional_mensual
  before update on public.cierres_profesional_mensual
  for each row execute procedure private.restringir_update_cierre_profesional_mensual();
