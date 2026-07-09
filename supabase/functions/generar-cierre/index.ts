import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Matching sin IA ──────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras cortas o genéricas que no aportan al match
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'en', 'y', 'a', 'al', 'por'])

function palabrasClave(s: string): string[] {
  return normalizar(s)
    .split(' ')
    .filter(p => p.length > 2 && !STOPWORDS.has(p))
}

// Títulos profesionales: no cuentan como palabra en común al matchear nombres.
// Sin este filtro, "Dra. Nueva Persona" (no registrada) compartía "dra." con
// cualquier doctora registrada y sus atenciones se asignaban al usuario
// equivocado — un profesional terminaba viendo montos de un colega.
const TITULOS = new Set([
  'dr', 'dr.', 'dra', 'dra.', 'ps', 'ps.', 'flga', 'flga.', 'flgo', 'flgo.',
  't.o', 't.o.', 'klga', 'klga.', 'klgo', 'klgo.', 'mat', 'mat.', 'nut', 'nut.',
])

function palabrasNombreProfesional(s: string): string[] {
  return palabrasClave(s).filter(p => !TITULOS.has(p))
}

interface Tratamiento {
  id: number
  nombre: string
  valor: number
  gratuito: boolean
}

function matchTratamiento(nombre: string, catalogo: Tratamiento[]): Tratamiento | null {
  const norm = normalizar(nombre)

  // 1. Exacto
  const exacto = catalogo.find(t => normalizar(t.nombre) === norm)
  if (exacto) return exacto

  // 2a. El nombre del catálogo está contenido en el texto del PDF: se elige el
  // más largo (más específico) para no resolver el empate al azar según el
  // orden en que la BD devuelva las filas.
  const dentroDelPdf = catalogo.filter(t => norm.includes(normalizar(t.nombre)))
  if (dentroDelPdf.length > 0) {
    return dentroDelPdf.reduce((a, b) =>
      normalizar(b.nombre).length > normalizar(a.nombre).length ? b : a)
  }

  // 2b. El texto del PDF está contenido en nombres del catálogo. Si hay varios
  // candidatos con valores distintos (ej: variante Fonasa vs Particular) el
  // match es ambiguo: es más seguro dejarlo "sin registro" para revisión manual
  // que adivinar un precio.
  const contienenPdf = catalogo.filter(t => normalizar(t.nombre).includes(norm))
  if (contienenPdf.length === 1) return contienenPdf[0]
  if (contienenPdf.length > 1) {
    const valores = new Set(contienenPdf.map(t => t.valor))
    return valores.size === 1 ? contienenPdf[0] : null
  }

  // 3. Overlap de palabras clave (≥2 coincidencias, o 1 si el nombre tiene una
  // sola palabra clave, ej: "vHIT"). Un empate de score entre tratamientos con
  // valores distintos también es ambiguo → sin registro.
  const palabrasNombre = palabrasClave(nombre)
  if (palabrasNombre.length === 0) return null

  let mejorMatch: Tratamiento | null = null
  let mejorScore = 0
  let empateConValorDistinto = false

  for (const t of catalogo) {
    const palabrasTrat = palabrasClave(t.nombre)
    const comunes = palabrasNombre.filter(p => palabrasTrat.includes(p))
    const califica = comunes.length >= 2 || (comunes.length === 1 && palabrasNombre.length === 1)
    if (!califica) continue

    const score = comunes.length / Math.max(palabrasNombre.length, palabrasTrat.length)
    if (score > mejorScore) {
      mejorScore = score
      mejorMatch = t
      empateConValorDistinto = false
    } else if (score === mejorScore && mejorMatch && t.valor !== mejorMatch.valor) {
      empateConValorDistinto = true
    }
  }

  return empateConValorDistinto ? null : mejorMatch
}

// ── Generación del cierre ────────────────────────────────────────────────────

interface AtencionAnonimizada {
  hora: string
  tratamiento: string
  estado: string
  profesional: string
}

