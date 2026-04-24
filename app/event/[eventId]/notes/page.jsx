"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import ScreenBackButton from "../../../components/Common/ScreenBackButton";
import VoiceInputControl from "../../../components/Common/VoiceInputControl";
import { generateUUID } from "../../../utils/uuid";
import { getEventById, selectActiveEvent } from "../../../utils/eventApi";
import { createSubmission } from "../../../utils/submissionApi";
import { getTrackCatalog } from "../../../utils/trackCatalogApi";
import { getRunGroup } from "../../../utils/runGroupApi";
import { getDrivers, getVehicles } from "../../../utils/fleetApi";
import { getEventSubmissionState } from "../../../utils/eventSchedule";
import {
  DRIVER_OPTIONS,
  VEHICLE_OPTIONS,
  SESSION_TYPE_OPTIONS,
  PRESSURE_UNIT_OPTIONS,
  TRACK_OPTIONS,
} from "../../../utils/staticOptions";
import "./NotesSubmission.css";

const getCurrentLocalTimeValue = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SESSION_ID_PATTERN = /^\d{8}-\d{4}-[A-Z0-9]+-S\d+$/;
const TIRE_INVENTORY_STATUS_OPTIONS = [
  { id: "ACTIVE", label: "Active" },
  { id: "DISCARDED", label: "Discarded" },
];

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
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

const isValidTimeValue = (value) => TIME_PATTERN.test(String(value || "").trim());

const isValidSessionId = (value) => SESSION_ID_PATTERN.test(String(value || "").trim());

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

const validateSubmissionFields = ({ formState, trackValue, driverOptions, vehicleOptions }) => {
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

  if (!isValidDateValue(formState.date)) {
    errors.date = "Please enter a valid date.";
  }

  if (!isValidTimeValue(formState.time)) {
    errors.time = "Please enter a valid time.";
  }

  if (!String(formState.session_type || "").trim()) {
    errors.session_type = "Session type is required.";
  }

  if (!isValidSessionId(formState.session_id)) {
    errors.session_id = "Session ID is required and must follow the correct format.";
  }

  const wheelbaseValue = String(formState.wheelbase_mm ?? "").trim();
  if (wheelbaseValue) {
    const parsedWheelbase = Number(wheelbaseValue);
    if (!Number.isFinite(parsedWheelbase) || parsedWheelbase <= 0) {
      errors.wheelbase_mm = "Wheelbase must be greater than 0.";
    }
  }

  if (!String(trackValue || "").trim()) {
    errors.track = "Please select a track.";
  }

  const driverId = String(formState.driver_id || "").trim();
  if (!driverId || !validDriverIds.has(driverId)) {
    errors.driver_id = "Please select a driver.";
  }

  const vehicleId = String(formState.vehicle_id || "").trim();
  if (!vehicleId || !validVehicleIds.has(vehicleId)) {
    errors.vehicle_id = "Please select a vehicle.";
  }

  return errors;
};

const createBaseFormState = () => ({
  date: "",
  time: getCurrentLocalTimeValue(),
  session_id: "",
  track: "",
  driver_id: "",
  vehicle_id: "",
  session_type: "Practice",
  session_number: 1,
  duration_min: 30,
  tire_set: "",
  wheelbase_mm: "",
  pressures: {
    unit: "psi",
    cold: { fl: "", fr: "", rl: "", rr: "" },
    hot: { fl: "", fr: "", rl: "", rr: "" },
  },
});

const createDetailFormState = () => ({
  ...createBaseFormState(),
  suspension: {
    rebound_fl: "",
    rebound_fr: "",
    rebound_rl: "",
    rebound_rr: "",
    bump_fl: "",
    bump_fr: "",
    bump_rl: "",
    bump_rr: "",
    sway_bar_f: "",
    sway_bar_r: "",
    wing_angle_deg: "",
  },
  alignment: {
    camber_fl: "",
    camber_fr: "",
    camber_rl: "",
    camber_rr: "",
    toe_front: "",
    toe_rear: "",
    caster_l: "",
    caster_r: "",
    ride_height_f: "",
    ride_height_r: "",
    corner_weight_fl: "",
    corner_weight_fr: "",
    corner_weight_rl: "",
    corner_weight_rr: "",
    cross_weight_pct: "",
    rake_mm: "",
  },
  tire_temperatures: {
    fl_in: "",
    fl_mid: "",
    fl_out: "",
    fr_in: "",
    fr_mid: "",
    fr_out: "",
    rl_in: "",
    rl_mid: "",
    rl_out: "",
    rr_in: "",
    rr_mid: "",
    rr_out: "",
  },
  tire_inventory: {
    tire_id: "",
    manufacturer: "",
    model: "",
    size: "",
    purchase_date: "",
    heat_cycles: "",
    track_time_min: "",
    status: "ACTIVE",
  },
});

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

