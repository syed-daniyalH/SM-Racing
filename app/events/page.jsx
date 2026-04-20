"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import { getEvents, selectActiveEvent } from "../utils/eventApi";
import "./EventList.css";

export default function EventList() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isMechanic } = useAuth();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load events from API only once on mount
    const loadEvents = async () => {
      try {
        setIsLoading(true);
        const response = await getEvents();
        // Handle different response structures
        const eventsData = response.events || response.data || response || [];
        setEvents(Array.isArray(eventsData) ? eventsData : []);
      } catch (error) {
        console.error("Failed to load events:", error);
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Only load events on mount or when pathname changes to /events
    if (pathname === "/events") {
      loadEvents();
    }
  }, [pathname]); // Only reload when pathname changes to /events

  const handleSelectEvent = async (event) => {
    // Handle both id and _id formats
    const eventId = event._id || event.id;
    if (eventId) {
      try {
        await selectActiveEvent(eventId);
      } catch (error) {
        console.warn("Failed to update active event before navigation:", error);
      }
      router.push(`/event/${eventId}`);
    } else {
      console.error("Event ID not found:", event);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <ProtectedRoute requireMechanic={true}>
      <div className="event-list-page">
        <div className="events-hero">
          <div className="hero-content">
            <h1 className="page-title">
              <span className="title-icon">🏁</span>
              Select Your Event
            </h1>
            <p className="page-subtitle">
              Choose a race event to view your run group
            </p>
          </div>
        </div>

        <div className="container">
          {isLoading ? (
            <div className="empty-state">
              <p>Loading events...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <p>No events available. Please contact your administrator.</p>
            </div>
          ) : (
            <div className="events-grid">
              {events.map((event) => (
                <div
                  key={event._id || event.id}
                  className="event-card"
                  onClick={() => handleSelectEvent(event)}
                >
                  <div className="event-card-header">
                    <div className="event-icon">🏁</div>
                  </div>

                  <div className="event-card-body">
                    <h2 className="event-name">{event.name}</h2>

                    <div className="event-details">
                      <div className="event-detail-item">
                        <span className="detail-icon">📍</span>
                        <div className="detail-content">
                          <span className="detail-label">Track</span>
                          <span className="detail-value">{event.track}</span>
                        </div>
                      </div>

                      <div className="event-detail-item">
                        <span className="detail-icon">📅</span>
                        <div className="detail-content">
                          <span className="detail-label">Date</span>
                          <span className="detail-value">
                            {formatDate(event.startDate)} -{" "}
                            {formatDate(event.endDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="event-card-footer">
                    <button className="event-select-btn">
                      <span>Select Event</span>
                      <span className="btn-icon">→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
// "use client";

// import { useEffect, useState } from "react";
// import { useParams } from "next/navigation";
// import ProtectedRoute from "@/app/components/ProtectedRoute";
// import { getSubmissionsByEvent } from "@/app//utils/submissionApi";
// import SubmissionsTable from "../components/Submissions/SubmissionTable";
// import SubmissionDrawer from "../components/Submissions/SubmissionDrawer";

// export default function SubmissionsPage() {
//   const { eventId } = useParams();
//   const [submissions, setSubmissions] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [selectedId, setSelectedId] = useState(null);

//   // useEffect(() => {
//   //   const load = async () => {
//   //     try {
//   //       setLoading(true);
//   //       const res = await getSubmissionsByEvent(eventId);
//   //       const list = res.submissions || res.data || res || [];
//   //       setSubmissions(list);
//   //     } catch (err) {
//   //       console.error("Failed to load submissions", err);
//   //     } finally {
//   //       setLoading(false);
//   //     }
//   //   };

//   //   if (eventId) load();
//   // }, [eventId]);
//   useEffect(() => {
//     console.log("eventId:", eventId);

//     const load = async () => {
//       console.log("fetching submissions...");
//       try {
//         const res = await getSubmissionsByEvent(eventId);
//         console.log("API RESPONSE:", res);
//         setSubmissions(res.submissions || res.data || []);
//       } catch (e) {
//         console.error(e);
//       } finally {
//         setLoading(false);
//       }
//     };

//     if (eventId) load();
//   }, [eventId]);

//   return (
//     <ProtectedRoute requireMechanic={false}>
//       <SubmissionsTable
//         submissions={submissions}
//         loading={loading}
//         onView={(id) => setSelectedId(id)}
//       />

//       <SubmissionDrawer
//         open={Boolean(selectedId)}
//         submissionId={selectedId}
//         onClose={() => setSelectedId(null)}
//       />
//     </ProtectedRoute>
//   );
// }
