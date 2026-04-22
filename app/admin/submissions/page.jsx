"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import Loader from "../../components/Common/Loader";
import StatusBadge from "../../components/Common/StatusBadge";
import {
  ActionIconButton,
  ConfirmDialog,
  EmptyStatePanel,
  MetricCard,
} from "../fleet/_components/ManagementUi";
import {
  formatDate,
  formatDateTime,
  getApiErrorMessage,
} from "../fleet/_components/fleetManagementHelpers";
import {
  buildReviewAnalysisPatch,
  buildSubmissionExportRows,
  buildSubmissionMonitorRecord,
  buildSubmissionSearchText,
  buildSubmissionSummaryCounts,
  getSubmissionId,
  getSubmissionDriverLabel,
  getSubmissionTrackLabel,
  getSubmissionVehicleLabel,
  mockSubmissions,
} from "./_components/submissionReviewHelpers";
import SubmissionReviewDrawer from "./_components/SubmissionReviewDrawer";
import {
  getAllSubmissions,
  retryFailedSubmission,
  updateSubmission,
} from "../../utils/submissionApi";
import "../fleet/fleetManagement.css";
import "./SubmissionReview.css";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DatasetOutlinedIcon from "@mui/icons-material/DatasetOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ArrowDownwardOutlinedIcon from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending_review", label: "Pending Review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "validated", label: "Validated" },
  { value: "failed", label: "Validation Failed" },
  { value: "archived", label: "Archived" },
];

const SUBMISSION_SPREADSHEET_COLUMNS = [
  { key: "submissionId", label: "ID", width: "minmax(110px, 0.85fr)", sortable: true },
  { key: "sessionDate", label: "Date", width: "minmax(110px, 0.85fr)", sortable: true },
  { key: "sessionTime", label: "Time", width: "minmax(80px, 0.6fr)", sortable: true },
  { key: "track", label: "Track", width: "minmax(180px, 1.2fr)", sortable: true },
  { key: "driverName", label: "Driver Name", width: "minmax(160px, 1fr)", sortable: true },
  { key: "driverId", label: "Driver ID", width: "minmax(100px, 0.75fr)", sortable: true },
  { key: "vehicleId", label: "Vehicle ID", width: "minmax(130px, 0.9fr)", sortable: true },
  { key: "sessionType", label: "Session Type", width: "minmax(120px, 0.85fr)", sortable: true },
  { key: "sessionNumber", label: "Session #", width: "minmax(90px, 0.65fr)", sortable: true },
  { key: "durationMin", label: "Duration (min)", width: "minmax(100px, 0.75fr)", sortable: true },
  { key: "tireSet", label: "Tire Set", width: "minmax(100px, 0.75fr)", sortable: true },
  { key: "notes", label: "Notes", width: "minmax(180px, 1.2fr)", sortable: true },
  { key: "createdBy", label: "Created By", width: "minmax(120px, 0.8fr)", sortable: true },
  { key: "createdAt", label: "Created At", width: "minmax(160px, 1fr)", sortable: true },
  { key: "status", label: "Status", width: "minmax(140px, 0.9fr)", sortable: true },
  { key: "actions", label: "Actions", width: "minmax(220px, 1.2fr)", sortable: false },
];

const SUBMISSION_TABLE_COLUMNS = SUBMISSION_SPREADSHEET_COLUMNS.map((column) => column.width).join(" ");

