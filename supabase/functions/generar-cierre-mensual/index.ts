import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// "Hoy" en la zona horaria de la clínica — mismo criterio que src/lib/fechas.ts,
// duplicado aquí porque las Edge Functions no comparten bundle con el cliente.
function hoyChile(): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' })
    .format(new Date())
    .split('-')
    .map(Number)
  return { anio: partes[0], mes: partes[1], dia: partes[2] }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${pad2(mes)}-${pad2(dia)}`
}

// ── Tipos ─────────────────────────────────────────────────────────────────

interface CierreProfesionalFila {
  profesional_nombre: string
  profesional_id: string | null
  fecha: string
  total_atenciones: number
  atendidos: number
  total_recaudado: number
  aceptado: boolean
}

interface Usuario {
  id: string
  profesional_nombre: string | null
  modalidad_pago: string
  porcentaje_almenis: number
  monto_arriendo: number | null
  monto_sueldo_fijo: number | null
}

interface Ajuste {
  profesional_id: string | null
  profesional_nombre: string
  fecha: string
  monto: number
  motivo: string
}

interface DiaJson {
  fecha: string
  origen: 'aceptado' | 'no_aceptado' | 'ajuste_manual'
  monto: number
  motivo?: string | null
}

// ── Cálculo ───────────────────────────────────────────────────────────────

function calcularMontos(
  modalidad: string | null,
  totalRecaudado: number,
  porcentajeAlmenis: number | null,
  montoArriendo: number | null,
  montoSueldoFijo: number | null
): { monto_almenis: number | null; monto_profesional: number | null } {
  if (!modalidad) return { monto_almenis: null, monto_profesional: null }

  if (modalidad === 'porcentaje') {
    if (porcentajeAlmenis == null) return { monto_almenis: null, monto_profesional: null }
    const montoAlmenis = Math.round((totalRecaudado * porcentajeAlmenis) / 100)
    return { monto_almenis: montoAlmenis, monto_profesional: totalRecaudado - montoAlmenis }
  }

  if (modalidad === 'arriendo') {
    if (montoArriendo == null) return { monto_almenis: null, monto_profesional: null }
    return { monto_almenis: montoArriendo, monto_profesional: totalRecaudado - montoArriendo }
  }

  if (modalidad === 'sueldo_fijo') {
    if (montoSueldoFijo == null) return { monto_almenis: null, monto_profesional: null }
    return { monto_almenis: totalRecaudado - montoSueldoFijo, monto_profesional: montoSueldoFijo }
  }

  return { monto_almenis: null, monto_profesional: null }
}

function armarCierreMensual(
  filas: CierreProfesionalFila[],
  ajustes: Ajuste[],
  usuarios: Usuario[]
) {
  // Agrupar por profesional_id si existe; si no, por nombre (profesional sin
  // match a un usuario registrado — igual que en el cierre diario).
  const clave = (f: { profesional_id: string | null; profesional_nombre: string }) =>
    f.profesional_id ?? `nombre:${f.profesional_nombre}`

  const grupos = new Map<string, { profesional_id: string | null; profesional_nombre: string; filas: CierreProfesionalFila[] }>()
  for (const f of filas) {
    const k = clave(f)
    if (!grupos.has(k)) grupos.set(k, { profesional_id: f.profesional_id, profesional_nombre: f.profesional_nombre, filas: [] })
    grupos.get(k)!.filas.push(f)
  }
  // Profesionales que solo tienen ajustes manuales en días donde no hay ninguna
  // fila de cierres_profesional (ej: día completo sin cierre diario subido).
  for (const a of ajustes) {
    const k = a.profesional_id ?? `nombre:${a.profesional_nombre}`
    if (!grupos.has(k)) grupos.set(k, { profesional_id: a.profesional_id, profesional_nombre: a.profesional_nombre, filas: [] })
  }

  const porProfesional = Array.from(grupos.values()).map(g => {
    const ajustesProf = ajustes.filter(a => (a.profesional_id ?? `nombre:${a.profesional_nombre}`) === clave(g))
    const ajustePorFecha = new Map(ajustesProf.map(a => [a.fecha, a]))

    const dias: DiaJson[] = []
    let total_recaudado = 0
    let total_atenciones = 0
    let atendidos = 0
    const fechasVistas = new Set<string>()

    for (const fila of g.filas) {
      fechasVistas.add(fila.fecha)
      const ajuste = ajustePorFecha.get(fila.fecha)
      if (ajuste) {
        // El admin corrigió explícitamente el monto de este día: reemplaza
        // el valor reportado en el cierre diario.
        dias.push({ fecha: fila.fecha, origen: 'ajuste_manual', monto: ajuste.monto, motivo: ajuste.motivo })
        total_recaudado += ajuste.monto
      } else {
        // Se suma igual aunque el profesional aún no lo haya aceptado — el
        // monto reportado en el cierre diario es el mejor dato disponible.
        // El origen 'no_aceptado' se conserva para seguir advirtiendo al
        // admin (que puede corregir con un ajuste) y al profesional (que
        // puede aceptarlo desde su perfil).
        dias.push({ fecha: fila.fecha, origen: fila.aceptado ? 'aceptado' : 'no_aceptado', monto: fila.total_recaudado })
        total_recaudado += fila.total_recaudado
      }
      total_atenciones += fila.total_atenciones
      atendidos += fila.atendidos
    }

    for (const a of ajustesProf) {
      if (!fechasVistas.has(a.fecha)) {
        dias.push({ fecha: a.fecha, origen: 'ajuste_manual', monto: a.monto, motivo: a.motivo })
        total_recaudado += a.monto
      }
    }

    dias.sort((a, b) => a.fecha.localeCompare(b.fecha))

    const usuario = g.profesional_id ? usuarios.find(u => u.id === g.profesional_id) ?? null : null
    const modalidad_pago = usuario?.modalidad_pago ?? null
    const porcentaje_almenis = modalidad_pago === 'porcentaje' ? usuario?.porcentaje_almenis ?? null : null
    const monto_arriendo = modalidad_pago === 'arriendo' ? usuario?.monto_arriendo ?? null : null
    const monto_sueldo_fijo = modalidad_pago === 'sueldo_fijo' ? usuario?.monto_sueldo_fijo ?? null : null
    const { monto_almenis, monto_profesional } = calcularMontos(
      modalidad_pago, total_recaudado, porcentaje_almenis, monto_arriendo, monto_sueldo_fijo
    )

    return {
      profesional_nombre: g.profesional_nombre,
      profesional_id: g.profesional_id,
      total_atenciones,
      atendidos,
      total_recaudado,
      modalidad_pago,
      porcentaje_almenis,
      monto_arriendo,
      monto_sueldo_fijo,
      monto_almenis,
      monto_profesional,
      dias_json: dias,
    }
  })

  porProfesional.sort((a, b) => a.profesional_nombre.localeCompare(b.profesional_nombre))
  return porProfesional
}

// ── Persistencia ──────────────────────────────────────────────────────────

async function guardarCierreMensual(
  supabase: any,
  anio: number,
  mes: number,
  cierrePorProfesional: ReturnType<typeof armarCierreMensual>,
  meta: { dias_esperados: number; dias_con_cierre: number; dias_faltantes: string[]; profesionales_pendientes: any[] },
  userId: string
) {
  const dias_aceptados = cierrePorProfesional.reduce(
    (s, p) => s + p.dias_json.filter((d: DiaJson) => d.origen === 'aceptado').length, 0
  )
  const total_atenciones = cierrePorProfesional.reduce((s, p) => s + p.total_atenciones, 0)
  const total_recaudado = cierrePorProfesional.reduce((s, p) => s + p.total_recaudado, 0)

  const { data: cierreMensual, error: e1 } = await supabase
    .from('cierres_mensuales')
    .upsert({
      anio, mes,
      dias_esperados: meta.dias_esperados,
      dias_con_cierre: meta.dias_con_cierre,
      dias_aceptados,
      total_atenciones,
      total_recaudado,
      datos_json: { cierre_por_profesional: cierrePorProfesional, dias_faltantes: meta.dias_faltantes, profesionales_pendientes: meta.profesionales_pendientes },
      generado_por: userId,
    }, { onConflict: 'anio,mes' })
    .select()
    .single()

  if (e1) throw new Error(`Error guardando cierre mensual: ${e1.message}`)

  // Igual que en el cierre diario: no perder la aceptación/observación previa
  // del profesional si su detalle del mes no cambió al regenerar.
  const { data: previas } = await supabase
    .from('cierres_profesional_mensual')
    .select('profesional_nombre, aceptado, aceptado_at, comentario_profesional, dias_json')
    .eq('cierre_mensual_id', cierreMensual.id)

  const { error: eDelete } = await supabase
    .from('cierres_profesional_mensual')
    .delete()
    .eq('cierre_mensual_id', cierreMensual.id)
  if (eDelete) throw new Error(`Error limpiando cierres mensuales previos: ${eDelete.message}`)

  const filas = cierrePorProfesional.map(cp => {
    const previa = (previas ?? []).find((p: any) => p.profesional_nombre === cp.profesional_nombre)
    const diasIguales = previa && JSON.stringify(previa.dias_json) === JSON.stringify(cp.dias_json)
    return {
      cierre_mensual_id: cierreMensual.id,
      profesional_nombre: cp.profesional_nombre,
      profesional_id: cp.profesional_id,
      anio, mes,
      total_atenciones: cp.total_atenciones,
      atendidos: cp.atendidos,
      total_recaudado: cp.total_recaudado,
      modalidad_pago: cp.modalidad_pago,
      porcentaje_almenis: cp.porcentaje_almenis,
      monto_arriendo: cp.monto_arriendo,
      monto_sueldo_fijo: cp.monto_sueldo_fijo,
      monto_almenis: cp.monto_almenis,
      monto_profesional: cp.monto_profesional,
      dias_json: cp.dias_json,
      aceptado: diasIguales ? previa.aceptado : false,
      aceptado_at: diasIguales ? previa.aceptado_at : null,
      comentario_profesional: diasIguales ? previa.comentario_profesional : null,
    }
  })

  if (filas.length > 0) {
    const { error: e2 } = await supabase.from('cierres_profesional_mensual').insert(filas)
    if (e2) throw new Error(`Error guardando cierres por profesional del mes: ${e2.message}`)
  }

  return cierreMensual
}

// ── Handler principal ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('No autorizado', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return jsonError('No autorizado', 401)

    const { data: usuarioActual } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (usuarioActual?.rol !== 'admin') {
      return jsonError('Solo administradores pueden generar cierres mensuales', 403)
    }

    const body = await req.json()
    const anio = Number(body?.anio)
    const mes = Number(body?.mes)
    const confirmar = body?.confirmar === true
    const ajustesInput = Array.isArray(body?.ajustes) ? body.ajustes : []

    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
      return jsonError('anio inválido', 400)
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return jsonError('mes inválido (1-12)', 400)
    }

    const hoy = hoyChile()
    if (anio > hoy.anio || (anio === hoy.anio && mes > hoy.mes)) {
      return jsonError('No se puede generar el cierre de un mes futuro', 400)
    }

    const ajustes: Ajuste[] = ajustesInput.map((a: any) => ({
      profesional_id: a?.profesional_id ? String(a.profesional_id) : null,
      profesional_nombre: String(a?.profesional_nombre ?? ''),
      fecha: String(a?.fecha ?? ''),
      monto: Number.isFinite(Number(a?.monto)) ? Math.round(Number(a.monto)) : 0,
      motivo: String(a?.motivo ?? '').trim(),
    })).filter((a: Ajuste) => /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) && a.profesional_nombre)

    if (ajustes.some(a => !a.motivo)) {
      return jsonError('Todo ajuste manual debe indicar un motivo', 400)
    }

    const esMesActual = anio === hoy.anio && mes === hoy.mes
    const ultimoDiaCalendario = new Date(anio, mes, 0).getDate()
    const dias_esperados = esMesActual ? hoy.dia : ultimoDiaCalendario

    const inicio = fechaISO(anio, mes, 1)
    const fin = fechaISO(anio, mes, dias_esperados)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cierresDiarios, error: eDiarios } = await supabaseAdmin
      .from('cierres_diarios')
      .select('fecha')
      .gte('fecha', inicio)
      .lte('fecha', fin)

    if (eDiarios) throw new Error(`Error cargando cierres diarios: ${eDiarios.message}`)

    const fechasConCierre = new Set((cierresDiarios ?? []).map((c: any) => c.fecha))
    const dias_faltantes: string[] = []
    for (let d = 1; d <= dias_esperados; d++) {
      const f = fechaISO(anio, mes, d)
      if (!fechasConCierre.has(f)) dias_faltantes.push(f)
    }

    const { data: filasProfesional, error: eFilas } = await supabaseAdmin
      .from('cierres_profesional')
      .select('profesional_nombre, profesional_id, fecha, total_atenciones, atendidos, total_recaudado, aceptado')
      .gte('fecha', inicio)
      .lte('fecha', fin)

    if (eFilas) throw new Error(`Error cargando cierres por profesional: ${eFilas.message}`)

    const { data: usuarios, error: eUsuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, profesional_nombre, modalidad_pago, porcentaje_almenis, monto_arriendo, monto_sueldo_fijo')
      .eq('rol', 'profesional')

    if (eUsuarios) throw new Error(`Error cargando profesionales: ${eUsuarios.message}`)

    const cierre_por_profesional = armarCierreMensual(filasProfesional ?? [], ajustes, usuarios ?? [])

    const profesionales_pendientes = cierre_por_profesional
      .map(p => ({
        profesional_nombre: p.profesional_nombre,
        fechas: p.dias_json.filter((d: DiaJson) => d.origen === 'no_aceptado').map((d: DiaJson) => d.fecha),
      }))
      .filter(p => p.fechas.length > 0)

    const meta = {
      dias_esperados,
      dias_con_cierre: fechasConCierre.size,
      dias_faltantes,
      profesionales_pendientes,
    }

    if (!confirmar) {
      // Modo preview: no persiste nada, solo devuelve el cálculo y los warnings
      // para que el admin decida si agrega ajustes antes de confirmar.
      return new Response(JSON.stringify({
        anio, mes, cierre_por_profesional,
        total_atenciones: cierre_por_profesional.reduce((s, p) => s + p.total_atenciones, 0),
        total_recaudado: cierre_por_profesional.reduce((s, p) => s + p.total_recaudado, 0),
        ...meta,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const cierreMensual = await guardarCierreMensual(supabase, anio, mes, cierre_por_profesional, meta, user.id)

    return new Response(JSON.stringify({ cierre_mensual_id: cierreMensual.id, anio, mes, cierre_por_profesional, ...meta }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('generar-cierre-mensual error:', error)
    return jsonError('Error interno al generar el cierre mensual. Revisa los logs de la función.', 500)
  }
})
