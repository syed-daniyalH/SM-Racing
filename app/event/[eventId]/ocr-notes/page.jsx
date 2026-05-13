"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DocumentScannerRoundedIcon from "@mui/icons-material/DocumentScannerRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import PendingActionsRoundedIcon from "@mui/icons-material/PendingActionsRounded";
import PhotoCameraBackRoundedIcon from "@mui/icons-material/PhotoCameraBackRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import Loader from "../../../components/Common/Loader";
import ScreenBackButton from "../../../components/Common/ScreenBackButton";
import StatusBadge from "../../../components/Common/StatusBadge";
import ProtectedRoute from "../../../components/ProtectedRoute";
import { getEventById, selectActiveEvent } from "../../../utils/eventApi";
import { formatEventDateRange, getEventSubmissionState } from "../../../utils/eventSchedule";
import { getDrivers, getVehicles } from "../../../utils/fleetApi";
import { getRunGroup } from "../../../utils/runGroupApi";
import { DRIVER_OPTIONS, SESSION_TYPE_OPTIONS, VEHICLE_OPTIONS } from "../../../utils/staticOptions";
import { createSubmission } from "../../../utils/submissionApi";
import { generateUUID } from "../../../utils/uuid";
import "./OCRNotes.css";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const GENERATED_SESSION_ID_PATTERN = /^\d{8}-\d{4}-[A-Z0-9]+-S\d+$/;
const LEGACY_SESSION_ID_PATTERN =
  /^[A-Z0-9]+-\d{8}-\d{4}-[A-Z0-9]+-\d+-[A-Z0-9]+-[A-Z0-9][A-Z0-9-]*$/;

const getCurrentLocalDateValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentLocalTimeValue = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const isValidDateValue = (value) => {
  const cleaned = String(value || "").trim();
  if (!DATE_PATTERN.test(cleaned)) {
    return false;
  }

  const [year, month, day] = cleaned.split("-").map((part) => Number(part));
  if (![year, month, day].every((part) => Number.isInteger(part))) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const isValidTimeValue = (value) => TIME_PATTERN.test(String(value || "").trim());

const isValidSessionId = (value) => {
  const cleaned = String(value || "").trim().toUpperCase();
  return GENERATED_SESSION_ID_PATTERN.test(cleaned) || LEGACY_SESSION_ID_PATTERN.test(cleaned);
};

const normalizeSessionDriverSegment = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const buildGeneratedSessionId = (date, time, driverId, sessionNumber) => {
  const normalizedDate = String(date || "").trim();
  const normalizedTime = String(time || "").trim();
  const normalizedDriverId = normalizeSessionDriverSegment(driverId);
  const normalizedSessionNumber = String(sessionNumber ?? "").trim();

  if (
    !isValidDateValue(normalizedDate) ||
    !isValidTimeValue(normalizedTime) ||
    !normalizedDriverId ||
    !/^\d+$/.test(normalizedSessionNumber)
  ) {
    return "";
  }

  return `${normalizedDate.replace(/-/g, "")}-${normalizedTime.replace(":", "")}-${normalizedDriverId}-S${normalizedSessionNumber}`;
};

const toNullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const buildDriverOption = (driver) => ({
  id: String(driver.driverCode || driver.id || "").trim(),
  label:
    driver.fullName ||
    driver.driverName ||
    driver.displayName ||
    driver.driverCode ||
    driver.id ||
    "Unknown driver",
});

const buildVehicleOption = (vehicle) => ({
  id: String(vehicle.vehicleCode || vehicle.id || "").trim(),
  driverId: String(vehicle.driverId || "").trim(),
  label:
    vehicle.vehicleCode ||
    vehicle.registrationNumber ||
    vehicle.make ||
    vehicle.model ||
    vehicle.id ||
    "Unknown vehicle",
});

const createOcrFormState = () => ({
  date: getCurrentLocalDateValue(),
  time: getCurrentLocalTimeValue(),
  session_id: "",
  track: "",
  driver_id: "",
  vehicle_id: "",
  session_type: SESSION_TYPE_OPTIONS[0]?.id || "Practice",
  session_number: 1,
  duration_min: 30,
  tire_set: "",
  wheelbase_mm: "",
  notes: "",
});

const formatStructuredWarning = (warning) => {
  const fieldLabel = warning?.field ? `${warning.field}: ` : "";
  return `${fieldLabel}${warning?.message || "Submission completed with a warning."}`;
};

const validateOcrSubmissionFields = ({
  formState,
  hasImage,
  runGroupId,
  driverOptions,
  vehicleOptions,
}) => {
  const errors = {};
  const validDriverIds = new Set(
    (driverOptions || [])
      .map((driver) => String(driver?.id || "").trim())
      .filter(Boolean),
  );
  const validVehicleIds = new Set(
    (vehicleOptions || [])
      .map((vehicle) => String(vehicle?.id || "").trim())
      .filter(Boolean),
  );

  if (!hasImage) {
    errors.image = "Please upload a handwritten note or setup sheet image.";
  }

  if (!isValidDateValue(formState.date)) {
    errors.date = "Please enter a valid date.";
  }

  if (!isValidTimeValue(formState.time)) {
    errors.time = "Please enter a valid time.";
  }

  if (!isValidSessionId(formState.session_id)) {
    errors.session_id = "Session ID must use the generated format or a legacy session reference.";
  }

  if (!normalizeText(formState.track)) {
    errors.track = "Track is required.";
  }

  if (!String(runGroupId || "").trim()) {
    errors.run_group = "Run group is required before an OCR submission can start.";
  }

  const driverId = String(formState.driver_id || "").trim();
  if (!driverId || !validDriverIds.has(driverId)) {
    errors.driver_id = "Please select a driver.";
  }

  const vehicleId = String(formState.vehicle_id || "").trim();
  if (!vehicleId || !validVehicleIds.has(vehicleId)) {
    errors.vehicle_id = "Please select a vehicle.";
  }

  if (!normalizeText(formState.session_type)) {
    errors.session_type = "Session type is required.";
  }

  const sessionNumberValue = String(formState.session_number ?? "").trim();
  if (!sessionNumberValue) {
    errors.session_number = "Session number is required.";
  } else {
    const parsedSessionNumber = Number(sessionNumberValue);
    if (!Number.isInteger(parsedSessionNumber) || parsedSessionNumber <= 0) {
      errors.session_number = "Session number must be a whole number greater than 0.";
    }
  }

  const durationValue = String(formState.duration_min ?? "").trim();
  if (durationValue) {
    const parsedDuration = Number(durationValue);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      errors.duration_min = "Duration must be greater than 0.";
    }
  }

  const wheelbaseValue = String(formState.wheelbase_mm ?? "").trim();
  if (wheelbaseValue) {
    const parsedWheelbase = Number(wheelbaseValue);
    if (!Number.isFinite(parsedWheelbase) || parsedWheelbase <= 0) {
      errors.wheelbase_mm = "Wheelbase must be greater than 0.";
    }
  }

  return errors;
};