const escapeCsvValue = (value) =>
  `"${String(value ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;

const escapeTsvValue = (value) => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");

const formatSubmissionDate = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDateTime(date);
};

const buildUniqueFilterOptions = (submissions = [], getter) => {
  const map = new Map();

  submissions.forEach((submission) => {
    const value = getter(submission);
    const label = value?.label || value?.value || value;
    const key = value?.value || value;
    if (!key || !label) return;
    if (!map.has(String(key))) {
      map.set(String(key), String(label));
    }
  });

  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
};

const getDateKey = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const getReviewStateTone = (value) => {
  switch (value) {
    case "validated":
      return "success";
    case "failed":
      return "danger";
    case "archived":
      return "neutral";
    case "reviewed":
    case "pending_review":
    default:
      return "warning";
  }
};

const getConfidenceTone = (confidence) => {
  if (confidence === null || confidence === undefined) return "neutral";
  if (confidence >= 90) return "success";
  if (confidence >= 80) return "warning";
  return "danger";
};

const formatDateOnly = (value) => {
  if (!value) return "-";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

const formatTimeOnly = (value) => {
  if (!value) return "-";
  if (typeof value === "string") {
    if (/^\d{1,2}:\d{2}/.test(value)) {
      return value.slice(0, 5);
    }
    return value;
  }
  return String(value);
};

const getRowSortValue = (submission, key) => {
  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  switch (key) {
    case "submissionId":
      return String(getSubmissionId(submission) || "");
    case "sessionDate":
      return submission.sessionDateLabel || "";
    case "sessionTime":
      return submission.sessionTimeLabel || "";
    case "track":
      return String(submission.data?.track || submission.event?.track || "");
    case "driverName":
      return String(submission.driverName || submission.driver?.driverName || submission.driver?.fullName || "");
    case "driverId":
      return String(submission.driverCode || submission.data?.driver_id || "");
    case "vehicleId":
      return String(submission.vehicleCode || submission.data?.vehicle_id || "");
    case "sessionType":
      return String(submission.sessionTypeLabel || "");
    case "sessionNumber":
      return numeric(submission.data?.session_number || submission.sessionNumberLabel || 0) ?? 0;
    case "durationMin":
      return numeric(submission.data?.duration_min || submission.durationLabel || 0) ?? 0;
    case "tireSet":
      return String(submission.tireSetLabel || "");
    case "notes":
      return String(submission.notesLabel || "");
    case "createdBy":
      return String(submission.createdByLabel || "");
    case "createdAt":
      return new Date(submission.submittedAt || submission.createdAt || submission.updatedAt || 0).getTime();
    case "status":
      return String(submission.validationStateLabel || submission.reviewStateLabel || "");
    default:
      return String(submission[key] || "");
  }
};

const DEMO_SUBMISSIONS = mockSubmissions.slice(0, 1);

const isOfflineError = (error) => {
  const message = getApiErrorMessage(error, "").toLowerCase();

  return /network error|failed to fetch|fetch failed|getaddrinfo|econnrefused|enotfound|socket hang up/.test(
    message,
  );
};

export default function SubmissionReviewPage() {
  const { user } = useAuth();

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sessionTypeFilter, setSessionTypeFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [drawerFocus, setDrawerFocus] = useState("overview");
  const [busyAction, setBusyAction] = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);

  const showDemoSubmission = useCallback((message) => {
    if (!DEMO_SUBMISSIONS.length) return;

    setSubmissions(DEMO_SUBMISSIONS);
    setPageError("");
    setNotice({
      tone: "warning",
      message,
    });

    const demoId = getSubmissionId(DEMO_SUBMISSIONS[0]);
    if (demoId) {
      setSelectedSubmissionId(demoId);
      setDrawerFocus("overview");
      setDrawerOpen(true);
    }
  }, []);

  const refreshMonitor = useCallback(async ({ showSpinner = true } = {}) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      setPageError("");

      const response = await getAllSubmissions();
      const list = Array.isArray(response) ? response : response?.submissions || [];

      if (list.length === 0) {
        showDemoSubmission(
          "No live submissions were returned, so a sample submission is shown for review.",
        );
        return;
      }

      setSubmissions(list);
    } catch (error) {
      console.error("Failed to load submissions:", error);

      if (isOfflineError(error)) {
        showDemoSubmission(
          "The backend is unreachable right now, so a sample submission is shown for review.",
        );
        return;
      }

      setSubmissions([]);
      setPageError(getApiErrorMessage(error, "Failed to load submissions."));
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [showDemoSubmission]);

  useEffect(() => {
    refreshMonitor();
  }, [refreshMonitor]);

  useEffect(() => {
    if (!notice) return undefined;

    const timeout = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const submissionRecords = useMemo(
    () =>
      submissions
        .map((submission) => buildSubmissionMonitorRecord(submission, submissions))
        .filter(Boolean),
    [submissions],
  );

  const summaryCounts = useMemo(
    () => buildSubmissionSummaryCounts(submissions),
    [submissions],
  );

  const sessionTypeOptions = useMemo(
    () =>
      buildUniqueFilterOptions(submissionRecords, (submission) => ({
        value: submission.sessionTypeLabel || "",
        label: submission.sessionTypeLabel || "",
      })),
    [submissionRecords],
  );

  const driverOptions = useMemo(
    () =>
      buildUniqueFilterOptions(submissionRecords, (submission) => ({
        value: submission.driverCode || submission.data?.driver_id || "",
        label:
          [
            submission.driverCode || submission.data?.driver_id || "",
            getSubmissionDriverLabel(submission),
          ]
            .filter(Boolean)
            .join(" · ") || "",
      })),
    [submissionRecords],
  );

  const vehicleOptions = useMemo(
    () =>
      buildUniqueFilterOptions(submissionRecords, (submission) => ({
        value: submission.vehicleCode || submission.data?.vehicle_id || "",
        label:
          [
            submission.vehicleCode || submission.data?.vehicle_id || "",
            getSubmissionVehicleLabel(submission),
          ]
            .filter(Boolean)
            .join(" · ") || "",
      })),
    [submissionRecords],
  );

  const filteredSubmissions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const fromKey = dateFrom ? new Date(dateFrom) : null;
    const toKey = dateTo ? new Date(dateTo) : null;

    let next = [...submissionRecords];

    if (query) {
      next = next.filter((submission) =>
        buildSubmissionSearchText(submission).includes(query),
      );
    }

    if (sessionTypeFilter !== "all") {
      next = next.filter(
        (submission) => String(submission.sessionTypeLabel || "").toLowerCase() === sessionTypeFilter,
      );
    }

    if (driverFilter !== "all") {
      next = next.filter(
        (submission) => String(submission.driverCode || submission.data?.driver_id || "").toLowerCase() === driverFilter,
      );
    }

    if (vehicleFilter !== "all") {
      next = next.filter(
        (submission) => String(submission.vehicleCode || submission.data?.vehicle_id || "").toLowerCase() === vehicleFilter,
      );
    }

    if (statusFilter !== "all") {
      next = next.filter((submission) => submission.validationStateKey === statusFilter);
    }

    if (fromKey) {
      next = next.filter((submission) => {
        const sessionDate = submission.sessionDateLabel || "";
        const submittedDate = sessionDate ? new Date(sessionDate) : new Date(submission.submittedAt || submission.createdAt || submission.updatedAt || 0);
        return !Number.isNaN(submittedDate.getTime()) && submittedDate >= fromKey;
      });
    }

    if (toKey) {
      toKey.setHours(23, 59, 59, 999);
      next = next.filter((submission) => {
        const sessionDate = submission.sessionDateLabel || "";
        const submittedDate = sessionDate ? new Date(sessionDate) : new Date(submission.submittedAt || submission.createdAt || submission.updatedAt || 0);
        return !Number.isNaN(submittedDate.getTime()) && submittedDate <= toKey;
      });
    }

    return next.sort((left, right) => {
      const leftValue = getRowSortValue(left, sortKey);
      const rightValue = getRowSortValue(right, sortKey);

      if (typeof leftValue === "number" || typeof rightValue === "number") {
        const leftNumber = Number(leftValue || 0);
        const rightNumber = Number(rightValue || 0);
        return sortDirection === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
      }

      const leftString = String(leftValue ?? "").toLowerCase();
      const rightString = String(rightValue ?? "").toLowerCase();
      const comparison = leftString.localeCompare(rightString, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    dateFrom,
    dateTo,
    driverFilter,
    sessionTypeFilter,
    searchQuery,
    sortDirection,
    sortKey,
    statusFilter,
    submissionRecords,
    vehicleFilter,
  ]);

  const selectedSubmission = useMemo(
    () =>
      submissionRecords.find(
        (submission) => String(getSubmissionId(submission)) === String(selectedSubmissionId),
      ) || null,
    [selectedSubmissionId, submissionRecords],
  );

  const hasFilters =
    Boolean(searchQuery.trim()) ||
    sessionTypeFilter !== "all" ||
    driverFilter !== "all" ||
    vehicleFilter !== "all" ||
    statusFilter !== "all" ||
    dateFrom ||
    dateTo;

  const toggleSort = (key) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection("asc");
      return key;
    });
  };

  const openDrawer = (submission, focus = "overview") => {
    setSelectedSubmissionId(submission?.id || submission?._id || submission?.submissionId || null);
    setDrawerFocus(focus);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (busyAction) return;
    setDrawerOpen(false);
    setSelectedSubmissionId(null);
    setDrawerFocus("overview");
  };

  const updateSubmissionRecord = (updatedSubmission, message, tone = "success") => {
    setSubmissions((current) =>
      current.map((submission) =>
        String(submission.id || submission._id || submission.submissionId) ===
        String(updatedSubmission.id || updatedSubmission._id || updatedSubmission.submissionId)
          ? updatedSubmission
          : submission,
      ),
    );
    setNotice({ tone, message });
  };

  const persistAnalysisUpdate = async (record, patch, actionKey, successMessage) => {
    const submissionId = record.id || record._id || record.submissionId;
    if (!submissionId) return;

    try {
      setBusyAction(`${actionKey}:${submissionId}`);
      const response = await updateSubmission(submissionId, patch);
      const updatedSubmission = response.submission || response.data || response;
      if (updatedSubmission) {
        updateSubmissionRecord(updatedSubmission, successMessage, "success");
      } else {
        setNotice({ tone: "warning", message: successMessage });
      }
    } catch (error) {
      console.error(`Submission ${actionKey} failed:`, error);
      setNotice({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to update submission."),
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleRetryValidation = async (record) => {
    const patch = buildReviewAnalysisPatch({
      submission: record,
      allSubmissions: submissionRecords,
      reviewState:
        record.reviewStateKey === "archived"
          ? "ARCHIVED"
          : record.reviewStateKey === "approved"
            ? "APPROVED"
            : record.reviewStateKey === "flagged"
              ? "FLAGGED"
              : "REVIEWED",
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note: "Validation re-run from Submission Review monitor.",
    });

    await persistAnalysisUpdate(
      record,
      patch,
      "validate",
      "Validation re-run completed and stored on the submission record.",
    );
  };

  const handleMarkReviewed = async (record) => {
    const patch = buildReviewAnalysisPatch({
      submission: record,
      allSubmissions: submissionRecords,
      reviewState: "REVIEWED",
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note: "Marked as reviewed from the Submission Review monitor.",
    });

    await persistAnalysisUpdate(
      record,
      patch,
      "mark",
      "Submission marked as reviewed.",
    );
  };

  const handleApproveSubmission = async (record) => {
    const patch = buildReviewAnalysisPatch({
      submission: record,
      allSubmissions: submissionRecords,
      reviewState: "APPROVED",
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note: "Approved from the Submission Review monitor.",
    });

    await persistAnalysisUpdate(
      record,
      patch,
      "approve",
      "Submission approved and validation state updated.",
    );
  };

  const handleFlagForCorrection = async (record) => {
    const patch = buildReviewAnalysisPatch({
      submission: record,
      allSubmissions: submissionRecords,
      reviewState: "FLAGGED",
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note: "Flagged for correction from the Submission Review monitor.",
    });

    await persistAnalysisUpdate(
      record,
      patch,
      "flag",
      "Submission flagged for correction.",
    );
  };

  const handleRetrySync = async (record) => {
    const submissionId = record.id || record._id || record.submissionId;
    if (!submissionId) return;

    try {
      setBusyAction(`sync:${submissionId}`);
      const response = await retryFailedSubmission(submissionId);
      const updatedSubmission = response.submission || response.data || response;
      if (updatedSubmission) {
        const syncTone = response.success ? "success" : "warning";
        const syncMessage = response.success
          ? "Sync retry completed for the submission."
          : response.message || "Sync retry completed, but the submission still needs attention.";
        updateSubmissionRecord(
          updatedSubmission,
          syncMessage,
          syncTone,
        );
      } else {
        setNotice({
          tone: "warning",
          message: "Sync retry request was sent.",
        });
      }
    } catch (error) {
      console.error("Sync retry failed:", error);
      setNotice({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to retry sync."),
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleArchiveSubmission = async (record) => {
    const patch = buildReviewAnalysisPatch({
      submission: record,
      allSubmissions: submissionRecords,
      reviewState: "ARCHIVED",
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note: "Archived from the Submission Review monitor.",
    });

    await persistAnalysisUpdate(
      record,
      patch,
      "archive",
      "Submission archived and retained for audit history.",
    );
    setArchiveTarget(null);
  };

  const handleExportRows = (rows, format = "csv", fileName = "submission-review") => {
    const headers = [
      "ID",
      "Date",
      "Time",
      "Track",
      "Driver Name",
      "Driver ID",
      "Vehicle ID",
      "Session Type",
      "Session Number",
      "Duration (min)",
      "Tire Set",
      "Notes",
      "Created By",
      "Created At",
      "Status",
      "Validation",
      "Sync Status",
      "Confidence",
      "Reviewed At",
      "Raw Text",
    ];

    const delimiter = format === "excel" ? "\t" : ",";
    const rowsText = [
      headers.join(delimiter),
      ...rows.map((row) =>
        [
          row.submissionId,
          row.date,
          row.time,
          row.track,
          row.driverName,
          row.driverId,
          row.vehicleId,
          row.sessionType,
          row.sessionNumber,
          row.durationMin,
          row.tireSet,
          row.notes,
          row.createdBy,
          row.createdAt,
          row.status,
          row.reviewStatus,
          row.syncStatus,
          row.confidence,
          row.reviewedAt,
          row.rawText,
        ]
          .map(format === "excel" ? escapeTsvValue : escapeCsvValue)
          .join(delimiter),
      ),
    ].join("\n");

    const mimeType = format === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/csv;charset=utf-8;";
    const extension = format === "excel" ? "xls" : "csv";
    const blob = new Blob([rowsText], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const rows = buildSubmissionExportRows(filteredSubmissions);
    handleExportRows(rows, "csv", "submission-review-dashboard");
    setNotice({
      tone: "success",
      message: `Exported ${rows.length} submission${rows.length === 1 ? "" : "s"} to CSV.`,
    });
  };

  const handleExportExcel = () => {
    const rows = buildSubmissionExportRows(filteredSubmissions);
    handleExportRows(rows, "excel", "submission-review-dashboard");
    setNotice({
      tone: "success",
      message: `Exported ${rows.length} submission${rows.length === 1 ? "" : "s"} to Excel.`,
    });
  };

  const handleExportSubmission = (record, format = "csv") => {
    const rows = buildSubmissionExportRows([record]);
    handleExportRows(rows, format, `submission-${String(getSubmissionId(record) || "export")}`);
    setNotice({
      tone: "success",
      message: `Exported ${getSubmissionId(record) ? `submission ${getSubmissionId(record)}` : "selected submission"}${format === "excel" ? " to Excel" : " to CSV"}.`,
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSessionTypeFilter("all");
    setDriverFilter("all");
    setVehicleFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortKey("createdAt");
    setSortDirection("desc");
  };

  const summaryCards = [
    {
      icon: PendingActionsOutlinedIcon,
      label: "Total Submissions",
      value: summaryCounts.total,
      helper: "All submissions visible to the admin monitor.",
      tone: "accent",
    },
    {
      icon: WarningAmberOutlinedIcon,
      label: "Pending Review",
      value: summaryCounts.pendingReview,
      helper: "Waiting on validation or approval.",
      tone: "warning",
    },
    {
      icon: ErrorOutlineOutlinedIcon,
      label: "Validation Failed",
      value: summaryCounts.validationFailed,
      helper: "Blocked by missing fields or conflicts.",
      tone: "danger",
    },
    {
      icon: CheckCircleOutlineOutlinedIcon,
      label: "Synced Successfully",
      value: summaryCounts.synced,
      helper: "Delivered successfully to the sync pipeline.",
      tone: "success",
    },
    {
      icon: CameraAltOutlinedIcon,
      label: "OCR / Photo Submissions",
      value: summaryCounts.media,
      helper: "Submissions with proof or OCR evidence.",
      tone: "info",
    },
  ];

  const renderSortableHeader = (column) => {
    const isActive = sortKey === column.key;
    const SortIcon = isActive ? (sortDirection === "asc" ? ArrowUpwardOutlinedIcon : ArrowDownwardOutlinedIcon) : null;

    return (
      <button
        key={column.key}
        type="button"
        className={`submission-sort-header ${column.sortable ? "is-sortable" : "is-static"} ${isActive ? "is-active" : ""}`}
        onClick={column.sortable ? () => toggleSort(column.key) : undefined}
        disabled={!column.sortable}
      >
        <span>{column.label}</span>
        {column.sortable ? (
          <span className="submission-sort-icon" aria-hidden="true">
            {SortIcon ? <SortIcon fontSize="inherit" /> : <ArrowUpwardOutlinedIcon fontSize="inherit" className="submission-sort-icon-placeholder" />}
          </span>
        ) : null}
      </button>
    );
  };

  const renderSubmissionCell = (submission, column) => {
    const submissionId = submission.submissionId || submission.submission_ref || getSubmissionId(submission) || "-";
    const trackLabel = getSubmissionTrackLabel(submission);
    const driverLabel = getSubmissionDriverLabel(submission);
    const driverId = submission.driverCode || submission.data?.driver_id || submission.driver?.driver_id || "-";
    const vehicleId = submission.vehicleCode || submission.data?.vehicle_id || submission.vehicle?.vehicle_id || "-";
    const sessionType = submission.sessionTypeLabel || "-";
    const sessionNumber = submission.sessionNumberLabel || "-";
    const duration = submission.durationLabel || "-";
    const tireSet = submission.tireSetLabel || "-";
    const notes = submission.notesLabel || "-";
    const createdBy = submission.createdByLabel || "-";
    const createdAt = submission.submittedAtLabel || formatDateTime(submission.submittedAt || submission.createdAt || submission.updatedAt);
    const statusTone = getReviewStateTone(submission.validationStateKey);
    const syncTone =
      submission.syncStateKey === "sent"
        ? "success"
        : submission.syncStateKey === "failed"
          ? "danger"
          : "warning";
    const confidenceTone = getConfidenceTone(submission.confidence);

    switch (column.key) {
      case "submissionId":
        return (
          <div className="submission-cell-stack">
            <strong className="submission-mono">{submissionId}</strong>
            <span className="submission-cell-subtext">
              {formatDate(submission.sessionDateLabel || submission.submittedAt || submission.createdAt)}
            </span>
          </div>
        );
      case "sessionDate":
        return (
          <div className="submission-cell-stack">
            <strong>{submission.sessionDateLabel || "-"}</strong>
            <span className="submission-cell-subtext">
              {submission.sessionTimeLabel || "Session time not captured"}
            </span>
          </div>
        );
      case "sessionTime":
        return <strong className="submission-mono">{submission.sessionTimeLabel || "-"}</strong>;
      case "track":
        return (
          <div className="submission-cell-stack">
            <strong>{trackLabel}</strong>
            <span className="submission-cell-subtext">{submission.event?.name || "Event-linked track"}</span>
          </div>
        );
      case "driverName":
        return (
          <div className="submission-cell-stack">
            <strong>{driverLabel}</strong>
            <span className="submission-cell-subtext">{driverId}</span>
          </div>
        );
      case "driverId":
        return <strong className="submission-mono">{driverId}</strong>;
      case "vehicleId":
        return <strong className="submission-mono">{vehicleId}</strong>;
      case "sessionType":
        return <strong>{sessionType}</strong>;
      case "sessionNumber":
        return <strong className="submission-mono">{sessionNumber}</strong>;
      case "durationMin":
        return <strong className="submission-mono">{duration}</strong>;
      case "tireSet":
        return <strong>{tireSet}</strong>;
      case "notes":
        return (
          <div className="submission-cell-stack">
            <strong className="submission-note-title">{notes}</strong>
            <span className="submission-cell-subtext">
              {submission.rawText ? "Raw notes available in the drawer" : "No notes provided"}
            </span>
          </div>
        );
      case "createdBy":
        return (
          <div className="submission-cell-stack">
            <strong>{createdBy}</strong>
            <span className="submission-cell-subtext">{submission.sourceTypeLabel}</span>
          </div>
        );
      case "createdAt":
        return (
          <div className="submission-cell-stack">
            <strong>{createdAt}</strong>
            <span className="submission-cell-subtext">{submission.reviewStateLabel}</span>
          </div>
        );
      case "status":
        return (
          <div className="submission-status-stack">
            <StatusBadge label={submission.validationStateLabel} tone={statusTone} />
            <StatusBadge label={submission.syncStateLabel} tone={syncTone} />
            <span className={`submission-confidence-badge tone-${confidenceTone}`}>
              Confidence {submission.confidenceLabel || "-"}
            </span>
          </div>
        );
      case "actions":
        return (
          <div className="submission-action-grid">
            <ActionIconButton
              icon={VisibilityOutlinedIcon}
              label="View Details"
              title="View Details"
              onClick={(event) => {
                event.stopPropagation();
                openDrawer(submission, "overview");
              }}
            />
            <ActionIconButton
              icon={CheckCircleOutlineOutlinedIcon}
              label="Approve"
              title="Approve Submission"
              tone="success"
              onClick={(event) => {
                event.stopPropagation();
                handleApproveSubmission(submission);
              }}
              disabled={
                busyAction === `approve:${submission.id}` ||
                submission.validationStateKey === "failed" ||
                submission.validationStateKey === "archived"
              }
            />
            <ActionIconButton
              icon={CancelOutlinedIcon}
              label="Reject"
              title="Reject Submission"
              tone="danger"
              onClick={(event) => {
                event.stopPropagation();
                handleFlagForCorrection(submission);
              }}
              disabled={busyAction === `flag:${submission.id}` || submission.validationStateKey === "archived"}
            />
            <ActionIconButton
              icon={DownloadOutlinedIcon}
              label="CSV"
              title="Export CSV"
              onClick={(event) => {
                event.stopPropagation();
                handleExportSubmission(submission, "csv");
              }}
              disabled={busyAction === `archive:${submission.id}`}
            />
            <ActionIconButton
              icon={DescriptionOutlinedIcon}
              label="Excel"
              title="Export Excel"
              onClick={(event) => {
                event.stopPropagation();
                handleExportSubmission(submission, "excel");
              }}
              disabled={busyAction === `archive:${submission.id}`}
            />
          </div>
        );
      default:
        return <strong>{String(submission[column.key] || "-")}</strong>;
    }
  };

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="submission-monitor-page fleet-page-shell">
        <div className="submission-monitor-orb submission-monitor-orb-one" />
        <div className="submission-monitor-orb submission-monitor-orb-two" />

        <header className="submission-monitor-header">
          <div className="submission-monitor-copy">
            <p className="submission-monitor-eyebrow">Admin Operations</p>
            <h1>Submission Review</h1>
            <p className="submission-monitor-subtitle">
              Review Make.com bulk submissions in an Excel-style sheet, validate records, and open a polished right-side drawer for full inspection.
            </p>
          </div>

          <div className="submission-monitor-header-actions">
            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={refreshMonitor}
            >
              <RefreshOutlinedIcon fontSize="inherit" />
              Refresh Monitor
            </button>
            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={handleExportCsv}
            >
              <DownloadOutlinedIcon fontSize="inherit" />
              Export CSV
            </button>
            <button
              type="button"
              className="fleet-btn fleet-btn-primary"
              onClick={handleExportExcel}
            >
              <DownloadOutlinedIcon fontSize="inherit" />
              Export Excel
            </button>
          </div>
        </header>

        <div className="submission-monitor-summary-grid">
          {summaryCards.map((card) => (
            <MetricCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              helper={card.helper}
              tone={card.tone}
            />
          ))}
        </div>

        <section className="submission-monitor-filter-panel">
          <div className="submission-monitor-filter-grid">
            <div className="fleet-field submission-filter-search">
              <label className="fleet-label" htmlFor="submission-search">
                Search
              </label>
              <div className="submission-search-wrap">
                <SearchOutlinedIcon fontSize="small" />
                <input
                  id="submission-search"
                  className="fleet-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search submission ID, driver, vehicle, track, notes, or raw text..."
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-session-type-filter">
                Session Type
              </label>
              <select
                id="submission-session-type-filter"
                className="fleet-select"
                value={sessionTypeFilter}
                onChange={(event) => setSessionTypeFilter(event.target.value)}
              >
                <option value="all">All Session Types</option>
                {sessionTypeOptions.map((option) => (
                  <option key={option.value} value={String(option.value).toLowerCase()}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-driver-filter">
                Driver
              </label>
              <select
                id="submission-driver-filter"
                className="fleet-select"
                value={driverFilter}
                onChange={(event) => setDriverFilter(event.target.value)}
              >
                <option value="all">All Drivers</option>
                {driverOptions.map((option) => (
                  <option key={option.value} value={String(option.value).toLowerCase()}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-vehicle-filter">
                Vehicle
              </label>
              <select
                id="submission-vehicle-filter"
                className="fleet-select"
                value={vehicleFilter}
                onChange={(event) => setVehicleFilter(event.target.value)}
              >
                <option value="all">All Vehicles</option>
                {vehicleOptions.map((option) => (
                  <option key={option.value} value={String(option.value).toLowerCase()}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-status-filter">
                Status
              </label>
              <select
                id="submission-status-filter"
                className="fleet-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-date-from">
                From Date
              </label>
              <input
                id="submission-date-from"
                className="fleet-input"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-date-to">
                To Date
              </label>
              <input
                id="submission-date-to"
                className="fleet-input"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </div>

          <div className="submission-monitor-filter-actions">
            <div className="submission-monitor-filter-hint">
              <TuneOutlinedIcon fontSize="small" />
              Showing {filteredSubmissions.length} of {submissionRecords.length} submissions
            </div>

            <div className="submission-monitor-button-row">
              <button
                type="button"
                className="fleet-btn fleet-btn-secondary"
                onClick={clearFilters}
                disabled={!hasFilters}
              >
                Clear Filters
              </button>
              <button
                type="button"
                className="fleet-btn fleet-btn-primary"
                onClick={refreshMonitor}
              >
                <RefreshOutlinedIcon fontSize="inherit" />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {notice ? (
          <div className={`submission-monitor-notice submission-monitor-notice-${notice.tone}`}>
            {notice.message}
          </div>
        ) : null}

        {pageError ? <div className="submission-monitor-error">{pageError}</div> : null}

        <section className="submission-table-section">
          <div className="submission-table-heading">
            <div>
              <h2 className="submission-table-title">Bulk Submission Spreadsheet</h2>
              <p className="submission-table-subtitle">
                Click any row to open the right-side review drawer with raw input, parsed fields, and audit notes.
              </p>
            </div>
          </div>

          {loading ? (
            <Loader label="Loading submissions" sublabel="Fetching the latest submission monitor data." fullHeight />
          ) : filteredSubmissions.length ? (
            <div className="fleet-table-card submission-sheet-card">
              <div className="fleet-table-scroll">
                <div className="fleet-table submission-table submission-sheet-table">
                  <div
                    className="fleet-table-header submission-table-header"
                    style={{ gridTemplateColumns: SUBMISSION_TABLE_COLUMNS }}
                  >
                    {SUBMISSION_SPREADSHEET_COLUMNS.map((column) => renderSortableHeader(column))}
                  </div>

                  {filteredSubmissions.map((submission) => {
                    const rowId = getSubmissionId(submission);
                    const isSelected = String(selectedSubmissionId) === String(rowId);

                    return (
                      <div
                        key={rowId || submission.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Open submission ${submission.submissionId || submission.submission_ref || rowId}`}
                        className={`fleet-table-row submission-table-row ${isSelected ? "is-selected" : ""}`}
                        style={{ gridTemplateColumns: SUBMISSION_TABLE_COLUMNS }}
                        onClick={() => openDrawer(submission, "overview")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDrawer(submission, "overview");
                          }
                        }}
                      >
                        {SUBMISSION_SPREADSHEET_COLUMNS.map((column) => (
                          <div key={column.key} className="fleet-table-cell" data-label={column.label}>
                            {renderSubmissionCell(submission, column)}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : hasFilters ? (
            <EmptyStatePanel
              icon={DatasetOutlinedIcon}
              title="No submissions match your filters"
              description="Try widening the date range or clearing the current filters to review more submissions."
              action={
                <>
                  <button
                    type="button"
                    className="fleet-btn fleet-btn-secondary"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </button>
                  <button
                    type="button"
                    className="fleet-btn fleet-btn-primary"
                    onClick={refreshMonitor}
                  >
                    Refresh Monitor
                  </button>
                </>
              }
            />
          ) : (
            <EmptyStatePanel
              icon={PendingActionsOutlinedIcon}
              title="No submissions yet"
              description="Incoming mechanic submissions will appear here with validation, sync, and review state once they arrive."
              action={
                <button
                  type="button"
                  className="fleet-btn fleet-btn-primary"
                  onClick={refreshMonitor}
                >
                  Refresh Monitor
                </button>
              }
            />
          )}
        </section>
      </div>

      <SubmissionReviewDrawer
        open={drawerOpen}
        submission={selectedSubmission}
        allSubmissions={submissionRecords}
        focusSection={drawerFocus}
        onClose={closeDrawer}
        onMarkReviewed={handleMarkReviewed}
        onApprove={handleApproveSubmission}
        onFlag={handleFlagForCorrection}
        onRetryValidation={handleRetryValidation}
        onRetrySync={handleRetrySync}
        onArchive={(record) => setArchiveTarget(record)}
        busyAction={busyAction}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive Submission"
        message={
          archiveTarget
            ? `Archive ${archiveTarget.submissionId || archiveTarget.submission_ref || formatDateTime(archiveTarget.id)}? This keeps the record filterable for audit history without deleting it.`
            : "Archive this submission? It will remain visible in archived filters."
        }
        confirmLabel={busyAction === `archive:${archiveTarget?.id}` ? "Working..." : "Archive Submission"}
        cancelLabel="Cancel"
        confirmTitle="Archive Submission"
        tone="danger"
        busy={busyAction === `archive:${archiveTarget?.id}`}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => handleArchiveSubmission(archiveTarget)}
        icon={ArchiveOutlinedIcon}
      />
    </ProtectedRoute>
  );
}
