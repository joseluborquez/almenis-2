import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logout } from '../lib/auth'
import type { Usuario } from '../types'

interface Props {
  usuario: Usuario
  children: ReactNode
}

export function Layout({ usuario, children }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const navAdmin = [
    { label: 'Subir PDF', path: '/subir', icon: '↑' },
    { label: 'Cierre de Hoy', path: '/dashboard', icon: '◎' },
    { label: 'Histórico', path: '/historico', icon: '☰' },
    { label: 'Tratamientos', path: '/tratamientos', icon: '♦' },
    { label: 'Profesionales', path: '/profesionales', icon: '👤' },
  ]
  const navProfesional = [
    { label: 'Mi Cierre', path: '/dashboard', icon: '◎' },
    { label: 'Histórico', path: '/historico', icon: '☰' },
  ]
  const navItems = usuario.rol === 'admin' ? navAdmin : navProfesional

  return (
    <div className="min-h-screen bg-slate-50 pb-16 sm:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">A</span>
              </div>
              <div>
                <span className="font-semibold text-slate-800 text-sm">Almenis</span>
                <span className="text-slate-400 text-xs ml-1.5 hidden sm:inline">Cierre de Caja</span>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors
                    ${location.pathname === item.path
                      ? 'text-blue-600 bg-blue-50 font-medium'
                      : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-800 leading-tight">{usuario.nombre_completo}</p>
                <p className="text-xs text-slate-400 capitalize">{usuario.rol}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs sm:text-sm text-slate-500 hover:text-red-600 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        {children}
      </main>

      {/* Bottom nav — solo móvil */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40">
        <div className="flex">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs transition-colors
                ${location.pathname === item.path
                  ? 'text-blue-600'
                  : 'text-slate-500'}`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="leading-tight">{item.label}</span>
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs text-slate-500"
          >
            <span className="text-base leading-none">✕</span>
            <span>Salir</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
