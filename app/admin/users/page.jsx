'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'
import { createAdminUser, getUsers } from '../../utils/authApi'
import './UsersManagement.css'

export default function UsersManagement() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'MECHANIC'
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await getUsers()
        setUsers(response.users || [])
      } catch (error) {
        console.error('Failed to load users:', error)
        setUsers([])
      }
    }

    loadUsers()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }

    try {
      // Call signup API
      const response = await createAdminUser(formData)
      
      if (response.success && response.user) {
        // Add new user to local list for display
        const newUser = response.user
        const updatedUsers = [...users, newUser]
        setUsers(updatedUsers)

        setSuccess('User created successfully!')
        setFormData({ name: '', email: '', password: '', role: 'MECHANIC' })
        setShowForm(false)
      } else {
        setError(response.message || 'Failed to create user')
      }
    } catch (error) {
      // Handle API errors
      const errorMessage = error?.message || error?.error || 'Failed to create user. Please try again.'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="users-management-page">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1 className="page-title">User Management</h1>
              <p className="page-subtitle">Manage system users</p>
            </div>
            <div className="header-actions">
              <button onClick={() => router.push('/admin/events')} className="btn btn-secondary">
                Events
              </button>
              <button onClick={logout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Users</h2>
            <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
              {showForm ? 'Cancel' : '+ Create User'}
            </button>
          </div>

          {showForm && (
            <div className="create-user-form">
              <h3 className="form-title">Create New User</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="Email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="input"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="MECHANIC">MECHANIC</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                </div>

                {error && <div className="error-text">{error}</div>}
                {success && <div className="success-text">{success}</div>}

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create User'}
                </button>
              </form>
            </div>
          )}

          <div className="users-list">
            {users.length === 0 ? (
              <div className="empty-state">
                <p>No users created yet. Create your first user above.</p>
              </div>
            ) : (
              <div className="users-table">
                <div className="table-header">
                  <div className="table-cell">Name</div>
                  <div className="table-cell">Email</div>
                  <div className="table-cell">Role</div>
                  <div className="table-cell">Created</div>
                </div>
                {users.map((user) => (
                  <div key={user.id} className="table-row">
                    <div className="table-cell">{user.name}</div>
                    <div className="table-cell">{user.email}</div>
                    <div className="table-cell">
                      <span className={`role-badge role-${user.role.toLowerCase()}`}>
                        {user.role}
                      </span>
                    </div>
                    <div className="table-cell">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
