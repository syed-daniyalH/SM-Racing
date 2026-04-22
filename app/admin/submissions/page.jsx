"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import Loader from "../../components/Common/Loader";
import StatusBadge from "../../components/Common/StatusBadge";
import ScreenBackButton from "../../components/Common/ScreenBackButton";
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
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DatasetOutlinedIcon from "@mui/icons-material/DatasetOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending_review", label: "Pending Review" },
  { value: "validated", label: "Validated" },
  { value: "failed", label: "Validation Failed" },
  { value: "archived", label: "Archived" },
];

const VALIDATION_FILTER_OPTIONS = [
  { value: "all", label: "All Validation" },
  { value: "clean", label: "Clean" },
  { value: "warning", label: "Warnings" },
  { value: "failed", label: "Failed" },
];

const SYNC_FILTER_OPTIONS = [
  { value: "all", label: "All Sync" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Synced" },
  { value: "failed", label: "Sync Failed" },
];

const SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "quick", label: "Quick Submission" },
  { value: "detail", label: "Detailed Submission" },
  { value: "ocr", label: "OCR Submission" },
  { value: "photo", label: "Photo Submission" },
];

const SUBMISSION_TABLE_COLUMNS =
  "minmax(150px, 0.95fr) minmax(160px, 0.9fr) minmax(240px, 1.25fr) minmax(150px, 0.85fr) minmax(220px, 1.05fr) minmax(220px, 1.1fr)";

const FILTER_TONE = {
  clean: "success",
  warning: "warning",
  failed: "danger",
};

