import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'
import { getUsuarioActual } from './lib/auth'
import { Login } from './pages/Login'
import { Subir } from './pages/Subir'
import { Dashboard } from './pages/Dashboard'
import { Historico } from './pages/Historico'
import { Tratamientos } from './pages/Tratamientos'
import { Profesionales } from './pages/Profesionales'
import type { Usuario } from './types'

const USUARIO_DEMO: Usuario = {
  id: 'demo-id',
  email: 'demo@almenis.cl',
  nombre_completo: 'Recepcionista Demo',
  rol: 'admin',
  profesional_nombre: null,
}

function BannerDemo() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center">
      <p className="text-xs text-amber-700">
        <span className="font-semibold">Modo demo</span> — Configura las credenciales de Supabase en{' '}
        <code className="bg-amber-100 px-1 rounded">.env</code> para activar todas las funciones
      </p>
    </div>
  )
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorSesion, setErrorSesion] = useState(false)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!supabaseConfigured) {
      // Modo demo: saltar autenticación
      setCargando(false)
      return
    }

    let activo = true
    setCargando(true)
    setErrorSesion(false)

    Promise.race([getUsuarioActual(), timeout(10000)])
      .then(u => { if (activo) setUsuario(u) })
      .catch(() => { if (activo) setErrorSesion(true) })
      .finally(() => { if (activo) setCargando(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Diferir las consultas fuera del callback: llamar a supabase-js
      // directamente dentro de onAuthStateChange puede deadlockear
      // (limitación documentada de la librería)
      setTimeout(async () => {
        if (session?.user) {
          try {
            const u = await getUsuarioActual()
            if (activo) setUsuario(u)
          } catch {
            if (activo) setErrorSesion(true)
          }
        } else {
          if (activo) setUsuario(null)
        }
      }, 0)
    })

    return () => { activo = false; subscription.unsubscribe() }
  }, [intento])

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }

  if (errorSesion) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 font-medium mb-1">No se pudo verificar la sesión</p>
          <p className="text-slate-500 text-sm mb-4">Revisa tu conexión e intenta de nuevo</p>
          <button
            onClick={() => setIntento(i => i + 1)}
            className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  // En modo demo, usar usuario ficticio para navegar libremente
  const usuarioEfectivo = !supabaseConfigured ? USUARIO_DEMO : usuario

  return (
    <BrowserRouter>
      {!supabaseConfigured && <BannerDemo />}
      <Routes>
        <Route
          path="/login"
          element={
            !supabaseConfigured
              ? <Navigate to="/dashboard" replace />
              : usuarioEfectivo
              ? <Navigate to="/dashboard" replace />
              : <Login />
          }
        />
        <Route
          path="/subir"
          element={
            !usuarioEfectivo ? <Navigate to="/login" replace /> :
            usuarioEfectivo.rol !== 'admin' ? <Navigate to="/dashboard" replace /> :
            <Subir usuario={usuarioEfectivo} />
          }
        />
        <Route
          path="/dashboard"
          element={
            !usuarioEfectivo ? <Navigate to="/login" replace /> :
            <Dashboard usuario={usuarioEfectivo} />
          }
        />
        <Route
          path="/historico"
          element={
            !usuarioEfectivo ? <Navigate to="/login" replace /> :
            <Historico usuario={usuarioEfectivo} />
          }
        />
        <Route
          path="/tratamientos"
          element={
            !usuarioEfectivo ? <Navigate to="/login" replace /> :
            usuarioEfectivo.rol !== 'admin' ? <Navigate to="/dashboard" replace /> :
            <Tratamientos usuario={usuarioEfectivo} />
          }
        />
        <Route
          path="/profesionales"
          element={
            !usuarioEfectivo ? <Navigate to="/login" replace /> :
            usuarioEfectivo.rol !== 'admin' ? <Navigate to="/dashboard" replace /> :
            <Profesionales usuario={usuarioEfectivo} />
          }
        />
        <Route
          path="*"
          element={<Navigate to={usuarioEfectivo ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
