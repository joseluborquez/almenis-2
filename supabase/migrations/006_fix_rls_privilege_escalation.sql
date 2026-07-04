-- ============================================================
-- Fix: escalacion de privilegios y fuga de datos entre profesionales
-- ============================================================

-- 1) cierres_profesional_own tenia (en produccion, fuera de cualquier
-- migracion versionada) un fallback por coincidencia de texto que
-- comparaba solo la PRIMERA PALABRA del nombre del profesional
-- (normalmente el titulo: "Dra.", "Dr.", "Flga", etc). Como varios
-- profesionales comparten titulo, esto permitia que un profesional
-- viera los cierres (montos, atenciones) de un colega con el mismo
-- titulo. Se vuelve a la comparacion estricta por profesional_id.
drop policy if exists "cierres_profesional_own" on public.cierres_profesional;

create policy "cierres_profesional_own" on public.cierres_profesional
  for select using (
    profesional_id = auth.uid() and private.get_user_rol() = 'profesional'
  );

-- 2) usuarios_update_self permitia a CUALQUIER usuario autenticado
-- actualizar cualquier columna de su propia fila en `usuarios`,
-- incluyendo `rol` — un profesional podia auto-otorgarse rol admin.
-- Ninguna pantalla de la app usa update sobre usuarios (la creacion/
-- edicion pasa por la Edge Function con service role), asi que se
-- elimina el permiso por completo en vez de acotarlo.
drop policy if exists "usuarios_update_self" on public.usuarios;

-- 3) cierres_profesional_own_accept permite a un profesional actualizar
-- su propia fila para aceptar/observar el cierre, pero sin restriccion
-- de columnas tambien dejaba reescribir total_recaudado, detalle_json,
-- atendidos, etc. Se agrega un trigger que bloquea cualquier cambio
-- fuera de aceptado/aceptado_at/comentario_profesional cuando quien
-- actualiza tiene rol 'profesional' (el admin no queda afectado).
create or replace function private.restringir_update_cierre_profesional()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.get_user_rol() = 'profesional' then
    if new.profesional_id      is distinct from old.profesional_id
      or new.profesional_nombre is distinct from old.profesional_nombre
      or new.cierre_diario_id   is distinct from old.cierre_diario_id
      or new.total_atenciones   is distinct from old.total_atenciones
      or new.total_recaudado    is distinct from old.total_recaudado
      or new.atendidos          is distinct from old.atendidos
      or new.detalle_json       is distinct from old.detalle_json
      or new.fecha              is distinct from old.fecha
    then
      raise exception 'Un profesional solo puede modificar aceptado, aceptado_at y comentario_profesional';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restringir_update_cierre_profesional on public.cierres_profesional;

create trigger trg_restringir_update_cierre_profesional
  before update on public.cierres_profesional
  for each row execute procedure private.restringir_update_cierre_profesional();