const escapeCsvValue = (value) =>
  `"${String(value ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;

const formatSubmissionDate = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDateTime(date);
};

const buildEventFilterOptions = (submissions = []) => {
  const map = new Map();

  submissions.forEach((submission) => {
    const eventName = submission.event?.name || submission.eventId || "Unknown Event";
    const eventId = String(submission.event?.id || submission.eventId || eventName);
    if (!map.has(eventId)) {
      map.set(eventId, eventName);
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

export default function SubmissionReviewPage() {
  const { user } = useAuth();

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [validationFilter, setValidationFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [drawerFocus, setDrawerFocus] = useState("overview");
  const [busyAction, setBusyAction] = useState("");
  const [archiveTarget, setArchiveTarget] = useState(null);

  const refreshMonitor = useCallback(async ({ showSpinner = true } = {}) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      setPageError("");

      const response = await getAllSubmissions();
      const list = Array.isArray(response) ? response : response?.submissions || [];
      setSubmissions(list);
    } catch (error) {
      console.error("Failed to load submissions:", error);
      setSubmissions([]);
      setPageError(getApiErrorMessage(error, "Failed to load submissions."));
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, []);

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

  const eventOptions = useMemo(
    () => buildEventFilterOptions(submissionRecords),
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

    if (eventFilter !== "all") {
      next = next.filter(
        (submission) => String(submission.event?.id || submission.eventId || "") === eventFilter,
      );
    }

    if (statusFilter !== "all") {
      next = next.filter((submission) => submission.validationStateKey === statusFilter);
    }

    if (validationFilter !== "all") {
      next = next.filter((submission) => submission.validationSeverityKey === validationFilter);
    }

    if (syncFilter !== "all") {
      next = next.filter((submission) => submission.syncStateKey === syncFilter);
    }

    if (sourceFilter !== "all") {
      next = next.filter((submission) => submission.sourceTypeKey === sourceFilter);
    }

    if (fromKey) {
      next = next.filter((submission) => {
        const submittedAt = new Date(submission.submittedAt || submission.createdAt || submission.updatedAt || 0);
        return !Number.isNaN(submittedAt.getTime()) && submittedAt >= fromKey;
      });
    }

    if (toKey) {
      toKey.setHours(23, 59, 59, 999);
      next = next.filter((submission) => {
        const submittedAt = new Date(submission.submittedAt || submission.createdAt || submission.updatedAt || 0);
        return !Number.isNaN(submittedAt.getTime()) && submittedAt <= toKey;
      });
    }

    return next.sort((left, right) => {
      const rightTime = new Date(right.submittedAt || right.createdAt || right.updatedAt || 0).getTime();
      const leftTime = new Date(left.submittedAt || left.createdAt || left.updatedAt || 0).getTime();
      return rightTime - leftTime;
    });
  }, [
    dateFrom,
    dateTo,
    eventFilter,
    searchQuery,
    sourceFilter,
    statusFilter,
    submissionRecords,
    syncFilter,
    validationFilter,
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
    eventFilter !== "all" ||
    statusFilter !== "all" ||
    validationFilter !== "all" ||
    syncFilter !== "all" ||
    sourceFilter !== "all" ||
    dateFrom ||
    dateTo;

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

  const handleExportReport = () => {
    const rows = buildSubmissionExportRows(filteredSubmissions);
    const headers = [
      "Submission ID",
      "Date / Time",
      "Event",
      "Driver",
      "Vehicle",
      "Track",
      "Source Type",
      "Validation Status",
      "Sync Status",
      "Confidence",
      "Status",
      "Reviewed At",
      "Raw Text",
    ];

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.submissionId,
          row.dateTime,
          row.event,
          row.driver,
          row.vehicle,
          row.track,
          row.sourceType,
          row.validationStatus,
          row.syncStatus,
          row.confidence,
          row.status,
          row.reviewedAt,
          row.rawText,
        ]
          .map(escapeCsvValue)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `submission-review-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setNotice({
      tone: "success",
      message: `Exported ${rows.length} submission${rows.length === 1 ? "" : "s"} to CSV.`,
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setEventFilter("all");
    setStatusFilter("all");
    setValidationFilter("all");
    setSyncFilter("all");
    setSourceFilter("all");
    setDateFrom("");
    setDateTo("");
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

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="submission-monitor-page fleet-page-shell">
        <div className="submission-monitor-orb submission-monitor-orb-one" />
        <div className="submission-monitor-orb submission-monitor-orb-two" />

        <header className="submission-monitor-header">
          <div className="submission-monitor-copy">
            <ScreenBackButton fallbackHref="/admin/users" label="Back" />
            <p className="submission-monitor-eyebrow">Admin Operations</p>
            <h1>Submission Review</h1>
            <p className="submission-monitor-subtitle">
              Monitor validations, inspect incoming race data, and manage submission quality.
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
              className="fleet-btn fleet-btn-primary"
              onClick={handleExportReport}
            >
              <DownloadOutlinedIcon fontSize="inherit" />
              Export Report
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
                  placeholder="Search submission ID, driver, vehicle, event, track, or raw text..."
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-event-filter">
                Event
              </label>
              <select
                id="submission-event-filter"
                className="fleet-select"
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value)}
              >
                <option value="all">All Events</option>
                {eventOptions.map((option) => (
                  <option key={option.value} value={option.value}>
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
              <label className="fleet-label" htmlFor="submission-validation-filter">
                Validation State
              </label>
              <select
                id="submission-validation-filter"
                className="fleet-select"
                value={validationFilter}
                onChange={(event) => setValidationFilter(event.target.value)}
              >
                {VALIDATION_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-sync-filter">
                Sync State
              </label>
              <select
                id="submission-sync-filter"
                className="fleet-select"
                value={syncFilter}
                onChange={(event) => setSyncFilter(event.target.value)}
              >
                {SYNC_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="fleet-field">
              <label className="fleet-label" htmlFor="submission-source-filter">
                Source Type
              </label>
              <select
                id="submission-source-filter"
                className="fleet-select"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                {SOURCE_FILTER_OPTIONS.map((option) => (
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
              <h2 className="submission-table-title">Submissions</h2>
              <p className="submission-table-subtitle">
                Inspect raw input, validation outcome, sync status, and manual review decisions.
              </p>
            </div>
          </div>

          {loading ? (
            <Loader label="Loading submissions" sublabel="Fetching the latest submission monitor data." fullHeight />
          ) : filteredSubmissions.length ? (
            <div className="fleet-table-card">
              <div className="fleet-table-scroll">
                <div className="fleet-table submission-table">
                  <div
                    className="fleet-table-header submission-table-header"
                    style={{ gridTemplateColumns: SUBMISSION_TABLE_COLUMNS }}
                  >
                    {[
                      "Submission ID",
                      "Date / Time",
                      "Event",
                      "Source Type",
                      "Status",
                      "Actions",
                    ].map((label) => (
                      <div key={label} className="fleet-table-header-cell">
                        {label}
                      </div>
                    ))}
                  </div>

                  {filteredSubmissions.map((submission) => {
                    const displayId = submission.submissionId || submission.submission_ref || formatDateTime(submission.id);
                    const confidenceTone = getConfidenceTone(submission.confidence);
                    const validationTone = getReviewStateTone(submission.validationStateKey);
                    const syncTone =
                      submission.syncStateKey === "sent"
                        ? "success"
                        : submission.syncStateKey === "failed"
                          ? "danger"
                          : "warning";

                    return (
                      <div
                        key={submission.id}
                        className="fleet-table-row submission-table-row"
                        style={{ gridTemplateColumns: SUBMISSION_TABLE_COLUMNS }}
                      >
                        <div className="fleet-table-cell" data-label="Submission ID">
                          <div className="submission-cell-stack">
                            <strong className="submission-mono">{displayId}</strong>
                            <span className="submission-cell-subtext">
                              {formatDate(submission.createdAt || submission.submittedAt)}
                            </span>
                          </div>
                        </div>

                        <div className="fleet-table-cell" data-label="Date / Time">
                          <div className="submission-cell-stack">
                            <strong>{formatDateTime(submission.submittedAt || submission.createdAt || submission.updatedAt)}</strong>
                            <span className="submission-cell-subtext">
                              {submission.reviewStateLabel || "Awaiting review"}
                            </span>
                          </div>
                        </div>

                        <div className="fleet-table-cell" data-label="Event">
                          <div className="submission-cell-stack">
                            <strong>{submission.event?.name || "Unknown Event"}</strong>
                            <span className="submission-cell-subtext">
                              {submission.event?.track || submission.event?.trackName || submission.event?.track_name || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="fleet-table-cell" data-label="Source Type">
                          <StatusBadge label={submission.sourceTypeLabel} tone={submission.sourceTypeTone} />
                        </div>

                        <div className="fleet-table-cell" data-label="Status">
                          <div className="submission-status-stack">
                            <StatusBadge label={submission.validationStateLabel} tone={validationTone} />
                            <StatusBadge label={submission.syncStateLabel} tone={syncTone} />
                            <span className={`submission-confidence-badge tone-${confidenceTone}`}>
                              Confidence {submission.confidenceLabel || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="fleet-table-cell" data-label="Actions">
                          <div className="submission-action-stack">
                            <ActionIconButton
                              icon={VisibilityOutlinedIcon}
                              label="View Details"
                              title="View Details"
                              onClick={() => openDrawer(submission, "overview")}
                            />
                            <ActionIconButton
                              icon={DescriptionOutlinedIcon}
                              label="Review Raw Input"
                              title="Review Raw Input"
                              onClick={() => openDrawer(submission, "raw")}
                            />
                            <ActionIconButton
                              icon={DatasetOutlinedIcon}
                              label="Review Parsed Data"
                              title="Review Parsed Data"
                              onClick={() => openDrawer(submission, "parsed")}
                            />
                            <ActionIconButton
                              icon={ReplayOutlinedIcon}
                              label="Retry Validation"
                              title="Retry Validation"
                              onClick={() => handleRetryValidation(submission)}
                              disabled={busyAction === `validate:${submission.id}` || submission.validationStateKey === "archived"}
                            />
                            <ActionIconButton
                              icon={SyncOutlinedIcon}
                              label="Retry Sync"
                              title="Retry Sync"
                              onClick={() => handleRetrySync(submission)}
                              disabled={busyAction === `sync:${submission.id}` || submission.syncStateKey !== "failed" || submission.validationStateKey === "archived"}
                            />
                            <ActionIconButton
                              icon={ArchiveOutlinedIcon}
                              label="Archive"
                              title="Archive Submission"
                              tone="danger"
                              onClick={() => setArchiveTarget(submission)}
                              disabled={busyAction === `archive:${submission.id}` || submission.validationStateKey === "archived"}
                            />
                          </div>
                        </div>
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
