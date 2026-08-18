import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { CierreProfesionalMensualPreview } from '../types'

export interface AjusteManual {
  profesional_id: string | null
  profesional_nombre: string
  fecha: string
  monto: number
  motivo: string
}

export interface PreviewCierreMensual {
  anio: number
  mes: number
  cierre_por_profesional: CierreProfesionalMensualPreview[]
  total_atenciones: number
  total_recaudado: number
  dias_esperados: number
  dias_con_cierre: number
  dias_faltantes: string[]
  profesionales_pendientes: { profesional_nombre: string; fechas: string[] }[]
}

async function mensajeError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch {
      // respuesta sin JSON, se usa el mensaje genérico
    }
  }
  return (error as any)?.message ?? fallback
}

async function llamarGenerarCierreMensual(
  anio: number,
  mes: number,
  ajustes: AjusteManual[],
  confirmar: boolean
): Promise<PreviewCierreMensual & { cierre_mensual_id?: string }> {
  const { data, error } = await supabase.functions.invoke('generar-cierre-mensual', {
    body: { anio, mes, ajustes, confirmar },
  })

  if (error) throw new Error(await mensajeError(error, 'Error al generar el cierre mensual'))
  return data
}

export function previsualizarCierreMensual(anio: number, mes: number, ajustes: AjusteManual[]) {
  return llamarGenerarCierreMensual(anio, mes, ajustes, false)
}

export function confirmarCierreMensual(anio: number, mes: number, ajustes: AjusteManual[]) {
  return llamarGenerarCierreMensual(anio, mes, ajustes, true)
}
