-- Agregar campos de aceptación al cierre del profesional
ALTER TABLE public.cierres_profesional
  ADD COLUMN IF NOT EXISTS aceptado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceptado_at timestamptz,
  ADD COLUMN IF NOT EXISTS comentario_profesional text;

-- Permitir que el profesional marque su propio cierre como aceptado/observado
CREATE POLICY "cierres_profesional_own_accept" ON public.cierres_profesional
  FOR UPDATE USING (
    profesional_id = auth.uid() AND public.get_user_rol() = 'profesional'
  );
