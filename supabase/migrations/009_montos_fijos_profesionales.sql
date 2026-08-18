-- ============================================================
-- Montos reales para modalidades 'arriendo' y 'sueldo_fijo'
-- ============================================================
-- Hasta ahora modalidad_pago solo determinaba un switch binario sobre el
-- recaudado del dia (arriendo = 0% a Almenis, sueldo_fijo = 100% a Almenis),
-- sin registrar el monto real pactado. El cierre mensual necesita ese monto
-- real (arriendo que paga el profesional / sueldo que paga Almenis) para
-- calcular el ingreso neto real, asi que se agrega como config editable.

alter table public.usuarios
  add column if not exists monto_arriendo integer
    check (monto_arriendo is null or monto_arriendo >= 0),
  add column if not exists monto_sueldo_fijo integer
    check (monto_sueldo_fijo is null or monto_sueldo_fijo >= 0);

comment on column public.usuarios.monto_arriendo is
  'Monto mensual (CLP) que el profesional paga a Almenis cuando modalidad_pago = arriendo.';
comment on column public.usuarios.monto_sueldo_fijo is
  'Monto mensual (CLP) que Almenis paga al profesional cuando modalidad_pago = sueldo_fijo.';
