"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

import { useAuth } from "../../../context/AuthContext";
import StatusBadge from "../../../components/Common/StatusBadge";
import { EmptyStatePanel } from "../../fleet/_components/ManagementUi";
import {
  formatDate,
  formatDateTime,
  formatEntityId,
  getApiErrorMessage,
} from "../../fleet/_components/fleetManagementHelpers";
import { updateSubmission } from "../../../utils/submissionApi";
import ProtectedAudioPlayer from "./ProtectedAudioPlayer";
import {
  buildReviewAnalysisPatch,
  buildSubmissionMonitorRecord,
  getSubmissionDriverLabel,
  getSubmissionEventLabel,
  getSubmissionId,
  getSubmissionTrackLabel,
  getSubmissionVehicleLabel,
} from "./submissionReviewHelpers";

const field = (label, path, options = {}) => ({ label, path, ...options });

const SEANCES_GROUPS = [
  {
    title: "Session Details",
    fields: [
      field("Date", ["date"], { type: "date", required: true }),
      field("Time", ["time"], { type: "time", required: true }),
      field("Session Type", ["session_type"], { type: "text", required: true }),
      field("Session #", ["session_number"], { type: "number", required: true }),
      field("Duration (min)", ["duration_min"], { type: "number", required: true }),
      field("Laps", ["laps"], { type: "number" }),
      field("Conditions", ["conditions"], { type: "text" }),
      field("Feedback", ["feedback"], {
        type: "textarea",
        span: 2,
        rows: 3,
        placeholder: "Grip, weather, tire behavior, or driver notes.",
      }),
      field("Wheelbase (mm)", ["wheelbase_mm"], { type: "number" }),
    ],
  },
];

const PRESSURE_GROUPS = [
  {
    title: "Core",
    fields: [
      field("Unit", ["pressures", "unit"], { type: "text", required: true, placeholder: "psi" }),
      field("Mode", ["pressures", "mode"], { type: "text", placeholder: "cold or hot" }),
    ],
  },
  {
    title: "Cold Set",
    fields: [
      field("Front-Left", ["pressures", "cold", "fl"], { type: "number" }),
      field("Front-Right", ["pressures", "cold", "fr"], { type: "number" }),
      field("Rear-Left", ["pressures", "cold", "rl"], { type: "number" }),
      field("Rear-Right", ["pressures", "cold", "rr"], { type: "number" }),
    ],
  },
  {
    title: "Hot Set",
    fields: [
      field("Front-Left", ["pressures", "hot", "fl"], { type: "number" }),
      field("Front-Right", ["pressures", "hot", "fr"], { type: "number" }),
      field("Rear-Left", ["pressures", "hot", "rl"], { type: "number" }),
      field("Rear-Right", ["pressures", "hot", "rr"], { type: "number" }),
    ],
  },
];

const SUSPENSION_GROUPS = [
  {
    title: "Dampers",
    fields: [
      field("Rebound FL", ["suspension", "rebound_fl"], { type: "number" }),
      field("Rebound FR", ["suspension", "rebound_fr"], { type: "number" }),
      field("Rebound RL", ["suspension", "rebound_rl"], { type: "number" }),
      field("Rebound RR", ["suspension", "rebound_rr"], { type: "number" }),
      field("Bump FL", ["suspension", "bump_fl"], { type: "number" }),
      field("Bump FR", ["suspension", "bump_fr"], { type: "number" }),
      field("Bump RL", ["suspension", "bump_rl"], { type: "number" }),
      field("Bump RR", ["suspension", "bump_rr"], { type: "number" }),
    ],
  },
  {
    title: "Platform",
    fields: [
      field("Ride Height FL", ["suspension", "ride_height_fl"], { type: "number" }),
      field("Ride Height FR", ["suspension", "ride_height_fr"], { type: "number" }),
      field("Ride Height RL", ["suspension", "ride_height_rl"], { type: "number" }),
      field("Ride Height RR", ["suspension", "ride_height_rr"], { type: "number" }),
      field("Sway Bar Front", ["suspension", "sway_bar_f"], { type: "number" }),
      field("Sway Bar Rear", ["suspension", "sway_bar_r"], { type: "number" }),
      field("Wing Angle (deg)", ["suspension", "wing_angle_deg"], { type: "number" }),
    ],
  },
];

const ALIGNMENT_GROUPS = [
  {
    title: "Camber",
    fields: [
      field("Front-Left", ["alignment", "camber_fl"], { type: "number" }),
      field("Front-Right", ["alignment", "camber_fr"], { type: "number" }),
      field("Rear-Left", ["alignment", "camber_rl"], { type: "number" }),
      field("Rear-Right", ["alignment", "camber_rr"], { type: "number" }),
    ],
  },
  {
    title: "Toe / Caster",
    fields: [
      field("Toe Front", ["alignment", "toe_front"], { type: "number" }),
      field("Toe Rear", ["alignment", "toe_rear"], { type: "number" }),
      field("Caster FL", ["alignment", "caster_fl"], { type: "number" }),
      field("Caster FR", ["alignment", "caster_fr"], { type: "number" }),
    ],
  },
  {
    title: "Ride / Rake",
    fields: [
      field("Rake (mm)", ["alignment", "rake_mm"], { type: "number" }),
    ],
  },
];

const TEMPERATURE_GROUPS = [
  {
    title: "Front-Left",
    fields: [
      field("Outer", ["tire_temperatures", "fl_out"], { type: "number" }),
      field("Middle", ["tire_temperatures", "fl_mid"], { type: "number" }),
      field("Inner", ["tire_temperatures", "fl_in"], { type: "number" }),
    ],
  },
  {
    title: "Front-Right",
    fields: [
      field("Outer", ["tire_temperatures", "fr_out"], { type: "number" }),
      field("Middle", ["tire_temperatures", "fr_mid"], { type: "number" }),
      field("Inner", ["tire_temperatures", "fr_in"], { type: "number" }),
    ],
  },
  {
    title: "Rear-Left",
    fields: [
      field("Outer", ["tire_temperatures", "rl_out"], { type: "number" }),
      field("Middle", ["tire_temperatures", "rl_mid"], { type: "number" }),
      field("Inner", ["tire_temperatures", "rl_in"], { type: "number" }),
    ],
  },
  {
    title: "Rear-Right",
    fields: [
      field("Outer", ["tire_temperatures", "rr_out"], { type: "number" }),
      field("Middle", ["tire_temperatures", "rr_mid"], { type: "number" }),
      field("Inner", ["tire_temperatures", "rr_in"], { type: "number" }),
    ],
  },
];

