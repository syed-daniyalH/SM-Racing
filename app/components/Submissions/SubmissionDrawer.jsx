import {
  Drawer,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Divider,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useMemo } from "react";
import SubmissionPreview from "./SubmissionPreview";
import { getSubmissionById } from "../../utils/submissionApi"; // path adjust karo
import Button from "@mui/material/Button";
import DownloadIcon from "@mui/icons-material/Download";
import { downloadSubmissionPDF } from "../../utils/pdfUtils";

export default function SubmissionDrawer({ open, onClose, submissionId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!submissionId || !open) return;

    const fetchSubmission = async () => {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const response = await getSubmissionById(submissionId);
        setData(response);
      } catch (err) {
        setError(err?.message || err?.error || "Failed to load submission");
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [submissionId, open]);
  const previewId = useMemo(
    () => `submission-preview-${submissionId}`,
    [submissionId],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { overflowY: "auto" },
      }}
    >
      <Box
        sx={{
          width: { xs: "100vw", sm: 600, md: 900, lg: 1000 },
          p: { xs: 2, sm: 3, md: 4 },
          maxWidth: "100vw",
          overflowX: "hidden",
        }}
      >
        <Typography variant="h4" fontWeight={800} align="center">
          Submission Preview
        </Typography>
        <Divider sx={{ my: 2 }} />

        {loading && (
          <Box sx={{ textAlign: "center", mt: 5 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {data && data._id && (
          <SubmissionPreview data={data} previewId={previewId} />
        )}
        {data && (
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            sx={{ mb: 2 }}
            onClick={() => downloadSubmissionPDF(previewId)}
          >
            Download PDF
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
