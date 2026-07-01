-- Fija search_path en funciones SECURITY DEFINER para prevenir
-- search_path hijacking (hallazgo del linter de seguridad de Supabase)
alter function public.get_user_rol() set search_path = public;
alter function public.handle_new_user() set search_path = public;
