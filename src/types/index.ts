export interface AtencionAnonimizada {
  hora: string
  tratamiento: string
  estado: string
  profesional: string
}

export interface Tratamiento {
  id: number
  nombre: string
  categoria: string | null
  valor: number
  gratuito: boolean
}

export interface DetalleItem {
  tratamiento: string
  valor: number
  estado: string
  cantidad: number
}

export type ModalidadPago = 'porcentaje' | 'arriendo' | 'sueldo_fijo'

export interface CierreProfesional {
  profesional: string
  total_atenciones: number
  atendidos: number
  total_recaudado: number
  detalle: DetalleItem[]
  aceptado?: boolean
  aceptado_at?: string | null
  comentario_profesional?: string | null
  // Snapshot de la modalidad de pago vigente al generar el cierre. Ausente
  // (undefined/null) en cierres generados antes de esta funcionalidad.
  modalidad_pago?: ModalidadPago | null
  porcentaje_almenis?: number | null
}

export interface CierreGeneral {
  total_atenciones: number
  atendidos: number
  total_recaudado: number
}

export interface ResultadoCierre {
  fecha: string
  cierre_general: CierreGeneral
  cierre_por_profesional: CierreProfesional[]
  items_sin_registro: string[]
  atenciones?: AtencionAnonimizada[]
  // Nombres de profesionales del PDF que no matchearon ningún usuario
  // registrado — quedaron con la modalidad por defecto (porcentaje 30%).
  profesionales_sin_match?: string[]
}

export interface Usuario {
  id: string
  email: string
  nombre_completo: string
  rol: 'admin' | 'profesional'
  profesional_nombre: string | null
}

export interface DiaCierreMensual {
  fecha: string
  origen: 'aceptado' | 'no_aceptado' | 'ajuste_manual'
  monto: number
  motivo?: string | null
}

// Campos que ya calcula la Edge Function en modo preview (sin persistir).
export interface CierreProfesionalMensualPreview {
  profesional_nombre: string
  profesional_id: string | null
  total_atenciones: number
  atendidos: number
  total_recaudado: number
  modalidad_pago: ModalidadPago | null
  porcentaje_almenis: number | null
  monto_arriendo: number | null
  monto_sueldo_fijo: number | null
  monto_almenis: number | null
  monto_profesional: number | null
  dias_json: DiaCierreMensual[]
}

export interface CierreProfesionalMensual extends CierreProfesionalMensualPreview {
  id: string
  cierre_mensual_id: string
  anio: number
  mes: number
  aceptado: boolean
  aceptado_at: string | null
  comentario_profesional: string | null
}

export interface CierreMensual {
  id: string
  anio: number
  mes: number
  dias_esperados: number
  dias_con_cierre: number
  dias_aceptados: number
  total_atenciones: number
  total_recaudado: number
  datos_json: {
    cierre_por_profesional: CierreProfesionalMensual[]
    dias_faltantes: string[]
    profesionales_pendientes: { profesional_nombre: string; fechas: string[] }[]
  }
  created_at: string
}

export interface CierreDiario {
  id: string
  fecha: string
  total_atenciones: number
  total_recaudado: number
  datos_json: ResultadoCierre
  created_at: string
}

export interface CierreProfesionalDB {
  id: string
  cierre_diario_id: string
  profesional_nombre: string
  profesional_id: string | null
  total_atenciones: number
  atendidos: number
  total_recaudado: number
  detalle_json: DetalleItem[]
  fecha: string
  aceptado: boolean
  aceptado_at: string | null
  comentario_profesional: string | null
}
