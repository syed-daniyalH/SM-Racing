"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "../context/AuthContext"
import { getActiveEvent } from "../utils/eventApi"
import "./Navbar.css"

const getEventId = (event) =>
  event?.id || event?._id || event?.eventId || event?.event_id || null

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAdmin, logout } = useAuth()
  const [activeEventId, setActiveEventId] = useState(null)

  const isAuthPage =
    pathname === "/login" || pathname === "/admin/login" || pathname === "/signup"

  const currentEventIdMatch = pathname.match(/^\/event\/([^/]+)/)
  const currentEventId = currentEventIdMatch?.[1] || null

  useEffect(() => {
    let cancelled = false

    const loadActiveEvent = async () => {
      if (!user || isAdmin()) {
        setActiveEventId(null)
        return
      }

      try {
        const activeEvent = await getActiveEvent()
        if (!cancelled) {
          setActiveEventId(getEventId(activeEvent))
        }
      } catch (error) {
        if (!cancelled) {
          setActiveEventId(null)
        }
      }
    }

    loadActiveEvent()

    return () => {
      cancelled = true
    }
  }, [user, isAdmin, pathname])

  if (isAuthPage || !user) {
    return null
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const handleMechanicSubmissions = () => {
    const targetEventId = currentEventId || activeEventId

    if (targetEventId) {
      router.push(`/event/${targetEventId}/submissions`)
      return
    }

    router.push('/events')
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
              <button 
                className={`nav-link ${pathname === '/admin/submissions' ? 'active' : ''}`}
                onClick={() => router.push('/admin/submissions')}
              >
                Submissions
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
                <button
                  className={`nav-link ${pathname.startsWith('/event/') && pathname.endsWith('/submissions') ? 'active' : ''}`}
                  onClick={handleMechanicSubmissions}
                  title={activeEventId ? 'Open submissions for the active event' : 'Select an event first to view submissions'}
                >
                  Submissions
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
