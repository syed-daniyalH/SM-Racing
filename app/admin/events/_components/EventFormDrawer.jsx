"use client";

import EventNoteIcon from "@mui/icons-material/EventNote";
import { DrawerShell } from "../../fleet/_components/ManagementUi";
import { getRunGroupPreview } from "./eventManagementHelpers";

const buildMailto = (address, subject) =>
  `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

const ADMIN_RAIL_LINKS = [
  { label: "Privacy Policy", href: buildMailto("privacy@sm2racing.local", "SM-2 Privacy Policy") },
  { label: "Terms of Service", href: buildMailto("legal@sm2racing.local", "SM-2 Terms of Service") },
  { label: "Security", href: buildMailto("security@sm2racing.local", "SM-2 Security") },
  { label: "Compliance", href: buildMailto("compliance@sm2racing.local", "SM-2 Compliance") },
];

export default function EventFormDrawer({
  open,
  mode = "create",
  values,
  onChange,
  onClose,
  onSubmit,
  onArchive = null,
  archiveDisabled = false,
  isSaving = false,
  error = "",
  notesHint = "Optional operational notes for admin reference.",
}) {
  if (!open) return null;

  const title = mode === "edit" ? "Edit Event" : "Create Event";
  const subtitle =
    mode === "edit"
      ? "Update the event details, run group, lifecycle state, and internal notes."
      : "Set up a new race event with the correct track, schedule, run group, and notes.";
  const runGroupPreview = getRunGroupPreview(values.runGroup || "");

  const updateField = (field) => (event) => {
    onChange(field, event.target.value);
  };

  return (
    <DrawerShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={isSaving ? undefined : onClose}
      footer={
        <div className="event-drawer-footer-stack">
          <div className="event-drawer-sidebar">
            <div className="event-drawer-sidebar-header">
              <div className="event-drawer-sidebar-eyebrow">System Status</div>
              <div className="event-drawer-sidebar-title">Right Rail</div>
              <p className="event-drawer-sidebar-copy">
                Keep the admin workspace connected to the live system while the
                event form stays open.
              </p>
            </div>

            <div className="event-drawer-system-card">
              <div className="event-drawer-system-line">
                <span className="event-drawer-system-dot" aria-hidden="true" />
                <span className="event-drawer-system-label">System Online</span>
              </div>
              <div className="event-drawer-system-meta">
                <span className="event-drawer-system-version">SM-2 v1.0.0</span>
                <span className="event-drawer-system-badge">Latest</span>
              </div>
            </div>

            <div className="event-drawer-legal">
              {ADMIN_RAIL_LINKS.map((item) => (
                <a key={item.label} className="event-drawer-legal-link" href={item.href}>
                  <span className="event-drawer-legal-dot" aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="event-drawer-footer-actions">
            <button
              type="button"
              className="fleet-btn fleet-btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            {mode === "edit" && onArchive ? (
              <button
                type="button"
                className="fleet-btn fleet-btn-danger"
                onClick={onArchive}
                disabled={isSaving || archiveDisabled}
              >
                {archiveDisabled ? "Archived" : "Archive Event"}
              </button>
            ) : null}
            <button
              type="submit"
              form="event-form-drawer-form"
              className="fleet-btn fleet-btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : mode === "edit" ? "Save Event" : "Create Event"}
            </button>
          </div>
        </div>
      }
    >
      <form id="event-form-drawer-form" className="event-form-drawer-content" onSubmit={onSubmit}>
        <div className="drawer-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="event-name">
              Event Name
            </label>
            <input
              id="event-name"
              className="input"
              type="text"
              placeholder="Spring Championship"
              value={values.name}
              onChange={updateField("name")}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="event-track">
              Track
            </label>
            <input
              id="event-track"
              className="input"
              type="text"
              placeholder="Circuit de la Sarthe"
              value={values.track}
              onChange={updateField("track")}
              autoComplete="off"
            />
          </div>

          <div className="form-group drawer-span-2">
            <label className="form-label" htmlFor="event-run-group">
              Run Group <span className="required-marker">*</span>
            </label>
            <input
              id="event-run-group"
              className="input"
              type="text"
              placeholder="RED"
              value={values.runGroup}
              onChange={updateField("runGroup")}
              autoComplete="off"
              required
            />
            <div className={`run-group-preview ${runGroupPreview.isValid ? "valid" : "invalid"}`}>
              <div className="run-group-preview-label">Normalized preview</div>
              <div className="run-group-preview-value">
                {runGroupPreview.isValid ? runGroupPreview.resolved : "Not configured yet"}
              </div>
              <p className="form-hint">
                {mode === "edit"
                  ? "Edit the raw label here. The backend keeps the normalized code in sync."
                  : runGroupPreview.hint}
              </p>
            </div>
          </div>

          <div className="form-row drawer-span-2">
            <div className="form-group">
              <label className="form-label" htmlFor="event-start-date">
                Start Date
              </label>
              <input
                id="event-start-date"
                className="input"
                type="date"
                value={values.startDate}
                onChange={updateField("startDate")}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="event-end-date">
                End Date
              </label>
              <input
                id="event-end-date"
                className="input"
                type="date"
                value={values.endDate}
                onChange={updateField("endDate")}
              />
            </div>
          </div>

          <div className="form-group drawer-span-2">
            <label className="form-label" htmlFor="event-status">
              Status
            </label>
            <select
              id="event-status"
              className="input"
              value={values.status}
              onChange={updateField("status")}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <p className="form-hint">Completed is derived automatically from the event dates.</p>
          </div>

          <div className="form-group drawer-span-2">
            <label className="form-label" htmlFor="event-notes">
              Notes / Description
            </label>
            <textarea
              id="event-notes"
              className="input event-textarea"
              rows={5}
              placeholder="Optional operational context, weekend notes, or admin-only guidance."
              value={values.notes}
              onChange={updateField("notes")}
            />
            <p className="form-hint">
              <EventNoteIcon
                fontSize="inherit"
                style={{ verticalAlign: "-2px", marginRight: 4 }}
              />
              {notesHint}
            </p>
          </div>
        </div>

        {error ? <div className="error-text">{error}</div> : null}
      </form>
    </DrawerShell>
  );
}