const TIRE_HISTORY_GROUPS = [
  {
    title: "History",
    fields: [
      field("Set ID", ["tire_history", "set_id"], { type: "text" }),
      field("Compound", ["tire_history", "compound"], { type: "text" }),
      field("Batch", ["tire_history", "batch"], { type: "text" }),
      field("Condition", ["tire_history", "condition"], { type: "text" }),
      field("Heat Cycles", ["tire_history", "heat_cycles"], { type: "number" }),
      field("Wear %", ["tire_history", "wear_percent"], { type: "number" }),
      field("Stint Count", ["tire_history", "stint_count"], { type: "number" }),
      field("Last Used", ["tire_history", "last_used_at"], { type: "date" }),
      field("Notes", ["tire_history", "notes"], {
        type: "textarea",
        span: 2,
        rows: 3,
        placeholder: "How this tire set behaved over time.",
      }),
    ],
  },
];

const TIRE_INVENTORY_GROUPS = [
  {
    title: "Inventory",
    fields: [
      field("Brand", ["tire_inventory", "brand"], { type: "text" }),
      field("Batch", ["tire_inventory", "batch"], { type: "text" }),
      field("Condition", ["tire_inventory", "condition"], { type: "text" }),
      field("Size", ["tire_inventory", "size"], { type: "text" }),
      field("Quantity", ["tire_inventory", "quantity"], { type: "number" }),
      field("Location", ["tire_inventory", "location"], { type: "text" }),
      field("Status", ["tire_inventory", "status"], { type: "text" }),
      field("Notes", ["tire_inventory", "notes"], {
        type: "textarea",
        span: 2,
        rows: 3,
        placeholder: "Inventory condition, storage notes, or follow-up actions.",
      }),
    ],
  },
];

const CATEGORY_SECTIONS = [
  {
    key: "seances",
    title: "SEANCES",
    subtitle: "Session details, timing, and driver feedback.",
    icon: NoteAltOutlinedIcon,
    groups: SEANCES_GROUPS,
  },
  {
    key: "pressures",
    title: "PRESSURES",
    subtitle: "Tire pressures by corner for cold and hot sets.",
    icon: TrackChangesOutlinedIcon,
    groups: PRESSURE_GROUPS,
  },
  {
    key: "suspensions",
    title: "SUSPENSIONS",
    subtitle: "Damper, platform, and aero-related settings.",
    icon: TimelineOutlinedIcon,
    groups: SUSPENSION_GROUPS,
  },
  {
    key: "alignment",
    title: "ALIGNMENT",
    subtitle: "Camber, toe, caster, and rake values.",
    icon: TrackChangesOutlinedIcon,
    groups: ALIGNMENT_GROUPS,
  },
  {
    key: "tire_temperatures",
    title: "TIRE_TEMPERATURES",
    subtitle: "Outer, middle, and inner readings for each corner.",
    icon: InfoOutlinedIcon,
    groups: TEMPERATURE_GROUPS,
  },
  {
    key: "tire_history",
    title: "TIRE_HISTORY",
    subtitle: "Wear, set usage, and compound history.",
    icon: HistoryIcon,
    groups: TIRE_HISTORY_GROUPS,
  },
  {
    key: "tire_inventory",
    title: "TIRE_INVENTORY",
    subtitle: "Inventory, batch, and storage details.",
    icon: AttachFileOutlinedIcon,
    groups: TIRE_INVENTORY_GROUPS,
  },
];

function HistoryIcon(props) {
  return <TimelineOutlinedIcon {...props} />;
}

const cloneJson = (value) => JSON.parse(JSON.stringify(value ?? {}));

const isFilled = (value) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => isFilled(item));
  return String(value).trim() !== "";
};

const getValueAtPath = (source, path) =>
  path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);

const setValueAtPath = (source, path, nextValue) => {
  const next = cloneJson(source);
  let current = next;

  path.forEach((key, index) => {
    if (index === path.length - 1) {
      current[key] = nextValue;
      return;
    }

    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key];
  });

  return next;
};

const formatDisplayValue = (value, fieldType = "text") => {
  if (!isFilled(value)) return "Not set";
  if (fieldType === "textarea") return String(value);
  if (fieldType === "date") return formatDate(value);
  if (fieldType === "time") return String(value);
  if (fieldType === "datetime-local") return formatDateTime(value);
  return Array.isArray(value) ? value.join(" / ") : String(value);
};

const toInputValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const normalizeStatus = (record) => {
  if (!record) {
    return { label: "Pending", tone: "warning" };
  }

  if (record.validationStateKey === "validated") {
    return { label: "Validated", tone: "success" };
  }

  if (record.validationStateKey === "failed") {
    return { label: "Rejected", tone: "danger" };
  }

  if (record.validationStateKey === "archived") {
    return { label: "Archived", tone: "neutral" };
  }

  return { label: "Pending", tone: "warning" };
};

const buildSectionStatus = (section, payload, record) => {
  const fields = section.groups.flatMap((group) => group.fields);
  const requiredMissing = fields.filter((item) => item.required && !isFilled(getValueAtPath(payload, item.path)));
  const presentCount = fields.filter((item) => isFilled(getValueAtPath(payload, item.path))).length;

  if (requiredMissing.length) {
    return {
      label: record?.validationSeverityKey === "failed" ? "Error" : "Missing Data",
      tone: record?.validationSeverityKey === "failed" ? "danger" : "warning",
      helper: `${requiredMissing.length} required field${requiredMissing.length === 1 ? "" : "s"} missing`,
    };
  }

  if (!presentCount) {
    return {
      label: "Missing Data",
      tone: "warning",
      helper: "Section has no recorded values yet",
    };
  }

  return {
    label: "Valid",
    tone: "success",
    helper: `${presentCount}/${fields.length} fields populated`,
  };
};

const normalizeAuditLogEntry = (entry, index) => {
  if (!entry) return null;

  if (typeof entry === "string") {
    return {
      id: `audit-string-${index}`,
      action: "Note",
      note: entry,
      timestamp: null,
      actor: "Admin",
      tone: "neutral",
    };
  }

  return {
    id: entry.id || `audit-${index}`,
    action: entry.action || entry.type || "Update",
    note: entry.note || entry.message || entry.description || "",
    timestamp: entry.timestamp || entry.created_at || entry.createdAt || entry.at || null,
    actor: entry.actor || entry.user || entry.by || "Admin",
    tone: entry.tone || "neutral",
  };
};

