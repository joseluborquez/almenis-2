import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { Layout } from '../components/Layout'
import { TablaCierre } from '../components/TablaCierre'
import type { Usuario, ResultadoCierre, CierreProfesional } from '../types'

interface Props {
  usuario: Usuario
}

const CIERRE_DEMO: ResultadoCierre = {
  fecha: new Date().toISOString().split('T')[0],
  cierre_general: { total_atenciones: 8, atendidos: 5, total_recaudado: 220130 },
  cierre_por_profesional: [
    {
      profesional: 'Dra. Magdalena Sepúlveda Suárez',
      total_atenciones: 2, atendidos: 2, total_recaudado: 30260,
      detalle: [{ tratamiento: 'Consulta Medicina General Fonasa', valor: 15130, estado: 'Atendido', cantidad: 2 }],
    },
    {
      profesional: 'EXAMENES OTORRINO',
      total_atenciones: 4, atendidos: 2, total_recaudado: 110000,
      detalle: [
        { tratamiento: 'VIII Par con Videonistagmografía', valor: 80000, estado: 'Atendido', cantidad: 1 },
        { tratamiento: 'Rehabilitación Vestibular', valor: 30000, estado: 'Atendido', cantidad: 1 },
        { tratamiento: 'Evaluación rehabilitación vestibular', valor: 30000, estado: 'Confirmado', cantidad: 1 },
        { tratamiento: 'Control de audífono', valor: 0, estado: 'No Confirmado', cantidad: 1 },
      ],
    },
    {
      profesional: 'Flga Javiera Medina',
      total_atenciones: 2, atendidos: 1, total_recaudado: 79870,
      detalle: [
        { tratamiento: 'Evaluación Fonoaudiología Infantil', valor: 28000, estado: 'Atendido', cantidad: 1 },
        { tratamiento: 'Fonoaudiología Infantil Fonasa', valor: 18340, estado: 'Confirmado', cantidad: 1 },
      ],
    },
  ],
  items_sin_registro: ['Fonoaudiología Infantil Fonasa'],
}

export function Dashboard({ usuario }: Props) {
  const [cierreHoy, setCierreHoy] = useState<ResultadoCierre | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const hoy = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!supabaseConfigured) {
      setCierreHoy(CIERRE_DEMO)
      setLoading(false)
      return
    }
    cargarCierreHoy()
  }, [])

  const cargarCierreHoy = async () => {
    setLoading(true)
    setError('')
    try {
      if (usuario.rol === 'admin') {
        const { data, error: e } = await supabase
          .from('cierres_diarios')
          .select('datos_json')
          .eq('fecha', hoy)
          .single()
        if (e && e.code !== 'PGRST116') throw e
        setCierreHoy(data?.datos_json || null)
      } else {
        // Puede haber múltiples filas para el mismo profesional (nombres distintos en el PDF)
        const { data: filas, error: e } = await supabase
          .from('cierres_profesional')
          .select('*')
          .eq('fecha', hoy)
          .eq('profesional_id', usuario.id)
        if (e) throw e
        if (filas && filas.length > 0) {
          const detalle = filas.flatMap(f => f.detalle_json ?? [])
          const atendidos = filas.reduce((s, f) => s + (f.atendidos ?? 0), 0)
          const total_recaudado = filas.reduce((s, f) => s + (f.total_recaudado ?? 0), 0)
          const total_atenciones = filas.reduce((s, f) => s + (f.total_atenciones ?? 0), 0)
          setCierreHoy({
            fecha: hoy,
            cierre_general: { total_atenciones, atendidos, total_recaudado },
            cierre_por_profesional: [{
              profesional: usuario.nombre_completo,
              total_atenciones,
              atendidos,
              total_recaudado,
              detalle,
            }],
            items_sin_registro: [],
          })
        }
      }
    } catch (err: any) {
      setError(`Error al cargar el cierre: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const actualizarProfesional = async (nombreProf: string, actualizado: CierreProfesional) => {
    if (!cierreHoy) return

    // Reconstruir resultado con el profesional actualizado
    const nuevoProfesionales = cierreHoy.cierre_por_profesional.map(p =>
      p.profesional === nombreProf ? actualizado : p
    )
    const nuevoResultado: ResultadoCierre = {
      ...cierreHoy,
      cierre_por_profesional: nuevoProfesionales,
      cierre_general: {
        ...cierreHoy.cierre_general,
        atendidos: nuevoProfesionales.reduce((s, p) => s + p.atendidos, 0),
        total_recaudado: nuevoProfesionales.reduce((s, p) => s + p.total_recaudado, 0),
      },
    }

    // Guardar en Supabase directamente (admin tiene RLS)
    const { error: e1 } = await supabase
      .from('cierres_diarios')
      .update({
        total_recaudado: nuevoResultado.cierre_general.total_recaudado,
        datos_json: nuevoResultado,
      })
      .eq('fecha', hoy)

    if (e1) throw new Error(e1.message)

    const { error: e2 } = await supabase
      .from('cierres_profesional')
      .update({
        atendidos: actualizado.atendidos,
        total_recaudado: actualizado.total_recaudado,
        detalle_json: actualizado.detalle,
      })
      .eq('fecha', hoy)
      .eq('profesional_nombre', nombreProf)

    if (e2) throw new Error(e2.message)

    setCierreHoy(nuevoResultado)
  }

  const fechaFormateada = new Date(hoy + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Layout usuario={usuario}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 truncate">
              {usuario.rol === 'admin' ? 'Cierre de Hoy' : 'Mi Cierre'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5 capitalize">{fechaFormateada}</p>
          </div>
          {usuario.rol === 'admin' && !cierreHoy && !loading && (
            <a href="/subir" className="text-sm px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0">
              Generar →
            </a>
          )}
        </div>

        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Cargando...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && !cierreHoy && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-slate-800 font-medium mb-1">No hay cierre para hoy</p>
            {usuario.rol === 'admin'
              ? <p className="text-slate-500 text-sm">Sube el PDF de Reservo para generar el cierre del día</p>
              : <p className="text-slate-500 text-sm">La recepcionista aún no ha generado el cierre de hoy</p>
            }
          </div>
        )}

        {!loading && !error && cierreHoy && (
          <TablaCierre
            resultado={cierreHoy}
            soloParaProfesional={usuario.rol === 'profesional' ? usuario.profesional_nombre || undefined : undefined}
            isAdmin={usuario.rol === 'admin'}
            onActualizarProfesional={actualizarProfesional}
          />
        )}
      </div>
    </Layout>
  )
}
