'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '../../context/AuthContext'
import ProtectedRoute from '../../components/ProtectedRoute'
import { getEventById, selectActiveEvent } from '../../utils/eventApi'
import { getRunGroup } from '../../utils/runGroupApi'
import './EventDetail.css'

export default function EventDetail() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.eventId
  const { user, isMechanic } = useAuth()
  const [event, setEvent] = useState(null)
  const [runGroup, setRunGroup] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if eventId exists
    if (!eventId) {
      router.push('/events')
      return
    }

    // Load event from API
    const loadEvent = async () => {
      try {
        setIsLoading(true)
        const response = await getEventById(eventId)
        
        // Handle different response structures
        const eventData = response.event || response.data || response
        
        if (eventData && (eventData.id || eventData._id || eventData.name)) {
          setEvent(eventData)
          selectActiveEvent(eventId).catch((error) => {
            console.warn('Failed to set active event:', error)
          })
        } else {
          console.error('Invalid event data received:', eventData)
          // Fallback to localStorage
          const storedEvents = localStorage.getItem('sm2_events')
          if (storedEvents) {
            const events = JSON.parse(storedEvents)
            const foundEvent = events.find(e => 
              e.id === parseInt(eventId) || 
              e.id === eventId || 
              e._id === eventId ||
              String(e.id) === String(eventId) ||
              String(e._id) === String(eventId)
            )
            if (foundEvent) {
              setEvent(foundEvent)
            } else {
              router.push('/events')
            }
          } else {
            router.push('/events')
          }
        }
      } catch (error) {
        console.error('Failed to load event:', error)
        setError('Failed to load event. Please try again.')
        setTimeout(() => router.push('/events'), 2000)
      } finally {
        setIsLoading(false)
      }
    }

    loadEvent()

    // Load run group from API
            const loadRunGroup = async () => {
              try {
                const response = await getRunGroup(eventId)

                // Backend returns the runGroup object directly: { eventId, rawText, normalized, ... }
                // Extract normalized or rawText
                if (response && typeof response === 'object') {
                  // Backend returns: { eventId, rawText, normalized, createdBy, ... }
                  const runGroupValue = response.normalized || response.rawText
                  
                  if (runGroupValue && typeof runGroupValue === 'string' && runGroupValue.trim()) {
                    setRunGroup(runGroupValue.trim())
                  }
                }
      } catch (error) {
        console.error('Failed to load run group:', error)
        setRunGroup(null)
      }
    }

    if (eventId) {
      loadRunGroup()
    }
  }, [eventId, router])

  if (isLoading) {
    return (
      <ProtectedRoute requireMechanic={true}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
          <p>Loading event...</p>
        </div>
      </ProtectedRoute>
    )
  }

  if (error && !event) {
    return (
      <ProtectedRoute requireMechanic={true}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
          <p style={{ color: '#ff3b30', marginBottom: '1rem' }}>{error}</p>
          <button 
            onClick={() => router.push('/events')} 
            className="btn btn-primary"
          >
            Back to Events
          </button>
        </div>
      </ProtectedRoute>
    )
  }

  if (!event) {
    return (
      <ProtectedRoute requireMechanic={true}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
          <p>Event not found</p>
          <button 
            onClick={() => router.push('/events')} 
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
          >
            Back to Events
          </button>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requireMechanic={true}>
      <div className="event-detail-page">
        <div className="page-header">
          <div className="header-content">
            <button onClick={() => router.push('/events')} className="back-button">
              ← Back
            </button>
          </div>
        </div>

        <div className="container">
          <div className="event-info-card">
            <h1 className="event-title">{event.name}</h1>
            <div className="event-meta">
              <div className="meta-item">
                <span className="meta-label">Track:</span>
                <span className="meta-value">{event.track}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Date:</span>
                <span className="meta-value">
                  {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="run-group-display">
            <div className="run-group-label">Your Run Group</div>
            {runGroup ? (
              <div className="run-group-value">{runGroup}</div>
            ) : (
              <div className="run-group-placeholder">Not assigned yet</div>
            )}
          </div>

          <div className="action-buttons">
            <button
              onClick={() => router.push(`/event/${eventId}/notes`)}
              className="btn btn-primary btn-large"
            >
              Submit Notes
            </button>
            <button
              onClick={() => router.push(`/event/${eventId}/submissions`)}
              className="btn btn-secondary btn-large"
            >
              View Submissions
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