const buildAuditTimeline = (record, analysisResult = {}) => {
  const voiceSession = record?.voiceSession || record?.voice_session || null;
  const existing = Array.isArray(analysisResult.audit_log)
    ? analysisResult.audit_log.map(normalizeAuditLogEntry).filter(Boolean)
    : [];

  const fallback = [
    {
      action: "Created",
      note: "Submission entered the system.",
      timestamp: record?.createdAt || record?.submittedAt || null,
      actor: record?.sourceChannel || record?.sourceTypeLabel || "System",
      tone: "accent",
    },
    {
      action: "Processed",
      note: record?.auditSnippet || "Parser and validation pipeline completed.",
      timestamp: record?.processedAt || record?.updatedAt || null,
      actor: "Parser",
      tone: "info",
    },
    {
      action: "Reviewed",
      note: analysisResult.review_state ? `Review state: ${analysisResult.review_state}` : "No manual review recorded yet.",
      timestamp: analysisResult.reviewed_at || analysisResult.reviewedAt || null,
      actor: analysisResult.reviewed_by_name || analysisResult.reviewed_by_id || "Admin",
      tone: "neutral",
    },
    {
      action: "Updated",
      note: record?.updatedAt ? "Last record update saved." : "No update timestamp available.",
      timestamp: record?.updatedAt || null,
      actor: "System",
      tone: "neutral",
    },
  ];

  if (voiceSession) {
    fallback.unshift(
      {
        action: "Voice Captured",
        note: voiceSession.audioFileName ? `Stored ${voiceSession.audioFileName} for transcription.` : "Voice note audio stored for processing.",
        timestamp: voiceSession.uploadedAt || voiceSession.createdAt || record?.createdAt || null,
        actor: "Voice Capture",
        tone: "info",
      },
      {
        action: "Voice Transcribed",
        note:
          voiceSession.transcriptEditedText || voiceSession.transcriptText
            ? "Deepgram transcript available for review."
            : voiceSession.lastErrorMessage || "Transcription is pending or failed.",
        timestamp: voiceSession.transcribedAt || voiceSession.updatedAt || record?.processedAt || null,
        actor: "Deepgram",
        tone: voiceSession.status === "TRANSCRIPTION_FAILED" ? "danger" : "success",
      },
    );

    if (voiceSession.confirmedAt) {
      fallback.push({
        action: "Voice Confirmed",
        note: "Driver confirmed the transcript before final submission.",
        timestamp: voiceSession.confirmedAt,
        actor: "Driver",
        tone: "success",
      });
    }

    if (voiceSession.submittedAt) {
      fallback.push({
        action: "Voice Submitted",
        note: "Voice note finalized into the standard submission pipeline.",
        timestamp: voiceSession.submittedAt,
        actor: "Submission API",
        tone: "accent",
      });
    }
  }

  if (analysisResult.archived_at || analysisResult.archivedAt) {
    fallback.push({
      action: "Archived",
      note: "Submission archived for audit history.",
      timestamp: analysisResult.archived_at || analysisResult.archivedAt,
      actor: analysisResult.reviewed_by_name || "Owner",
      tone: "neutral",
    });
  }

  const merged = [...existing, ...fallback]
    .filter(Boolean)
    .sort((left, right) => {
      const rightTime = new Date(right.timestamp || 0).getTime();
      const leftTime = new Date(left.timestamp || 0).getTime();
      return rightTime - leftTime;
    });

  return merged;
};

const normalizeAttachment = (attachment, index) => {
  if (!attachment) return null;

  const url =
    attachment.url ||
    attachment.href ||
    attachment.path ||
    attachment.file_url ||
    attachment.fileUrl ||
    attachment.image_url ||
    attachment.imageUrl ||
    attachment.download_url ||
    null;

  const type = String(attachment.type || attachment.mime_type || attachment.mimeType || "").toLowerCase();
  const kind = type.includes("audio")
    ? "audio"
    : type.includes("video")
      ? "video"
      : "image";

  return {
    id: attachment.id || attachment.key || `${kind}-${index}`,
    kind,
    url,
    name: attachment.name || attachment.filename || attachment.file_name || `Attachment ${index + 1}`,
    description: attachment.description || attachment.label || attachment.caption || "",
    voiceSessionId: attachment.voiceSessionId || attachment.voice_session_id || null,
    mimeType: attachment.mimeType || attachment.mime_type || null,
  };
};

const buildAttachmentList = (record, draftAnalysis = {}) => {
  const fromAnalysis = Array.isArray(draftAnalysis.attachments) ? draftAnalysis.attachments : [];
  const fromPayload = Array.isArray(record?.data?.attachments) ? record.data.attachments : [];
  const voiceSession = record?.voiceSession || record?.voice_session || null;

  const normalized = [
    ...(record?.imageUrl
      ? [
          {
            id: "primary-image",
            kind: "image",
            url: record.imageUrl,
            name: "Primary image",
            description: "Driver supplied media attachment.",
          },
        ]
      : []),
    ...(voiceSession?.audioDownloadUrl || voiceSession?.audio_storage_key
      ? [
          {
            id: `voice-audio-${voiceSession.id || "session"}`,
            kind: "audio",
            url: voiceSession.audioDownloadUrl || voiceSession.audio_download_url || null,
            voiceSessionId: voiceSession.id || voiceSession.voiceSessionId || null,
            name: voiceSession.audioFileName || "Voice recording",
            description: voiceSession.transcriptEditedText || voiceSession.transcriptText || "Driver voice capture.",
            mimeType: voiceSession.audioContentType || voiceSession.audio_content_type || "audio/webm",
          },
        ]
      : []),
    ...fromAnalysis.map(normalizeAttachment),
    ...fromPayload.map(normalizeAttachment),
  ]
    .filter((item) => item && item.url)
    .reduce((items, item) => {
      if (items.some((existing) => existing.url === item.url)) {
        return items;
      }

      items.push(item);
      return items;
    }, []);

  return normalized;
};

const csvEscape = (value) =>
  `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ").trim()}"`;

