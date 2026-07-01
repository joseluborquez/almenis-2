import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { Layout } from '../components/Layout'
import type { Tratamiento, Usuario } from '../types'

interface Props {
  usuario: Usuario
}

function formatPesos(valor: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(valor)
}

// ── Modal: Agregar / Editar tratamiento ──────────────────────────────────────

interface ModalFormProps {
  inicial?: Tratamiento | null
  onGuardar: (t: Omit<Tratamiento, 'id'> & { id?: number }) => Promise<void>
  onCerrar: () => void
}

function ModalForm({ inicial, onGuardar, onCerrar }: ModalFormProps) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '')
  const [valor, setValor] = useState(String(inicial?.valor ?? ''))
  const [gratuito, setGratuito] = useState(inicial?.gratuito ?? false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    const valorNum = parseInt(valor.replace(/\D/g, ''), 10) || 0
    setGuardando(true)
    setError('')
    try {
      await onGuardar({
        ...(inicial?.id !== undefined ? { id: inicial.id } : {}),
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        valor: gratuito ? 0 : valorNum,
        gratuito,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{inicial ? 'Editar tratamiento' : 'Agregar tratamiento'}</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Consulta ORL Fonasa"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
            <input
              type="text"
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              placeholder="Ej: Consultas, Exámenes..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Valor (CLP)</label>
            <input
              type="number"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0"
              disabled={gratuito}
              min={0}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gratuito}
              onChange={e => { setGratuito(e.target.checked); if (e.target.checked) setValor('0') }}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-slate-700">Servicio gratuito (valor $0)</span>
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCerrar} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 font-medium">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: Subir planilla ────────────────────────────────────────────────────

interface FilaPrevia {
  id: number
  nombre: string
  categoria: string | null
  valor: number
  gratuito: boolean
  error?: string
}

interface ModalPlanillaProps {
  onSubir: (filas: FilaPrevia[]) => Promise<void>
  onCerrar: () => void
}

function ModalPlanilla({ onSubir, onCerrar }: ModalPlanillaProps) {
  const [filas, setFilas] = useState<FilaPrevia[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const parsearArchivo = (file: File) => {
    setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (rows.length === 0) { setError('La planilla está vacía'); return }

        // Normalizar nombres de columnas (case-insensitive)
        const normalizar = (obj: any) => {
          const out: Record<string, any> = {}
          for (const k of Object.keys(obj)) {
            out[k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()] = obj[k]
          }
          return out
        }

        // Busca por prefijo en vez de header exacto: los exports de Reservo
        // usan headers como "Tratamiento" (no "Nombre") o "Gratuito (1: Si; 0: No)"
        // (no "Gratuito"), así que un match exacto los deja siempre vacíos.
        const buscarCampo = (r: Record<string, any>, alias: string[]): any => {
          for (const a of alias) {
            const key = Object.keys(r).find(k => k.startsWith(a))
            if (key !== undefined) return r[key]
          }
          return undefined
        }

        const parseadas: FilaPrevia[] = rows.map((row, i) => {
          const r = normalizar(row)
          const id = parseInt(buscarCampo(r, ['id', 'codigo']) ?? '', 10)
          const nombre = String(buscarCampo(r, ['nombre', 'name', 'tratamiento']) ?? '').trim()
          const categoria = String(buscarCampo(r, ['categoria', 'category']) ?? '').trim() || null
          const valor = parseInt(String(buscarCampo(r, ['valor', 'value', 'precio']) ?? '0').replace(/\D/g, ''), 10) || 0
          const gratuitoRaw = String(buscarCampo(r, ['gratuito', 'free', 'gratis']) ?? 'false').toLowerCase()
          const gratuito = ['true', '1', 'si', 'sí', 'yes'].includes(gratuitoRaw)

          const errores: string[] = []
          if (isNaN(id)) errores.push('ID inválido')
          if (!nombre) errores.push('nombre vacío')

          return { id: isNaN(id) ? -(i + 1) : id, nombre: nombre || `Fila ${i + 2}`, categoria, valor, gratuito, error: errores.join(', ') || undefined }
        })

        setFilas(parseadas)
      } catch (err: any) {
        setError(`Error al leer el archivo: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const validas = filas.filter(f => !f.error)
  const conError = filas.filter(f => f.error)

  const handleSubir = async () => {
    if (validas.length === 0) return
    setSubiendo(true)
    setError('')
    try {
      // No pasar el objeto FilaPrevia tal cual: aunque error sea undefined
      // en las filas válidas, la key sigue presente en el objeto y
      // supabase-js la incluye en el parámetro `columns` del upsert,
      // que Postgres rechaza por no existir en la tabla.
      await onSubir(validas.map(({ id, nombre, categoria, valor, gratuito }) => ({ id, nombre, categoria, valor, gratuito })))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-slate-800">Subir planilla de tratamientos</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Zona de carga */}
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parsearArchivo(f) }}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parsearArchivo(f) }} />
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm font-medium text-slate-700">Arrastra tu planilla aquí o haz clic para seleccionar</p>
            <p className="text-xs text-slate-400 mt-1">Formatos: .xlsx, .xls, .csv</p>
          </div>

          {/* Formato esperado */}
          {filas.length === 0 && (
            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">Columnas requeridas en la planilla:</p>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {[['id', 'Número único del tratamiento'], ['nombre', 'Nombre del servicio'], ['categoria', 'Categoría (opcional)'], ['valor', 'Valor en pesos (ej: 15000)'], ['gratuito', 'true/false o SI/NO']].map(([col, desc]) => (
                  <div key={col} className="flex gap-1.5 items-start">
                    <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-700 shrink-0">{col}</code>
                    <span className="text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errores de parseo */}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Preview */}
          {filas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-700">{filas.length} filas detectadas</p>
                {conError.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{conError.length} con error</span>}
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{validas.length} válidas</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">ID</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">Nombre</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium hidden sm:table-cell">Categoría</th>
                      <th className="px-3 py-2 text-right text-slate-500 font-medium">Valor</th>
                      <th className="px-3 py-2 text-slate-500 font-medium hidden sm:table-cell">Grat.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i} className={`border-t border-slate-100 ${f.error ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-1.5 text-slate-500">{f.id > 0 ? f.id : '—'}</td>
                        <td className="px-3 py-1.5 text-slate-700">
                          {f.nombre}
                          {f.error && <span className="ml-1.5 text-red-500">({f.error})</span>}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500 hidden sm:table-cell">{f.categoria ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{f.gratuito ? '$0' : formatPesos(f.valor)}</td>
                        <td className="px-3 py-1.5 text-center hidden sm:table-cell">{f.gratuito ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conError.length > 0 && (
                <p className="text-xs text-slate-500">Las filas con error serán omitidas.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button onClick={onCerrar} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubir}
            disabled={validas.length === 0 || subiendo}
            className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
          >
            {subiendo ? 'Cargando...' : `Cargar ${validas.length} tratamientos`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export function Tratamientos({ usuario }: Props) {
  const [tratamientos, setTratamientos] = useState<Tratamiento[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modalAgregar, setModalAgregar] = useState(false)
  const [modalEditar, setModalEditar] = useState<Tratamiento | null>(null)
  const [modalPlanilla, setModalPlanilla] = useState(false)
  const [eliminando, setEliminando] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const cargar = async () => {
    setLoading(true)
    setError('')
    const { data, error: e } = await supabase
      .from('tratamientos')
      .select('id, nombre, categoria, valor, gratuito')
      .order('nombre')
    if (e) { setError(e.message); setLoading(false); return }
    setTratamientos(data ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const filtrados = tratamientos.filter(t =>
    t.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (t.categoria ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const siguienteId = async (): Promise<number> => {
    const { data } = await supabase.from('tratamientos').select('id').order('id', { ascending: false }).limit(1)
    return ((data?.[0]?.id as number) ?? 0) + 1
  }

  const handleGuardar = async (t: Omit<Tratamiento, 'id'> & { id?: number }) => {
    if (t.id !== undefined) {
      const { error: e } = await supabase.from('tratamientos').update({ nombre: t.nombre, categoria: t.categoria, valor: t.valor, gratuito: t.gratuito }).eq('id', t.id)
      if (e) throw new Error(e.message)
      mostrarToast('Tratamiento actualizado')
    } else {
      const newId = await siguienteId()
      const { error: e } = await supabase.from('tratamientos').insert({ id: newId, nombre: t.nombre, categoria: t.categoria, valor: t.valor, gratuito: t.gratuito })
      if (e) throw new Error(e.message)
      mostrarToast('Tratamiento agregado')
    }
    setModalAgregar(false)
    setModalEditar(null)
    cargar()
  }

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar este tratamiento?')) return
    setEliminando(id)
    const { error: e } = await supabase.from('tratamientos').delete().eq('id', id)
    setEliminando(null)
    if (e) { setError(e.message); return }
    mostrarToast('Tratamiento eliminado')
    cargar()
  }

  const handlePlanilla = async (filas: { id: number; nombre: string; categoria: string | null; valor: number; gratuito: boolean }[]) => {
    const { error: e } = await supabase.from('tratamientos').upsert(filas, { onConflict: 'id' })
    if (e) throw new Error(e.message)
    setModalPlanilla(false)
    mostrarToast(`${filas.length} tratamientos cargados correctamente`)
    cargar()
  }

  const categorias = [...new Set(tratamientos.map(t => t.categoria).filter(Boolean))] as string[]

  return (
    <Layout usuario={usuario}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {modalAgregar && (
        <ModalForm onGuardar={handleGuardar} onCerrar={() => setModalAgregar(false)} />
      )}
      {modalEditar && (
        <ModalForm inicial={modalEditar} onGuardar={handleGuardar} onCerrar={() => setModalEditar(null)} />
      )}
      {modalPlanilla && (
        <ModalPlanilla onSubir={handlePlanilla} onCerrar={() => setModalPlanilla(false)} />
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Tratamientos</h1>
            <p className="text-slate-500 text-sm mt-0.5">{tratamientos.length} servicios registrados · {categorias.length} categorías</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setModalPlanilla(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span>📊</span> Subir planilla
            </button>
            <button
              onClick={() => setModalAgregar(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <span>+</span> Agregar tratamiento
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o categoría..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Cargando tratamientos...</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 text-sm">{busqueda ? 'Sin resultados para tu búsqueda' : 'No hay tratamientos registrados'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 sm:px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Categoría</th>
                    <th className="px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Valor</th>
                    <th className="px-4 sm:px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(t => (
                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 sm:px-5 py-2.5">
                        <span className="text-slate-800 font-medium">{t.nombre}</span>
                        {t.gratuito && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Gratuito</span>}
                        <span className="sm:hidden block text-xs text-slate-400 mt-0.5">{t.categoria ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs hidden sm:table-cell">{t.categoria ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">
                        {t.gratuito ? <span className="text-green-600">$0</span> : formatPesos(t.valor)}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setModalEditar(t)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleEliminar(t.id)}
                            disabled={eliminando === t.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {eliminando === t.id ? '...' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtrados.length > 0 && !loading && (
          <p className="text-xs text-slate-400 text-center">
            Mostrando {filtrados.length} de {tratamientos.length} tratamientos
          </p>
        )}
      </div>
    </Layout>
  )
}
