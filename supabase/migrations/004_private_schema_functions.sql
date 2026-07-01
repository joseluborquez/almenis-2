-- Mueve las funciones SECURITY DEFINER fuera del schema 'public' (expuesto
-- por la API REST) para que no sean invocables directamente vía
-- /rest/v1/rpc/get_user_rol o /rest/v1/rpc/handle_new_user.
-- Su uso interno en políticas RLS y en el trigger on_auth_user_created
-- sigue funcionando igual (Postgres las referencia por OID, no por nombre).
create schema if not exists private;

alter function public.get_user_rol() set schema private;
alter function public.handle_new_user() set schema private;

-- Preserva el acceso necesario para que las políticas RLS sigan evaluando
-- correctamente para los roles anon y authenticated.
grant usage on schema private to anon, authenticated;
grant execute on function private.get_user_rol() to anon, authenticated;
