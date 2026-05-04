'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, logoutUser as logoutApi } from '../utils/authApi'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for stored token and verify with API
    const token = localStorage.getItem('sm2_token')
    if (token) {
      const verificationToken = token

      // Verify token with backend
      getMe()
        .then((data) => {
          if (localStorage.getItem('sm2_token') !== verificationToken) {
            return
          }

          // Token is valid, set user from API response
          if (data.user) {
            setUser(data.user)
            localStorage.setItem('sm2_user', JSON.stringify(data.user))
          } else {
            localStorage.removeItem('sm2_user')
            localStorage.removeItem('sm2_token')
          }
        })
        .catch((error) => {
          if (localStorage.getItem('sm2_token') !== verificationToken) {
            return
          }

          // Token invalid or expired, clear storage
          console.error('Token verification failed:', error)
          localStorage.removeItem('sm2_user')
          localStorage.removeItem('sm2_token')
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const login = (userData, token) => {
    setUser(userData)
    localStorage.setItem('sm2_user', JSON.stringify(userData))
    if (token) {
      localStorage.setItem('sm2_token', token)
    }
  }

  const logout = async () => {
    let success = false

    try {
      // Call logout API
      await logoutApi()
      success = true
    } catch (error) {
      // Even if API call fails, clear local storage
      console.error('Logout API error:', error)
    } finally {
      // Always clear local storage
      setUser(null)
      localStorage.removeItem('sm2_user')
      localStorage.removeItem('sm2_token')
    }

    return { success }
  }

  const isAdmin = () => {
    return user?.role === 'OWNER' || user?.role === 'ADMIN'
  }

  const isMechanic = () => {
    return user?.role === 'MECHANIC' || user?.role === 'WORKER'
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, isMechanic }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
