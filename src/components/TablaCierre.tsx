import { useState } from 'react'
import type { CierreProfesional, DetalleItem, ResultadoCierre } from '../types'

const ESTADOS = ['Atendido', 'Confirmado', 'Llegó', 'En atención', 'No Confirmado', 'Suspendió', 'No llegó']

function formatPesos(valor: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(valor)
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function recalcularProfesional(detalle: DetalleItem[]): Pick<CierreProfesional, 'atendidos' | 'total_recaudado'> {
  const atendidos = detalle.filter(d => d.estado === 'Atendido').reduce((s, d) => s + d.cantidad, 0)
  const total_recaudado = detalle.filter(d => d.estado === 'Atendido').reduce((s, d) => s + d.valor * d.cantidad, 0)
  return { atendidos, total_recaudado }
}

function EstadoBadge({ estado }: { estado: string }) {
  const clases: Record<string, string> = {
    'Atendido':      'bg-green-100 text-green-700',
    'Suspendió':     'bg-yellow-100 text-yellow-700',
    'Llegó':         'bg-blue-100 text-blue-700',
    'En atención':   'bg-purple-100 text-purple-700',
    'Confirmado':    'bg-slate-100 text-slate-600',
    'No Confirmado': 'bg-slate-100 text-slate-400',
    'No llegó':      'bg-red-100 text-red-600',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${clases[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado}
    </span>
  )
}

function AceptacionBadge({ aceptado, comentario }: { aceptado: boolean; comentario?: string | null }) {
  if (!aceptado) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-400">
        Pendiente
      </span>
    )
  }
  if (comentario) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
        Con observación
      </span>
    )
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
      ✓ Aceptado
    </span>
  )
}

interface TarjetaProps {
  cierre: CierreProfesional
  isAdmin: boolean
  onGuardar: (actualizado: CierreProfesional) => Promise<void>
  onAceptar?: (comentario?: string) => Promise<void>
}

