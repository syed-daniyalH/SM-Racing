"use client";

import { DataGrid } from "@mui/x-data-grid";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import VisibilityIcon from "@mui/icons-material/Visibility";

export default function SubmissionsTable({ submissions, loading, onView }) {
  // ✅ map backend data to DataGrid rows
  const rows = submissions.map((s) => ({
    id: s._id,
    userId: s.userId,
    runGroup: s.runGroup,
    status: s.status,
    track: s.data.track,
    // createdAt: s.createdAt,
    createdAt: s.createdAt ? new Date(s.createdAt) : null,
  }));

  const columns = [
    {
      field: "createdAt",
      headerName: "Date",
      type: "dateTime",
      flex: 1,
      minWidth: 180,
    },

    {
      field: "userId",
      headerName: "User ID",
      flex: 1,
      minWidth: 150,
    },
    {
      field: "track",
      headerName: "Track Name",
      flex: 2,
      minWidth: 150,
    },
    {
      field: "runGroup",
      headerName: "Run Group",
      flex: 1,
      minWidth: 100,
    },
    {
      field: "status",
      headerName: "Status",
      flex: 1,
      minWidth: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={
            params.value === "FAILED"
              ? "error"
              : params.value === "SENT"
                ? "success"
                : "warning"
          }
          size="small"
        />
      ),
    },
    {
      field: "view",
      headerName: "View",
      flex: 1,
      minWidth: 100,
      sortable: false,
      renderCell: (params) => (
        // <Button size="small" onClick={() => onView(params.row.id)}>
        //   View
        // </Button>
        <Button
          variant="outlined"
          startIcon={<VisibilityIcon />}
          size="small"
          onClick={() => onView(params.row.id)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Paper sx={{ height: 500, width: "100%", p: 2 }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        pageSizeOptions={[5, 10, 20]}
        initialState={{
          pagination: { paginationModel: { page: 0, pageSize: 10 } },
        }}
        disableRowSelectionOnClick
      />
    </Paper>
  );
}
