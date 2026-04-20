'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../context/AuthContext'
import './Footer.css'

export default function Footer() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAdmin } = useAuth()

  const isAuthPage = pathname === '/login' || pathname === '/admin/login' || pathname === '/signup'

  if (isAuthPage) {
    return null
  }

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <div className="footer-brand">
              <span className="footer-brand-icon">🏁</span>
              <h3 className="footer-title">SM-2 Race Control</h3>
            </div>
            <p className="footer-description">
              Professional motorsport event data collection system. 
              Streamline race weekend operations with real-time notes and automation.
            </p>
          </div>
          
          <div className="footer-section">
            <h4 className="footer-heading">Navigation</h4>
            <ul className="footer-links">
              {isAdmin() ? (
                <>
                  <li><button onClick={() => router.push('/admin/users')}>User Management</button></li>
                  <li><button onClick={() => router.push('/admin/drivers')}>Driver Management</button></li>
                  <li><button onClick={() => router.push('/admin/vehicles')}>Vehicle Management</button></li>
                  <li><button onClick={() => router.push('/admin/tracks')}>Track Management</button></li>
                  <li><button onClick={() => router.push('/admin/events')}>Event Management</button></li>
                </>
              ) : (
                <>
                  <li><button onClick={() => router.push('/events')}>Events</button></li>
                  <li><button onClick={() => router.push('/events')}>My Submissions</button></li>
                </>
              )}
            </ul>
          </div>
          
          <div className="footer-section">
            <h4 className="footer-heading">System</h4>
            <ul className="footer-links">
              <li>
                <span className="footer-status">
                  <span className="status-dot"></span>
                  System Online
                </span>
              </li>
              <li>
                <span className="footer-info">Version 1.0.0</span>
              </li>
              <li>
                <span className="footer-info">© {new Date().getFullYear()} SM-2</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-stripes"></div>
          <p className="footer-copyright">
            Professional Motorsport Management System
          </p>
        </div>
      </div>
    </footer>
  )
}
