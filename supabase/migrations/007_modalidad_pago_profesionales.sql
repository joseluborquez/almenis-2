-- ============================================================
-- Modalidad de pago por profesional (arriendo / porcentaje / sueldo fijo)
-- ============================================================

-- Configuracion vigente por profesional (usada al generar cierres nuevos).
alter table public.usuarios
  add column if not exists modalidad_pago text not null default 'porcentaje'
    check (modalidad_pago in ('porcentaje', 'arriendo', 'sueldo_fijo')),
  add column if not exists porcentaje_almenis integer not null default 30
    check (porcentaje_almenis between 0 and 100);

-- Snapshot congelado al momento de generar cada cierre diario: nullable,
-- porque las filas historicas ya existentes no tienen este dato (NUNCA se
-- debe asumir un valor por defecto para ellas, se muestran como "sin dato").
alter table public.cierres_profesional
  add column if not exists modalidad_pago text
    check (modalidad_pago is null or modalidad_pago in ('porcentaje', 'arriendo', 'sueldo_fijo')),
  add column if not exists porcentaje_almenis integer
    check (porcentaje_almenis is null or porcentaje_almenis between 0 and 100);

-- Configuracion real acordada con la clinica.
update public.usuarios set modalidad_pago = 'arriendo'
  where id in (
    '63c4251c-82b7-4954-84cf-49304ab1a4a1', -- dr. Pedro Jovino Bravo Crrisós
    '66a9306f-9b7f-42b8-9f9f-6cbe18ce9909'   -- Ps. Elena Meneses Ciuffardi
  );

update public.usuarios set modalidad_pago = 'porcentaje', porcentaje_almenis = 20
  where id in (
    '8e8237c4-e58e-4fcf-af9f-f303f985d6cb', -- Aimara Lizarzabal Tapia
    'd28e0027-9d44-4b27-981a-586e7dcee227'   -- Dr. Benjamin Palma Ramirez
  );

update public.usuarios set modalidad_pago = 'sueldo_fijo'
  where id = 'cb249c37-47b5-4280-a23a-3ab78784b046'; -- Camila Zuñiga (EXAMENES OTORRINO)

-- El resto de los profesionales queda con el default: porcentaje 30%.
