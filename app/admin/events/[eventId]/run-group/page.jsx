'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '../../../../context/AuthContext'
import ProtectedRoute from '../../../../components/ProtectedRoute'
import { getEventById } from '../../../../utils/eventApi'
import { getRunGroup, setRunGroup as createRunGroup, updateRunGroup } from '../../../../utils/runGroupApi'
import './RunGroupSetup.css'

export default function RunGroupSetup() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.eventId
  const { user, isAdmin, logout } = useAuth()
  const [event, setEvent] = useState(null)
  const [runGroup, setRunGroup] = useState('')
  const [normalizedPreview, setNormalizedPreview] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const normalizeRunGroup = (text) => {
    // Convert to uppercase and remove extra spaces
    return text.trim().toUpperCase().replace(/\s+/g, ' ')
  }

  useEffect(() => {
    if (!eventId) {
      router.push('/admin/events')
      return
    }

    // Load event and run group from API
    const loadData = async () => {
      try {
        setIsLoading(true)
        
        // Load event
        const eventResponse = await getEventById(eventId)
        const eventData = eventResponse.event || eventResponse.data || eventResponse
        if (eventData) {
          setEvent(eventData)
          
          // MongoDB automatically generates _id when event is created
          // The backend API should return this _id in the response
          if (!eventData._id) {
            console.error('MongoDB should have generated _id automatically when event was created.')
            console.error('Event object received:', eventData)
            console.error('Please check your backend event controller - it should return _id field.')
            setError('Event data is missing MongoDB ObjectId (_id). The backend API must return the _id field. Please check your backend event controller.')
          }
        } else {
          router.push('/admin/events')
          return
        }

        // Load existing run group
        try {
          const runGroupResponse = await getRunGroup(eventId)
          // Backend returns: { eventId, rawText, normalized, createdBy, ... }
          if (runGroupResponse && runGroupResponse.rawText) {
            setRunGroup(runGroupResponse.rawText)
            setNormalizedPreview(runGroupResponse.normalized || normalizeRunGroup(runGroupResponse.rawText))
          }
        } catch (runGroupError) {
          // Run group might not exist yet (404), that's okay
          if (runGroupError?.response?.status !== 404) {
            console.error('Error loading run group:', runGroupError)
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error)
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
            // Load existing run group from localStorage
            const storedRunGroups = localStorage.getItem('sm2_runGroups')
            if (storedRunGroups) {
              const runGroups = JSON.parse(storedRunGroups)
              const existing = runGroups.find(rg => 
                rg.eventId === parseInt(eventId) || 
                rg.eventId === eventId ||
                String(rg.eventId) === String(eventId)
              )
              if (existing) {
                setRunGroup(existing.runGroup)
                setNormalizedPreview(existing.normalized)
              }
            }
          } else {
            router.push('/admin/events')
          }
        } else {
          router.push('/admin/events')
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [eventId, router])

  const handleRunGroupChange = (e) => {
    const value = e.target.value
    setRunGroup(value)
    if (value.trim()) {
      setNormalizedPreview(normalizeRunGroup(value))
    } else {
      setNormalizedPreview('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSaving(true)

    if (!runGroup.trim()) {
      setError('Please enter a run group')
      setIsSaving(false)
      return
    }

    try {
      // MongoDB automatically generates _id when event is created
      // The backend API MUST return this _id in the response
      // We simply use the _id that MongoDB generated - no assignment needed
      
      if (!event?._id) {
        console.error('❌ Event API response missing _id field!')
        console.error('MongoDB should have generated _id automatically.')
        console.error('Event object received:', event)
        console.error('Please check your backend API - it should return the _id field.')
        setError('Event data is missing MongoDB ObjectId (_id). The backend API must return the _id field that MongoDB generates. Please check your backend event controller.')
        setIsSaving(false)
        return
      }
      
      // Use the _id that MongoDB generated (from API response)
      const eventIdToSend = String(event._id)
      
      // Backend expects: eventId (as MongoDB ObjectId string) and rawText
      const runGroupData = {
        eventId: eventIdToSend,  // Must be MongoDB ObjectId string
        rawText: runGroup.trim()  // Backend expects 'rawText', not 'runGroup'
      }
      
      // Try to create run group
      let response
      try {
        response = await createRunGroup(runGroupData)
      } catch (createError) {
        // Check if run group already exists (409 Conflict)
        const isConflict = createError?.response?.status === 409 || 
                          createError?.message?.includes('already set') ||
                          createError?.message === 'Run group already set'
        
        if (isConflict) {
          // Run group already exists - show error message
          // User can manually update by changing the value and saving again
          setError('Run group already exists for this event. To update it, change the run group value and save again, or delete the existing run group first.')
          return
        } else {
          // Re-throw other errors
          throw createError
        }
      }
      
      // Successfully created new run group
      if (response.runGroup || response.message) {
        setSuccess(response.message || 'Run group saved successfully!')
        setTimeout(() => {
          router.push('/admin/events')
        }, 1500)
      } else {
        setError(response.message || 'Failed to save run group')
      }
    } catch (error) {
      console.error('Failed to save run group:', error)
      const errorMessage = error?.message || error?.error || 'Failed to save run group. Please try again.'
      setError(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !event) {
    return (
      <ProtectedRoute requireAdmin={true}>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
          <p>Loading event...</p>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="run-group-setup-page">
        <div className="page-header">
          <div className="header-content">
            <div>
              <h1 className="page-title">Run Group Setup</h1>
              <p className="page-subtitle">{event.name}</p>
            </div>
            <div className="header-actions">
              <button onClick={() => router.push('/admin/events')} className="btn btn-secondary">
                Back to Events
              </button>
              <button onClick={logout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="setup-card">
            <div className="event-info">
              <h2 className="info-title">Event Information</h2>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Event:</span>
                  <span className="info-value">{event.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Track:</span>
                  <span className="info-value">{event.track}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Date:</span>
                  <span className="info-value">
                    {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="run-group-form">
              <div className="form-group">
                <label className="form-label">Run Group</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., RED, BLUE, GROUP A"
                  value={runGroup}
                  onChange={handleRunGroupChange}
                />
                <p className="form-hint">Enter the run group name (free text)</p>
              </div>

              {normalizedPreview && (
                <div className="preview-section">
                  <label className="preview-label">Normalized Preview:</label>
                  <div className="preview-box">
                    {normalizedPreview}
                  </div>
                  <p className="preview-hint">This is how it will appear to mechanics</p>
                </div>
              )}

              {error && <div className="error-text">{error}</div>}
              {success && <div className="success-text">{success}</div>}

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={() => router.push('/admin/events')} 
                  className="btn btn-secondary"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Run Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
