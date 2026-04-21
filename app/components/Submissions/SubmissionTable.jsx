"use client";

import { Box, Button, Chip, Paper, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EmptyState from "../Common/EmptyState";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const normalizeStatus = (value) => String(value || "PENDING").toUpperCase();

const getStatusTone = (value) => {
  switch (normalizeStatus(value)) {
    case "SENT":
      return {
        background: "rgba(52, 199, 89, 0.14)",
        border: "rgba(52, 199, 89, 0.28)",
        color: "#8df0a8",
      };
    case "FAILED":
      return {
        background: "rgba(255, 59, 48, 0.14)",
        border: "rgba(255, 59, 48, 0.28)",
        color: "#ffb1ad",
      };
    case "PENDING":
    default:
      return {
        background: "rgba(255, 149, 0, 0.14)",
        border: "rgba(255, 149, 0, 0.28)",
        color: "#ffd08a",
      };
  }
};

function NoRowsState() {
  return (
    <Box sx={{ p: 3 }}>
      <EmptyState
        icon="🏁"
        title="No submissions yet"
        description="Once mechanics submit race notes for this event, the entries will appear here with status, run group, and view actions."
      />
    </Box>
  );
}

export default function SubmissionsTable({ submissions = [], loading, onView }) {
  const rows = submissions.map((submission, index) => {
    const submissionId =
      submission?._id || submission?.id || submission?.submissionId || `submission-${index}`;
    const runGroupValue = submission?.runGroup || submission?.run_group || submission?.data?.runGroup;
    const normalizedRunGroup =
      typeof runGroupValue === "string"
        ? runGroupValue
        : runGroupValue?.normalized || runGroupValue?.rawText || runGroupValue?.raw_text || "-";

    return {
      id: submissionId,
      createdAt: submission?.createdAt ? new Date(submission.createdAt) : null,
      userId:
        submission?.userId ||
        submission?.createdBy ||
        submission?.created_by ||
        submission?.data?.userId ||
        "-",
      runGroup: normalizedRunGroup,
      status: normalizeStatus(submission?.status),
      track: submission?.data?.track || submission?.track || "-",
    };
  });

  const columns = [
    {
      field: "createdAt",
      headerName: "Date",
      type: "dateTime",
      flex: 1.15,
      minWidth: 190,
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography sx={{ color: "var(--color-text)", fontWeight: 700, lineHeight: 1.2 }}>
            {formatDateTime(params.value)}
          </Typography>
          <Typography sx={{ color: "var(--color-text-muted)", fontSize: "0.72rem" }}>
            Submission received
          </Typography>
        </Box>
      ),
    },
    {
      field: "userId",
      headerName: "User ID",
      flex: 1.25,
      minWidth: 190,
      renderCell: (params) => (
        <Typography
          sx={{
            color: "var(--color-text)",
            fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Consolas, monospace",
            fontSize: "0.78rem",
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
          title={params.value}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "track",
      headerName: "Track Name",
      flex: 1.6,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Typography sx={{ color: "var(--color-text)", fontWeight: 700 }}>
            {params.value}
          </Typography>
          <Typography sx={{ color: "var(--color-text-muted)", fontSize: "0.72rem" }}>
            Captured from submission data
          </Typography>
        </Box>
      ),
    },
    {
      field: "runGroup",
      headerName: "Run Group",
      flex: 0.9,
      minWidth: 130,
      renderCell: (params) => (
        <Chip
          label={params.value || "-"}
          size="small"
          variant="outlined"
          sx={{
            borderRadius: "999px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderColor: "rgba(255, 149, 0, 0.28)",
            color: "#ffb08c",
            background: "rgba(240, 83, 35, 0.1)",
          }}
        />
      ),
    },
    {
      field: "status",
      headerName: "Status",
      flex: 0.95,
      minWidth: 130,
      renderCell: (params) => {
        const tone = getStatusTone(params.value);

        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              borderRadius: "999px",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: `1px solid ${tone.border}`,
              background: tone.background,
              color: tone.color,
            }}
          />
        );
      },
    },
    {
      field: "view",
      headerName: "View",
      flex: 0.8,
      minWidth: 110,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          startIcon={<VisibilityIcon />}
          size="small"
          onClick={() => onView(params.row.id)}
          sx={{
            borderRadius: "12px",
            borderColor: "rgba(255, 149, 0, 0.32)",
            color: "#ffb08c",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            px: 1.5,
            py: 0.85,
            minWidth: 0,
            "&:hover": {
              borderColor: "rgba(255, 149, 0, 0.55)",
              backgroundColor: "rgba(240, 83, 35, 0.12)",
            },
          }}
        >
          View
        </Button>
      ),
    },
  ];

  if (!loading && rows.length === 0) {
    return <NoRowsState />;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: "100%",
        overflow: "hidden",
        borderRadius: "24px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        background:
          "linear-gradient(180deg, rgba(18, 18, 18, 0.98), rgba(10, 10, 10, 0.98))",
        boxShadow: "0 24px 52px rgba(0, 0, 0, 0.28)",
      }}
    >
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        loading={loading}
        pageSizeOptions={[5, 10, 20]}
        initialState={{
          pagination: { paginationModel: { page: 0, pageSize: 10 } },
        }}
        disableRowSelectionOnClick
        disableColumnMenu
        disableColumnFilter
        rowHeight={72}
        columnHeaderHeight={56}
        sx={{
          border: "none",
          color: "var(--color-text)",
          fontFamily: "inherit",
          "& .MuiDataGrid-columnHeaders": {
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          },
          "& .MuiDataGrid-columnHeaderTitle": {
            fontSize: "0.68rem",
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-text-light)",
          },
          "& .MuiDataGrid-columnSeparator": {
            color: "rgba(255, 255, 255, 0.06)",
          },
          "& .MuiDataGrid-cell": {
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            outline: "none !important",
          },
          "& .MuiDataGrid-row": {
            backgroundColor: "rgba(255, 255, 255, 0.01)",
            transition: "background-color 160ms ease, transform 160ms ease",
          },
          "& .MuiDataGrid-row:hover": {
            backgroundColor: "rgba(240, 83, 35, 0.08)",
          },
          "& .MuiDataGrid-footerContainer": {
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01))",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          },
          "& .MuiTablePagination-root, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
            {
              color: "var(--color-text-light)",
            },
          "& .MuiDataGrid-toolbarContainer": {
            background: "transparent",
          },
          "& .MuiCircularProgress-root": {
            color: "#F05323",
          },
          "& .MuiDataGrid-overlay": {
            backgroundColor: "transparent",
          },
        }}
      />
    </Paper>
  );
}
