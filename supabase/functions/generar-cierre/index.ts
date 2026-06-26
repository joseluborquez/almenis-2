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

  // 2. Contiene (en cualquier dirección)
  const contiene = catalogo.find(t => {
    const tn = normalizar(t.nombre)
    return tn.includes(norm) || norm.includes(tn)
  })
  if (contiene) return contiene

  // 3. Overlap de palabras clave (≥2 coincidencias, o ≥50% si hay pocas palabras)
  const palabrasNombre = palabrasClave(nombre)
  if (palabrasNombre.length === 0) return null

  let mejorMatch: Tratamiento | null = null
  let mejorScore = 0

  for (const t of catalogo) {
    const palabrasTrat = palabrasClave(t.nombre)
    const comunes = palabrasNombre.filter(p => palabrasTrat.includes(p))
    const score = comunes.length / Math.max(palabrasNombre.length, palabrasTrat.length)

    if (comunes.length >= 2 && score > mejorScore) {
      mejorScore = score
      mejorMatch = t
    } else if (comunes.length === 1 && palabrasNombre.length === 1 && score > mejorScore) {
      // Para tratamientos de 1 sola palabra clave (ej: "vHIT")
      mejorScore = score
      mejorMatch = t
    }
  }

  return mejorMatch
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

    const match = matchTratamiento(a.tratamiento, catalogo)
    const valor = match ? match.valor : 0

    if (!match) sinRegistro.add(a.tratamiento)

    porProfesional.get(prof)!.atenciones.push({
      tratamiento: match ? match.nombre : a.tratamiento,
      valor,
      estado: a.estado,
    })
  }

  const cierre_por_profesional = Array.from(porProfesional.entries()).map(([prof, data]) => {
    // Agrupar detalle por tratamiento+estado
    const detalleMap = new Map<string, { tratamiento: string; valor: number; estado: string; cantidad: number }>()

    for (const a of data.atenciones) {
      const key = `${a.tratamiento}|${a.estado}`
      if (detalleMap.has(key)) {
        detalleMap.get(key)!.cantidad++
      } else {
        detalleMap.set(key, { tratamiento: a.tratamiento, valor: a.valor, estado: a.estado, cantidad: 1 })
      }
    }

    const detalle = Array.from(detalleMap.values())
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

// ── Guardar en Supabase ──────────────────────────────────────────────────────

async function guardarCierre(supabase: any, resultado: any, fecha: string, userId: string) {
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

  await supabase.from('cierres_profesional').delete().eq('cierre_diario_id', cierreDiario.id)

  const profesionalNombres = resultado.cierre_por_profesional.map((c: any) => c.profesional)
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, profesional_nombre')
    .in('profesional_nombre', profesionalNombres)

  const nombreAId = new Map(usuarios?.map((u: any) => [u.profesional_nombre, u.id]) || [])

  const filas = resultado.cierre_por_profesional.map((cp: any) => ({
    cierre_diario_id: cierreDiario.id,
    profesional_nombre: cp.profesional,
    profesional_id: nombreAId.get(cp.profesional) || null,
    total_atenciones: cp.total_atenciones,
    atendidos: cp.atendidos,
    total_recaudado: cp.total_recaudado,
    detalle_json: cp.detalle,
    fecha,
  }))

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

    if (!atenciones || !fecha) {
      return new Response(JSON.stringify({ error: 'Datos incompletos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cargar catálogo de tratamientos desde Supabase (usando service role para evitar RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: catalogo, error: eCatalogo } = await supabaseAdmin
      .from('tratamientos')
      .select('id, nombre, valor, gratuito')

    if (eCatalogo) throw new Error(`Error cargando tratamientos: ${eCatalogo.message}`)

    const resultado = generarCierre(atenciones, catalogo ?? [], fecha)

    await guardarCierre(supabase, resultado, fecha, user.id)

    return new Response(JSON.stringify({ resultado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