function TarjetaProfesional({ cierre, isAdmin, onGuardar, onAceptar }: TarjetaProps) {
  const [editando, setEditando] = useState(false)
  const [detalle, setDetalle] = useState<DetalleItem[]>(cierre.detalle)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [mostrarObservacion, setMostrarObservacion] = useState(false)
  const [comentarioLocal, setComentarioLocal] = useState('')
  const [aceptando, setAceptando] = useState(false)
  const [errorAceptar, setErrorAceptar] = useState('')

  const { atendidos, total_recaudado } = recalcularProfesional(detalle)

  const cambiarEstado = (idx: number, nuevoEstado: string) => {
    setDetalle(prev => prev.map((d, i) => i === idx ? { ...d, estado: nuevoEstado } : d))
  }

  const handleGuardar = async () => {
    setGuardando(true)
    setError('')
    try {
      await onGuardar({ ...cierre, detalle, atendidos, total_recaudado })
      setEditando(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleCancelar = () => {
    setDetalle(cierre.detalle)
    setEditando(false)
    setError('')
  }

  const handleAceptar = async (comentario?: string) => {
    if (!onAceptar) return
    setAceptando(true)
    setErrorAceptar('')
    try {
      await onAceptar(comentario)
      setMostrarObservacion(false)
      setComentarioLocal('')
    } catch (e: any) {
      setErrorAceptar(e.message)
    } finally {
      setAceptando(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm sm:text-base truncate">{cierre.profesional}</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 items-center">
            <span className="text-xs text-slate-500">
              {cierre.total_atenciones} agend. · <span className="text-green-600 font-medium">{atendidos} atend.</span>
            </span>
            <span className="text-xs font-semibold text-blue-700">{formatPesos(total_recaudado)}</span>
            {isAdmin && cierre.aceptado !== undefined && (
              <AceptacionBadge aceptado={cierre.aceptado} comentario={cierre.comentario_profesional} />
            )}
          </div>
        </div>
        {isAdmin && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-white hover:text-slate-700 transition-colors shrink-0"
          >
            Editar
          </button>
        )}
        {isAdmin && editando && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleCancelar}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {guardando ? '...' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {detalle.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-400 italic">Sin atenciones registradas</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[340px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="px-4 sm:px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Servicio</th>
                <th className="px-2 sm:px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide text-center w-10">Cant.</th>
                <th className="px-2 sm:px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 sm:px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((item, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 sm:px-5 py-2 sm:py-2.5 text-slate-700 text-xs sm:text-sm">{item.tratamiento}</td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5 text-center text-slate-600 text-xs sm:text-sm">{item.cantidad}</td>
                  <td className="px-2 sm:px-3 py-2 sm:py-2.5">
                    {editando ? (
                      <select
                        value={item.estado}
                        onChange={e => cambiarEstado(i, e.target.value)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:ring-1 focus:ring-blue-400 outline-none
                          ${item.estado === 'Atendido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <EstadoBadge estado={item.estado} />
                    )}
                  </td>
                  <td className="px-4 sm:px-5 py-2 sm:py-2.5 text-right font-medium text-slate-800 text-xs sm:text-sm whitespace-nowrap">
                    {item.valor > 0 && item.estado === 'Atendido'
                      ? formatPesos(item.valor * item.cantidad)
                      : <span className="text-slate-400">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50">
                <td className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-blue-800" colSpan={3}>Total recaudado</td>
                <td className="px-4 sm:px-5 py-2.5 text-right font-bold text-blue-800 text-xs sm:text-sm whitespace-nowrap">{formatPesos(total_recaudado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Sección de aceptación — solo visible al profesional cuando se pasa onAceptar */}
      {onAceptar && (
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100">
          {cierre.aceptado ? (
            /* Estado: ya aceptado */
            <div className={`flex items-start gap-2 text-sm ${cierre.comentario_profesional ? 'text-amber-700' : 'text-green-700'}`}>
              <span className="mt-0.5 text-base leading-none">{cierre.comentario_profesional ? '⚠' : '✓'}</span>
              <div>
                <span className="font-medium">
                  {cierre.comentario_profesional ? 'Cierre aceptado con observación' : 'Cierre aceptado'}
                </span>
                {cierre.aceptado_at && (
                  <span className="text-xs ml-2 opacity-60">{formatFechaHora(cierre.aceptado_at)}</span>
                )}
                {cierre.comentario_profesional && (
                  <p className="text-xs mt-1 opacity-80 italic">"{cierre.comentario_profesional}"</p>
                )}
              </div>
            </div>
          ) : mostrarObservacion ? (
            /* Estado: escribiendo observación */
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Describe la irregularidad:</p>
              <textarea
                value={comentarioLocal}
                onChange={e => setComentarioLocal(e.target.value)}
                placeholder="Ej: El valor de la consulta no coincide con lo acordado..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
              />
              {errorAceptar && <p className="text-xs text-red-600">{errorAceptar}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setMostrarObservacion(false); setComentarioLocal(''); setErrorAceptar('') }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleAceptar(comentarioLocal.trim() || undefined)}
                  disabled={aceptando || !comentarioLocal.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {aceptando ? 'Enviando...' : 'Enviar observación'}
                </button>
              </div>
            </div>
          ) : (
            /* Estado: pendiente de aceptar */
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-500 mr-1">¿Los montos de tu cierre son correctos?</p>
              {errorAceptar && <p className="text-xs text-red-600 w-full">{errorAceptar}</p>}
              <button
                onClick={() => handleAceptar()}
                disabled={aceptando}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
              >
                {aceptando ? 'Guardando...' : '✓ Aceptar cierre'}
              </button>
              <button
                onClick={() => setMostrarObservacion(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Tengo una observación
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vista admin: mostrar comentario del profesional si existe */}
      {isAdmin && cierre.aceptado && cierre.comentario_profesional && (
        <div className="px-4 sm:px-5 py-3 border-t border-amber-100 bg-amber-50">
          <p className="text-xs font-medium text-amber-800 mb-0.5">Observación del profesional:</p>
          <p className="text-xs text-amber-700 italic">"{cierre.comentario_profesional}"</p>
          {cierre.aceptado_at && (
            <p className="text-xs text-amber-500 mt-0.5">{formatFechaHora(cierre.aceptado_at)}</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  resultado: ResultadoCierre
  soloParaProfesional?: string
  isAdmin?: boolean
  onActualizarProfesional?: (profesional: string, actualizado: CierreProfesional) => Promise<void>
  onAceptarCierre?: (profesional: string, comentario?: string) => Promise<void>
}

export function TablaCierre({ resultado, soloParaProfesional, isAdmin = false, onActualizarProfesional, onAceptarCierre }: Props) {
  const cierres = soloParaProfesional
    ? resultado.cierre_por_profesional.filter(c => c.profesional === soloParaProfesional)
    : resultado.cierre_por_profesional

  const totalAtendidos = resultado.cierre_por_profesional.reduce((s, c) => s + c.atendidos, 0)
  const totalRecaudado = resultado.cierre_por_profesional.reduce((s, c) => s + c.total_recaudado, 0)

  return (
    <div className="space-y-6">
      {!soloParaProfesional && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1 leading-tight">Agendados</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-800">{resultado.cierre_general.total_atenciones}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1 leading-tight">Atendidos</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalAtendidos}</p>
          </div>
          <div className="bg-blue-600 rounded-xl p-3 sm:p-5">
            <p className="text-xs text-blue-200 uppercase tracking-wide mb-1 leading-tight">Recaudado</p>
            <p className="text-lg sm:text-3xl font-bold text-white">{formatPesos(totalRecaudado)}</p>
          </div>
        </div>
      )}

      {resultado.items_sin_registro?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            ⚠️ {resultado.items_sin_registro.length} servicio(s) sin valor en la base de tratamientos:
          </p>
          <ul className="text-sm text-amber-700 space-y-0.5">
            {resultado.items_sin_registro.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {cierres.map((cierre, i) => (
          <TarjetaProfesional
            key={i}
            cierre={cierre}
            isAdmin={isAdmin}
            onGuardar={actualizado => onActualizarProfesional?.(cierre.profesional, actualizado) ?? Promise.resolve()}
            onAceptar={onAceptarCierre ? (comentario) => onAceptarCierre(cierre.profesional, comentario) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
