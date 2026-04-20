'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'
import { createEvent, getEvents } from '../../utils/eventApi'
import './EventsManagement.css'

export default function EventsManagement() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()
  const [events, setEvents] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    track: '',
    startDate: '',
    endDate: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)

  // Load events from API
  useEffect(() => {
    const loadEvents = async () => {
      try {
        setIsLoadingEvents(true)
        const response = await getEvents()
        // Handle different response structures
        const eventsData = response.events || response.data || response || []
        setEvents(Array.isArray(eventsData) ? eventsData : [])
      } catch (error) {
        console.error('Failed to load events:', error)
        setError('Failed to load events. Please refresh the page.')
        setEvents([])
      } finally {
        setIsLoadingEvents(false)
      }
    }

    loadEvents()
  }, [user, isAdmin, router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    if (!formData.name || !formData.track || !formData.startDate || !formData.endDate) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }

    try {
      // Call create event API
      const response = await createEvent(formData)
      
      if (response.success || response.event) {
        setSuccess('Event created successfully!')
        setFormData({ name: '', track: '', startDate: '', endDate: '' })
        setShowForm(false)
        
        // Reload events list
        const updatedResponse = await getEvents()
        const eventsData = updatedResponse.events || updatedResponse.data || updatedResponse || []
        setEvents(Array.isArray(eventsData) ? eventsData : [])
      } else {
        setError(response.message || 'Failed to create event')
      }
    } catch (error) {
      // Handle API errors
      console.error('Create event error:', error)
      const errorMessage = error?.message || error?.error || 'Failed to create event. Please try again.'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="events-management-page">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1 className="page-title">Event Management</h1>
              <p className="page-subtitle">Create and manage race events</p>
            </div>
            <div className="header-actions">
              <button onClick={() => router.push('/admin/users')} className="btn btn-secondary">
                Users
              </button>
              <button onClick={logout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Events</h2>
            <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
              {showForm ? 'Cancel' : '+ Create Event'}
            </button>
          </div>

          {showForm && (
            <div className="create-event-form">
              <h3 className="form-title">Create New Event</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Event Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Spring Championship"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Track Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g., Circuit de la Sarthe"
                    value={formData.track}
                    onChange={(e) => setFormData({ ...formData, track: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="input"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input
                      type="date"
                      className="input"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                {error && <div className="error-text">{error}</div>}
                {success && <div className="success-text">{success}</div>}

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating...' : 'Create Event'}
                </button>
              </form>
            </div>
          )}

          <div className="events-list">
            {isLoadingEvents ? (
              <div className="empty-state">
                <p>Loading events...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="empty-state">
                <p>No events created yet. Create your first event above.</p>
              </div>
            ) : (
              <div className="events-grid">
                {events.map((event) => {
                  const eventIdForRoute = event.id || event._id
                  
                  return (
                    <div key={eventIdForRoute || `event-${event.name}`} className="event-card">
                      <div className="event-header">
                        <h3 className="event-name">{event.name}</h3>
                        <button
                          onClick={() => router.push(`/admin/events/${eventIdForRoute}/run-group`)}
                          className="btn btn-sm btn-primary"
                          disabled={!eventIdForRoute}
                        >
                          Setup Run Group
                        </button>
                      </div>
                      <div className="event-details">
                        <div className="event-detail">
                          <span className="detail-label">Track:</span>
                          <span className="detail-value">{event.track}</span>
                        </div>
                        <div className="event-detail">
                          <span className="detail-label">Date:</span>
                          <span className="detail-value">
                            {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