const getSubmissionFailureMessage = (errorLike) => {
  const code = String(errorLike?.code || "").trim().toUpperCase();
  const message = String(errorLike?.message || errorLike?.error || "").trim();

  if (code === "SUBMISSION_ALREADY_EXISTS") {
    return "This Session ID already exists. Use a new Session ID or regenerate it before submitting.";
  }

  if (code === "SUBMISSION_DUPLICATE") {
    return "A matching submission already exists for this event, driver, vehicle, date, time, and session number.";
  }

  if (code === "SUBMISSION_SAVE_FAILED") {
    return "The backend could not save this OCR submission. Please try once more.";
  }

  return message || "OCR submission failed. Please try again.";
};

const getSubmissionSuccessState = (submission) => {
  const structuredStatus = String(submission?.structuredIngestStatus || "").trim().toLowerCase();
  const warnings = Array.isArray(submission?.structuredIngestWarnings)
    ? submission.structuredIngestWarnings
    : [];
  const stagedForReview = warnings.some(
    (warning) => String(warning?.code || "").trim().toUpperCase() === "IMAGE_STAGED_FOR_REVIEW",
  );

  if (structuredStatus === "pending_review" || warnings.length > 0) {
    return {
      status: "sent_with_warnings",
      message: stagedForReview
        ? "OCR note uploaded. The image was staged for extraction and review before any structured setup data is applied."
        : "OCR note uploaded. Review the submission details and warnings below.",
      warnings,
    };
  }

  return {
    status: "sent",
    message: "OCR note uploaded successfully. Redirecting to Submissions...",
    warnings: [],
  };
};

