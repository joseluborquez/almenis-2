import { supabase } from './supabase'
import type { AtencionAnonimizada, ResultadoCierre } from '../types'

export async function generarCierre(
  atenciones: AtencionAnonimizada[],
  fecha: string
): Promise<ResultadoCierre> {
  const { data, error } = await supabase.functions.invoke('generar-cierre', {
    body: { atenciones, fecha },
  })

  if (error) throw new Error(`Error al generar cierre: ${error.message}`)
  if (!data?.resultado) throw new Error('Respuesta inválida del servidor')

  return data.resultado as ResultadoCierre
}
