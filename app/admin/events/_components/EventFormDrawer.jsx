"use client";

import CloseIcon from "@mui/icons-material/Close";
import EventNoteIcon from "@mui/icons-material/EventNote";
import { getRunGroupPreview } from "./eventManagementHelpers";

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
    <div
      className="event-drawer-backdrop"
      onClick={isSaving ? undefined : onClose}
    >
      <aside
        className="event-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="event-drawer-header">
          <div className="event-drawer-header-copy">
            <span className="event-drawer-eyebrow">
              {mode === "edit" ? "Modify Existing Event" : "New Event"}
            </span>
            <h2 id="event-form-drawer-title">{title}</h2>
            <p>{subtitle}</p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close event form"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <form className="event-drawer-form" onSubmit={onSubmit}>
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

            <div className="form-group">
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
              <div
                className={`run-group-preview ${
                  runGroupPreview.isValid ? "valid" : "invalid"
                }`}
              >
                <div className="run-group-preview-label">
                  Normalized preview
                </div>
                <div className="run-group-preview-value">
                  {runGroupPreview.isValid
                    ? runGroupPreview.resolved
                    : "Not configured yet"}
                </div>
                <p className="form-hint">
                  {mode === "edit"
                    ? "Edit the raw label here. The backend keeps the normalized code in sync."
                    : runGroupPreview.hint}
                </p>
              </div>
            </div>

            <div className="form-row">
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

            <div className="form-group">
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
              <p className="form-hint">
                Completed is derived automatically from the event dates.
              </p>
            </div>

            <div className="form-group">
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

          <div className="event-drawer-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            {mode === "edit" && onArchive ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onArchive}
                disabled={isSaving || archiveDisabled}
              >
                {archiveDisabled ? "Archived" : "Archive Event"}
              </button>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : mode === "edit" ? "Save Event" : "Create Event"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
