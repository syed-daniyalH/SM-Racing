'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import './Navbar.css'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAdmin, logout } = useAuth()

  const isAuthPage = pathname === '/login' || pathname === '/admin/login' || pathname === '/signup'

  if (isAuthPage || !user) {
    return null
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleDashboard = () => {
    if (isAdmin()) {
      router.push('/admin/users')
    } else {
      router.push('/events')
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand" onClick={handleDashboard}>
          <span className="brand-icon">🏁</span>
          <span className="brand-text">
            <span className="brand-name">SM-2</span>
            <span className="brand-subtitle">RACE CONTROL</span>
          </span>
        </div>
        
        <div className="navbar-content">
          <div className="navbar-menu">
            {isAdmin() ? (
              <>
              <button 
                className={`nav-link ${pathname === '/admin/users' ? 'active' : ''}`}
                onClick={() => router.push('/admin/users')}
              >
                Users
              </button>
              <button 
                className={`nav-link ${pathname === '/admin/drivers' ? 'active' : ''}`}
                onClick={() => router.push('/admin/drivers')}
              >
                Drivers
              </button>
              <button 
                className={`nav-link ${pathname === '/admin/vehicles' ? 'active' : ''}`}
                onClick={() => router.push('/admin/vehicles')}
              >
                Vehicles
              </button>
              <button 
                className={`nav-link ${pathname === '/admin/tracks' ? 'active' : ''}`}
                onClick={() => router.push('/admin/tracks')}
              >
                Tracks
              </button>
              <button 
                className={`nav-link ${pathname === '/admin/events' ? 'active' : ''}`}
                onClick={() => router.push('/admin/events')}
              >
                Events
                </button>
              </>
            ) : (
              <>
                <button 
                  className={`nav-link ${pathname === '/events' || pathname.startsWith('/event/') ? 'active' : ''}`}
                  onClick={() => router.push('/events')}
                >
                  Events
                </button>
              </>
            )}
          </div>

          <div className="navbar-user">
            <div className="user-info">
              <div className="user-name">{user.name || user.email}</div>
              <div className="user-role">{user.role}</div>
            </div>
            <button 
              className="nav-link logout"
              onClick={handleLogout}
              title="Logout"
            >
              <span className="logout-icon">🚪</span>
              <span className="logout-text">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
