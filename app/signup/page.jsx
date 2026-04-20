'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registerUser } from '../utils/authApi'
import '../login/Login.css'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    if (!name || !email || !password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }
    
    try {
      // Call signup API
      const response = await registerUser({ name, email, password })
      
      if (response.success && response.user) {
        // Clear form fields immediately to prevent any message display
        setName('')
        setEmail('')
        setPassword('')
        setError('')
        
        // Immediately redirect to login page - no delay
        window.location.replace('/login?signup=success')
        return // Exit early - this should not execute if redirect works
      } else {
        setError(response.message || 'Failed to create user')
        setIsLoading(false)
      }
    } catch (error) {
      // Handle API errors
      console.error('Signup error:', error)
      const errorMessage = error?.message || error?.error || 'Failed to create user. Please try again.'
      setError(errorMessage)
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="racing-lines"></div>
        <div className="racing-grid"></div>
      </div>
      
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-container">
              <div className="logo-icon">🏁</div>
              <h1 className="app-logo">
                <span className="logo-sm">SM-2</span>
                <span className="logo-title">RACE CONTROL</span>
              </h1>
            </div>
            <p className="login-subtitle">Create a new account</p>
          </div>
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">👤</span>
                Full Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="Enter full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">📧</span>
                Email Address
              </label>
              <input
                type="email"
                className="input"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">🔒</span>
                Password
              </label>
              <input
                type="password"
                className="input"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            {error && <div className="error-text">{error}</div>}
            
            <button 
              type="submit" 
              className="btn btn-primary login-button"
              disabled={isLoading}
            >
              <span>{isLoading ? 'Creating Account...' : 'Create Account'}</span>
              {!isLoading && <span className="btn-arrow">→</span>}
            </button>
          </form>

          <div className="login-footer">
            <p className="footer-text">
              Already have an account?{' '}
              <button 
                type="button"
                onClick={() => router.push('/login')} 
                className="link-button"
              >
                Login here
              </button>
            </p>
          </div>

          <div className="login-info">
            <p className="info-text">
              <strong>API Connected:</strong> Backend authentication enabled
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
