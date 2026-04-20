"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";

export default function EventArchiveDialog({
  open,
  eventName,
  onClose,
  onConfirm,
  isSaving = false,
}) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-event-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-icon danger">
          <WarningAmberIcon />
        </div>

        <h3 id="archive-event-title">Archive Event</h3>
        <p className="confirm-modal-copy">
          Archive <strong>{eventName}</strong>? This will deactivate the event
          without permanently deleting it, so it stays available in the
          archived filter for audit and recovery.
        </p>

        <div className="confirm-modal-note">
          Run group data and submissions remain linked to the event, but new
          active operations should not be scheduled against archived events.
        </div>

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isSaving}
          >
            {isSaving ? "Archiving..." : "Archive Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
