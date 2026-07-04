-- ============================================================
-- Gestion de profesionales desde el panel admin (crear / eliminar)
-- ============================================================

-- Al eliminar la cuenta de un profesional no se debe perder el historico
-- de cierres ya generados: se limpia la referencia al usuario mas no la fila.
alter table public.cierres_profesional
  drop constraint if exists cierres_profesional_profesional_id_fkey,
  add constraint cierres_profesional_profesional_id_fkey
    foreign key (profesional_id) references public.usuarios(id) on delete set null;

alter table public.cierres_diarios
  drop constraint if exists cierres_diarios_creado_por_fkey,
  add constraint cierres_diarios_creado_por_fkey
    foreign key (creado_por) references public.usuarios(id) on delete set null;

-- El trigger de creacion de usuario ahora tambien guarda profesional_nombre
-- (antes se cargaba a mano desde el Table Editor de Supabase).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nombre_completo, rol, profesional_nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    coalesce(new.raw_user_meta_data->>'rol', 'profesional'),
    new.raw_user_meta_data->>'profesional_nombre'
  );
  return new;
end;
$$;

-- Permite que el admin borre cuentas desde public.usuarios (ademas del
-- borrado via Admin API con service role que hace la Edge Function).
create policy "usuarios_admin_delete" on public.usuarios
  for delete using (private.get_user_rol() = 'admin');
