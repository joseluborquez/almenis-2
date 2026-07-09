// "Hoy" en la zona horaria de la clínica (America/Santiago), formato YYYY-MM-DD.
// new Date().toISOString() devuelve la fecha en UTC: en Chile (UTC-3/-4) desde
// las ~20:00-21:00 el día UTC ya es "mañana", lo que hacía que el dashboard
// consultara la fecha equivocada y que la aceptación nocturna del cierre no
// encontrara ninguna fila que actualizar.
export function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}
