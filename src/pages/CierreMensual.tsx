import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { hoyChile } from '../lib/fechas'
import { previsualizarCierreMensual, confirmarCierreMensual } from '../lib/cierreMensualApi'
import type { AjusteManual, PreviewCierreMensual } from '../lib/cierreMensualApi'
import { Layout } from '../components/Layout'
import type { Usuario, CierreProfesionalMensual, CierreProfesionalMensualPreview, ModalidadPago, DiaCierreMensual } from '../types'

interface Props {
  usuario: Usuario
}

interface ProfesionalOpcion {
  id: string
  nombre: string
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MODALIDAD_LABELS: Record<ModalidadPago, string> = {
  arriendo: 'Arriendo mensual',
  porcentaje: 'Porcentaje',
  sueldo_fijo: 'Sueldo fijo',
}

const ORIGEN_LABELS: Record<DiaCierreMensual['origen'], string> = {
  aceptado: 'Aceptado',
  no_aceptado: 'Pendiente de aceptación (igual incluido en el total)',
  ajuste_manual: 'Ajuste manual',
}

function formatPesos(valor: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(valor)
}

function formatFecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function periodoActual(): { anio: number; mes: number } {
  const [anio, mes] = hoyChile().split('-').map(Number)
  return { anio, mes }
}

function claveAjuste(profesional_nombre: string, fecha: string): string {
  return `${profesional_nombre}__${fecha}`
}

// ── Formulario inline para agregar un ajuste manual ──────────────────────────

interface FormAjusteProps {
  fecha: string
  profesionalFijo?: { id: string | null; nombre: string }
  profesionales: ProfesionalOpcion[]
  onAgregar: (ajuste: AjusteManual) => void
  onCancelar: () => void
}

function FormAjuste({ fecha, profesionalFijo, profesionales, onAgregar, onCancelar }: FormAjusteProps) {
  const [profesionalId, setProfesionalId] = useState(profesionalFijo?.id ?? '')
  const [monto, setMonto] = useState(0)
  const [motivo, setMotivo] = useState('')

  const nombreSeleccionado = profesionalFijo?.nombre
    ?? profesionales.find(p => p.id === profesionalId)?.nombre
    ?? ''

  const puedeAgregar = nombreSeleccionado && motivo.trim().length > 0

  return (
    <div className="mt-2 p-3 bg-white border border-slate-200 rounded-lg space-y-2">
      {!profesionalFijo && (
        <select
          value={profesionalId}
          onChange={e => setProfesionalId(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Selecciona un profesional...</option>
          {profesionales.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={monto}
          onChange={e => setMonto(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder="Monto (puede ser 0)"
          className="w-32 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo (ej: no trabajó ese día)"
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancelar}
          className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          disabled={!puedeAgregar}
          onClick={() => {
            const p = profesionalFijo ?? profesionales.find(pr => pr.id === profesionalId)
            if (!p) return
            onAgregar({
              profesional_id: profesionalFijo ? profesionalFijo.id : profesionalId,
              profesional_nombre: nombreSeleccionado,
              fecha, monto, motivo: motivo.trim(),
            })
          }}
          className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Agregar ajuste
        </button>
      </div>
    </div>
  )
}

// ── Warnings del preview ──────────────────────────────────────────────────────

interface WarningsProps {
  preview: PreviewCierreMensual
  ajustes: AjusteManual[]
  profesionales: ProfesionalOpcion[]
  onAgregarAjuste: (a: AjusteManual) => void
  onQuitarAjuste: (profesional_nombre: string, fecha: string) => void
}

function Warnings({ preview, ajustes, profesionales, onAgregarAjuste, onQuitarAjuste }: WarningsProps) {
  const [formAbierto, setFormAbierto] = useState<string | null>(null)

  const tieneAjuste = (profesional_nombre: string, fecha: string) =>
    ajustes.find(a => a.profesional_nombre === profesional_nombre && a.fecha === fecha)

  return (
    <div className="space-y-3">
      {preview.dias_faltantes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            ⚠️ {preview.dias_faltantes.length} día(s) del mes sin cierre diario generado — no se pudo determinar lo recaudado ese día para ningún profesional:
          </p>
          <ul className="text-sm text-amber-700 space-y-1.5">
            {preview.dias_faltantes.map(fecha => (
              <li key={fecha}>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" />
                  {formatFecha(fecha)}
                  <button
                    onClick={() => setFormAbierto(formAbierto === `faltante:${fecha}` ? null : `faltante:${fecha}`)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Agregar ajuste para un profesional
                  </button>
                </div>
                {formAbierto === `faltante:${fecha}` && (
                  <FormAjuste
                    fecha={fecha}
                    profesionales={profesionales}
                    onAgregar={a => { onAgregarAjuste(a); setFormAbierto(null) }}
                    onCancelar={() => setFormAbierto(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.profesionales_pendientes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            ⚠️ Cierres diarios aún no aceptados por el profesional — ya están incluidos en el total con el monto reportado; agrega un ajuste manual solo si ese monto es incorrecto:
          </p>
          <ul className="text-sm text-amber-700 space-y-1.5">
            {preview.profesionales_pendientes.map(p => (
              <li key={p.profesional_nombre}>
                <p className="font-medium">{p.profesional_nombre}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                  {p.fechas.map(fecha => {
                    const ajuste = tieneAjuste(p.profesional_nombre, fecha)
                    const clave = `pendiente:${p.profesional_nombre}:${fecha}`
                    return (
                      <span key={fecha} className="inline-flex items-center gap-1">
                        {formatFecha(fecha)}
                        {ajuste ? (
                          <button
                            onClick={() => onQuitarAjuste(p.profesional_nombre, fecha)}
                            className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                          >
                            ajuste: {formatPesos(ajuste.monto)} ✕
                          </button>
                        ) : (
                          <button
                            onClick={() => setFormAbierto(formAbierto === clave ? null : clave)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + ajuste
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
                {p.fechas.map(fecha => formAbierto === `pendiente:${p.profesional_nombre}:${fecha}` && (
                  <FormAjuste
                    key={fecha}
                    fecha={fecha}
                    profesionalFijo={{ id: profesionales.find(pr => pr.nombre === p.profesional_nombre)?.id ?? null, nombre: p.profesional_nombre }}
                    profesionales={profesionales}
                    onAgregar={a => { onAgregarAjuste(a); setFormAbierto(null) }}
                    onCancelar={() => setFormAbierto(null)}
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Tarjeta por profesional ──────────────────────────────────────────────────

type FilaMensualDisplay = CierreProfesionalMensualPreview & Partial<Pick<CierreProfesionalMensual, 'aceptado' | 'aceptado_at' | 'comentario_profesional'>>

function TarjetaProfesionalMensual({ fila, esPreview }: { fila: FilaMensualDisplay; esPreview: boolean }) {
  const [verDetalle, setVerDetalle] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 sm:py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 text-sm sm:text-base truncate">{fila.profesional_nombre}</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 items-center">
              <span className="text-xs text-slate-500">
                {fila.total_atenciones} agend. · <span className="text-green-600 font-medium">{fila.atendidos} atend.</span>
              </span>
              <span className="text-xs font-semibold text-blue-700">{formatPesos(fila.total_recaudado)}</span>
              {!esPreview && (
                fila.aceptado
                  ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${fila.comentario_profesional ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {fila.comentario_profesional ? 'Con observación' : '✓ Aceptado'}
                    </span>
                  : <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-400">Pendiente</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs">
              <span className="text-slate-500">
                {fila.modalidad_pago ? MODALIDAD_LABELS[fila.modalidad_pago] : 'Sin modalidad registrada'}
                {fila.modalidad_pago === 'porcentaje' && fila.porcentaje_almenis != null && ` (${fila.porcentaje_almenis}%)`}
              </span>
              {fila.monto_almenis != null ? (
                <span className="text-emerald-700 font-medium">
                  Almenis: {formatPesos(fila.monto_almenis)} · Profesional: {formatPesos(fila.monto_profesional ?? 0)}
                </span>
              ) : (
                <span className="text-slate-400 italic">
                  {fila.modalidad_pago ? 'falta configurar el monto en Profesionales' : 'sin configuración de pago'}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setVerDetalle(v => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-white transition-colors shrink-0"
          >
            {verDetalle ? 'Ocultar días' : 'Ver días'}
          </button>
        </div>
      </div>

      {verDetalle && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[280px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="px-4 sm:px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Fecha</th>
                <th className="px-2 sm:px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Origen</th>
                <th className="px-4 sm:px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {fila.dias_json.map((d, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-4 sm:px-5 py-2 text-slate-700 text-xs">{formatFecha(d.fecha)}</td>
                  <td className="px-2 sm:px-3 py-2 text-xs">
                    <span className={
                      d.origen === 'aceptado' ? 'text-green-600' :
                      d.origen === 'ajuste_manual' ? 'text-blue-600' : 'text-slate-400'
                    }>
                      {ORIGEN_LABELS[d.origen]}
                    </span>
                    {d.motivo && <span className="text-slate-400 italic ml-1">— {d.motivo}</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-2 text-right text-xs font-medium text-slate-800">{formatPesos(d.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!esPreview && fila.aceptado && fila.comentario_profesional && (
        <div className="px-4 sm:px-5 py-3 border-t border-amber-100 bg-amber-50">
          <p className="text-xs font-medium text-amber-800 mb-0.5">Observación del profesional:</p>
          <p className="text-xs text-amber-700 italic">"{fila.comentario_profesional}"</p>
          {fila.aceptado_at && <p className="text-xs text-amber-500 mt-0.5">{formatFechaHora(fila.aceptado_at)}</p>}
        </div>
      )}
    </div>
  )
}

// ── Banner de ingreso real Almenis (desglosado por modalidad) ───────────────

function BannerIngresoAlmenis({ filas, totalRecaudadoMes }: { filas: FilaMensualDisplay[]; totalRecaudadoMes: number }) {
  const conModalidad = filas.filter(f => f.modalidad_pago && f.monto_almenis != null)
  const sumar = (arr: FilaMensualDisplay[]) => arr.reduce((s, f) => s + (f.monto_almenis ?? 0), 0)

  const porcentaje = conModalidad.filter(f => f.modalidad_pago === 'porcentaje')
  const arriendo = conModalidad.filter(f => f.modalidad_pago === 'arriendo')
  const sueldoFijo = conModalidad.filter(f => f.modalidad_pago === 'sueldo_fijo')

  const totalPorcentaje = sumar(porcentaje)
  const totalArriendo = sumar(arriendo)
  const totalSueldoFijo = sumar(sueldoFijo)
  // Total Almenis del mes: la suma de lo cobrado por porcentaje a quienes
  // trabajan así, más las mensualidades (arriendo) y el neto de sueldo fijo
  // de quienes no trabajan a porcentaje.
  const totalAlmenis = totalPorcentaje + totalArriendo + totalSueldoFijo

  const totalRecaudadoConModalidad = conModalidad.reduce((s, f) => s + f.total_recaudado, 0)
  const sinConfigurar = filas.filter(f => !f.modalidad_pago || f.monto_almenis == null)
  const recaudadoSinConfigurar = sinConfigurar.reduce((s, f) => s + f.total_recaudado, 0)

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs text-emerald-700 uppercase tracking-wide font-medium mb-1">Total Almenis (mes)</p>
        <p className="text-xl sm:text-2xl font-bold text-emerald-800">{formatPesos(totalAlmenis)}</p>
        <div className="mt-2 space-y-0.5 text-xs text-emerald-700">
          {porcentaje.length > 0 && (
            <p>Por porcentaje ({porcentaje.length} profesional{porcentaje.length > 1 ? 'es' : ''}): {formatPesos(totalPorcentaje)}</p>
          )}
          {arriendo.length > 0 && (
            <p>Por arriendo / mensualidad ({arriendo.length} profesional{arriendo.length > 1 ? 'es' : ''}): {formatPesos(totalArriendo)}</p>
          )}
          {sueldoFijo.length > 0 && (
            <p>Por sueldo fijo, neto ({sueldoFijo.length} profesional{sueldoFijo.length > 1 ? 'es' : ''}): {formatPesos(totalSueldoFijo)}</p>
          )}
        </div>
      </div>
      <div className="text-xs text-emerald-700 text-right">
        <p>Profesionales retienen {formatPesos(totalRecaudadoConModalidad - totalAlmenis)}</p>
        <p>Total recaudado del mes: {formatPesos(totalRecaudadoMes)}</p>
        {sinConfigurar.length > 0 && (
          <p className="text-amber-600 mt-0.5">
            ⚠ {formatPesos(recaudadoSinConfigurar)} recaudados por {sinConfigurar.length} profesional(es) sin modalidad o monto configurado — no entran en ninguno de los totales de arriba
          </p>
        )}
      </div>

      {sinConfigurar.length > 0 && (
        <div className="w-full pt-2 border-t border-emerald-200">
          <p className="text-xs text-amber-700 font-medium mb-1">Configura su modalidad/monto en Profesionales para que cuenten:</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {sinConfigurar.map((f, i) => (
              <li key={i}>
                {f.profesional_nombre}
                {' — '}
                {!f.profesional_id
                  ? 'no coincide con ningún usuario registrado'
                  : !f.modalidad_pago
                  ? 'sin modalidad de pago'
                  : `falta el monto de ${f.modalidad_pago === 'arriendo' ? 'arriendo' : 'sueldo fijo'}`}
                {' ('}{formatPesos(f.total_recaudado)}{')'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Sección de aceptación (vista profesional) ────────────────────────────────

function SeccionAceptacionMensual({ fila, onAceptar }: { fila: CierreProfesionalMensual; onAceptar: (comentario?: string) => Promise<void> }) {
  const [mostrarObservacion, setMostrarObservacion] = useState(false)
  const [comentarioLocal, setComentarioLocal] = useState('')
  const [aceptando, setAceptando] = useState(false)
  const [error, setError] = useState('')

  const handleAceptar = async (comentario?: string) => {
    setAceptando(true)
    setError('')
    try {
      await onAceptar(comentario)
      setMostrarObservacion(false)
      setComentarioLocal('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAceptando(false)
    }
  }

  if (fila.aceptado) {
    return (
      <div className={`px-4 sm:px-5 py-3 border-t border-slate-100 flex items-start gap-2 text-sm ${fila.comentario_profesional ? 'text-amber-700' : 'text-green-700'}`}>
        <span className="mt-0.5 text-base leading-none">{fila.comentario_profesional ? '⚠' : '✓'}</span>
        <div>
          <span className="font-medium">{fila.comentario_profesional ? 'Cierre mensual aceptado con observación' : 'Cierre mensual aceptado'}</span>
          {fila.aceptado_at && <span className="text-xs ml-2 opacity-60">{formatFechaHora(fila.aceptado_at)}</span>}
        </div>
      </div>
    )
  }

  if (mostrarObservacion) {
    return (
      <div className="px-4 sm:px-5 py-3 border-t border-slate-100 space-y-2">
        <p className="text-xs font-medium text-slate-600">Describe la irregularidad:</p>
        <textarea
          value={comentarioLocal}
          onChange={e => setComentarioLocal(e.target.value)}
          rows={3}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => { setMostrarObservacion(false); setComentarioLocal(''); setError('') }} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => handleAceptar(comentarioLocal.trim() || undefined)}
            disabled={aceptando || !comentarioLocal.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {aceptando ? 'Enviando...' : 'Enviar observación'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
      <p className="text-xs text-slate-500 mr-1">¿Los montos de tu cierre mensual son correctos?</p>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      <button onClick={() => handleAceptar()} disabled={aceptando} className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium">
        {aceptando ? 'Guardando...' : '✓ Aceptar cierre mensual'}
      </button>
      <button onClick={() => setMostrarObservacion(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50">
        Tengo una observación
      </button>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export function CierreMensual({ usuario }: Props) {
  const [periodo, setPeriodo] = useState(periodoActual())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [persistido, setPersistido] = useState<CierreProfesionalMensual[] | null>(null)

  const [preview, setPreview] = useState<PreviewCierreMensual | null>(null)
  const [ajustes, setAjustes] = useState<AjusteManual[]>([])
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const [profesionales, setProfesionales] = useState<ProfesionalOpcion[]>([])

  useEffect(() => {
    if (usuario.rol === 'admin') {
      supabase.from('usuarios').select('id, nombre_completo, profesional_nombre').eq('rol', 'profesional')
        .then(({ data }) => setProfesionales((data ?? []).map(p => ({ id: p.id, nombre: p.profesional_nombre || p.nombre_completo }))))
    }
  }, [usuario.rol])

  useEffect(() => { cargar() }, [periodo.anio, periodo.mes])

  const cargar = async () => {
    setCargando(true)
    setError('')
    setPreview(null)
    setAjustes([])
    try {
      if (usuario.rol === 'admin') {
        const { data: cm, error: e1 } = await supabase
          .from('cierres_mensuales')
          .select('id')
          .eq('anio', periodo.anio).eq('mes', periodo.mes)
          .maybeSingle()
        if (e1) throw e1

        if (cm) {
          const { data: filas, error: e2 } = await supabase
            .from('cierres_profesional_mensual')
            .select('*')
            .eq('cierre_mensual_id', cm.id)
            .order('profesional_nombre')
          if (e2) throw e2
          setPersistido(filas ?? [])
        } else {
          setPersistido(null)
        }
      } else {
        const { data: filas, error: e } = await supabase
          .from('cierres_profesional_mensual')
          .select('*')
          .eq('anio', periodo.anio).eq('mes', periodo.mes)
          .eq('profesional_id', usuario.id)
        if (e) throw e
        setPersistido(filas ?? [])
      }
    } catch (err: any) {
      setError(`Error al cargar el cierre mensual: ${err.message}`)
    } finally {
      setCargando(false)
    }
  }

  const handleGenerarPreview = async (ajustesActuales: AjusteManual[]) => {
    setGenerando(true)
    setError('')
    try {
      const p = await previsualizarCierreMensual(periodo.anio, periodo.mes, ajustesActuales)
      setPreview(p)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerando(false)
    }
  }

  const agregarAjuste = (a: AjusteManual) => {
    const nuevos = [...ajustes.filter(x => claveAjuste(x.profesional_nombre, x.fecha) !== claveAjuste(a.profesional_nombre, a.fecha)), a]
    setAjustes(nuevos)
    handleGenerarPreview(nuevos)
  }

  const quitarAjuste = (profesional_nombre: string, fecha: string) => {
    const nuevos = ajustes.filter(x => claveAjuste(x.profesional_nombre, x.fecha) !== claveAjuste(profesional_nombre, fecha))
    setAjustes(nuevos)
    handleGenerarPreview(nuevos)
  }

  const handleConfirmar = async () => {
    setConfirmando(true)
    setError('')
    try {
      await confirmarCierreMensual(periodo.anio, periodo.mes, ajustes)
      await cargar()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setConfirmando(false)
    }
  }

  const aceptarCierreMensual = async (fila: CierreProfesionalMensual, comentario?: string) => {
    const ahora = new Date().toISOString()
    const cambios: Record<string, unknown> = { aceptado: true, aceptado_at: ahora }
    if (comentario !== undefined) cambios.comentario_profesional = comentario

    const { data, error: e } = await supabase
      .from('cierres_profesional_mensual')
      .update(cambios)
      .eq('id', fila.id)
      .select('id')

    if (e) throw new Error(e.message)
    if (!data || data.length === 0) throw new Error('No se encontró tu cierre mensual — recarga la página')

    setPersistido(prev => prev ? prev.map(f => f.id === fila.id
      ? { ...f, aceptado: true, aceptado_at: ahora, comentario_profesional: comentario !== undefined ? comentario : f.comentario_profesional }
      : f) : prev)
  }

  const totalRecaudado = (persistido ?? []).reduce((s, f) => s + f.total_recaudado, 0)

  const hoy = periodoActual()
  const ANIOS = Array.from({ length: hoy.anio - 2023 }, (_, i) => hoy.anio - i) // desde 2024 (primer año con datos) hasta hoy
  const mesMaximo = periodo.anio === hoy.anio ? hoy.mes : 12

  const cambiarMes = (mes: number) => setPeriodo(prev => ({ ...prev, mes }))
  const cambiarAnio = (anio: number) => setPeriodo(prev => ({ anio, mes: anio === hoy.anio ? Math.min(prev.mes, hoy.mes) : prev.mes }))

  return (
    <Layout usuario={usuario}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              {usuario.rol === 'admin' ? 'Cierre Mensual' : 'Mi Cierre Mensual'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">{MESES[periodo.mes - 1]} {periodo.anio}</p>
          </div>
          <div className="flex gap-2">
            <select
              value={periodo.mes}
              onChange={e => cambiarMes(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1} disabled={i + 1 > mesMaximo}>{nombre}</option>
              ))}
            </select>
            <select
              value={periodo.anio}
              onChange={e => cambiarAnio(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {ANIOS.map(anio => (
                <option key={anio} value={anio}>{anio}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {cargando && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Cargando...</p>
          </div>
        )}

        {!cargando && usuario.rol === 'admin' && !preview && (
          <div className="flex justify-end">
            <button
              onClick={() => handleGenerarPreview(ajustes)}
              disabled={generando}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 font-medium"
            >
              {generando ? 'Calculando...' : persistido ? 'Regenerar cierre del mes' : 'Generar cierre del mes'}
            </button>
          </div>
        )}

        {!cargando && preview && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-blue-700 uppercase tracking-wide font-medium mb-1">Vista previa — aún no guardada</p>
                <p className="text-lg font-bold text-blue-900">{formatPesos(preview.total_recaudado)} recaudado ({preview.dias_con_cierre}/{preview.dias_esperados} días con cierre diario)</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPreview(null); setAjustes([]) }} className="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-white">
                  Descartar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={confirmando || generando}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 font-medium"
                >
                  {confirmando ? 'Guardando...' : 'Confirmar cierre mensual'}
                </button>
              </div>
            </div>

            <Warnings
              preview={preview}
              ajustes={ajustes}
              profesionales={profesionales}
              onAgregarAjuste={agregarAjuste}
              onQuitarAjuste={quitarAjuste}
            />

            {usuario.rol === 'admin' && (
              <BannerIngresoAlmenis filas={preview.cierre_por_profesional} totalRecaudadoMes={preview.total_recaudado} />
            )}

            <div className="space-y-4">
              {preview.cierre_por_profesional.map((p, i) => (
                <TarjetaProfesionalMensual key={i} fila={p} esPreview />
              ))}
            </div>
          </div>
        )}

        {!cargando && !preview && persistido && (
          <div className="space-y-4">
            {usuario.rol === 'admin' && (
              <BannerIngresoAlmenis filas={persistido} totalRecaudadoMes={totalRecaudado} />
            )}

            {persistido.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-slate-500 text-sm">
                  {usuario.rol === 'admin' ? 'El cierre de este mes no tiene profesionales con datos.' : 'Aún no hay cierre mensual generado para tu cuenta en este período.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {persistido.map(fila => (
                  <div key={fila.id}>
                    <TarjetaProfesionalMensual fila={fila} esPreview={false} />
                    {usuario.rol === 'profesional' && (
                      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl -mt-px">
                        <SeccionAceptacionMensual fila={fila} onAceptar={comentario => aceptarCierreMensual(fila, comentario)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!cargando && !preview && !persistido && usuario.rol === 'admin' && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-sm">Sin cierre mensual generado para este período todavía.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
