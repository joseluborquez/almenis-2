import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { crearProfesional, eliminarProfesional } from '../lib/profesionalesApi'
import { Layout } from '../components/Layout'
import type { Usuario } from '../types'

interface Props {
  usuario: Usuario
}

interface ProfesionalFila {
  id: string
  email: string
  nombre_completo: string
  profesional_nombre: string | null
}

// El teclado en español (autocorrección) y el autocompletado del navegador a
// veces reemplazan la "n" del dominio por "ñ" (ej: almenis.cl → almeñis.cl),
// lo que el navegador rechaza como email inválido. El dominio de la clínica
// nunca lleva ñ, así que se corrige apenas aparece después del "@".
function limpiarEmail(valor: string): string {
  const posArroba = valor.indexOf('@')
  if (posArroba === -1) return valor
  const dominio = valor.slice(posArroba).replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
  return valor.slice(0, posArroba) + dominio
}

// ── Modal: agregar profesional ───────────────────────────────────────────────

interface ModalProps {
  onCrear: (datos: { email: string; password: string; nombre_completo: string; profesional_nombre: string }) => Promise<void>
  onCerrar: () => void
}

function ModalAgregar({ onCrear, onCerrar }: ModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [nombreCompleto, setNombreCompleto] = useState('')
  const [profesionalNombre, setProfesionalNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password || !nombreCompleto.trim() || !profesionalNombre.trim()) {
      setError('Todos los campos son obligatorios')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await onCrear({
        email: email.trim(),
        password,
        nombre_completo: nombreCompleto.trim(),
        profesional_nombre: profesionalNombre.trim(),
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
          <h2 className="font-semibold text-slate-800">Agregar profesional</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
            <input
              type="text"
              value={nombreCompleto}
              onChange={e => setNombreCompleto(e.target.value)}
              placeholder="Ej: Aimara Lizarzabal Tapia"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre en el PDF de Reservo *</label>
            <input
              type="text"
              value={profesionalNombre}
              onChange={e => setProfesionalNombre(e.target.value)}
              placeholder="Ej: Dra. Aimara Lizarzabal Tapia"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1">Debe coincidir exactamente con la columna Box/Prof del PDF</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(limpiarEmail(e.target.value))}
              placeholder="profesional@almenis.cl"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña *</label>
            <div className="relative">
              <input
                type={mostrarPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCerrar} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 font-medium">
              {guardando ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export function Profesionales({ usuario }: Props) {
  const [profesionales, setProfesionales] = useState<ProfesionalFila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalAgregar, setModalAgregar] = useState(false)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const cargar = async () => {
    setLoading(true)
    setError('')
    const { data, error: e } = await supabase
      .from('usuarios')
      .select('id, email, nombre_completo, profesional_nombre')
      .eq('rol', 'profesional')
      .order('nombre_completo')
    if (e) { setError(e.message); setLoading(false); return }
    setProfesionales(data ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const handleCrear = async (datos: { email: string; password: string; nombre_completo: string; profesional_nombre: string }) => {
    await crearProfesional(datos)
    setModalAgregar(false)
    mostrarToast('Profesional agregado')
    cargar()
  }

  const handleEliminar = async (p: ProfesionalFila) => {
    if (!confirm(`¿Eliminar el acceso de ${p.nombre_completo}? Su historial de cierres se conserva.`)) return
    setEliminando(p.id)
    setError('')
    try {
      await eliminarProfesional(p.id)
      mostrarToast('Profesional eliminado')
      cargar()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setEliminando(null)
    }
  }

  return (
    <Layout usuario={usuario}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {modalAgregar && (
        <ModalAgregar onCrear={handleCrear} onCerrar={() => setModalAgregar(false)} />
      )}

      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Profesionales</h1>
            <p className="text-slate-500 text-sm mt-0.5">{profesionales.length} profesionales registrados</p>
          </div>
          <button
            onClick={() => setModalAgregar(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shrink-0"
          >
            <span>+</span> Agregar profesional
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Cargando profesionales...</p>
            </div>
          ) : profesionales.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 text-sm">No hay profesionales registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 sm:px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                    <th className="px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Nombre en PDF</th>
                    <th className="px-4 sm:px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {profesionales.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 sm:px-5 py-2.5">
                        <span className="text-slate-800 font-medium">{p.nombre_completo}</span>
                        <span className="sm:hidden block text-xs text-slate-400 mt-0.5">{p.email}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs hidden sm:table-cell">{p.email}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs hidden sm:table-cell">
                        {p.profesional_nombre ?? <span className="text-amber-500">Sin asignar</span>}
                      </td>
                      <td className="px-4 sm:px-5 py-2.5 text-right">
                        <button
                          onClick={() => handleEliminar(p)}
                          disabled={eliminando === p.id}
                          className="text-xs px-2.5 py-1 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {eliminando === p.id ? '...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