const buildSubmissionCsv = ({ record, draftPayload, draftAnalysis, timeline, attachments }) => {
  const row = {
    "Submission ID": record.submissionId || formatEntityId("SUB", record.id),
    "Submission Status": normalizeStatus(record).label,
    "Review State": record.reviewStateLabel || "-",
    "Validation State": record.validationStateLabel || "-",
    "Source Type": record.sourceTypeLabel || "-",
    "Voice Status": record.voiceStatus || "-",
    "Voice Review": record.voiceValidationStatus || "-",
    "Voice Session ID": record.voiceSessionId || "",
    "Deepgram Request ID": record.voiceSession?.deepgramRequestId || "",
    "Voice Transcript": record.voiceTranscript || "",
    "Voice Confidence": record.confidenceLabel || "",
    "Voice Audio File": record.voiceAudioFileName || "",
    "Voice Audio Duration": record.voiceAudioDurationLabel || "",
    Driver: getSubmissionDriverLabel(record),
    Vehicle: getSubmissionVehicleLabel(record),
    Event: getSubmissionEventLabel(record),
    Track: getSubmissionTrackLabel(record),
    RawText: record.rawText || "",
    Comments: draftAnalysis.admin_comment || draftAnalysis.comments || "",
    Payload: JSON.stringify(draftPayload ?? {}, null, 2),
    Analysis: JSON.stringify(draftAnalysis ?? {}, null, 2),
    AuditLog: JSON.stringify(timeline ?? [], null, 2),
    Attachments: JSON.stringify(attachments ?? [], null, 2),
    CreatedAt: record.createdAt || "",
    UpdatedAt: record.updatedAt || "",
  };

  const headers = Object.keys(row);
  const values = headers.map((header) => csvEscape(row[header]));
  return `${headers.map(csvEscape).join(",")}\n${values.join(",")}\n`;
};

const DownloadLink = ({ attachment }) => {
  if (!attachment?.url || (attachment.kind === "audio" && attachment.voiceSessionId)) {
    return null;
  }

  return (
    <a
      className="fleet-btn fleet-btn-secondary submission-detail-attachment-link"
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
    >
      <DownloadOutlinedIcon fontSize="inherit" />
      Download
    </a>
  );
};

const EditableField = ({ field, value, isEditing, onChange }) => {
  const inputId = `submission-detail-${field.path.join("-")}`;
  const displayValue = formatDisplayValue(value, field.type);
  const hasFullWidth = field.span === 2;

  return (
    <label className={`submission-detail-field${hasFullWidth ? " submission-detail-field-span-2" : ""}`} htmlFor={inputId}>
      <span className="submission-detail-field-label">
        {field.label}
        {field.required ? <span className="required-marker">*</span> : null}
      </span>

      {isEditing ? (
        field.type === "textarea" ? (
          <textarea
            id={inputId}
            className="submission-detail-input submission-detail-textarea"
            rows={field.rows || 3}
            placeholder={field.placeholder || ""}
            value={toInputValue(value)}
            onChange={(event) => onChange(field.path, event.target.value)}
          />
        ) : field.options ? (
          <select
            id={inputId}
            className="submission-detail-input"
            value={toInputValue(value)}
            onChange={(event) => onChange(field.path, event.target.value)}
          >
            <option value="">Not set</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            className="submission-detail-input"
            type={field.type || "text"}
            placeholder={field.placeholder || ""}
            value={toInputValue(value)}
            onChange={(event) => onChange(field.path, event.target.value)}
          />
        )
      ) : (
        <div className={`submission-detail-field-value${field.type === "textarea" ? " submission-detail-field-value-block" : ""}`}>
          {displayValue}
        </div>
      )}

      {field.help ? <span className="submission-detail-field-help">{field.help}</span> : null}
    </label>
  );
};

const FieldGroup = ({ group, payload, isEditing, onChange, sectionStatus }) => {
  const fields = group.fields || [];
  const totalFields = fields.length;
  const presentCount = fields.filter((item) => isFilled(getValueAtPath(payload, item.path))).length;

  return (
    <article className="submission-detail-group-card">
      <div className="submission-detail-group-header">
        <div>
          <h4 className="submission-detail-group-title">{group.title}</h4>
          <p className="submission-detail-group-copy">
            {presentCount}/{totalFields} fields populated
          </p>
        </div>
        <StatusBadge
          label={sectionStatus.label}
          tone={sectionStatus.tone}
          title={sectionStatus.helper}
        />
      </div>

      <div className="submission-detail-field-grid">
        {fields.map((item) => (
          <EditableField
            key={item.path.join(".")}
            field={item}
            value={getValueAtPath(payload, item.path)}
            isEditing={isEditing}
            onChange={onChange}
          />
        ))}
      </div>
    </article>
  );
};

const SectionCard = ({
  section,
  payload,
  isEditing,
  onChange,
  record,
}) => {
  const sectionStatus = buildSectionStatus(section, payload, record);
  const Icon = section.icon;
  const allFields = section.groups.flatMap((group) => group.fields);
  const populated = allFields.filter((item) => isFilled(getValueAtPath(payload, item.path))).length;

  return (
    <section id={section.key} className="submission-section submission-detail-section-card">
      <div className="submission-detail-section-head">
        <div className="submission-section-heading">
          <span className="submission-section-eyebrow">
            {Icon ? <Icon fontSize="inherit" /> : null}
            {section.title}
          </span>
          <h3>{section.subtitle}</h3>
          <p>
            {populated}/{allFields.length} recorded fields are currently populated.
          </p>
        </div>

        <div className="submission-detail-section-meta">
          <StatusBadge
            label={sectionStatus.label}
            tone={sectionStatus.tone}
            title={sectionStatus.helper}
          />
          <span className="submission-detail-section-score">{sectionStatus.helper}</span>
        </div>
      </div>

      <div className="submission-detail-group-stack">
        {section.groups.map((group) => (
          <FieldGroup
            key={`${section.key}-${group.title}`}
            group={group}
            payload={payload}
            isEditing={isEditing}
            onChange={onChange}
            sectionStatus={sectionStatus}
          />
        ))}
      </div>
    </section>
  );
};

const TimelineItem = ({ item }) => {
  const toneClass = item.tone || "neutral";

  return (
    <li className={`submission-detail-timeline-item submission-detail-timeline-${toneClass}`}>
      <div className="submission-detail-timeline-top">
        <div>
          <div className="submission-detail-timeline-action">{item.action}</div>
          <div className="submission-detail-timeline-note">{item.note || "No note available."}</div>
        </div>
        <StatusBadge
          label={item.actor || "Admin"}
          tone={toneClass === "danger" ? "danger" : toneClass === "success" ? "success" : toneClass === "info" ? "info" : toneClass === "accent" ? "accent" : "neutral"}
        />
      </div>
      <div className="submission-detail-timeline-meta">
        {item.timestamp ? formatDateTime(item.timestamp) : "No timestamp"}
      </div>
    </li>
  );
};

