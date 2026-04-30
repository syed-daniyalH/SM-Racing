"use client"

import { useMemo } from "react"
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined"
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined"
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined"

import StatusBadge from "../../../components/Common/StatusBadge"
import { DrawerShell } from "../../fleet/_components/ManagementUi"
import { buildSubmissionMonitorRecord } from "./submissionReviewHelpers"
import SubmissionReviewWorkspace from "./SubmissionReviewWorkspace"

export default function SubmissionReviewDrawer({
  open,
  submission,
  allSubmissions = [],
  focusSection = "overview",
  onClose,
  onRetryValidation,
  onRetrySync,
  onArchive,
  busyAction = "",
}) {
  const record = useMemo(() => {
    if (!submission) return null
    return buildSubmissionMonitorRecord(submission, allSubmissions)
  }, [submission, allSubmissions])

  if (!open || !record) {
    return null
  }

  const canRetrySync = record.syncStateKey === "failed"
  const canArchive = record.validationStateKey !== "archived"
  const confidenceTone =
    record.confidence === null
      ? "neutral"
      : record.confidence >= 90
        ? "success"
        : record.confidence >= 80
          ? "warning"
          : "danger"

  const footer = (
    <div className="submission-drawer-actions">
      <button
        type="button"
        className="fleet-btn fleet-btn-secondary"
        onClick={() => onRetryValidation?.(record)}
        disabled={busyAction.startsWith("validate:") || record.isArchived}
      >
        <WarningAmberOutlinedIcon fontSize="inherit" />
        {busyAction === `validate:${record.id}` ? "Working..." : "Retry Validation"}
      </button>
      <button
        type="button"
        className="fleet-btn fleet-btn-secondary"
        onClick={() => onRetrySync?.(record)}
        disabled={busyAction.startsWith("sync:") || !canRetrySync || record.isArchived}
      >
        <CloudSyncOutlinedIcon fontSize="inherit" />
        {busyAction === `sync:${record.id}` ? "Working..." : "Retry Sync"}
      </button>
      <button
        type="button"
        className="fleet-btn fleet-btn-danger"
        onClick={() => onArchive?.(record)}
        disabled={busyAction.startsWith("archive:") || !canArchive}
      >
        <ArchiveOutlinedIcon fontSize="inherit" />
        {record.isArchived ? "Archived" : busyAction === `archive:${record.id}` ? "Working..." : "Archive Submission"}
      </button>
    </div>
  )

  return (
    <DrawerShell
      open
      wide
      onClose={onClose}
      title="Submission Review"
      subtitle="Inspect raw input, parsed session details, sync state, and system findings from the admin console."
      meta={
        <div className="submission-drawer-meta">
          <StatusBadge label={record.validationStateLabel} tone={record.validationStateTone} title="Validation status" />
          <StatusBadge label={record.syncStateLabel} tone={record.syncStateTone} title="Sync status" />
          <StatusBadge label={record.sourceTypeLabel} tone={record.sourceTypeTone} title="Source type" />
          <span className={`submission-confidence-chip tone-${confidenceTone}`}>
            Confidence {record.confidenceLabel}
          </span>
        </div>
      }
      footer={footer}
    >
      <SubmissionReviewWorkspace record={record} focusSection={focusSection} />
    </DrawerShell>
  )
}