function generarCierre(atenciones: AtencionAnonimizada[], catalogo: Tratamiento[], fecha: string) {
  const porProfesional = new Map<string, {
    atenciones: Array<{ tratamiento: string; valor: number; estado: string }>
  }>()

  const sinRegistro = new Set<string>()

  for (const a of atenciones) {
    const prof = a.profesional.trim()
    if (!porProfesional.has(prof)) {
      porProfesional.set(prof, { atenciones: [] })
    }

    // Si el campo contiene comas, puede ser un tratamiento combinado (varios
    // servicios en una sola cita). Se busca el valor de cada parte por separado
    // y se suman, pero se guarda como UNA sola entrada con el nombre completo.
    const partes = a.tratamiento.split(',').map(p => p.trim()).filter(Boolean)
    let valorTotal = 0
    const sinMatch: string[] = []

    for (const parte of partes) {
      const match = matchTratamiento(parte, catalogo)
      if (match) {
        valorTotal += match.valor
      } else {
        sinMatch.push(parte)
      }
    }

    // Solo se registra como sin-registro si NINGUNA parte tuvo match
    if (sinMatch.length === partes.length) sinRegistro.add(a.tratamiento)

    porProfesional.get(prof)!.atenciones.push({
      tratamiento: a.tratamiento,
      valor: valorTotal,
      estado: a.estado,
    })
  }

  const cierre_por_profesional = Array.from(porProfesional.entries()).map(([prof, data]) => {
    // Sin agrupamiento: cada paciente es una fila independiente aunque tenga el mismo tratamiento
    const detalle = data.atenciones.map(a => ({
      tratamiento: a.tratamiento,
      valor: a.valor,
      estado: a.estado,
      cantidad: 1,
    }))
    const cuentaParaTotal = (estado: string) => estado === 'Atendido'
    const atendidos = data.atenciones.filter(a => cuentaParaTotal(a.estado)).length
    const total_recaudado = data.atenciones
      .filter(a => cuentaParaTotal(a.estado))
      .reduce((sum, a) => sum + a.valor, 0)

    return {
      profesional: prof,
      total_atenciones: data.atenciones.length,
      atendidos,
      total_recaudado,
      detalle,
    }
  })

  const cierre_general = {
    total_atenciones: atenciones.length,
    atendidos: cierre_por_profesional.reduce((s, p) => s + p.atendidos, 0),
    total_recaudado: cierre_por_profesional.reduce((s, p) => s + p.total_recaudado, 0),
  }

  return {
    fecha,
    cierre_general,
    cierre_por_profesional,
    items_sin_registro: Array.from(sinRegistro),
    atenciones, // guardadas para permitir reedición desde el dashboard
  }
}

// ── Matching de profesionales contra usuarios registrados ────────────────────

interface Usuario {
  id: string
  profesional_nombre: string
  modalidad_pago?: string
  porcentaje_almenis?: number
}

function matchUsuarioPorNombre(pdfNombre: string, usuarios: Usuario[]): Usuario | null {
  const norm = normalizar(pdfNombre)
  // 1. Exacto
  const exacto = usuarios.find(u => normalizar(u.profesional_nombre) === norm)
  if (exacto) return exacto
  // 2. Contiene (el nombre del PDF está dentro del nombre completo o viceversa)
  const contiene = usuarios.find(u => {
    const un = normalizar(u.profesional_nombre)
    return un.includes(norm) || norm.includes(un)
  })
  if (contiene) return contiene
  // 3. Overlap de palabras clave (≥1 palabra en común, excluyendo títulos como
  // "Dra." o "Flga" que comparten varios profesionales)
  const palabrasNombre = palabrasNombreProfesional(pdfNombre)
  let mejor: Usuario | null = null
  let mejorScore = 0
  for (const u of usuarios) {
    const palabrasU = palabrasNombreProfesional(u.profesional_nombre)
    if (palabrasU.length === 0) continue
    const comunes = palabrasNombre.filter(p => palabrasU.includes(p))
    const score = comunes.length / Math.max(palabrasNombre.length, palabrasU.length)
    if (comunes.length >= 1 && score > mejorScore) {
      mejorScore = score
      mejor = u
    }
  }
  return mejor
}

// ── Guardar en Supabase ──────────────────────────────────────────────────────

