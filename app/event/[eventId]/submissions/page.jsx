"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ProtectedRoute from "../../../components/ProtectedRoute";
import Loader from "../../../components/Common/Loader";
import { getSubmissionsByEvent } from "../../../utils/submissionApi";
import SubmissionsTable from "../../../components/Submissions/SubmissionTable";
import SubmissionDrawer from "../../../components/Submissions/SubmissionDrawer";
import "./SubmissionsHistory.css";

export default function SubmissionsPage() {
  const router = useRouter();
  const params = useParams();
  const routeEventId = params?.eventId;

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const refreshData = useCallback(
    async ({ showSpinner = true } = {}) => {
      if (!routeEventId) {
        router.push("/events");
        return;
      }

      try {
        if (showSpinner) {
          setLoading(true);
        }

        setPageError("");

        const response = await getSubmissionsByEvent(routeEventId);
        const list = response.submissions || response.data || response || [];
        setSubmissions(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error("Failed to load submissions", error);
        setSubmissions([]);
        setPageError("Failed to load submissions. Please refresh and try again.");
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [routeEventId, router],
  );

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  if (loading && submissions.length === 0) {
    return (
      <ProtectedRoute requireMechanic={false}>
        <Loader
          fullHeight
          label="Loading submissions"
          sublabel="Fetching notes for the selected event..."
        />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireMechanic={false}>
      <div className="submissions-history-page">
        <div className="submissions-history-orb submissions-history-orb-one" />
        <div className="submissions-history-orb submissions-history-orb-two" />

        <div className="submissions-history-shell submissions-notes-shell">
          <header className="submissions-notes-header">
            <div>
              <p className="submissions-table-eyebrow">Submission Notes</p>
              <h1 className="submissions-notes-title">Notes Feed</h1>
              <p className="submissions-notes-subtitle">
                Only the submission notes for the selected event and run group
                are shown here.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-secondary submissions-notes-refresh"
              onClick={() => refreshData({ showSpinner: true })}
              disabled={loading}
            >
              <RefreshRoundedIcon fontSize="inherit" />
              Refresh
            </button>
          </header>

          {pageError ? (
            <div className="page-banner error submissions-notes-banner">
              <strong>Error.</strong>
              <span>{pageError}</span>
            </div>
          ) : null}

          <section className="submissions-table-panel submissions-notes-panel">
            <SubmissionsTable
              submissions={submissions}
              loading={loading}
              onView={(id) => setSelectedId(id)}
            />
          </section>
        </div>

        <SubmissionDrawer
          open={Boolean(selectedId)}
          submissionId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </ProtectedRoute>
  );
}