export default function OCRNotesPage() {
  const router = useRouter();
  const params = useParams();
  const routeEventId = params?.eventId;

  const [event, setEvent] = useState(null);
  const [runGroup, setRunGroup] = useState(null);
  const [driverOptions, setDriverOptions] = useState(DRIVER_OPTIONS);
  const [vehicleOptions, setVehicleOptions] = useState(VEHICLE_OPTIONS);
  const [formState, setFormState] = useState(() => createOcrFormState());
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageName, setImageName] = useState("");
  const [sessionIdMode, setSessionIdMode] = useState("auto");
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("idle");
  const [submissionFeedback, setSubmissionFeedback] = useState("");
  const [submissionWarnings, setSubmissionWarnings] = useState([]);

  const loadPageData = useCallback(async () => {
    if (!routeEventId) {
      router.push("/events");
      return;
    }

    setLoading(true);
    setPageError("");

    const [eventResult, runGroupResult, driversResult, vehiclesResult] = await Promise.allSettled([
      getEventById(routeEventId),
      getRunGroup(routeEventId),
      getDrivers(),
      getVehicles(),
    ]);

    try {
      if (eventResult.status !== "fulfilled") {
        throw eventResult.reason || new Error("Failed to load event");
      }

      const eventData = eventResult.value?.event || eventResult.value?.data || eventResult.value;
      if (!eventData || !(eventData.id || eventData._id || eventData.name)) {
        throw new Error("Event not found.");
      }

      setEvent(eventData);
      selectActiveEvent(routeEventId).catch((selectError) => {
        console.warn("Failed to set active event:", selectError);
      });

      setRunGroup(
        runGroupResult.status === "fulfilled" && runGroupResult.value && typeof runGroupResult.value === "object"
          ? runGroupResult.value
          : null,
      );

      const nextDrivers =
        driversResult.status === "fulfilled"
          ? (driversResult.value?.drivers || []).map(buildDriverOption).filter((driver) => driver.id)
          : [];
      const nextVehicles =
        vehiclesResult.status === "fulfilled"
          ? (vehiclesResult.value?.vehicles || []).map(buildVehicleOption).filter((vehicle) => vehicle.id)
          : [];

      setDriverOptions(nextDrivers.length > 0 ? nextDrivers : DRIVER_OPTIONS);
      setVehicleOptions(nextVehicles.length > 0 ? nextVehicles : VEHICLE_OPTIONS);
    } catch (error) {
      console.error("Failed to load OCR notes workspace:", error);
      setEvent(null);
      setRunGroup(null);
      setPageError("Failed to load the OCR Notes workspace. Please refresh and try again.");
      setDriverOptions(DRIVER_OPTIONS);
      setVehicleOptions(VEHICLE_OPTIONS);
    } finally {
      setLoading(false);
    }
  }, [routeEventId, router]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const eventTrack = event?.track || event?.track_name || "";
  const eventDates = formatEventDateRange(event?.startDate || event?.start_date, event?.endDate || event?.end_date);
  const submissionState = event
    ? getEventSubmissionState(event)
    : { isOpen: false, isUpcoming: false, hasEnded: false };
  const runGroupValue = runGroup?.normalized || runGroup?.rawText || runGroup?.raw_text || "Not assigned yet";
  const runGroupId = runGroup?.id || runGroup?._id || null;
  const hasRunGroup = Boolean(runGroupId && runGroupValue && runGroupValue !== "Not assigned yet");
  const canSubmitOcr = hasRunGroup && submissionState.isOpen;

  useEffect(() => {
    if (!eventTrack) {
      return;
    }

    setFormState((prev) => {
      if (normalizeText(prev.track)) {
        return prev;
      }

      return { ...prev, track: eventTrack };
    });
  }, [eventTrack]);

  const generatedSessionId = useMemo(
    () =>
      buildGeneratedSessionId(
        formState.date,
        formState.time,
        formState.driver_id,
        formState.session_number,
      ),
    [formState.date, formState.time, formState.driver_id, formState.session_number],
  );

  useEffect(() => {
    if (sessionIdMode !== "auto") {
      return;
    }

    setFormState((prev) => {
      if (prev.session_id === generatedSessionId) {
        return prev;
      }

      return {
        ...prev,
        session_id: generatedSessionId,
      };
    });
  }, [generatedSessionId, sessionIdMode]);

  const vehicleOptionsForDriver = useMemo(() => {
    const selectedDriverId = String(formState.driver_id || "").trim();
    if (!selectedDriverId) {
      return vehicleOptions;
    }

    const filteredVehicles = vehicleOptions.filter(
      (vehicle) => String(vehicle.driverId || "").trim() === selectedDriverId,
    );
    return filteredVehicles.length > 0 ? filteredVehicles : vehicleOptions;
  }, [formState.driver_id, vehicleOptions]);

  useEffect(() => {
    if (!formState.vehicle_id) {
      return;
    }

    const selectedDriverId = String(formState.driver_id || "").trim();
    if (!selectedDriverId) {
      return;
    }

    const vehicleStillValid = vehicleOptionsForDriver.some(
      (vehicle) => String(vehicle.id || "").trim() === String(formState.vehicle_id || "").trim(),
    );

    if (!vehicleStillValid) {
      setFormState((prev) => ({ ...prev, vehicle_id: "" }));
    }
  }, [formState.driver_id, formState.vehicle_id, vehicleOptionsForDriver]);

  const selectedDriverLabel =
    driverOptions.find((driver) => driver.id === formState.driver_id)?.label || "Not selected";
  const selectedVehicleLabel =
    vehicleOptionsForDriver.find((vehicle) => vehicle.id === formState.vehicle_id)?.label || "Not selected";
  const submissionWindowNote = !submissionState.isOpen
    ? "This event is closed for new OCR-backed submissions."
    : !hasRunGroup
      ? "Run group configuration is required before OCR submissions can be staged."
      : "OCR-backed submissions are ready for this event and run group.";

  const getFieldClassName = (baseClassName, fieldName) =>
    fieldErrors[fieldName] ? `${baseClassName} input-error` : baseClassName;

  const handleFieldChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      return {
        ...prev,
        [field]: "",
      };
    });
  };

  const handleImageChange = (eventLike) => {
    const file = eventLike.target.files?.[0];
    if (!file) {
      setImageDataUrl(null);
      setImageName("");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
      setImageName(file.name);
      setFieldErrors((prev) => ({
        ...prev,
        image: "",
      }));
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormState({
      ...createOcrFormState(),
      track: eventTrack,
    });
    setImageDataUrl(null);
    setImageName("");
    setSessionIdMode("auto");
    setFieldErrors({});
    setValidationAttempted(false);
    setPageError("");
    setSubmissionStatus("idle");
    setSubmissionFeedback("");
    setSubmissionWarnings([]);
  };

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();

    if (!canSubmitOcr) {
      setSubmissionStatus("failed");
      setSubmissionFeedback("");
      setSubmissionWarnings([]);
      setPageError(
        !hasRunGroup
          ? "Run group is required before OCR Notes can submit."
          : "This event is closed. OCR submissions are disabled.",
      );
      return;
    }

    const nextErrors = validateOcrSubmissionFields({
      formState,
      hasImage: Boolean(imageDataUrl),
      runGroupId,
      driverOptions,
      vehicleOptions: vehicleOptionsForDriver,
    });

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setValidationAttempted(true);
      setSubmissionStatus("failed");
      setSubmissionFeedback("");
      setSubmissionWarnings([]);
      setPageError("Please fix the highlighted fields before submitting.");
      return;
    }

    setIsSubmitting(true);
    setPageError("");
    setSubmissionStatus("pending");
    setSubmissionFeedback("");
    setSubmissionWarnings([]);

    try {
      const normalizedFormState = {
        ...formState,
        session_id: normalizeText(formState.session_id) || generateUUID(),
        track: normalizeText(formState.track) || eventTrack || "",
      };

      const response = await createSubmission({
        submissionId: normalizedFormState.session_id,
        session_id: normalizedFormState.session_id,
        correlation_id: generateUUID(),
        source: "pwa",
        eventId: event?._id || event?.id || routeEventId,
        runGroup: runGroupValue || undefined,
        action: "ADD_SEANCE",
        confidence: 0.85,
        data: {
          date: normalizedFormState.date || null,
          time: normalizedFormState.time || null,
          session_id: normalizedFormState.session_id || null,
          track: normalizedFormState.track || null,
          run_group: runGroupValue || null,
          driver_id: normalizedFormState.driver_id || null,
          vehicle_id: normalizedFormState.vehicle_id || null,
          session_type: normalizedFormState.session_type || null,
          session_number: toNullableNumber(normalizedFormState.session_number),
          duration_min: toNullableNumber(normalizedFormState.duration_min),
          tire_set: normalizeText(normalizedFormState.tire_set) || null,
          wheelbase_mm: toNullableNumber(normalizedFormState.wheelbase_mm),
          capture_channel: "ocr_notes",
        },
        analysis_result: {
          action: "ADD_SEANCE",
          confidence: 0.85,
          run_group: runGroupValue || undefined,
          submission_mode: "detail",
          source_channel: "ocr_notes",
          ocr_entrypoint: true,
          review_before_submission: true,
        },
        raw_text: normalizeText(normalizedFormState.notes) || undefined,
        image_url: imageDataUrl || undefined,
      });

      if (!response.success) {
        throw response;
      }

      const successState = getSubmissionSuccessState(response.submission);
      setSubmissionStatus(successState.status);
      setSubmissionFeedback(successState.message);
      setSubmissionWarnings(successState.warnings);

      if (successState.status === "sent") {
        window.setTimeout(() => {
          router.push(`/event/${routeEventId}/submissions`);
        }, 1800);
      }
    } catch (error) {
      console.error("OCR submission error:", error);
      setSubmissionStatus("failed");
      setSubmissionFeedback("");
      setSubmissionWarnings([]);
      setPageError(getSubmissionFailureMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && !event) {
    return (
      <ProtectedRoute requireDriver={true}>
        <Loader
          fullHeight
          label="Loading OCR workspace"
          sublabel="Fetching the active event, run group, and capture context..."
        />
      </ProtectedRoute>
    );
  }

  if (pageError && !event) {
    return (
      <ProtectedRoute requireDriver={true}>
        <div className="ocr-notes-page">
          <div className="ocr-notes-orb ocr-notes-orb-one" />
          <div className="ocr-notes-orb ocr-notes-orb-two" />

          <div className="ocr-notes-shell ocr-notes-state-shell">
            <div className="ocr-notes-state-card">
              <div className="ocr-notes-state-icon danger">
                <WarningAmberRoundedIcon fontSize="inherit" />
              </div>
              <p className="ocr-notes-eyebrow">
                <DocumentScannerRoundedIcon fontSize="inherit" />
                OCR Flow
              </p>
              <h1>OCR Notes unavailable</h1>
              <p>{pageError}</p>
              <div className="ocr-notes-state-actions">
                <button type="button" className="ocr-notes-button-primary" onClick={loadPageData}>
                  Retry Load
                </button>
                <button type="button" className="ocr-notes-button-secondary" onClick={() => router.push("/events")}>
                  Back to Events
                </button>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireDriver={true}>
      <div className="ocr-notes-page">
        <div className="ocr-notes-orb ocr-notes-orb-one" />
        <div className="ocr-notes-orb ocr-notes-orb-two" />

        <div className="ocr-notes-shell">
          <header className="ocr-notes-topbar">
            <div className="ocr-notes-topbar-copy">
              <ScreenBackButton fallbackHref={`/event/${routeEventId}`} label="Back" />
              <p className="ocr-notes-eyebrow">
                <DocumentScannerRoundedIcon fontSize="inherit" />
                OCR Flow
              </p>
              <h1 className="ocr-notes-title">OCR Notes</h1>
              <p className="ocr-notes-subtitle">
                Upload setup sheets or handwritten notes, extract values, and review before submission.
              </p>
            </div>

            <div className="ocr-notes-topbar-meta">
              <div className="ocr-notes-badge-row">
                <StatusBadge
                  label={submissionState.isOpen ? "Event Open" : "Event Closed"}
                  tone={submissionState.isOpen ? "success" : "neutral"}
                />
                <StatusBadge
                  label={hasRunGroup ? "Run Group Ready" : "Run Group Missing"}
                  tone={hasRunGroup ? "success" : "warning"}
                />
              </div>
              <button
                type="button"
                className="ocr-notes-refresh"
                onClick={loadPageData}
                disabled={loading}
              >
                <RefreshRoundedIcon fontSize="inherit" />
                Refresh Context
              </button>
            </div>
          </header>

          <section className="ocr-notes-context-strip">
            <div className="ocr-notes-context-item">
              <span>Event</span>
              <strong>{event?.name || "Unknown event"}</strong>
            </div>
            <div className="ocr-notes-context-item">
              <span>Track</span>
              <strong>{eventTrack || "Not provided"}</strong>
            </div>
            <div className="ocr-notes-context-item">
              <span>Run Group</span>
              <strong>{hasRunGroup ? runGroupValue : "Not Configured"}</strong>
            </div>
            <div className="ocr-notes-context-item">
              <span>Date Range</span>
              <strong>{eventDates}</strong>
            </div>
          </section>

          <section className="ocr-notes-status-strip">
            <div className="ocr-notes-status-item">
              <span>Capture State</span>
              <strong>{canSubmitOcr ? "Ready to Submit" : "Read Only"}</strong>
            </div>
            <div className="ocr-notes-status-item">
              <span>Image Review</span>
              <strong>{imageDataUrl ? "Attachment Ready" : "Waiting for Upload"}</strong>
            </div>
            <div className="ocr-notes-status-item">
              <span>Session ID</span>
              <strong>{normalizeText(formState.session_id) || "Will generate automatically"}</strong>
            </div>
            <div className="ocr-notes-status-item">
              <span>Submission Notes</span>
              <strong>{normalizeText(formState.notes) ? "Included" : "Optional"}</strong>
            </div>
          </section>

          <p className="ocr-notes-status-note">{submissionWindowNote}</p>

          {!submissionState.isOpen ? (
            <div className="ocr-notes-banner neutral">
              <PendingActionsRoundedIcon fontSize="inherit" />
              <div>
                <strong>Submission window closed.</strong>
                <span>This event is outside the active submission window, so OCR-backed submissions are read only.</span>
              </div>
            </div>
          ) : null}

          {!hasRunGroup ? (
            <div className="ocr-notes-banner warning">
              <WarningAmberRoundedIcon fontSize="inherit" />
              <div>
                <strong>Run group required.</strong>
                <span>Configure the event run group before drivers or mechanics start the OCR flow.</span>
              </div>
            </div>
          ) : null}

          {submissionStatus === "sent" ? (
            <div className="ocr-notes-banner success">
              <CheckCircleRoundedIcon fontSize="inherit" />
              <div>
                <strong>OCR note submitted.</strong>
                <span>{submissionFeedback}</span>
              </div>
            </div>
          ) : null}

          {submissionStatus === "sent_with_warnings" ? (
            <div className="ocr-notes-banner warning" data-testid="ocr-submission-warning">
              <WarningAmberRoundedIcon fontSize="inherit" />
              <div>
                <strong>OCR note staged with review warnings.</strong>
                <span>{submissionFeedback}</span>
                {submissionWarnings.length ? (
                  <ul className="ocr-notes-banner-list">
                    {submissionWarnings.map((warning, index) => (
                      <li key={`${warning?.code || "ocr-warning"}-${index}`}>{formatStructuredWarning(warning)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          {submissionStatus === "pending" && isSubmitting ? (
            <div className="ocr-notes-banner neutral">
              <PendingActionsRoundedIcon fontSize="inherit" />
              <div>
                <strong>Submitting OCR note.</strong>
                <span>Uploading the image and linking the session context now.</span>
              </div>
            </div>
          ) : null}

          {pageError && event ? (
            <div className="ocr-notes-banner danger" data-testid="ocr-submission-error">
              <WarningAmberRoundedIcon fontSize="inherit" />
              <div>
                <strong>Unable to continue.</strong>
                <span>{pageError}</span>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <section className="ocr-notes-main-grid">
              <div className="ocr-notes-panel">
                <div className="ocr-notes-panel-head">
                  <div>
                    <p className="ocr-notes-panel-eyebrow">Required Details</p>
                    <h2>Session context</h2>
                  </div>
                  <StatusBadge label={canSubmitOcr ? "Driver Ready" : "Read Only"} tone={canSubmitOcr ? "success" : "neutral"} />
                </div>

                <div className="ocr-notes-form-grid">
                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-date">Date</label>
                    <input
                      id="ocr-submission-date"
                      data-testid="ocr-submission-date"
                      className={getFieldClassName("ocr-notes-input", "date")}
                      type="date"
                      value={formState.date}
                      onChange={(eventLike) => handleFieldChange("date", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.date)}
                    />
                    {fieldErrors.date ? <p className="ocr-notes-field-error">{fieldErrors.date}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-time">Time</label>
                    <input
                      id="ocr-submission-time"
                      data-testid="ocr-submission-time"
                      className={getFieldClassName("ocr-notes-input", "time")}
                      type="time"
                      step="60"
                      value={formState.time}
                      onChange={(eventLike) => handleFieldChange("time", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.time)}
                    />
                    {fieldErrors.time ? <p className="ocr-notes-field-error">{fieldErrors.time}</p> : null}
                  </div>

                  <div className="ocr-notes-field ocr-notes-field-wide">
                    <label htmlFor="ocr-submission-session-id">Session ID</label>
                    <input
                      id="ocr-submission-session-id"
                      data-testid="ocr-submission-session-id"
                      className={getFieldClassName("ocr-notes-input", "session_id")}
                      type="text"
                      value={formState.session_id}
                      onChange={(eventLike) => {
                        setSessionIdMode("manual");
                        handleFieldChange("session_id", eventLike.target.value.toUpperCase());
                      }}
                      placeholder="YYYYMMDD-HHMM-DRIVERID-S1"
                      maxLength={120}
                      spellCheck={false}
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.session_id)}
                    />
                    <div className="ocr-notes-inline-actions">
                      <p className="ocr-notes-field-hint">
                        Auto-generated from date, time, driver, and session number. You can still edit it.
                      </p>
                      <button
                        type="button"
                        className="ocr-notes-inline-button"
                        onClick={() => {
                          setSessionIdMode("auto");
                          handleFieldChange("session_id", generatedSessionId);
                        }}
                      >
                        Use Generated ID
                      </button>
                    </div>
                    {fieldErrors.session_id ? <p className="ocr-notes-field-error">{fieldErrors.session_id}</p> : null}
                  </div>

                  <div className="ocr-notes-field ocr-notes-field-wide">
                    <label htmlFor="ocr-submission-track">Track</label>
                    <input
                      id="ocr-submission-track"
                      data-testid="ocr-submission-track"
                      className={getFieldClassName("ocr-notes-input", "track")}
                      type="text"
                      value={formState.track}
                      onChange={(eventLike) => handleFieldChange("track", eventLike.target.value)}
                      placeholder="Enter the active track"
                      aria-invalid={Boolean(fieldErrors.track)}
                    />
                    {fieldErrors.track ? <p className="ocr-notes-field-error">{fieldErrors.track}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-driver">Driver</label>
                    <select
                      id="ocr-submission-driver"
                      data-testid="ocr-submission-driver"
                      className={getFieldClassName("ocr-notes-select", "driver_id")}
                      value={formState.driver_id}
                      onChange={(eventLike) => handleFieldChange("driver_id", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.driver_id)}
                    >
                      <option value="">Select driver</option>
                      {driverOptions.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.driver_id ? <p className="ocr-notes-field-error">{fieldErrors.driver_id}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-vehicle">Vehicle</label>
                    <select
                      id="ocr-submission-vehicle"
                      data-testid="ocr-submission-vehicle"
                      className={getFieldClassName("ocr-notes-select", "vehicle_id")}
                      value={formState.vehicle_id}
                      onChange={(eventLike) => handleFieldChange("vehicle_id", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.vehicle_id)}
                    >
                      <option value="">Select vehicle</option>
                      {vehicleOptionsForDriver.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.vehicle_id ? <p className="ocr-notes-field-error">{fieldErrors.vehicle_id}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-session-type">Session Type</label>
                    <select
                      id="ocr-submission-session-type"
                      data-testid="ocr-submission-session-type"
                      className={getFieldClassName("ocr-notes-select", "session_type")}
                      value={formState.session_type}
                      onChange={(eventLike) => handleFieldChange("session_type", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.session_type)}
                    >
                      {SESSION_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.session_type ? <p className="ocr-notes-field-error">{fieldErrors.session_type}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-session-number">Session Number</label>
                    <input
                      id="ocr-submission-session-number"
                      data-testid="ocr-submission-session-number"
                      className={getFieldClassName("ocr-notes-input", "session_number")}
                      type="number"
                      min="1"
                      step="1"
                      value={formState.session_number}
                      onChange={(eventLike) => handleFieldChange("session_number", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.session_number)}
                    />
                    {fieldErrors.session_number ? <p className="ocr-notes-field-error">{fieldErrors.session_number}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-duration">Duration (min)</label>
                    <input
                      id="ocr-submission-duration"
                      data-testid="ocr-submission-duration"
                      className={getFieldClassName("ocr-notes-input", "duration_min")}
                      type="number"
                      min="1"
                      step="1"
                      value={formState.duration_min}
                      onChange={(eventLike) => handleFieldChange("duration_min", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.duration_min)}
                    />
                    {fieldErrors.duration_min ? <p className="ocr-notes-field-error">{fieldErrors.duration_min}</p> : null}
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-tire-set">Tire Set</label>
                    <input
                      id="ocr-submission-tire-set"
                      data-testid="ocr-submission-tire-set"
                      className="ocr-notes-input"
                      type="text"
                      value={formState.tire_set}
                      onChange={(eventLike) => handleFieldChange("tire_set", eventLike.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="ocr-notes-field">
                    <label htmlFor="ocr-submission-wheelbase">Wheelbase (mm)</label>
                    <input
                      id="ocr-submission-wheelbase"
                      data-testid="ocr-submission-wheelbase"
                      className={getFieldClassName("ocr-notes-input", "wheelbase_mm")}
                      type="number"
                      min="1"
                      step="1"
                      value={formState.wheelbase_mm}
                      onChange={(eventLike) => handleFieldChange("wheelbase_mm", eventLike.target.value)}
                      aria-invalid={Boolean(fieldErrors.wheelbase_mm)}
                    />
                    {fieldErrors.wheelbase_mm ? <p className="ocr-notes-field-error">{fieldErrors.wheelbase_mm}</p> : null}
                  </div>
                </div>
              </div>

              <div className="ocr-notes-panel">
                <div className="ocr-notes-panel-head">
                  <div>
                    <p className="ocr-notes-panel-eyebrow">OCR Capture</p>
                    <h2>Upload and review</h2>
                  </div>
                  <PhotoCameraBackRoundedIcon className="ocr-notes-panel-icon" fontSize="inherit" />
                </div>

                <p className="ocr-notes-panel-copy">
                  Attach a setup sheet or handwritten notes image. The OCR flow will preserve the event, run group,
                  driver, vehicle, and session metadata with the uploaded file.
                </p>

                <div className="ocr-notes-upload-shell">
                  <label className={`ocr-notes-upload-dropzone${fieldErrors.image ? " input-error" : ""}`}>
                    <input
                      data-testid="ocr-submission-image-input"
                      className="ocr-notes-upload-input"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                    <UploadFileRoundedIcon fontSize="inherit" />
                    <strong>{imageName || "Upload setup sheet or handwritten note"}</strong>
                    <span>PNG, JPG, or WEBP images are accepted here.</span>
                  </label>
                  {fieldErrors.image ? <p className="ocr-notes-field-error">{fieldErrors.image}</p> : null}
                </div>

                <div className="ocr-notes-preview-shell">
                  {imageDataUrl ? (
                    <>
                      <Image
                        src={imageDataUrl}
                        alt="OCR note preview"
                        className="ocr-notes-preview-image"
                        width={1200}
                        height={900}
                        unoptimized
                      />
                      <button type="button" className="ocr-notes-inline-button" onClick={() => {
                        setImageDataUrl(null);
                        setImageName("");
                      }}>
                        Remove Image
                      </button>
                    </>
                  ) : (
                    <div className="ocr-notes-preview-empty">
                      <DocumentScannerRoundedIcon fontSize="inherit" />
                      <span>No image selected yet.</span>
                    </div>
                  )}
                </div>

                <div className="ocr-notes-field ocr-notes-field-wide">
                  <label htmlFor="ocr-submission-notes">Additional Notes</label>
                  <textarea
                    id="ocr-submission-notes"
                    data-testid="ocr-submission-notes"
                    className="ocr-notes-textarea"
                    rows={6}
                    value={formState.notes}
                    onChange={(eventLike) => handleFieldChange("notes", eventLike.target.value)}
                    placeholder="Optional context to accompany the uploaded sheet before review."
                  />
                  <p className="ocr-notes-field-hint">
                    Add a short summary, corrections, or callouts that should travel with the OCR-backed submission.
                  </p>
                </div>

                <div className="ocr-notes-review-card">
                  <p className="ocr-notes-panel-eyebrow">Review Snapshot</p>
                  <ul className="ocr-notes-review-list">
                    <li>
                      <span>Event</span>
                      <strong>{event?.name || "Unknown event"}</strong>
                    </li>
                    <li>
                      <span>Run Group</span>
                      <strong>{hasRunGroup ? runGroupValue : "Not Configured"}</strong>
                    </li>
                    <li>
                      <span>Driver</span>
                      <strong>{selectedDriverLabel}</strong>
                    </li>
                    <li>
                      <span>Vehicle</span>
                      <strong>{selectedVehicleLabel}</strong>
                    </li>
                    <li>
                      <span>Session</span>
                      <strong>
                        {normalizeText(formState.session_type) || "Session type"} / S
                        {String(formState.session_number || "").trim() || "-"}
                      </strong>
                    </li>
                    <li>
                      <span>Attachment</span>
                      <strong>{imageName || "Not selected"}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <footer className="ocr-notes-footer">
              <div className="ocr-notes-footer-copy">
                <h3>Submit the OCR-backed note</h3>
                <p>
                  This creates an image-backed submission for the selected event and queues the OCR extraction review
                  path without changing the typed Notes or Voice Submission flows.
                </p>
              </div>

              <div className="ocr-notes-footer-actions">
                <button type="button" className="ocr-notes-button-secondary" onClick={() => router.push(`/event/${routeEventId}`)}>
                  Back to Event
                </button>
                <button type="button" className="ocr-notes-button-secondary" onClick={resetForm}>
                  Reset Form
                </button>
                <button
                  type="submit"
                  data-testid="ocr-submission-submit"
                  className="ocr-notes-button-primary"
                  disabled={isSubmitting || !canSubmitOcr}
                >
                  {isSubmitting ? "Submitting OCR Note..." : "Submit OCR Note"}
                </button>
              </div>
            </footer>
          </form>

          {(submissionStatus === "sent" || submissionStatus === "sent_with_warnings") && (
            <section className="ocr-notes-success-panel">
              <div className="ocr-notes-success-copy">
                <p className="ocr-notes-panel-eyebrow">Next Steps</p>
                <h2>Keep the submission flow moving</h2>
                <p>
                  Open the event history to confirm the OCR-backed note, start another upload, or jump back into the
                  typed notes flow without losing event context.
                </p>
              </div>

              <div className="ocr-notes-link-grid">
                <button
                  type="button"
                  className="ocr-notes-link-card"
                  onClick={() => router.push(`/event/${routeEventId}/submissions`)}
                >
                  <div className="ocr-notes-link-icon">
                    <CheckCircleRoundedIcon fontSize="inherit" />
                  </div>
                  <div className="ocr-notes-link-copy">
                    <span>Review History</span>
                    <strong>Open Submissions</strong>
                  </div>
                  <KeyboardArrowRightRoundedIcon className="ocr-notes-link-arrow" fontSize="inherit" />
                </button>

                <button type="button" className="ocr-notes-link-card" onClick={resetForm}>
                  <div className="ocr-notes-link-icon accent">
                    <DocumentScannerRoundedIcon fontSize="inherit" />
                  </div>
                  <div className="ocr-notes-link-copy">
                    <span>OCR Flow</span>
                    <strong>Upload Another</strong>
                  </div>
                  <KeyboardArrowRightRoundedIcon className="ocr-notes-link-arrow" fontSize="inherit" />
                </button>

                <button
                  type="button"
                  className="ocr-notes-link-card"
                  onClick={() => router.push(`/event/${routeEventId}/notes`)}
                >
                  <div className="ocr-notes-link-icon neutral">
                    <PendingActionsRoundedIcon fontSize="inherit" />
                  </div>
                  <div className="ocr-notes-link-copy">
                    <span>Typed Entry</span>
                    <strong>Open Submit Notes</strong>
                  </div>
                  <KeyboardArrowRightRoundedIcon className="ocr-notes-link-arrow" fontSize="inherit" />
                </button>
              </div>
            </section>
          )}

          {validationAttempted && fieldErrors.run_group ? (
            <p className="ocr-notes-inline-warning">{fieldErrors.run_group}</p>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
