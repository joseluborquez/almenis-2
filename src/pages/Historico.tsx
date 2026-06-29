import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Layout } from '../components/Layout'
import { TablaCierre } from '../components/TablaCierre'
import type { Usuario, ResultadoCierre } from '../types'

interface RegistroHistorico {
  fecha: string
  total_atenciones: number
  atendidos: number
  total_recaudado: number
  datos_json?: ResultadoCierre
  detalle_json?: any[]
  profesional_nombre?: string
}

interface Props {
  usuario: Usuario
}

function formatPesos(valor: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(valor)
}

export function Historico({ usuario }: Props) {
  const [registros, setRegistros] = useState<RegistroHistorico[]>([])
  const [seleccionado, setSeleccionado] = useState<RegistroHistorico | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarHistorico()
  }, [])

  const cargarHistorico = async () => {
    setLoading(true)
    setError('')
    try {
      if (usuario.rol === 'admin') {
        const { data, error: e } = await supabase
          .from('cierres_diarios')
          .select('fecha, total_atenciones, total_recaudado, datos_json')
          .order('fecha', { ascending: false })
          .limit(60)

        if (e) throw e
        setRegistros(data?.map(d => ({
          ...d,
          atendidos: d.datos_json?.cierre_general?.atendidos || 0,
        })) || [])
      } else {
        const { data, error: e } = await supabase
          .from('cierres_profesional')
          .select('fecha, total_atenciones, atendidos, total_recaudado, detalle_json, profesional_nombre')
          .eq('profesional_id', usuario.id)
          .order('fecha', { ascending: false })
          .limit(60)

        if (e) throw e
        setRegistros(data || [])
      }
    } catch (err: any) {
      setError(`Error al cargar histórico: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const verDetalle = (registro: RegistroHistorico) => {
    setSeleccionado(registro)
  }

  const resultadoParaDetalle = (registro: RegistroHistorico): ResultadoCierre | null => {
    if (usuario.rol === 'admin' && registro.datos_json) {
      return registro.datos_json
    }
    if (usuario.rol === 'profesional' && registro.detalle_json) {
      return {
        fecha: registro.fecha,
        cierre_general: {
          total_atenciones: registro.total_atenciones,
          atendidos: registro.atendidos,
          total_recaudado: registro.total_recaudado,
        },
        cierre_por_profesional: [{
          profesional: registro.profesional_nombre || usuario.profesional_nombre || '',
          total_atenciones: registro.total_atenciones,
          atendidos: registro.atendidos,
          total_recaudado: registro.total_recaudado,
          detalle: registro.detalle_json,
        }],
        items_sin_registro: [],
      }
    }
    return null
  }

  if (seleccionado) {
    const resultado = resultadoParaDetalle(seleccionado)
    const fechaF = new Date(seleccionado.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

    return (
      <Layout usuario={usuario}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => setSeleccionado(null)}
                className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2"
              >
                ← Volver al histórico
              </button>
              <h1 className="text-2xl font-bold text-slate-800 capitalize">{fechaF}</h1>
            </div>
          </div>
          {resultado && (
            <TablaCierre
              resultado={resultado}
              soloParaProfesional={usuario.rol === 'profesional' ? usuario.profesional_nombre || undefined : undefined}
            />
          )}
        </div>
      </Layout>
    )
  }

  return (
    <Layout usuario={usuario}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {usuario.rol === 'admin' ? 'Histórico de Cierres' : 'Mi Histórico'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Últimos 60 días</p>
        </div>

        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Cargando...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && registros.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-sm">No hay cierres registrados aún</p>
          </div>
        )}

        {!loading && !error && registros.length > 0 && (
          <>
            {/* Cards en mobile */}
            <div className="sm:hidden space-y-3">
              {registros.map((r, i) => {
                const fechaF = new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })
                return (
                  <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="text-sm font-semibold text-slate-700 capitalize leading-tight">{fechaF}</p>
                      <button
                        onClick={() => verDetalle(r)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                      >
                        Ver detalle →
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Agendados</p>
                        <p className="text-base font-medium text-slate-700">{r.total_atenciones}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Atendidos</p>
                        <p className="text-base font-medium text-green-600">{r.atendidos}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Recaudado</p>
                        <p className="text-base font-semibold text-slate-800">{formatPesos(r.total_recaudado)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Tabla en tablet/desktop */}
            <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Fecha</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Agendados</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Atendidos</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Recaudado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r, i) => {
                    const fechaF = new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                    })
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-3.5 text-slate-700 font-medium capitalize">{fechaF}</td>
                        <td className="px-4 py-3.5 text-center text-slate-600">{r.total_atenciones}</td>
                        <td className="px-4 py-3.5 text-center text-green-600 font-medium">{r.atendidos}</td>
                        <td className="px-6 py-3.5 text-right font-semibold text-slate-800">{formatPesos(r.total_recaudado)}</td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => verDetalle(r)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver detalle →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
