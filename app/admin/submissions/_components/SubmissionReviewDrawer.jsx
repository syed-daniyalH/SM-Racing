"use client";

import { useEffect, useMemo, useRef } from "react";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CloudSyncOutlinedIcon from "@mui/icons-material/CloudSyncOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DatasetOutlinedIcon from "@mui/icons-material/DatasetOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

import StatusBadge from "../../../components/Common/StatusBadge";
import { DrawerShell } from "../../fleet/_components/ManagementUi";
import {
  formatDate,
  formatDateTime,
  formatEntityId,
} from "../../fleet/_components/fleetManagementHelpers";
import {
  buildSubmissionMonitorRecord,
  getSubmissionDriverLabel,
  getSubmissionEventLabel,
  getSubmissionTrackLabel,
  getSubmissionVehicleLabel,
} from "./submissionReviewHelpers";

const KeyValue = ({ label, value, mono = false }) => (
  <div className="submission-kv-card">
    <p className="submission-kv-label">{label}</p>
    <p className={`submission-kv-value ${mono ? "submission-mono" : ""}`}>
      {value || "-"}
    </p>
  </div>
);

const Section = ({ id, icon: Icon, eyebrow, title, description, children, sectionRef }) => (
  <section ref={sectionRef} id={id} className="submission-section">
    <div className="submission-section-header">
      <div className="submission-section-heading">
        <span className="submission-section-eyebrow">
          {Icon ? <Icon fontSize="inherit" /> : null}
          {eyebrow}
        </span>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
    <div className="submission-section-body">{children}</div>
  </section>
);

const InfoPill = ({ label, value, tone = "neutral" }) => (
  <div className={`submission-info-pill submission-info-${tone}`}>
    <span className="submission-info-label">{label}</span>
    <span className="submission-info-value">{value || "-"}</span>
  </div>
);

const JsonBlock = ({ value, emptyLabel = "No data available." }) => (
  <pre className="submission-json-block">
    {value && Object.keys(value).length ? JSON.stringify(value, null, 2) : emptyLabel}
  </pre>
);

const renderCornerList = (pressures = {}) => {
  const selected = pressures.cold || pressures.hot || {};
  const corners = [
    ["FL", selected.fl],
    ["FR", selected.fr],
    ["RL", selected.rl],
    ["RR", selected.rr],
  ];

  return (
    <div className="submission-corner-grid">
      {corners.map(([corner, value]) => (
        <div key={corner} className="submission-corner-card">
          <span className="submission-corner-label">{corner}</span>
          <span className="submission-corner-value">
            {value === null || value === undefined || value === "" ? "-" : value}
          </span>
        </div>
      ))}
    </div>
  );
};