const AttachmentCard = ({ attachment }) => {
  const isAudio = attachment.kind === "audio";
  const isImage = attachment.kind === "image";

  return (
    <article className="submission-detail-attachment-card">
      <div className="submission-detail-attachment-header">
        <div>
          <div className="submission-detail-attachment-name">{attachment.name}</div>
          {attachment.description ? (
            <div className="submission-detail-attachment-description">{attachment.description}</div>
          ) : null}
        </div>
        <StatusBadge label={attachment.kind.toUpperCase()} tone={isAudio ? "info" : "accent"} />
      </div>

      {isImage ? (
        <Image
          className="submission-detail-media"
          src={attachment.url}
          alt={attachment.name}
          width={1200}
          height={800}
          unoptimized
        />
      ) : isAudio ? (
        <ProtectedAudioPlayer
          className="submission-detail-audio-player"
          voiceSessionId={attachment.voiceSessionId || null}
          src={attachment.url}
          downloadName={attachment.name || "voice-note"}
        />
      ) : (
        <div className="submission-detail-media-placeholder">
          <VisibilityOutlinedIcon fontSize="inherit" />
          <span>Preview not available.</span>
        </div>
      )}

      <div className="submission-detail-attachment-actions">
        <DownloadLink attachment={attachment} />
      </div>
    </article>
  );
};

