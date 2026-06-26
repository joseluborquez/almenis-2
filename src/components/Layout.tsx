import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../lib/auth'
import type { Usuario } from '../types'

interface Props {
  usuario: Usuario
  children: ReactNode
}

export function Layout({ usuario, children }: Props) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">A</span>
              </div>
              <div>
                <span className="font-semibold text-slate-800 text-sm">Almenis</span>
                <span className="text-slate-400 text-xs ml-2">Cierre de Caja</span>
              </div>
            </div>

            <nav className="hidden sm:flex items-center gap-1">
              {usuario.rol === 'admin' && (
                <>
                  <button
                    onClick={() => navigate('/subir')}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Subir PDF
                  </button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Cierre de Hoy
                  </button>
                  <button
                    onClick={() => navigate('/historico')}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Histórico
                  </button>
                </>
              )}
              {usuario.rol === 'profesional' && (
                <>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Mi Cierre
                  </button>
                  <button
                    onClick={() => navigate('/historico')}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    Mi Histórico
                  </button>
                </>
              )}
            </nav>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-800">{usuario.nombre_completo}</p>
                <p className="text-xs text-slate-400 capitalize">{usuario.rol}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