const formatSuspensionCorners = (suspension = {}, baseKey) => {
  const values = [
    suspension?.[`${baseKey}_fl`] ?? suspension?.[`${baseKey}_f`] ?? null,
    suspension?.[`${baseKey}_fr`] ?? suspension?.[`${baseKey}_f`] ?? null,
    suspension?.[`${baseKey}_rl`] ?? suspension?.[`${baseKey}_r`] ?? null,
    suspension?.[`${baseKey}_rr`] ?? suspension?.[`${baseKey}_r`] ?? null,
  ];

  if (!values.some((value) => value !== null && value !== undefined && value !== "")) {
    return "-";
  }

  return values
    .map((value) => (value === null || value === undefined || value === "" ? "-" : value))
    .join(" / ");
};

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
  const sectionRefs = useRef({
    overview: null,
    validation: null,
    raw: null,
    parsed: null,
    system: null,
  });

  const record = useMemo(() => {
    if (!submission) return null;
    return buildSubmissionMonitorRecord(submission, allSubmissions);
  }, [submission, allSubmissions]);

  useEffect(() => {
    if (!open || !record) return undefined;

    const target = sectionRefs.current[focusSection];
    if (!target) return undefined;

    const timeout = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    return () => window.clearTimeout(timeout);
  }, [focusSection, open, record]);

  if (!open || !record) {
    return null;
  }

  const submissionId = record.submissionId || record.submission_ref || formatEntityId("SUB", record.id);
  const canRetrySync = record.syncStateKey === "failed";
  const canArchive = record.validationStateKey !== "archived";

  const eventName = getSubmissionEventLabel(record);
  const driverName = getSubmissionDriverLabel(record);
  const vehicleName = getSubmissionVehicleLabel(record);
  const trackName = getSubmissionTrackLabel(record);

  const submissionData = record.data || {};
  const pressures = submissionData.pressures || {};
  const sessionType = submissionData.session_type || submissionData.sessionType || "-";
  const sessionNumber = submissionData.session_number || submissionData.sessionNumber || "-";
  const confidenceTone =
    record.confidence === null
      ? "neutral"
      : record.confidence >= 90
        ? "success"
        : record.confidence >= 80
          ? "warning"
          : "danger";

  const footer = (
    <div className="submission-drawer-actions">
      <button
        type="button"
        className="fleet-btn fleet-btn-secondary"
        onClick={() => onRetryValidation?.(record)}
        disabled={busyAction.startsWith("validate:") || record.isArchived}
      >
        {busyAction === `validate:${record.id}` ? "Working..." : "Retry Validation"}
      </button>
      <button
        type="button"
        className="fleet-btn fleet-btn-secondary"
        onClick={() => onRetrySync?.(record)}
        disabled={busyAction.startsWith("sync:") || !canRetrySync || record.isArchived}
      >
        {busyAction === `sync:${record.id}` ? "Working..." : "Retry Sync"}
      </button>
      <button
        type="button"
        className="fleet-btn fleet-btn-danger"
        onClick={() => onArchive?.(record)}
        disabled={busyAction.startsWith("archive:") || !canArchive}
      >
        {record.isArchived ? "Archived" : busyAction === `archive:${record.id}` ? "Working..." : "Archive Submission"}
      </button>
    </div>
  );

  return (
    <DrawerShell
      open={open}
      wide
      onClose={onClose}
      title="Submission Review"
      subtitle="Inspect raw input, parsed session details, sync state, and system findings from the admin console."
      meta={
        <div className="submission-drawer-meta">
          <StatusBadge
            label={record.validationStateLabel}
            tone={record.validationStateTone}
            title="Validation status"
          />
          <StatusBadge
            label={record.syncStateLabel}
            tone={record.syncStateTone}
            title="Sync status"
          />
          <StatusBadge
            label={record.sourceTypeLabel}
            tone={record.sourceTypeTone}
            title="Source type"
          />
          <span className={`submission-confidence-chip tone-${confidenceTone}`}>
            Confidence {record.confidenceLabel}
          </span>
        </div>
      }
      footer={footer}
    >
      <div className="submission-drawer-content">
        <Section
          id="overview"
          sectionRef={(node) => {
            sectionRefs.current.overview = node;
          }}
          icon={DatasetOutlinedIcon}
          eyebrow="General Details"
          title={submissionId}
          description="Core submission identity and operational context."
        >
          <div className="submission-detail-grid">
            <KeyValue label="Created By" value={formatEntityId("USR", record.userId)} mono />
            <KeyValue label="Event" value={eventName} />
            <KeyValue label="Driver" value={driverName} />
            <KeyValue label="Vehicle" value={vehicleName} />
            <KeyValue label="Track" value={trackName} />
            <KeyValue
              label="Run Group"
              value={record.run_group?.normalized || record.runGroup || record.run_group?.rawText || "-"}
            />
            <KeyValue label="Session Type" value={sessionType} />
            <KeyValue label="Session Number" value={sessionNumber} />
            <KeyValue label="Created At" value={formatDateTime(record.createdAt || record.submittedAt)} />
            <KeyValue label="Source Type" value={record.sourceTypeLabel} />
          </div>
        </Section>

        <Section
          id="validation"
          sectionRef={(node) => {
            sectionRefs.current.validation = node;
          }}
          icon={WarningAmberOutlinedIcon}
          eyebrow="Validation Details"
          title="Validation Status"
          description="Clear visibility into field-level issues, mismatch warnings, and parser recommendations."
        >
          <div className="submission-review-strip">
            <div className="submission-review-strip-item">
              <span className="submission-review-strip-label">Validation</span>
              <StatusBadge label={record.validationStateLabel} tone={record.validationStateTone} />
            </div>
            <div className="submission-review-strip-item">
              <span className="submission-review-strip-label">Sync</span>
              <StatusBadge label={record.syncStateLabel} tone={record.syncStateTone} />
            </div>
            <div className="submission-review-strip-item">
              <span className="submission-review-strip-label">Confidence</span>
              <span className={`submission-confidence-badge tone-${confidenceTone}`}>
                {record.confidenceLabel}
              </span>
            </div>
          </div>

          {record.validationMessages.length ? (
            <div className={`submission-alert submission-alert-${record.validationStateTone}`}>
              <div className="submission-alert-title">
                <ErrorOutlineOutlinedIcon fontSize="small" />
                {record.validationStateLabel}
              </div>
              <ul className="submission-alert-list">
                {record.validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
              <p className="submission-alert-copy">{record.recommendation}</p>
            </div>
          ) : (
            <div className="submission-alert submission-alert-success">
              <div className="submission-alert-title">
                <CheckCircleOutlineOutlinedIcon fontSize="small" />
                No blocking validation errors
              </div>
              <p className="submission-alert-copy">{record.recommendation}</p>
            </div>
          )}

          <div className="submission-issue-grid">
            <div className="submission-issue-card">
              <p className="submission-issue-label">Failed Fields</p>
              <p className="submission-issue-value">
                {record.failedFields.length ? record.failedFields.join(", ") : "None"}
              </p>
            </div>
            <div className="submission-issue-card">
              <p className="submission-issue-label">Missing Fields</p>
              <p className="submission-issue-value">
                {record.missingFields.length ? record.missingFields.join(", ") : "None"}
              </p>
            </div>
            <div className="submission-issue-card">
              <p className="submission-issue-label">Duplicate Detection</p>
              <p className="submission-issue-value">{record.duplicateDetection.message}</p>
            </div>
            <div className="submission-issue-card">
              <p className="submission-issue-label">Driver / Vehicle</p>
              <p className="submission-issue-value">
                {record.driverVehicleMismatch ? "Mismatch detected" : "Aligned"}
              </p>
            </div>
            <div className="submission-issue-card">
              <p className="submission-issue-label">Track Normalization</p>
              <p className="submission-issue-value">
                {record.trackNormalizationWarning ? "Needs review" : "Aligned"}
              </p>
            </div>
            <div className="submission-issue-card">
              <p className="submission-issue-label">Run Group Normalization</p>
              <p className="submission-issue-value">
                {record.runGroupNormalizationWarning ? "Needs review" : "Aligned"}
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="raw"
          sectionRef={(node) => {
            sectionRefs.current.raw = node;
          }}
          icon={DescriptionOutlinedIcon}
          eyebrow="Raw Input"
          title="Raw Input Verification"
          description="Review the exact input received from the mechanic, OCR, or photo source."
        >
          <div className="submission-raw-grid">
            <div className="submission-raw-card">
              <div className="submission-raw-card-title">raw_text</div>
              <pre className="submission-code-block">
                {record.rawText || "No raw text submitted."}
              </pre>
            </div>

            <div className="submission-raw-card">
              <div className="submission-raw-card-title">raw_payload_json</div>
              <JsonBlock value={submissionData} emptyLabel="No structured payload available." />
            </div>

            <div className="submission-raw-card">
              <div className="submission-raw-card-title">OCR Text</div>
              <pre className="submission-code-block">
                {record.ocrText || "No OCR text captured."}
              </pre>
            </div>

            <div className="submission-raw-card submission-raw-image-card">
              <div className="submission-raw-card-title">Proof Attachment</div>
              {record.imageUrl ? (
                <img
                  className="submission-proof-image"
                  src={record.imageUrl}
                  alt="Submission proof"
                />
              ) : (
                <div className="submission-image-empty">
                  <ImageOutlinedIcon fontSize="inherit" />
                  <span>No image uploaded.</span>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          id="parsed"
          sectionRef={(node) => {
            sectionRefs.current.parsed = node;
          }}
          icon={DatasetOutlinedIcon}
          eyebrow="Parsed Data"
          title="Structured Submission Data"
          description="Review the interpreted session details and structured telemetry captured from the submission."
        >
          <div className="submission-structured-grid">
            <div className="submission-structured-card">
              <div className="submission-structured-title">Session</div>
              <div className="submission-detail-grid submission-detail-grid-tight">
                <InfoPill label="Date" value={submissionData.date} />
                <InfoPill label="Time" value={submissionData.time} />
                <InfoPill label="Session Type" value={submissionData.session_type} />
                <InfoPill label="Session #" value={submissionData.session_number} />
                <InfoPill label="Duration" value={submissionData.duration_min ? `${submissionData.duration_min} min` : "-"} />
                <InfoPill label="Track" value={submissionData.track || trackName} />
              </div>
            </div>

            <div className="submission-structured-card">
              <div className="submission-structured-title">Pressures</div>
              <div className="submission-structured-meta">
                <span className="submission-structured-unit">
                  Unit: {submissionData.pressures?.unit || "psi"}
                </span>
              </div>
              {renderCornerList(pressures)}
            </div>

            <div className="submission-structured-card">
              <div className="submission-structured-title">Suspension</div>
              <div className="submission-detail-grid submission-detail-grid-tight">
                <InfoPill
                  label="Rebound (FL/FR/RL/RR)"
                  value={formatSuspensionCorners(submissionData.suspension, "rebound")}
                />
                <InfoPill
                  label="Bump (FL/FR/RL/RR)"
                  value={formatSuspensionCorners(submissionData.suspension, "bump")}
                />
                <InfoPill
                  label="Sway Bar F/R"
                  value={`${submissionData.suspension?.sway_bar_f ?? "-"} / ${submissionData.suspension?.sway_bar_r ?? "-"}`}
                />
                <InfoPill
                  label="Wing Angle"
                  value={
                    submissionData.suspension?.wing_angle_deg !== undefined &&
                    submissionData.suspension?.wing_angle_deg !== null
                      ? `${submissionData.suspension.wing_angle_deg} deg`
                      : "-"
                  }
                />
              </div>
            </div>

            <div className="submission-structured-card">
              <div className="submission-structured-title">Alignment</div>
              <div className="submission-detail-grid submission-detail-grid-tight">
                <InfoPill
                  label="Camber FL/FR"
                  value={`${submissionData.alignment?.camber_fl ?? "-"} / ${submissionData.alignment?.camber_fr ?? "-"}`}
                />
                <InfoPill
                  label="Camber RL/RR"
                  value={`${submissionData.alignment?.camber_rl ?? "-"} / ${submissionData.alignment?.camber_rr ?? "-"}`}
                />
                <InfoPill
                  label="Toe Front/Rear"
                  value={`${submissionData.alignment?.toe_front ?? "-"} / ${submissionData.alignment?.toe_rear ?? "-"}`}
                />
                <InfoPill
                  label="Rake"
                  value={
                    submissionData.alignment?.rake_mm !== undefined &&
                    submissionData.alignment?.rake_mm !== null
                      ? `${submissionData.alignment.rake_mm} mm`
                      : "-"
                  }
                />
              </div>
            </div>

            <div className="submission-structured-card">
              <div className="submission-structured-title">Tire Temperatures</div>
              <div className="submission-detail-grid submission-detail-grid-tight">
                <InfoPill
                  label="FL"
                  value={
                    [submissionData.tire_temperatures?.fl_out, submissionData.tire_temperatures?.fl_mid, submissionData.tire_temperatures?.fl_in]
                      .filter((item) => item !== undefined && item !== null && item !== "")
                      .join(" / ") || "-"
                  }
                />
                <InfoPill
                  label="FR"
                  value={
                    [submissionData.tire_temperatures?.fr_out, submissionData.tire_temperatures?.fr_mid, submissionData.tire_temperatures?.fr_in]
                      .filter((item) => item !== undefined && item !== null && item !== "")
                      .join(" / ") || "-"
                  }
                />
                <InfoPill
                  label="RL"
                  value={
                    [submissionData.tire_temperatures?.rl_out, submissionData.tire_temperatures?.rl_mid, submissionData.tire_temperatures?.rl_in]
                      .filter((item) => item !== undefined && item !== null && item !== "")
                      .join(" / ") || "-"
                  }
                />
                <InfoPill
                  label="RR"
                  value={
                    [submissionData.tire_temperatures?.rr_out, submissionData.tire_temperatures?.rr_mid, submissionData.tire_temperatures?.rr_in]
                      .filter((item) => item !== undefined && item !== null && item !== "")
                      .join(" / ") || "-"
                  }
                />
              </div>
            </div>

            <div className="submission-structured-card">
              <div className="submission-structured-title">Tire Inventory</div>
              <div className="submission-detail-grid submission-detail-grid-tight">
                <InfoPill label="Tire ID" value={submissionData.tire_inventory?.tire_id} />
                <InfoPill label="Manufacturer" value={submissionData.tire_inventory?.manufacturer} />
                <InfoPill label="Model" value={submissionData.tire_inventory?.model} />
                <InfoPill label="Size" value={submissionData.tire_inventory?.size} />
                <InfoPill
                  label="Heat Cycles"
                  value={submissionData.tire_inventory?.heat_cycles ?? "-"}
                />
                <InfoPill
                  label="Track Time"
                  value={
                    submissionData.tire_inventory?.track_time_min !== undefined &&
                    submissionData.tire_inventory?.track_time_min !== null
                      ? `${submissionData.tire_inventory.track_time_min} min`
                      : "-"
                  }
                />
                <InfoPill label="Status" value={submissionData.tire_inventory?.status} />
                <InfoPill
                  label="Wheelbase"
                  value={
                    submissionData.wheelbase_mm !== undefined &&
                    submissionData.wheelbase_mm !== null
                      ? `${submissionData.wheelbase_mm} mm`
                      : "-"
                  }
                />
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="system"
          sectionRef={(node) => {
            sectionRefs.current.system = node;
          }}
          icon={CloudSyncOutlinedIcon}
          eyebrow="System / Processing"
          title="Processing and Audit"
          description="Operational metadata used to trace parser behavior and sync outcomes."
        >
          <div className="submission-detail-grid">
            <KeyValue label="Sync Status" value={record.syncStateLabel} />
            <KeyValue label="Processed At" value={formatDateTime(record.processedAt || record.updatedAt)} />
            <KeyValue label="Parser Version" value={record.parserVersion} />
            <KeyValue label="Source Channel" value={record.sourceChannel || record.sourceTypeLabel} />
            <KeyValue label="Validation Status" value={record.validationStateLabel} />
            <KeyValue label="Archive State" value={record.isArchived ? "Archived" : "Live"} />
          </div>
          <div className="submission-audit-card">
            <div className="submission-structured-title">Audit Snippet</div>
            <p>{record.auditSnippet}</p>
          </div>
        </Section>
      </div>
    </DrawerShell>
  );
}
