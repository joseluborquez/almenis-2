-- ============================================================
-- Fix: escalacion de privilegios via signup publico
-- ============================================================
-- handle_new_user copiaba el rol desde raw_user_meta_data, que es controlado
-- por quien llama a auth.signUp. Con la anon key (publica en el bundle del
-- frontend) cualquiera podia registrarse pasando { rol: 'admin' } en la
-- metadata y quedar como administrador: acceso a todos los cierres y montos.
-- El trigger ahora fuerza SIEMPRE rol 'profesional': la unica via legitima de
-- creacion de cuentas es la Edge Function gestionar-profesionales (que solo
-- crea profesionales); las cuentas admin se promueven a mano en la base.
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
    'profesional',  -- nunca confiar en el rol que venga en la metadata
    new.raw_user_meta_data->>'profesional_nombre'
  );
  return new;
end;
$$;