export default function NotesSubmission() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId;
  const { user, isMechanic } = useAuth();
  const [event, setEvent] = useState(null);
  const [activeTab, setActiveTab] = useState("quick"); // 'quick' | 'detail'
  const [eventRunGroup, setEventRunGroup] = useState("");
  const [trackSelection, setTrackSelection] = useState(""); // dropdown value; '__OTHER__' => manual entry
  const [trackCatalog, setTrackCatalog] = useState([]);
  const [driverOptions, setDriverOptions] = useState(() => DRIVER_OPTIONS);
  const [vehicleOptions, setVehicleOptions] = useState(() => VEHICLE_OPTIONS);

  const [pressureTypeQuick, setPressureTypeQuick] = useState("cold");
  const [pressureTypeDetail, setPressureTypeDetail] = useState("cold");

  const [quickRawText, setQuickRawText] = useState("");
  const [detailRawText, setDetailRawText] = useState("");
  const [quickAction, setQuickAction] = useState("ADD_SEANCE");
  const [detailAction, setDetailAction] = useState("ADD_SEANCE");
  const [quickConfidence, setQuickConfidence] = useState(0.85);
  const [detailConfidence, setDetailConfidence] = useState(0.85);
  const [detailDraftStatus, setDetailDraftStatus] = useState("idle");
  const [detailDraftReady, setDetailDraftReady] = useState(false);
  const [quickImage, setQuickImage] = useState(null);
  const [detailImage, setDetailImage] = useState(null);
  const [quickVoiceInputUsed, setQuickVoiceInputUsed] = useState(false);
  const quickRawTextRef = useRef(null);
  const detailDraftHydratedRef = useRef(false);
  const detailDraftSaveTimeoutRef = useRef(null);

  const [quickForm, setQuickForm] = useState(() => createBaseFormState());

  const [detailForm, setDetailForm] = useState(() =>
    createDetailFormState(),
  );
  const [submissionStatus, setSubmissionStatus] = useState("pending"); // sent, pending, failed
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sessionIdMode, setSessionIdMode] = useState({
    quick: "auto",
    detail: "auto",
  });
  const [fieldTouched, setFieldTouched] = useState({ quick: {}, detail: {} });
  const [validationAttempted, setValidationAttempted] = useState({
    quick: false,
    detail: false,
  });
  const currentUserStorageKey = useMemo(() => {
    const resolveUserKey = (candidate) =>
      candidate?.id ||
      candidate?._id ||
      candidate?.userId ||
      candidate?.email ||
      candidate?.user?.id ||
      candidate?.user?._id ||
      candidate?.user?.userId ||
      candidate?.user?.email ||
      null;

    if (typeof window !== "undefined") {
      try {
        const storedUser = window.localStorage.getItem("sm2_user");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          const storedKey = resolveUserKey(parsedUser);
          if (storedKey) {
            return String(storedKey);
          }
        }
      } catch (error) {
        console.warn("Failed to read stored user for draft key:", error);
      }
    }

    return resolveUserKey(user) || "anonymous";
  }, [user]);
  const detailDraftStorageKey = useMemo(() => {
    if (!eventId || !currentUserStorageKey) {
      return null;
    }

    return `sm2:submission-draft:${eventId}:${currentUserStorageKey}`;
  }, [currentUserStorageKey, eventId]);

  useEffect(() => {
    // Load event from API
    const loadEvent = async () => {
      try {
        const response = await getEventById(eventId);
        const eventData = response.event || response.data || response;
        if (eventData) {
          setEvent(eventData);
          selectActiveEvent(eventId).catch((error) => {
            console.warn("Failed to set active event:", error);
          });
        } else {
          router.push("/events");
        }
      } catch (error) {
        console.error("Failed to load event:", error);
        setError("Failed to load event. Please try again.");
        router.push("/events");
      }
    };

    if (eventId) {
      loadEvent();
    }
  }, [eventId, router]);

  useEffect(() => {
    // Load run group for this event (normalized or rawText)
    const loadRunGroup = async () => {
      try {
        const response = await getRunGroup(eventId);
        const value =
          response?.normalized || response?.rawText || response?.runGroup;
        if (value && typeof value === "string") {
          setEventRunGroup(value.trim());
        }
      } catch (err) {
        setEventRunGroup("");
      }
    };

    if (eventId) loadRunGroup();
  }, [eventId]);

  useEffect(() => {
    let isActive = true;

    const loadFleetOptions = async () => {
      try {
        const [driversResponse, vehiclesResponse] = await Promise.all([
          getDrivers(),
          getVehicles(),
        ]);

        if (!isActive) return;

        const liveDrivers = (driversResponse?.drivers || [])
          .filter((driver) => driver?.isActive !== false)
          .map(buildDriverOption)
          .filter((option) => option.id);

        const liveVehicles = (vehiclesResponse?.vehicles || [])
          .filter((vehicle) => vehicle?.isActive !== false)
          .map(buildVehicleOption)
          .filter((option) => option.id);

        setDriverOptions(liveDrivers.length ? liveDrivers : DRIVER_OPTIONS);
        setVehicleOptions(liveVehicles.length ? liveVehicles : VEHICLE_OPTIONS);
      } catch (error) {
        console.warn("Falling back to static fleet options:", error);
        if (!isActive) return;
        setDriverOptions(DRIVER_OPTIONS);
        setVehicleOptions(VEHICLE_OPTIONS);
      }
    };

    loadFleetOptions();

    return () => {
      isActive = false;
    };
  }, []);

  const clearDetailDraft = () => {
    if (!detailDraftStorageKey || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.removeItem(detailDraftStorageKey);
    } catch (error) {
      console.warn("Failed to clear detail draft:", error);
    }

    if (detailDraftSaveTimeoutRef.current) {
      window.clearTimeout(detailDraftSaveTimeoutRef.current);
      detailDraftSaveTimeoutRef.current = null;
    }

    detailDraftHydratedRef.current = false;
    setDetailDraftReady(false);
    setDetailDraftStatus("idle");
  };

  const persistDetailDraftSnapshot = (nextDetailForm) => {
    if (
      activeTab !== "detail" ||
      !detailDraftStorageKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    if (detailDraftSaveTimeoutRef.current) {
      window.clearTimeout(detailDraftSaveTimeoutRef.current);
    }

    setDetailDraftStatus("saving");
    detailDraftSaveTimeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          detailDraftStorageKey,
          JSON.stringify({
            detailForm: nextDetailForm,
            pressureTypeDetail,
            detailAction,
            detailConfidence,
            savedAt: new Date().toISOString(),
          }),
        );
        detailDraftHydratedRef.current = true;
        setDetailDraftReady(true);
        setDetailDraftStatus("saved");
      } catch (error) {
        console.warn("Failed to save detail draft:", error);
      }
    }, 150);
  };

  useEffect(() => {
    detailDraftHydratedRef.current = false;
    setDetailDraftReady(false);

    if (!detailDraftStorageKey || typeof window === "undefined") {
      return;
    }

    try {
      const storedDraft = window.localStorage.getItem(detailDraftStorageKey);
      if (!storedDraft) {
        detailDraftHydratedRef.current = true;
        setDetailDraftReady(true);
        setDetailDraftStatus("idle");
        return;
      }

      const parsedDraft = JSON.parse(storedDraft);
      if (!parsedDraft || typeof parsedDraft !== "object") {
        detailDraftHydratedRef.current = true;
        setDetailDraftReady(true);
        setDetailDraftStatus("idle");
        return;
      }

      if (parsedDraft.detailForm && typeof parsedDraft.detailForm === "object") {
        const restoredGeneratedSessionId = buildGeneratedSessionId(
          parsedDraft.detailForm.date,
          parsedDraft.detailForm.time,
          parsedDraft.detailForm.driver_id,
          parsedDraft.detailForm.session_number,
        );
        const restoredSessionId = String(parsedDraft.detailForm.session_id || "").trim();
        setSessionIdMode((prev) => ({
          ...prev,
          detail:
            restoredSessionId &&
            restoredSessionId !== restoredGeneratedSessionId
              ? "manual"
              : "auto",
        }));

        setDetailForm((prev) => ({
          ...prev,
          ...parsedDraft.detailForm,
          pressures: {
            ...prev.pressures,
            ...parsedDraft.detailForm.pressures,
            cold: {
              ...prev.pressures.cold,
              ...parsedDraft.detailForm.pressures?.cold,
            },
            hot: {
              ...prev.pressures.hot,
              ...parsedDraft.detailForm.pressures?.hot,
            },
          },
          suspension: {
            ...prev.suspension,
            ...parsedDraft.detailForm.suspension,
          },
          alignment: {
            ...prev.alignment,
            ...parsedDraft.detailForm.alignment,
          },
          tire_temperatures: {
            ...prev.tire_temperatures,
            ...parsedDraft.detailForm.tire_temperatures,
          },
          tire_inventory: {
            ...prev.tire_inventory,
            ...parsedDraft.detailForm.tire_inventory,
          },
        }));
      }

      if (typeof parsedDraft.trackSelection === "string") {
        setTrackSelection(parsedDraft.trackSelection);
      } else if (parsedDraft.detailForm?.track) {
        setTrackSelection(
          parsedDraft.detailForm.track === event?.track
            ? parsedDraft.detailForm.track
            : "__OTHER__",
        );
      }
      if (typeof parsedDraft.pressureTypeDetail === "string") {
        setPressureTypeDetail(parsedDraft.pressureTypeDetail);
      }
      if (typeof parsedDraft.detailAction === "string") {
        setDetailAction(parsedDraft.detailAction);
      }
      if (typeof parsedDraft.detailConfidence === "number") {
        setDetailConfidence(parsedDraft.detailConfidence);
      }

      detailDraftHydratedRef.current = true;
      setDetailDraftReady(true);
      setDetailDraftStatus("restored");
    } catch (error) {
      console.warn("Failed to load detail draft:", error);
      detailDraftHydratedRef.current = true;
      setDetailDraftReady(true);
      setDetailDraftStatus("idle");
    }
  }, [detailDraftStorageKey, event?.track]);

  useEffect(() => {
    if (
      !detailDraftStorageKey ||
      typeof window === "undefined" ||
      currentUserStorageKey === "anonymous"
    ) {
      return;
    }

    const anonymousDraftKey = `sm2:submission-draft:${eventId}:anonymous`;

    try {
      const currentDraft = window.localStorage.getItem(detailDraftStorageKey);
      if (currentDraft) {
        return;
      }

      const anonymousDraft = window.localStorage.getItem(anonymousDraftKey);
      if (!anonymousDraft) {
        return;
      }

      window.localStorage.setItem(detailDraftStorageKey, anonymousDraft);
      detailDraftHydratedRef.current = true;
      setDetailDraftReady(true);
      setDetailDraftStatus("restored");
    } catch (error) {
      console.warn("Failed to migrate anonymous detail draft:", error);
    }
  }, [currentUserStorageKey, detailDraftStorageKey, eventId]);

  useEffect(() => {
    if (detailDraftSaveTimeoutRef.current) {
      window.clearTimeout(detailDraftSaveTimeoutRef.current);
      detailDraftSaveTimeoutRef.current = null;
    }

    if (
      activeTab !== "detail" ||
      !detailDraftStorageKey ||
      typeof window === "undefined" ||
      !detailDraftHydratedRef.current ||
      !detailDraftReady
    ) {
      return undefined;
    }

    setDetailDraftStatus("saving");
    detailDraftSaveTimeoutRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          detailDraftStorageKey,
          JSON.stringify({
            detailForm,
            trackSelection,
            pressureTypeDetail,
            detailAction,
            detailConfidence,
            savedAt: new Date().toISOString(),
          }),
        );
        setDetailDraftStatus("saved");
      } catch (error) {
        console.warn("Failed to save detail draft:", error);
      }
    }, 800);

    return () => {
      if (detailDraftSaveTimeoutRef.current) {
        window.clearTimeout(detailDraftSaveTimeoutRef.current);
        detailDraftSaveTimeoutRef.current = null;
      }
    };
  }, [
    activeTab,
    detailAction,
    detailConfidence,
    detailDraftStorageKey,
    detailDraftReady,
    detailForm,
    pressureTypeDetail,
    trackSelection,
  ]);

  useEffect(() => {
    let isActive = true;

    const loadTrackCatalog = async () => {
      try {
        const response = await getTrackCatalog();

        if (!isActive) return;

        setTrackCatalog(response.tracks || []);
      } catch (error) {
        console.warn("Falling back to the current event track only:", error);
        if (!isActive) return;

        setTrackCatalog([]);
      }
    };

    loadTrackCatalog();

    return () => {
      isActive = false;
    };
  }, []);

  const submissionState = useMemo(() => getEventSubmissionState(event), [event]);
  const canSubmitNotes = submissionState.isOpen;
  const submissionUnavailableMessage = submissionState.isUpcoming
    ? "Submission notes will open when the event start date arrives."
    : submissionState.hasEnded
      ? "Submission notes close after the event end date."
      : submissionState.isArchived
        ? "Submission notes are unavailable for archived events."
        : "Submission notes are unavailable until the event schedule is ready.";
  const submitButtonLabel = canSubmitNotes
    ? "Submit Notes"
    : submissionState.isUpcoming
      ? "Opens At Event Start"
      : submissionState.hasEnded
        ? "Event Closed"
        : "Notes Unavailable";

  const toNumberOrUndefined = (value) =>
    value === "" || value === null || value === undefined
      ? undefined
      : Number(value);

  const updateQuickForm = (key, value) => {
    setQuickForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateDetailForm = (key, value) => {
    setDetailForm((prev) => {
      const next = { ...prev, [key]: value };
      persistDetailDraftSnapshot(next);
      return next;
    });
  };

  const updatePressure = (setFn, type, corner, value) => {
    setFn((prev) => {
      const next = {
        ...prev,
        pressures: {
          ...prev.pressures,
          [type]: {
            ...prev.pressures[type],
            [corner]: value,
          },
        },
      };

      if (!isQuickTab) {
        persistDetailDraftSnapshot(next);
      }

      return next;
    });
  };

  const updateNested = (setFn, path, value) => {
    // path as array e.g. ['suspension', 'rebound_fl']
    setFn((prev) => {
      const updated = { ...prev };
      let cursor = updated;
      for (let i = 0; i < path.length - 1; i++) {
        cursor[path[i]] = { ...cursor[path[i]] };
        cursor = cursor[path[i]];
      }
      cursor[path[path.length - 1]] = value;
      if (!isQuickTab) {
        persistDetailDraftSnapshot(updated);
      }
      return updated;
    });
  };

  const handleImageChange = (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) {
      setter(null);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const buildData = (formState) => ({
    date: formState.date || undefined,
    time: formState.time || undefined,
    session_id: formState.session_id || undefined,
    track: formState.track || undefined,
    driver_id: formState.driver_id || undefined,
    vehicle_id: formState.vehicle_id || undefined,
    session_type: formState.session_type || undefined,
    session_number: toNumberOrUndefined(formState.session_number),
    duration_min: toNumberOrUndefined(formState.duration_min),
    tire_set: formState.tire_set || undefined,
    wheelbase_mm: toNumberOrUndefined(formState.wheelbase_mm),
    pressures: {
      unit: formState.pressures?.unit || "psi",
      cold: {
        fl: toNumberOrUndefined(formState.pressures?.cold?.fl),
        fr: toNumberOrUndefined(formState.pressures?.cold?.fr),
        rl: toNumberOrUndefined(formState.pressures?.cold?.rl),
        rr: toNumberOrUndefined(formState.pressures?.cold?.rr),
      },
      hot: {
        fl: toNumberOrUndefined(formState.pressures?.hot?.fl),
        fr: toNumberOrUndefined(formState.pressures?.hot?.fr),
        rl: toNumberOrUndefined(formState.pressures?.hot?.rl),
        rr: toNumberOrUndefined(formState.pressures?.hot?.rr),
      },
    },
  });

  const buildDetailExtensions = (formState) => ({
    suspension: {
      rebound_fl: toNumberOrUndefined(formState.suspension.rebound_fl),
      rebound_fr: toNumberOrUndefined(formState.suspension.rebound_fr),
      rebound_rl: toNumberOrUndefined(formState.suspension.rebound_rl),
      rebound_rr: toNumberOrUndefined(formState.suspension.rebound_rr),
      bump_fl: toNumberOrUndefined(formState.suspension.bump_fl),
      bump_fr: toNumberOrUndefined(formState.suspension.bump_fr),
      bump_rl: toNumberOrUndefined(formState.suspension.bump_rl),
      bump_rr: toNumberOrUndefined(formState.suspension.bump_rr),
      sway_bar_f: toNumberOrUndefined(formState.suspension.sway_bar_f),
      sway_bar_r: toNumberOrUndefined(formState.suspension.sway_bar_r),
      wing_angle_deg: toNumberOrUndefined(formState.suspension.wing_angle_deg),
    },
    alignment: {
      camber_fl: toNumberOrUndefined(formState.alignment.camber_fl),
      camber_fr: toNumberOrUndefined(formState.alignment.camber_fr),
      camber_rl: toNumberOrUndefined(formState.alignment.camber_rl),
      camber_rr: toNumberOrUndefined(formState.alignment.camber_rr),
      toe_front: toNumberOrUndefined(formState.alignment.toe_front),
      toe_rear: toNumberOrUndefined(formState.alignment.toe_rear),
      caster_l: toNumberOrUndefined(formState.alignment.caster_l),
      caster_r: toNumberOrUndefined(formState.alignment.caster_r),
      ride_height_f: toNumberOrUndefined(formState.alignment.ride_height_f),
      ride_height_r: toNumberOrUndefined(formState.alignment.ride_height_r),
      corner_weight_fl: toNumberOrUndefined(
        formState.alignment.corner_weight_fl,
      ),
      corner_weight_fr: toNumberOrUndefined(
        formState.alignment.corner_weight_fr,
      ),
      corner_weight_rl: toNumberOrUndefined(
        formState.alignment.corner_weight_rl,
      ),
      corner_weight_rr: toNumberOrUndefined(
        formState.alignment.corner_weight_rr,
      ),
      cross_weight_pct: toNumberOrUndefined(
        formState.alignment.cross_weight_pct,
      ),
      rake_mm: toNumberOrUndefined(formState.alignment.rake_mm),
    },
    tire_temperatures: {
      fl_in: toNumberOrUndefined(formState.tire_temperatures.fl_in),
      fl_mid: toNumberOrUndefined(formState.tire_temperatures.fl_mid),
      fl_out: toNumberOrUndefined(formState.tire_temperatures.fl_out),
      fr_in: toNumberOrUndefined(formState.tire_temperatures.fr_in),
      fr_mid: toNumberOrUndefined(formState.tire_temperatures.fr_mid),
      fr_out: toNumberOrUndefined(formState.tire_temperatures.fr_out),
      rl_in: toNumberOrUndefined(formState.tire_temperatures.rl_in),
      rl_mid: toNumberOrUndefined(formState.tire_temperatures.rl_mid),
      rl_out: toNumberOrUndefined(formState.tire_temperatures.rl_out),
      rr_in: toNumberOrUndefined(formState.tire_temperatures.rr_in),
      rr_mid: toNumberOrUndefined(formState.tire_temperatures.rr_mid),
      rr_out: toNumberOrUndefined(formState.tire_temperatures.rr_out),
    },
    tire_inventory: {
      tire_id: formState.tire_inventory.tire_id || undefined,
      manufacturer: formState.tire_inventory.manufacturer || undefined,
      model: formState.tire_inventory.model || undefined,
      size: formState.tire_inventory.size || undefined,
      purchase_date: formState.tire_inventory.purchase_date || undefined,
      heat_cycles: toNumberOrUndefined(formState.tire_inventory.heat_cycles),
      track_time_min: toNumberOrUndefined(
        formState.tire_inventory.track_time_min,
      ),
      status: formState.tire_inventory.status || undefined,
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canSubmitNotes) {
      setSubmissionStatus("failed");
      setError(submissionUnavailableMessage);
      return;
    }

    const isQuick = activeTab === "quick";
    const tabKey = isQuick ? "quick" : "detail";
    const formState = isQuick ? quickForm : detailForm;
    const rawTextValue = isQuick ? quickRawText : null;
    const imageValue = isQuick ? quickImage : null;
    const actionValue = isQuick ? quickAction : detailAction;
    const confidenceValue = isQuick ? quickConfidence : detailConfidence;
    const pressureType = isQuick ? pressureTypeQuick : pressureTypeDetail;
    const voiceInputUsed = isQuick ? quickVoiceInputUsed : undefined;
    const submissionErrors = validateSubmissionFields({
      formState,
      trackValue,
      driverOptions,
      vehicleOptions: vehicleOptionsForDriver,
    });

    if (Object.keys(submissionErrors).length > 0) {
      markCurrentTabRequiredFieldsTouched();
      setValidationAttempted((prev) => ({
        ...prev,
        [tabKey]: true,
      }));
      setSubmissionStatus("failed");
      setError("Please fix the highlighted fields before submitting.");
      return;
    }

    setIsSubmitting(true);
    setSubmissionStatus("pending");
    setError("");

    try {
      const submissionId = String(formState.session_id || "").trim() || generateUUID();
      const correlationId = generateUUID();
      const eventIdToSend = event?._id || event?.id || eventId;

      // Ensure track comes from dropdown unless "Other"
      const normalizedFormState = {
        ...formState,
        session_id: submissionId,
        track: trackValue,
      };

      const data = buildData(normalizedFormState);
      if (!isQuick) {
        Object.assign(data, buildDetailExtensions(normalizedFormState));
      }

      const payload = {
        submissionId,
        session_id: submissionId,
        correlation_id: correlationId,
        eventId: eventIdToSend,
        runGroup: eventRunGroup || undefined,
        action: actionValue,
        confidence: Number(confidenceValue),
        data,
        analysis_result: {
          action: actionValue,
          confidence: Number(confidenceValue),
          run_group: eventRunGroup || undefined,
          submission_mode: isQuick ? "quick" : "detail",
          ...(isQuick && voiceInputUsed !== undefined
            ? { voice_input_used: voiceInputUsed }
            : {}),
        },
        ...(isQuick
          ? {
              raw_text: rawTextValue ?? undefined,
              image_url: imageValue || undefined,
            }
          : {}),
      };

      const response = await createSubmission(payload);

      if (response.success) {
        clearDetailDraft();
        setSubmissionStatus("sent");
        setQuickRawText("");
        setDetailRawText("");
        setQuickAction("ADD_SEANCE");
        setDetailAction("ADD_SEANCE");
        setQuickConfidence(0.85);
        setDetailConfidence(0.85);
        setPressureTypeQuick("cold");
        setPressureTypeDetail("cold");
        setQuickImage(null);
        setDetailImage(null);
        setQuickVoiceInputUsed(false);
        setQuickForm(createBaseFormState());
        setDetailForm(createDetailFormState());
        setSessionIdMode({
          quick: "auto",
          detail: "auto",
        });
        setError("");
        setFieldTouched({ quick: {}, detail: {} });
        setValidationAttempted({ quick: false, detail: false });

        setTimeout(() => {
          router.push(`/event/${eventId}/submissions`);
        }, 2000);
      } else {
        setSubmissionStatus("failed");
        setError(
          response?.submission?.errorMessage ||
          response.message ||
            "Failed to submit notes. Please try again.",
        );
      }
    } catch (error) {
      console.error("Submission error:", error);
      setSubmissionStatus("failed");
      const structuredError = error?.code
        ? `${error.code}: ${error?.message || error?.error || "Submission failed."}`
        : null;
      const errorMessage =
        structuredError ||
        error?.message ||
        error?.error ||
        "Failed to submit notes. Please try again.";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isQuickTab = activeTab === "quick";
  const formState = isQuickTab ? quickForm : detailForm;
  const setFormFn = isQuickTab ? setQuickForm : setDetailForm;
  const updateFormFn = isQuickTab ? updateQuickForm : updateDetailForm;
  const pressureType = isQuickTab ? pressureTypeQuick : pressureTypeDetail;
  const setPressureTypeFn = isQuickTab
    ? setPressureTypeQuick
    : setPressureTypeDetail;
  const rawTextValue = isQuickTab ? quickRawText : detailRawText;
  const setRawTextValue = isQuickTab ? setQuickRawText : setDetailRawText;
  const actionValue = isQuickTab ? quickAction : detailAction;
  const setActionValue = isQuickTab ? setQuickAction : setDetailAction;
  const confidenceValue = isQuickTab ? quickConfidence : detailConfidence;
  const setConfidenceValue = isQuickTab
    ? setQuickConfidence
    : setDetailConfidence;
  const setImageValue = isQuickTab ? setQuickImage : setDetailImage;
  const driverLabelMap = useMemo(
    () =>
      new Map(
        driverOptions
          .filter((driver) => driver?.id)
          .map((driver) => [String(driver.id), driver.label]),
      ),
    [driverOptions],
  );
  const vehicleOptionsForDriver = useMemo(() => {
    if (!formState.driver_id) {
      return vehicleOptions;
    }

    return vehicleOptions.filter(
      (vehicle) => String(vehicle.driverId || "") === String(formState.driver_id),
    );
  }, [formState.driver_id, vehicleOptions]);

  const trackOptionsForSelect = useMemo(() => {
    const seen = new Set();
    const nextOptions = [];

    const addTrack = (trackInput) => {
      const normalizedId = String(
        trackInput?.id || trackInput?.label || trackInput || "",
      ).trim();
      const normalizedLabel = String(
        trackInput?.label || trackInput?.id || trackInput || "",
      ).trim();

      if (!normalizedId) return;

      const lookupKey = normalizedId.toLowerCase();
      if (seen.has(lookupKey)) return;

      seen.add(lookupKey);
      nextOptions.push({ id: normalizedId, label: normalizedLabel });
    };

    TRACK_OPTIONS.forEach((track) => addTrack(track));
    addTrack(event?.track);
    trackCatalog.forEach((track) => addTrack(track));

    return nextOptions;
  }, [event?.track, trackCatalog]);

  const handleDriverChange = (driverId) => {
    markActiveFieldTouched("driver_id");
    updateFormFn("driver_id", driverId);

    if (
      formState.vehicle_id &&
      !vehicleOptions.filter(
        (vehicle) => String(vehicle.driverId || "") === String(driverId),
      ).some(
        (vehicle) => vehicle.id === formState.vehicle_id,
      )
    ) {
      markActiveFieldTouched("vehicle_id");
      updateFormFn("vehicle_id", "");
    }
  };
  const trackValue =
    trackSelection === "__OTHER__"
      ? formState.track
      : trackSelection || formState.track || event?.track || "";
  const activeTabKey = isQuickTab ? "quick" : "detail";
  const generatedQuickSessionId = useMemo(
    () =>
      buildGeneratedSessionId(
        quickForm.date,
        quickForm.time,
        quickForm.driver_id,
        quickForm.session_number,
      ),
    [quickForm.date, quickForm.time, quickForm.driver_id, quickForm.session_number],
  );
  const generatedDetailSessionId = useMemo(
    () =>
      buildGeneratedSessionId(
        detailForm.date,
        detailForm.time,
        detailForm.driver_id,
        detailForm.session_number,
      ),
    [detailForm.date, detailForm.time, detailForm.driver_id, detailForm.session_number],
  );
  const generatedSessionId = isQuickTab
    ? generatedQuickSessionId
    : generatedDetailSessionId;
  const activeFieldTouched = fieldTouched[activeTabKey] || {};
  const activeValidationAttempted = validationAttempted[activeTabKey] || false;
  const validationErrors = useMemo(
    () =>
      validateSubmissionFields({
        formState,
        trackValue,
        driverOptions,
        vehicleOptions: vehicleOptionsForDriver,
      }),
    [driverOptions, formState, trackValue, vehicleOptionsForDriver],
  );
  const shouldShowFieldError = (field) =>
    activeValidationAttempted || Boolean(activeFieldTouched[field]);
  const getFieldError = (field) =>
    shouldShowFieldError(field) ? validationErrors[field] || "" : "";
  const getFieldClassName = (baseClassName, field) =>
    `${baseClassName} ${getFieldError(field) ? "input-error" : ""}`.trim();
  const renderFieldError = (field) =>
    getFieldError(field) ? (
      <p className="field-error" role="alert">
        {getFieldError(field)}
      </p>
    ) : null;

  useEffect(() => {
    if (sessionIdMode.quick !== "auto") {
      return;
    }

    setQuickForm((prev) => {
      if (prev.session_id === generatedQuickSessionId) {
        return prev;
      }

      return {
        ...prev,
        session_id: generatedQuickSessionId,
      };
    });
  }, [generatedQuickSessionId, sessionIdMode.quick]);

  useEffect(() => {
    if (sessionIdMode.detail !== "auto") {
      return;
    }

    setDetailForm((prev) => {
      if (prev.session_id === generatedDetailSessionId) {
        return prev;
      }

      return {
        ...prev,
        session_id: generatedDetailSessionId,
      };
    });
  }, [generatedDetailSessionId, sessionIdMode.detail]);

  const markActiveFieldTouched = (field) => {
    setFieldTouched((prev) => ({
      ...prev,
      [activeTabKey]: {
        ...(prev[activeTabKey] || {}),
        [field]: true,
      },
    }));
  };
  const updateRequiredField = (field, value) => {
    markActiveFieldTouched(field);
    updateFormFn(field, value);
  };
  const markCurrentTabRequiredFieldsTouched = () => {
    setFieldTouched((prev) => ({
      ...prev,
      [activeTabKey]: {
        ...(prev[activeTabKey] || {}),
        date: true,
        time: true,
        track: true,
        session_id: true,
        session_type: true,
        driver_id: true,
        vehicle_id: true,
      },
    }));
  };

  if (!event) {
    return (
      <ProtectedRoute requireMechanic={true}>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Loading event...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireMechanic={true}>
      <div className="notes-submission-page">
        <div className="page-header">
          <div className="header-content">
            <ScreenBackButton fallbackHref={`/event/${eventId}`} label="Back" />
            <h1 className="page-title">Submit Notes</h1>
          </div>
        </div>

        <div className="container">
          <div className="event-info">
            <h2 className="event-name">{event.name}</h2>
            {/*<p className="event-track">{event.track}</p>*/}
          </div>

          <div className="tab-toggle">
            <button
              type="button"
              data-testid="submission-tab-quick"
              className={`tab-button ${isQuickTab ? "active" : ""}`}
              onClick={() => setActiveTab("quick")}
            >
              Quick Submission
            </button>
            <button
              type="button"
              data-testid="submission-tab-detail"
              className={`tab-button ${!isQuickTab ? "active" : ""}`}
              onClick={() => setActiveTab("detail")}
            >
              Detail Submission
            </button>
          </div>

          {!isQuickTab && detailDraftStorageKey ? (
            <p
              style={{
                marginTop: "0.75rem",
                color:
                  detailDraftStatus === "saving"
                    ? "#f0b429"
                    : detailDraftStatus === "saved" || detailDraftStatus === "restored"
                      ? "#7ddc95"
                      : "#9aa4b2",
                fontSize: "0.85rem",
              }}
            >
              {detailDraftStatus === "saving"
                ? "Saving draft locally..."
                : detailDraftStatus === "saved"
                  ? "Draft saved locally on this device."
                  : detailDraftStatus === "restored"
                    ? "Draft restored from this device."
                    : "Draft autosave is enabled for the detailed form."}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="notes-form">
            <div className="form-group">
              <label className="form-label">Session Information</label>
              <div className="grid-2">
                <div>
                  <label className="form-label sub-label">Date</label>
                  <input
                    data-testid="submission-date"
                    className={getFieldClassName("input", "date")}
                    type="date"
                    value={formState.date}
                    onChange={(e) => updateRequiredField("date", e.target.value)}
                    onBlur={() => markActiveFieldTouched("date")}
                    title="Use YYYY-MM-DD."
                    aria-invalid={Boolean(getFieldError("date"))}
                  />
                  {renderFieldError("date")}
                </div>
                <div>
                  <label className="form-label sub-label">Time</label>
                  <input
                    data-testid="submission-time"
                    className={getFieldClassName("input", "time")}
                    type="time"
                    step="60"
                    value={formState.time}
                    onChange={(e) => updateRequiredField("time", e.target.value)}
                    onBlur={() => markActiveFieldTouched("time")}
                    title="Use 24-hour HH:MM."
                    aria-invalid={Boolean(getFieldError("time"))}
                  />
                  {renderFieldError("time")}
                </div>
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <label className="form-label sub-label">Session ID</label>
                <input
                  data-testid="submission-session-id"
                  className={getFieldClassName("input", "session_id")}
                  type="text"
                  value={formState.session_id}
                  onChange={(e) => {
                    setSessionIdMode((prev) => ({
                      ...prev,
                      [activeTabKey]: "manual",
                    }));
                    updateRequiredField("session_id", e.target.value.toUpperCase());
                  }}
                  onBlur={() => markActiveFieldTouched("session_id")}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="YYYYMMDD-HHMM-DRIVERID-S1"
                  title="Format: YYYYMMDD-HHMM-DRIVERID-S1"
                  spellCheck={false}
                  aria-invalid={Boolean(getFieldError("session_id"))}
                />
                <p className="field-hint">
                  Auto-generated from date, time, driver, and session number. You can still edit it.
                </p>
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSessionIdMode((prev) => ({
                        ...prev,
                        [activeTabKey]: "auto",
                      }));
                      updateRequiredField("session_id", generatedSessionId);
                    }}
                  >
                    Use Generated ID
                  </button>
                </div>
                {renderFieldError("session_id")}
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <label className="form-label sub-label">Track</label>
                <select
                  data-testid="submission-track-select"
                  className={getFieldClassName("select", "track")}
                  value={trackSelection || (event?.track ? event.track : "")}
                  onChange={(e) => {
                    setTrackSelection(e.target.value);
                    if (e.target.value !== "__OTHER__") {
                      updateRequiredField("track", e.target.value);
                    } else {
                      // keep existing manual value
                      updateRequiredField("track", formState.track || "");
                    }
                  }}
                  onBlur={() => markActiveFieldTouched("track")}
                  title="Choose the event track or select Other to type a custom value."
                  aria-invalid={Boolean(getFieldError("track"))}
                >
                  <option value="">Select Track</option>
                  {trackOptionsForSelect.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>
                {trackSelection === "__OTHER__" && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <input
                      data-testid="submission-track-manual"
                      className={getFieldClassName("input", "track")}
                      type="text"
                      placeholder="Type track name"
                      value={formState.track}
                      onChange={(e) => updateRequiredField("track", e.target.value)}
                      onBlur={() => markActiveFieldTouched("track")}
                      title="Type the exact track name."
                      aria-invalid={Boolean(getFieldError("track"))}
                    />
                  </div>
                )}
                {renderFieldError("track")}
              </div>

              <div style={{ marginTop: "0.75rem" }}>
                <label className="form-label sub-label">Run Group</label>
                <input
                  className="input"
                  type="text"
                  value={eventRunGroup || ""}
                  readOnly
                  placeholder="Not assigned yet"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Driver</label>
              <select
                data-testid="submission-driver-select"
                className={getFieldClassName("select", "driver_id")}
                value={formState.driver_id}
                onChange={(e) => handleDriverChange(e.target.value)}
                onBlur={() => markActiveFieldTouched("driver_id")}
                title="Pick the driver assigned to this session."
                aria-invalid={Boolean(getFieldError("driver_id"))}
              >
                <option value="">Select Driver</option>
                {driverOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              {renderFieldError("driver_id")}
            </div>

            <div className="form-group">
              <label className="form-label">Vehicle</label>
              <select
                data-testid="submission-vehicle-select"
                className={getFieldClassName("select", "vehicle_id")}
                value={formState.vehicle_id}
                onChange={(e) => updateRequiredField("vehicle_id", e.target.value)}
                onBlur={() => markActiveFieldTouched("vehicle_id")}
                title="Pick the vehicle used for this session."
                aria-invalid={Boolean(getFieldError("vehicle_id"))}
              >
                <option value="">
                  {formState.driver_id
                    ? "Select Assigned Vehicle"
                    : "Select Vehicle"}
                </option>
                {vehicleOptionsForDriver.length ? (
                  vehicleOptionsForDriver.map((v) => {
                    const assignedDriverLabel = v.driverId
                      ? driverLabelMap.get(String(v.driverId)) || v.driverId
                      : "";
                    const optionLabel =
                      formState.driver_id || !assignedDriverLabel
                        ? v.label
                        : `${v.label} · ${assignedDriverLabel}`;

                    return (
                      <option key={v.id} value={v.id}>
                        {optionLabel}
                      </option>
                    );
                  })
                ) : (
                  <option value="" disabled>
                    No vehicles assigned to this driver
                  </option>
                )}
              </select>
              {renderFieldError("vehicle_id")}
            </div>

            <div className="form-group">
              <label className="form-label">Session Details</label>
              <div className="grid-2">
                <div>
                  <label className="form-label sub-label">Session Type</label>
                  <select
                    data-testid="submission-session-type"
                    className={getFieldClassName("select", "session_type")}
                    value={formState.session_type}
                    onChange={(e) => updateRequiredField("session_type", e.target.value)}
                    onBlur={() => markActiveFieldTouched("session_type")}
                    title="Choose the session classification."
                    aria-invalid={Boolean(getFieldError("session_type"))}
                  >
                    <option value="">Select session type</option>
                    {SESSION_TYPE_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {renderFieldError("session_type")}
                </div>
                <div>
                  <label className="form-label sub-label">Session #</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={formState.session_number}
                    onChange={(e) =>
                      updateFormFn("session_number", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div>
                  <label className="form-label sub-label">
                    Duration (Minutes)
                  </label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={formState.duration_min}
                    onChange={(e) =>
                      updateFormFn("duration_min", e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="form-label sub-label">Wheelbase (mm)</label>
                  <input
                    data-testid="submission-wheelbase"
                    className={getFieldClassName("input", "wheelbase_mm")}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="2450"
                    value={formState.wheelbase_mm}
                    onChange={(e) =>
                      updateFormFn("wheelbase_mm", e.target.value)
                    }
                    onBlur={() => markActiveFieldTouched("wheelbase_mm")}
                    aria-invalid={Boolean(getFieldError("wheelbase_mm"))}
                  />
                  <p className="field-hint">
                    Optional. Leave blank if the wheelbase is unknown.
                  </p>
                  {renderFieldError("wheelbase_mm")}
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div>
                  <label className="form-label sub-label">Tire Set</label>
                  <input
                    data-testid="detail-tire-set"
                    className="input"
                    type="text"
                    placeholder="Y-S3"
                    value={formState.tire_set}
                    onChange={(e) => updateFormFn("tire_set", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label sub-label">Pressure Unit</label>
                  <select
                    className="select"
                    value={formState.pressures.unit}
                    onChange={(e) =>
                      setFormFn((prev) => {
                        const next = {
                          ...prev,
                          pressures: { ...prev.pressures, unit: e.target.value },
                        };
                        if (!isQuickTab) {
                          persistDetailDraftSnapshot(next);
                        }
                        return next;
                      })
                    }
                  >
                    {PRESSURE_UNIT_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Pressures</label>
                <select
                  className="select select-small"
                  value={pressureType}
                  onChange={(e) => setPressureTypeFn(e.target.value)}
                >
                  <option value="cold">Cold</option>
                  <option value="hot">Hot</option>
                </select>
              </div>
              <div className="grid-2">
                <div>
                  <label className="form-label sub-label">FL</label>
                  <input
                    data-testid="detail-pressure-fl"
                    className="input"
                    type="number"
                    step="0.1"
                    value={formState.pressures[pressureType].fl}
                    onChange={(e) =>
                      updatePressure(
                        isQuickTab ? setQuickForm : setDetailForm,
                        pressureType,
                        "fl",
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="form-label sub-label">FR</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={formState.pressures[pressureType].fr}
                    onChange={(e) =>
                      updatePressure(
                        isQuickTab ? setQuickForm : setDetailForm,
                        pressureType,
                        "fr",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div>
                  <label className="form-label sub-label">RL</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={formState.pressures[pressureType].rl}
                    onChange={(e) =>
                      updatePressure(
                        isQuickTab ? setQuickForm : setDetailForm,
                        pressureType,
                        "rl",
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="form-label sub-label">RR</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={formState.pressures[pressureType].rr}
                    onChange={(e) =>
                      updatePressure(
                        isQuickTab ? setQuickForm : setDetailForm,
                        pressureType,
                        "rr",
                        e.target.value,
                      )
                    }
                    />
                  </div>
                </div>
              </div>

            {!isQuickTab && (
              <>
                <div className="form-group">
                  <label className="form-label">Suspension</label>
                  <div className="grid-2">
                    <div>
                      <label className="form-label sub-label">Rebound FL</label>
                      <input
                        data-testid="detail-suspension-rebound-fl"
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.rebound_fl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "rebound_fl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Rebound FR</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.rebound_fr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "rebound_fr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Rebound RL</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.rebound_rl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "rebound_rl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Rebound RR</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.rebound_rr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "rebound_rr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Bump FL</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.bump_fl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "bump_fl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Bump FR</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.bump_fr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "bump_fr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Bump RL</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.bump_rl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "bump_rl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Bump RR</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.bump_rr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "bump_rr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Sway Bar F</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.sway_bar_f}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "sway_bar_f"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Sway Bar R</label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        min="0"
                        value={detailForm.suspension.sway_bar_r}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["suspension", "sway_bar_r"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: "0.75rem" }}>
                    <label className="form-label sub-label">
                      Wing Angle (deg)
                    </label>
                    <input
                      className="input"
                      type="number"
                      step="0.1"
                      value={detailForm.suspension.wing_angle_deg}
                      onChange={(e) =>
                        updateNested(
                          setDetailForm,
                          ["suspension", "wing_angle_deg"],
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Alignment</label>
                  <div className="grid-2">
                    <div>
                      <label className="form-label sub-label">Camber FL</label>
                      <input
                        data-testid="detail-alignment-camber-fl"
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.camber_fl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "camber_fl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Camber FR</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.camber_fr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "camber_fr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Camber RL</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.camber_rl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "camber_rl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Camber RR</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.camber_rr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "camber_rr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Toe Front</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.toe_front}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "toe_front"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Toe Rear</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.toe_rear}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "toe_rear"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Caster L</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.caster_l}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "caster_l"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Caster R</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.caster_r}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "caster_r"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Ride Height F (mm)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.ride_height_f}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "ride_height_f"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        Ride Height R (mm)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.ride_height_r}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "ride_height_r"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Corner Weight FL (lbs)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.corner_weight_fl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "corner_weight_fl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        Corner Weight FR (lbs)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.corner_weight_fr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "corner_weight_fr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Corner Weight RL (lbs)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.corner_weight_rl}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "corner_weight_rl"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        Corner Weight RR (lbs)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.corner_weight_rr}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "corner_weight_rr"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Cross Weight (%)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.cross_weight_pct}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "cross_weight_pct"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Rake (mm)</label>
                      <input
                        className="input"
                        type="number"
                        step="0.1"
                        value={detailForm.alignment.rake_mm}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["alignment", "rake_mm"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Tire Temperatures</label>
                  <div className="grid-2">
                    <div>
                      <label className="form-label sub-label">
                        FL (In/Mid/Out)
                      </label>
                      <div
                        className="grid-2"
                        style={{
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "0.4rem",
                        }}
                      >
                        <input
                          data-testid="detail-temp-fl-in"
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fl_in}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fl_in"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fl_mid}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fl_mid"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fl_out}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fl_out"],
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        FR (In/Mid/Out)
                      </label>
                      <div
                        className="grid-2"
                        style={{
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "0.4rem",
                        }}
                      >
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fr_in}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fr_in"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fr_mid}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fr_mid"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.fr_out}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "fr_out"],
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        RL (In/Mid/Out)
                      </label>
                      <div
                        className="grid-2"
                        style={{
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "0.4rem",
                        }}
                      >
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rl_in}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rl_in"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rl_mid}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rl_mid"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rl_out}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rl_out"],
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        RR (In/Mid/Out)
                      </label>
                      <div
                        className="grid-2"
                        style={{
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "0.4rem",
                        }}
                      >
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rr_in}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rr_in"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rr_mid}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rr_mid"],
                              e.target.value,
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          step="0.1"
                          value={detailForm.tire_temperatures.rr_out}
                          onChange={(e) =>
                            updateNested(
                              setDetailForm,
                              ["tire_temperatures", "rr_out"],
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Tire Inventory</label>
                  <div className="grid-2">
                    <div>
                      <label className="form-label sub-label">Tire ID</label>
                      <input
                        className="input"
                        type="text"
                        value={detailForm.tire_inventory.tire_id}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "tire_id"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        Manufacturer
                      </label>
                      <input
                        className="input"
                        type="text"
                        value={detailForm.tire_inventory.manufacturer}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "manufacturer"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">Model</label>
                      <input
                        className="input"
                        type="text"
                        value={detailForm.tire_inventory.model}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "model"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Size</label>
                      <input
                        className="input"
                        type="text"
                        value={detailForm.tire_inventory.size}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "size"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Purchase Date
                      </label>
                      <input
                        className="input"
                        type="date"
                        value={detailForm.tire_inventory.purchase_date}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "purchase_date"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">
                        Heat Cycles
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        value={detailForm.tire_inventory.heat_cycles}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "heat_cycles"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                    <div>
                      <label className="form-label sub-label">
                        Track Time (min)
                      </label>
                      <input
                        className="input"
                        type="number"
                        step="1"
                        value={detailForm.tire_inventory.track_time_min}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "track_time_min"],
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="form-label sub-label">Status</label>
                      <select
                        data-testid="detail-tire-status"
                        className="select"
                        value={detailForm.tire_inventory.status}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "status"],
                            e.target.value,
                          )
                        }
                      >
                        {TIRE_INVENTORY_STATUS_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {isQuickTab && (
              <div className="form-group">
                <div className="raw-notes-header">
                  <label className="form-label">Race Notes (Raw Text)</label>
                </div>
                <textarea
                  data-testid="quick-raw-notes"
                  className="textarea raw-notes-textarea"
                  placeholder='e.g. "s1 30min nico gt4 Y-S3 pf 27 wb 2450"'
                  value={rawTextValue}
                  onChange={(e) => setRawTextValue(e.target.value)}
                  rows={4}
                  ref={quickRawTextRef}
                />

                <div style={{ marginTop: "0.5rem" }}>
                  <label className="form-label sub-label">Photo</label>
                  <input
                    data-testid="quick-photo-input"
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange(e, setImageValue)}
                  />
                </div>
              </div>
            )}

            <div className="submission-status">
              {!canSubmitNotes && (
                <div className="status-message status-pending">
                  {submissionUnavailableMessage}
                </div>
              )}
              {submissionStatus === "sent" && (
                <div className="status-message status-success">
                  ✓ Notes submitted successfully! Redirecting...
                </div>
              )}
              {submissionStatus === "pending" && isSubmitting && (
                <div className="status-message status-pending">
                  ⏳ Submitting notes...
                </div>
              )}
              {(submissionStatus === "failed" || error) && (
                <div className="status-message status-failed">
                  ✗ {error || "Submission failed. Please try again."}
                </div>
              )}
            </div>

            <div className={`form-actions ${isQuickTab ? "form-actions-with-voice" : ""}`}>
              {isQuickTab && (
                <div data-testid="quick-voice-control">
                  <VoiceInputControl
                    className="voice-input-bottom"
                    textareaRef={quickRawTextRef}
                    onValueChange={setRawTextValue}
                    onTranscriptInserted={() => setQuickVoiceInputUsed(true)}
                    disabled={isSubmitting || !canSubmitNotes}
                  />
                </div>
              )}

              <div className="form-action-buttons">
                <button
                  type="button"
                  onClick={() => router.push(`/event/${eventId}`)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-large"
                  disabled={isSubmitting || !canSubmitNotes}
                >
                  {isSubmitting ? "Submitting..." : submitButtonLabel}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
