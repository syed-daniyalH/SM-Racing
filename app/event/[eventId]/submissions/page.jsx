"use client";
import { Box, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { getSubmissionsByEvent } from "../../../utils/submissionApi";
import SubmissionsTable from "../../../components/Submissions/SubmissionTable";
import SubmissionDrawer from "../../../components/Submissions/SubmissionDrawer";

export default function SubmissionsPage() {
  const { eventId } = useParams();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getSubmissionsByEvent(eventId);
        const list = res.submissions || res.data || res || [];
        console.log("submission list: ", list, res.submissions, res.data, res);
        setSubmissions(list);
      } catch (err) {
        console.error("Failed to load submissions", err);
      } finally {
        setLoading(false);
      }
    };

    if (eventId) load();
  }, [eventId]);
  const handleView = (id) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };
  return (
    <ProtectedRoute requireMechanic={false}>
      <Box
        sx={{
          mb: 3,
          py: 2,
          px: 3,
          textAlign: "center",
        }}
      >
        <Typography
          variant="h4"
          fontWeight={800}
          sx={{
            letterSpacing: -0.5,
          }}
        >
          Submissions by Event
        </Typography>
      </Box>{" "}
      <SubmissionsTable
        submissions={submissions}
        loading={loading}
        onView={(id) => setSelectedId(id)}
      />
      <SubmissionDrawer
        open={Boolean(selectedId)}
        submissionId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </ProtectedRoute>
  );
}