async function guardarCierre(supabase: any, resultado: any, fecha: string, userId: string, usuarios: Usuario[]) {
  // Snapshot de la modalidad de pago vigente al momento de generar el cierre:
  // queda congelada aunque el profesional cambie su % más adelante.
  const sinMatch: string[] = []
  for (const cp of resultado.cierre_por_profesional) {
    const match = matchUsuarioPorNombre(cp.profesional, usuarios)
    if (match) {
      cp.modalidad_pago = match.modalidad_pago ?? 'porcentaje'
      cp.porcentaje_almenis = cp.modalidad_pago === 'porcentaje' ? (match.porcentaje_almenis ?? 30) : null
    } else {
      cp.modalidad_pago = 'porcentaje'
      cp.porcentaje_almenis = 30
      sinMatch.push(cp.profesional)
    }
  }
  resultado.profesionales_sin_match = sinMatch

  const { data: cierreDiario, error: e1 } = await supabase
    .from('cierres_diarios')
    .upsert({
      fecha,
      total_atenciones: resultado.cierre_general.total_atenciones,
      total_recaudado: resultado.cierre_general.total_recaudado,
      datos_json: resultado,
      creado_por: userId,
    }, { onConflict: 'fecha' })
    .select()
    .single()

  if (e1) throw new Error(`Error guardando cierre diario: ${e1.message}`)

  // Al regenerar el cierre del día no se debe perder la aceptación/observación
  // que el profesional ya registró, siempre que su detalle no haya cambiado.
  const { data: previas } = await supabase
    .from('cierres_profesional')
    .select('profesional_nombre, aceptado, aceptado_at, comentario_profesional, detalle_json')
    .eq('cierre_diario_id', cierreDiario.id)

  const { error: eDelete } = await supabase
    .from('cierres_profesional')
    .delete()
    .eq('cierre_diario_id', cierreDiario.id)
  if (eDelete) throw new Error(`Error limpiando cierres previos: ${eDelete.message}`)

  const filas = resultado.cierre_por_profesional.map((cp: any) => {
    const previa = (previas ?? []).find((p: any) => p.profesional_nombre === cp.profesional)
    const detalleIgual = previa && JSON.stringify(previa.detalle_json) === JSON.stringify(cp.detalle)
    return {
      cierre_diario_id: cierreDiario.id,
      profesional_nombre: cp.profesional,
      profesional_id: matchUsuarioPorNombre(cp.profesional, usuarios)?.id ?? null,
      total_atenciones: cp.total_atenciones,
      atendidos: cp.atendidos,
      total_recaudado: cp.total_recaudado,
      detalle_json: cp.detalle,
      fecha,
      modalidad_pago: cp.modalidad_pago,
      porcentaje_almenis: cp.porcentaje_almenis,
      aceptado: detalleIgual ? previa.aceptado : false,
      aceptado_at: detalleIgual ? previa.aceptado_at : null,
      comentario_profesional: detalleIgual ? previa.comentario_profesional : null,
    }
  })

  const { error: e2 } = await supabase.from('cierres_profesional').insert(filas)
  if (e2) throw new Error(`Error guardando cierres por profesional: ${e2.message}`)
}

// ── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (usuario?.rol !== 'admin') {
      return new Response(JSON.stringify({ error: 'Solo administradores pueden generar cierres' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { atenciones, fecha } = await req.json()

    if (!Array.isArray(atenciones) || atenciones.length === 0 || atenciones.length > 500) {
      return new Response(JSON.stringify({ error: 'atenciones debe ser una lista de 1 a 500 elementos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return new Response(JSON.stringify({ error: 'fecha inválida (formato esperado YYYY-MM-DD)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sanitizar: solo los 4 campos esperados, siempre como string — lo que se
    // guarda en datos_json no debe arrastrar campos extra del cliente
    const atencionesLimpias: AtencionAnonimizada[] = atenciones.map((a: any) => ({
      hora: String(a?.hora ?? ''),
      tratamiento: String(a?.tratamiento ?? ''),
      estado: String(a?.estado ?? ''),
      profesional: String(a?.profesional ?? ''),
    }))

    // Cargar catálogo de tratamientos desde Supabase (usando service role para evitar RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: catalogo, error: eCatalogo } = await supabaseAdmin
      .from('tratamientos')
      .select('id, nombre, valor, gratuito')

    if (eCatalogo) throw new Error(`Error cargando tratamientos: ${eCatalogo.message}`)

    const { data: usuarios } = await supabaseAdmin
      .from('usuarios')
      .select('id, profesional_nombre, modalidad_pago, porcentaje_almenis')
      .eq('rol', 'profesional')

    // Canonizar el nombre de profesional contra los usuarios registrados antes
    // de agrupar: el PDF a veces mezcla texto extra (comentarios/notas) en la
    // columna Box/Prof, lo que produce variantes del mismo nombre y termina
    // duplicando la tarjeta del profesional en el cierre.
    const atencionesCanonizadas: AtencionAnonimizada[] = atencionesLimpias.map((a) => {
      const match = matchUsuarioPorNombre(a.profesional, usuarios ?? [])
      return match ? { ...a, profesional: match.profesional_nombre } : a
    })

    const resultado = generarCierre(atencionesCanonizadas, catalogo ?? [], fecha)

    await guardarCierre(supabase, resultado, fecha, user.id, usuarios ?? [])

    return new Response(JSON.stringify({ resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    // El detalle queda en los logs de la función; al cliente solo un mensaje genérico
    console.error('generar-cierre error:', error)
    return new Response(JSON.stringify({ error: 'Error interno al generar el cierre. Revisa los logs de la función.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
