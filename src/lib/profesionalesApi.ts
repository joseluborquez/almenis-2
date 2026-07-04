import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { ModalidadPago } from '../types'

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

export async function crearProfesional(datos: {
  email: string
  password: string
  nombre_completo: string
  profesional_nombre: string
}): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('gestionar-profesionales', {
    body: { accion: 'crear', ...datos },
  })

  if (error) throw new Error(await mensajeError(error, 'Error al crear profesional'))

  return data
}

export async function eliminarProfesional(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('gestionar-profesionales', {
    body: { accion: 'eliminar', id },
  })

  if (error) throw new Error(await mensajeError(error, 'Error al eliminar profesional'))
}

export async function actualizarModalidad(
  id: string,
  modalidad_pago: ModalidadPago,
  porcentaje_almenis: number
): Promise<void> {
  const { error } = await supabase.functions.invoke('gestionar-profesionales', {
    body: { accion: 'actualizar_modalidad', id, modalidad_pago, porcentaje_almenis },
  })

  if (error) throw new Error(await mensajeError(error, 'Error al actualizar la modalidad de pago'))
}