export default function SubmissionDetailScreen({
  submission,
  allSubmissions = [],
  previewMessage = "",
  previewTone = "warning",
}) {
  const router = useRouter();

  const { user } = useAuth();
  const [liveSubmission, setLiveSubmission] = useState(submission);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [notice, setNotice] = useState(null);

  const record = useMemo(
    () => buildSubmissionMonitorRecord(liveSubmission, allSubmissions),
    [allSubmissions, liveSubmission],
  );

  const [draftPayload, setDraftPayload] = useState(() => cloneJson(record?.data || liveSubmission?.payload || {}));
  const [draftAnalysis, setDraftAnalysis] = useState(() => cloneJson(record?.analysisResult || liveSubmission?.analysis_result || {}));
  const [draftComment, setDraftComment] = useState(
    record?.analysisResult?.admin_comment ||
      record?.analysisResult?.comments ||
      record?.analysis_result?.admin_comment ||
      record?.analysis_result?.comments ||
      "",
  );

  useEffect(() => {
    if (!record) return;

    setDraftPayload(cloneJson(record.data || record.payload || {}));
    setDraftAnalysis(cloneJson(record.analysisResult || record.analysis_result || {}));
    setDraftComment(
      record.analysisResult?.admin_comment ||
        record.analysisResult?.comments ||
        record.analysis_result?.admin_comment ||
        record.analysis_result?.comments ||
        "",
    );
    setIsEditing(false);
    setIsDirty(false);
    setNotice(null);
  }, [record]);

  const status = useMemo(() => normalizeStatus(record), [record]);
  const attachmentList = useMemo(
    () => buildAttachmentList(record, draftAnalysis),
    [draftAnalysis, record],
  );
  const auditTimeline = useMemo(
    () => buildAuditTimeline(record, draftAnalysis),
    [draftAnalysis, record],
  );

  const submissionId = record?.submissionId || formatEntityId("SUB", record?.id);
  const eventName = getSubmissionEventLabel(record || submission || {});
  const driverName = getSubmissionDriverLabel(record || submission || {});
  const trackName = getSubmissionTrackLabel(record || submission || {});

  const vehicleYear = record?.vehicle?.year || record?.vehicle?.vehicle_year || null;
  const sourceLabel = record?.sourceTypeLabel || "Unknown";
  const confidenceTone =
    record?.confidence === null
      ? "neutral"
      : record?.confidence >= 90
        ? "success"
        : record?.confidence >= 80
          ? "warning"
          : "danger";

  const updateDraftValue = (path, value) => {
    setDraftPayload((current) => setValueAtPath(current, path, value));
    setIsDirty(true);
  };

  const setFeedback = (value) => {
    setDraftComment(value);
    setIsDirty(true);
  };

  const appendAuditEntry = (analysisResult, action, note, tone = "neutral") => {
    const entries = Array.isArray(analysisResult.audit_log) ? [...analysisResult.audit_log] : [];
    entries.push({
      id: `${action}-${Date.now()}`,
      action,
      note,
      actor: user?.name || user?.email || "Admin",
      timestamp: new Date().toISOString(),
      tone,
    });
    return entries;
  };

  const persistUpdate = async (nextSubmission, message, tone = "success") => {
    setBusyAction("saving");
    setIsSaving(true);

    try {
      const response = await updateSubmission(nextSubmission.id || nextSubmission._id || nextSubmission.submissionId, nextSubmission.updatePayload);
      const updatedSubmission = response.submission || response.data || response;

      if (updatedSubmission) {
        setLiveSubmission(updatedSubmission);
        setNotice({ tone, message });
        setIsEditing(false);
        setIsDirty(false);
      } else {
        setNotice({ tone: "warning", message });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: getApiErrorMessage(error, "Unable to save submission changes."),
      });
    } finally {
      setBusyAction("");
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!record) return;

    const nextAnalysis = cloneJson(draftAnalysis);
    nextAnalysis.admin_comment = draftComment;
    nextAnalysis.comments = draftComment;
    nextAnalysis.audit_log = appendAuditEntry(
      nextAnalysis,
      "Edited",
      "Manual corrections and feedback were saved from the detailed owner view.",
      "info",
    );
    nextAnalysis.last_edited_at = new Date().toISOString();
    nextAnalysis.last_edited_by = user?.name || user?.email || "Owner";

    await persistUpdate(
      {
        id: record.id,
        _id: record._id,
        submissionId: record.submissionId,
        updatePayload: {
          payload: draftPayload,
          analysis_result: nextAnalysis,
        },
      },
      "Submission data and owner notes were saved.",
    );
  };

  const handleReviewAction = async (reviewState, note, successMessage) => {
    if (!record) return;

    const patch = buildReviewAnalysisPatch({
      submission: liveSubmission,
      allSubmissions,
      reviewState,
      reviewerId: user?.id || null,
      reviewerName: user?.name || user?.email || null,
      note,
    });

    const nextAnalysis = cloneJson(patch.analysis_result);
    nextAnalysis.admin_comment = draftComment;
    nextAnalysis.comments = draftComment;
    nextAnalysis.audit_log = appendAuditEntry(
      nextAnalysis,
      reviewState === "APPROVED"
        ? "Approved"
        : reviewState === "FLAGGED"
          ? "Rejected"
          : "Reviewed",
      note,
      reviewState === "APPROVED" ? "success" : reviewState === "FLAGGED" ? "danger" : "neutral",
    );

    await persistUpdate(
      {
        id: record.id,
        _id: record._id,
        submissionId: record.submissionId,
        updatePayload: {
          analysis_result: nextAnalysis,
        },
      },
      successMessage,
      reviewState === "APPROVED" ? "success" : reviewState === "FLAGGED" ? "danger" : "warning",
    );
  };

  const handleApprove = () =>
    handleReviewAction("APPROVED", "Approved from the detailed owner view.", "Submission approved.");

  const handleReject = () =>
    handleReviewAction("FLAGGED", "Rejected from the detailed owner view.", "Submission flagged for correction.");

  const handleExport = () => {
    if (!record) return;

    const csv = buildSubmissionCsv({
      record,
      draftPayload: isEditing ? draftPayload : record.data || {},
      draftAnalysis: isEditing ? draftAnalysis : record.analysisResult || {},
      timeline: auditTimeline,
      attachments: attachmentList,
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${submissionId || "submission"}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    setNotice({ tone: "success", message: "Submission exported as CSV." });
  };

  if (!record) {
    return (
      <div className="submission-detail-empty-shell">
        <EmptyStatePanel
          icon={DescriptionOutlinedIcon}
          title="Submission not available"
          description="The requested submission could not be loaded."
        />
      </div>
    );
  }

  return (
    <div className="submission-detail-page">
      <div className="submission-detail-orb submission-detail-orb-one" />
      <div className="submission-detail-orb submission-detail-orb-two" />

      <div className="submission-detail-shell">
        <header className="submission-detail-hero">
          <div className="submission-detail-hero-copy">
            <p className="submission-detail-eyebrow">Admin Detailed View</p>
            <h1>{submissionId}</h1>
            <p className="submission-detail-subtitle">
              Review raw submission data, validate stored payloads, and manage approval or correction workflows from one screen.
            </p>

            <div className="submission-detail-badge-row">
              <StatusBadge label={status.label} tone={status.tone} title="Submission status" />
              <StatusBadge label={record.validationStateLabel} tone={record.validationStateTone} title="Validation status" />
              <StatusBadge label={record.syncStateLabel} tone={record.syncStateTone} title="Sync status" />
              <StatusBadge
                label={record.structuredStatusLabel}
                tone={record.structuredStatusTone}
                title="Structured normalization status"
              />
              <StatusBadge label={record.sourceTypeLabel} tone={record.sourceTypeTone} title="Source type" />
              <span className={`submission-confidence-chip tone-${confidenceTone}`}>Confidence {record.confidenceLabel}</span>
              {previewMessage ? <StatusBadge label="Preview Mode" tone={previewTone} title={previewMessage} /> : null}
            </div>

            <div className="submission-detail-anchor-row">
              <a href="#overview">Overview</a>
              <a href="#validation">Validation</a>
              <a href="#raw">Raw</a>
              <a href="#parsed">Parsed</a>
              <a href="#audit">Audit</a>
              <a href="#attachments">Attachments</a>
            </div>
          </div>

          <div className="submission-detail-hero-actions">
            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={() => router.push("/admin/submissions")}
            >
              <ArrowBackOutlinedIcon fontSize="inherit" />
              Back
            </button>
            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={() => setIsEditing((current) => !current)}
              disabled={isSaving}
            >
              {isEditing ? <CancelOutlinedIcon fontSize="inherit" /> : <EditOutlinedIcon fontSize="inherit" />}
              {isEditing ? "Cancel Edits" : "Edit"}
            </button>
            <button
              type="button"
              className="fleet-btn fleet-btn-primary"
              onClick={handleExport}
            >
              <DownloadOutlinedIcon fontSize="inherit" />
              Export
            </button>
          </div>
        </header>

        {notice ? (
          <div className={`submission-monitor-notice submission-monitor-notice-${notice.tone}`}>
            {notice.message}
          </div>
        ) : null}

        {previewMessage ? (
          <div className={`submission-monitor-notice submission-monitor-notice-${previewTone}`}>
            {previewMessage}
          </div>
        ) : null}

        <div className="submission-detail-layout">
          <main className="submission-detail-main">
            <section id="overview" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <ReceiptLongOutlinedIcon fontSize="inherit" />
                    Overview
                  </span>
                  <h3>Submission and Relationship Details</h3>
                  <p>
                    Confirm the core submission record, linked driver and vehicle, and the event context stored with the payload.
                  </p>
                </div>

                <div className="submission-detail-section-meta">
                  <StatusBadge label={status.label} tone={status.tone} />
                  <span className="submission-detail-section-score">
                    {record.validationSeverityLabel || "Review state"}
                  </span>
                </div>
              </div>

              <div className="submission-detail-field-grid submission-detail-field-grid-overview">
                <EditableField
                  field={field("Submission ID", ["submissionId"], { type: "text" })}
                  value={submissionId}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Submission Reference", ["submission_ref"], { type: "text" })}
                  value={record.submission_ref}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Driver ID", ["driver", "driver_id"], { type: "text" })}
                  value={record.driver?.driver_id || record.driver_id || record.driver?.id}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Vehicle ID", ["vehicle", "vehicle_id"], { type: "text" })}
                  value={record.vehicle?.vehicle_id || record.vehicle_id || record.vehicle?.id}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Event ID", ["event", "id"], { type: "text" })}
                  value={record.event?.id || record.event_id || record.eventId}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Track ID", ["event", "track"], { type: "text" })}
                  value={record.event?.track || record.event?.track_name || record.event?.trackName}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Driver", ["driver"], { type: "text" })}
                  value={driverName}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Vehicle", ["vehicle"], { type: "text" })}
                  value={`${record.vehicle?.make || "-"} ${record.vehicle?.model || ""}${vehicleYear ? ` ${vehicleYear}` : ""}`.trim()}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Event", ["event"], { type: "text" })}
                  value={eventName}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Track", ["track"], { type: "text" })}
                  value={trackName}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Source", ["analysis_result", "source_type"], { type: "text" })}
                  value={sourceLabel}
                  isEditing={false}
                  onChange={() => {}}
                />
                <EditableField
                  field={field("Created / Updated", ["timestamps"], { type: "text" })}
                  value={`${formatDateTime(record.createdAt || record.submittedAt)} | ${formatDateTime(record.updatedAt || record.submittedAt)}`}
                  isEditing={false}
                  onChange={() => {}}
                />
              </div>
            </section>

            <section id="validation" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <ErrorOutlineOutlinedIcon fontSize="inherit" />
                    Validation & Issues
                  </span>
                  <h3>Validation Status and Correction Tracker</h3>
                  <p>
                    Review missing fields, mismatch warnings, and manual notes before approving or rejecting the submission.
                  </p>
                </div>

                <div className="submission-detail-section-meta">
                  <StatusBadge label={record.validationStateLabel} tone={record.validationStateTone} />
                  <StatusBadge label={record.reviewStateLabel} tone="neutral" />
                  <StatusBadge label={record.structuredStatusLabel} tone={record.structuredStatusTone} />
                </div>
              </div>

              <div className={`submission-alert submission-alert-${record.validationStateTone}`}>
                <div className="submission-alert-title">
                  {record.validationMessages.length ? (
                    <ErrorOutlineOutlinedIcon fontSize="small" />
                  ) : (
                    <CheckCircleOutlineOutlinedIcon fontSize="small" />
                  )}
                  {record.validationMessages.length ? "Issues detected" : "No blocking validation errors"}
                </div>

                {record.validationMessages.length ? (
                  <ul className="submission-alert-list">
                    {record.validationMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}

                <p className="submission-alert-copy">{record.recommendation}</p>
              </div>

              <div className="submission-detail-issue-grid">
                <div className="submission-issue-card">
                  <p className="submission-issue-label">Missing Fields</p>
                  <p className="submission-issue-value">
                    {record.missingFields.length ? record.missingFields.join(", ") : "None"}
                  </p>
                </div>
                <div className="submission-issue-card">
                  <p className="submission-issue-label">Failed Fields</p>
                  <p className="submission-issue-value">
                    {record.failedFields.length ? record.failedFields.join(", ") : "None"}
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
                <div className="submission-issue-card">
                  <p className="submission-issue-label">Structured Normalization</p>
                  <p className="submission-issue-value">
                    {record.structuredStatusLabel}
                    {record.structuredWarningCount
                      ? ` (${record.structuredWarningCount} warning${record.structuredWarningCount === 1 ? "" : "s"})`
                      : ""}
                  </p>
                </div>
              </div>

              {record.structuredWarnings.length ? (
                <div className="submission-detail-admin-note" style={{ marginTop: "1rem" }}>
                  <div className="submission-detail-admin-note-header">
                    <div>
                      <div className="submission-detail-group-title">Structured Ingest Warnings</div>
                      <p className="submission-detail-group-copy">
                        The canonical note saved successfully, but some normalized table updates were partial or skipped.
                      </p>
                    </div>
                    <StatusBadge
                      label={record.structuredStatusLabel}
                      tone={record.structuredStatusTone}
                    />
                  </div>
                  <ul className="submission-alert-list">
                    {record.structuredWarnings.map((warning, index) => (
                      <li key={`${warning.code || "structured-warning"}-${index}`}>
                        {warning.field ? `${warning.field}: ` : ""}
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="submission-detail-admin-note">
                <div className="submission-detail-admin-note-header">
                  <div>
                    <div className="submission-detail-group-title">Owner Feedback</div>
                    <p className="submission-detail-group-copy">
                      Add correction notes, validation remarks, or follow-up instructions.
                    </p>
                  </div>
                  <StatusBadge
                    label={isEditing ? "Editing Enabled" : "Read Only"}
                    tone={isEditing ? "info" : "neutral"}
                  />
                </div>

                {isEditing ? (
                  <textarea
                    className="submission-detail-input submission-detail-textarea submission-detail-admin-textarea"
                    rows={5}
                    value={draftComment}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Leave correction notes for the driver or the next reviewer."
                  />
                ) : (
                  <div className="submission-detail-admin-note-readonly">
                    {draftComment ? draftComment : "No owner feedback saved yet."}
                  </div>
                )}
              </div>
            </section>

            <section id="raw" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <DescriptionOutlinedIcon fontSize="inherit" />
                    Raw Submission
                  </span>
                  <h3>Exact Raw Content and Media</h3>
                  <p>
                    Review the exact text or media submitted by the driver. Raw content is preserved as submitted while owner notes remain editable.
                  </p>
                </div>

                <div className="submission-detail-section-meta">
                  <StatusBadge label={record.sourceTypeLabel} tone={record.sourceTypeTone} />
                  <StatusBadge label={record.confidenceLabel || "-"} tone={confidenceTone} />
                </div>
              </div>

              <div className="submission-detail-raw-layout">
                <div className="submission-raw-card">
                  <div className="submission-raw-card-title">raw_submission</div>
                  <pre className="submission-code-block submission-detail-raw-code">
                    {record.rawText || "No raw note was submitted."}
                  </pre>

                  {record.voiceSession ? (
                    <div className="submission-detail-voice-transcript-card">
                      <div className="submission-raw-card-title">voice_transcript</div>
                      <pre className="submission-code-block submission-detail-raw-code">
                        {record.voiceTranscript || record.rawText || "No transcript available."}
                      </pre>
                      <div className="submission-detail-voice-meta">
                        <StatusBadge
                          label={record.voiceStatus || "Voice"}
                          tone={
                            record.voiceStatus === "TRANSCRIPTION_FAILED"
                              ? "danger"
                              : record.voiceValidationStatus === "REVIEW_REQUIRED"
                                ? "warning"
                                : "info"
                          }
                        />
                        {record.voiceAudioDurationLabel ? (
                          <StatusBadge label={record.voiceAudioDurationLabel} tone="neutral" />
                        ) : null}
                        {record.voiceTranscriptConfidence !== null && record.voiceTranscriptConfidence !== undefined ? (
                          <StatusBadge
                            label={`Confidence ${
                              Math.round(
                                ((record.voiceTranscriptConfidence <= 1
                                  ? record.voiceTranscriptConfidence * 100
                                  : record.voiceTranscriptConfidence) * 10) / 10,
                              )
                            }%`}
                            tone="neutral"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="submission-detail-quick-verdict">
                    <button
                      type="button"
                      className="fleet-btn fleet-btn-primary"
                      onClick={handleApprove}
                      disabled={busyAction || isSaving || isEditing}
                    >
                      <CheckCircleOutlineOutlinedIcon fontSize="inherit" />
                      Mark Valid
                    </button>
                    <button
                      type="button"
                      className="fleet-btn fleet-btn-danger"
                      onClick={handleReject}
                      disabled={busyAction || isSaving || isEditing}
                    >
                      <CancelOutlinedIcon fontSize="inherit" />
                      Mark Invalid
                    </button>
                  </div>
                </div>

                <div className="submission-detail-sidebar-stack">
                  <div className="submission-raw-card">
                    <div className="submission-raw-card-title">Admin Comment</div>
                    <div className="submission-detail-raw-comment">
                      {isEditing ? (
                        <textarea
                          className="submission-detail-input submission-detail-textarea"
                          rows={5}
                          value={draftComment}
                          onChange={(event) => setFeedback(event.target.value)}
                          placeholder="Add a note or correction summary."
                        />
                      ) : (
                        <div className="submission-detail-admin-note-readonly">
                          {draftComment ? draftComment : "No feedback entered yet."}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="submission-raw-card submission-raw-image-card">
                    <div className="submission-raw-card-title">media_preview</div>
                    {record.imageUrl ? (
                      <Image
                        className="submission-proof-image submission-detail-preview-image"
                        src={record.imageUrl}
                        alt="Submission media preview"
                        width={1200}
                        height={800}
                        unoptimized
                      />
                    ) : (
                      <div className="submission-image-empty">
                        <ImageOutlinedIcon fontSize="inherit" />
                        <span>No image uploaded.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section id="parsed" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <InfoOutlinedIcon fontSize="inherit" />
                    Parsed Data
                  </span>
                  <h3>Structured Sheet Categories</h3>
                  <p>
                    Validate the parsed submission fields against the raw note and correct any missing or incorrect data directly on screen.
                  </p>
                </div>

                <div className="submission-detail-section-meta">
                  <StatusBadge label={isEditing ? "Editing" : "Read Only"} tone={isEditing ? "info" : "neutral"} />
                </div>
              </div>

              <div className="submission-detail-category-grid">
                {CATEGORY_SECTIONS.map((section) => (
                  <SectionCard
                    key={section.key}
                    section={section}
                    payload={draftPayload}
                    isEditing={isEditing}
                    onChange={updateDraftValue}
                    record={record}
                  />
                ))}
              </div>
            </section>
          </main>

          <aside className="submission-detail-sidebar">
            <section id="audit" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <TimelineOutlinedIcon fontSize="inherit" />
                    Audit Log
                  </span>
                  <h3>History and Review Trail</h3>
                  <p>
                    Track when the record was created, processed, edited, approved, rejected, or archived.
                  </p>
                </div>
              </div>

              <ul className="submission-detail-timeline">
                {auditTimeline.length ? (
                  auditTimeline.map((item) => <TimelineItem key={item.id} item={item} />)
                ) : (
                  <li className="submission-detail-timeline-empty">
                    No audit entries available yet.
                  </li>
                )}
              </ul>
            </section>

            <section id="attachments" className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <AttachFileOutlinedIcon fontSize="inherit" />
                    Attachments
                  </span>
                  <h3>Media Preview and Downloads</h3>
                  <p>
                    View or download images and audio files that were uploaded with the submission.
                  </p>
                </div>
              </div>

              {attachmentList.length ? (
                <div className="submission-detail-attachment-grid">
                  {attachmentList.map((attachment) => (
                    <AttachmentCard key={attachment.id} attachment={attachment} />
                  ))}
                </div>
              ) : (
                <div className="submission-image-empty">
                  <AttachFileOutlinedIcon fontSize="inherit" />
                  <span>No attachments stored for this submission.</span>
                </div>
              )}
            </section>

            <section className="submission-section submission-detail-section-card">
              <div className="submission-detail-section-head">
                <div className="submission-section-heading">
                  <span className="submission-section-eyebrow">
                    <VisibilityOutlinedIcon fontSize="inherit" />
                    Storage Snapshot
                  </span>
                  <h3>Backend Record Preview</h3>
                  <p>
                    Confirm the stored payload, review state, and metadata currently held by the API.
                  </p>
                </div>
              </div>

              <div className="submission-detail-storage-grid">
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Created At</p>
                  <p className="submission-kv-value">{formatDateTime(record.createdAt || record.submittedAt)}</p>
                </div>
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Updated At</p>
                  <p className="submission-kv-value">{formatDateTime(record.updatedAt || record.submittedAt)}</p>
                </div>
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Status</p>
                  <p className="submission-kv-value">{status.label}</p>
                </div>
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Review</p>
                  <p className="submission-kv-value">{record.reviewStateLabel}</p>
                </div>
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Structured Status</p>
                  <p className="submission-kv-value">{record.structuredStatusLabel}</p>
                </div>
                <div className="submission-kv-card">
                  <p className="submission-kv-label">Structured Warnings</p>
                  <p className="submission-kv-value">{record.structuredWarningCount || 0}</p>
                </div>
                {record.voiceStatus ? (
                  <div className="submission-kv-card">
                    <p className="submission-kv-label">Voice Status</p>
                    <p className="submission-kv-value">{record.voiceStatus}</p>
                  </div>
                ) : null}
                {record.voiceValidationStatus ? (
                  <div className="submission-kv-card">
                    <p className="submission-kv-label">Voice Review</p>
                    <p className="submission-kv-value">{record.voiceValidationStatus}</p>
                  </div>
                ) : null}
                {record.confidenceLabel ? (
                  <div className="submission-kv-card">
                    <p className="submission-kv-label">Voice Confidence</p>
                    <p className="submission-kv-value">{record.confidenceLabel}</p>
                  </div>
                ) : null}
                {record.voiceAudioDurationLabel ? (
                  <div className="submission-kv-card">
                    <p className="submission-kv-label">Voice Duration</p>
                    <p className="submission-kv-value">{record.voiceAudioDurationLabel}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>

        <footer className="submission-detail-footer">
          <button
            type="button"
            className="fleet-btn fleet-btn-secondary"
            onClick={() => setIsEditing((current) => !current)}
            disabled={isSaving}
            >
              {isEditing ? <CancelOutlinedIcon fontSize="inherit" /> : <EditOutlinedIcon fontSize="inherit" />}
              {isEditing ? "Cancel Edits" : "Edit"}
            </button>

          {isEditing ? (
            <button
              type="button"
              className="fleet-btn fleet-btn-primary"
              onClick={handleSaveDraft}
              disabled={isSaving || !isDirty}
            >
              <SaveOutlinedIcon fontSize="inherit" />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          ) : null}

          <button
            type="button"
            className="fleet-btn fleet-btn-secondary"
            onClick={handleExport}
          >
            <DownloadOutlinedIcon fontSize="inherit" />
            Export
          </button>
        </footer>
      </div>
    </div>
  );
}
