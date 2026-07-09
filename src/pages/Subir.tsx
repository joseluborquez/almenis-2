import { useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { parsearPDF } from '../lib/pdfParser'
import { generarCierre } from '../lib/claudeApi'
import type { AtencionAnonimizada } from '../types'
import type { Usuario } from '../types'
import { Layout } from '../components/Layout'
import { TablaCierre } from '../components/TablaCierre'

type Paso = 'subir' | 'procesando-pdf' | 'previsualizando' | 'generando-cierre' | 'resultado'

interface Props {
  usuario: Usuario
}

export function Subir({ usuario }: Props) {
  const [paso, setPaso] = useState<Paso>('subir')
  const [error, setError] = useState('')
  const [arrastrandoOver, setArrastrandoOver] = useState(false)
  const [atenciones, setAtenciones] = useState<AtencionAnonimizada[]>([])
  const [fecha, setFecha] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const navigate = useNavigate()

  const procesarArchivo = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('El archivo debe ser un PDF exportado desde Reservo')
      return
    }
    setError('')
    setPaso('procesando-pdf')

    try {
      const { atenciones: a, fecha: f } = await parsearPDF(file)
      setAtenciones(a)
      setFecha(f)
      setPaso('previsualizando')
    } catch (err: any) {
      setError(`Error al leer el PDF: ${err.message}`)
      setPaso('subir')
    }
  }, [])

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setArrastrandoOver(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarArchivo(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  const handleGenerarCierre = async () => {
    setPaso('generando-cierre')
    setError('')
    try {
      const res = await generarCierre(atenciones, fecha)
      setResultado(res)
      setPaso('resultado')
    } catch (err: any) {
      setError(`Error al generar el cierre: ${err.message}`)
      setPaso('previsualizando')
    }
  }

  const handleNuevoCierre = () => {
    setPaso('subir')
    setAtenciones([])
    setResultado(null)
    setFecha('')
    setError('')
  }

  if (paso === 'resultado' && resultado) {
    return (
      <Layout usuario={usuario}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Cierre de Caja</h1>
              <p className="text-slate-500 text-sm mt-1">
                {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleNuevoCierre}
                className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Nuevo cierre
              </button>
              <button
                onClick={() => navigate('/historico')}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Ver histórico
              </button>
            </div>
          </div>
          <TablaCierre resultado={resultado} />
        </div>
      </Layout>
    )
  }

  return (
    <Layout usuario={usuario}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Subir Agenda del Día</h1>
          <p className="text-slate-500 text-sm mt-1">
            El PDF se procesa completamente en tu computador — ningún dato de pacientes sale a internet
          </p>
        </div>

        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 mb-8">
          {['Subir PDF', 'Revisar', 'Generar cierre'].map((label, i) => {
            const pasos = ['subir', 'previsualizando', 'generando-cierre']
            const activo = pasos.indexOf(paso) >= i
            return (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${activo ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${activo ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                  {label}
                </span>
                {i < 2 && <div className="w-8 h-px bg-slate-200 mx-1" />}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* PASO 1: Subir PDF */}
        {(paso === 'subir') && (
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setArrastrandoOver(true) }}
            onDragLeave={() => setArrastrandoOver(false)}
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
              ${arrastrandoOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-300 hover:border-blue-300 hover:bg-slate-50'
              }`}
          >
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-800 font-medium mb-1">Arrastra el PDF aquí</p>
            <p className="text-slate-500 text-sm mb-6">o haz clic para seleccionar el archivo</p>
            <label className="inline-block cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
              Seleccionar PDF
              <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </label>
            <p className="text-xs text-slate-400 mt-4">Solo archivos exportados desde Reservo.cl</p>
          </div>
        )}

        {/* PASO 1b: Procesando PDF */}
        {paso === 'procesando-pdf' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-800 font-medium">Procesando PDF...</p>
            <p className="text-slate-500 text-sm mt-1">Los datos se procesan en tu computador</p>
          </div>
        )}

        {/* PASO 2: Previsualizar atenciones anonimizadas */}
        {paso === 'previsualizando' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-green-800">
                ✓ {atenciones.length} atenciones detectadas — datos de pacientes eliminados
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Fecha: {fecha} · Solo profesional, servicio y estado serán enviados
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Vista previa de datos anonimizados
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Hora</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Profesional</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Servicio</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atenciones.map((a, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-4 py-2 text-slate-600 text-xs">{a.hora}</td>
                        <td className="px-4 py-2 text-slate-700 text-xs">{a.profesional}</td>
                        <td className="px-4 py-2 text-slate-700 text-xs">{a.tratamiento}</td>
                        <td className="px-4 py-2 text-xs">
                          <select
                            value={a.estado}
                            onChange={e => {
                              const nuevo = [...atenciones]
                              nuevo[i] = { ...nuevo[i], estado: e.target.value }
                              setAtenciones(nuevo)
                            }}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:ring-1 focus:ring-blue-400 outline-none
                              ${a.estado === 'Atendido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}
                          >
                            {['Atendido','Confirmado','Llegó','En atención','No Confirmado','Suspendió','No llegó'].map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleNuevoCierre}
                className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerarCierre}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-medium text-white transition-colors"
              >
                Generar Cierre →
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Generando cierre */}
        {paso === 'generando-cierre' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-800 font-medium">Generando cierre de caja...</p>
            <p className="text-slate-500 text-sm mt-1">Calculando totales por profesional...</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
