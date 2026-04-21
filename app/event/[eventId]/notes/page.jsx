"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import ProtectedRoute from "../../../components/ProtectedRoute";
import ScreenBackButton from "../../../components/Common/ScreenBackButton";
import VoiceInputControl from "../../../components/Common/VoiceInputControl";
import { generateUUID } from "../../../utils/uuid";
import { getEventById, selectActiveEvent } from "../../../utils/eventApi";
import { createSubmission } from "../../../utils/submissionApi";
import { getRunGroup } from "../../../utils/runGroupApi";
import {
  DRIVER_OPTIONS,
  VEHICLE_OPTIONS,
  SESSION_TYPE_OPTIONS,
  PRESSURE_UNIT_OPTIONS,
  TRACK_OPTIONS,
} from "../../../utils/staticOptions";
import "./NotesSubmission.css";

export default function NotesSubmission() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId;
  const { user, isMechanic } = useAuth();
  const [event, setEvent] = useState(null);
  const [activeTab, setActiveTab] = useState("quick"); // 'quick' | 'detail'
  const [eventRunGroup, setEventRunGroup] = useState("");
  const [trackSelection, setTrackSelection] = useState(""); // dropdown value; '__OTHER__' => manual entry

  const basePressures = {
    unit: "psi",
    cold: { fl: "", fr: "", rl: "", rr: "" },
    hot: { fl: "", fr: "", rl: "", rr: "" },
  };

  const [pressureTypeQuick, setPressureTypeQuick] = useState("cold");
  const [pressureTypeDetail, setPressureTypeDetail] = useState("cold");

  const [quickRawText, setQuickRawText] = useState("");
  const [detailRawText, setDetailRawText] = useState("");
  const [quickAction, setQuickAction] = useState("ADD_SEANCE");
  const [detailAction, setDetailAction] = useState("ADD_SEANCE");
  const [quickConfidence, setQuickConfidence] = useState(0.85);
  const [detailConfidence, setDetailConfidence] = useState(0.85);
  const [quickImage, setQuickImage] = useState(null);
  const [detailImage, setDetailImage] = useState(null);
  const quickRawTextRef = useRef(null);

  const [quickForm, setQuickForm] = useState({
    date: "",
    time: "",
    track: "",
    driver_id: "",
    vehicle_id: "",
    session_type: "Practice",
    session_number: 1,
    duration_min: 30,
    tire_set: "",
    wheelbase_mm: "",
    pressures: basePressures,
  });

  const [detailForm, setDetailForm] = useState({
    date: "",
    time: "",
    track: "",
    driver_id: "",
    vehicle_id: "",
    session_type: "Practice",
    session_number: 1,
    duration_min: 30,
    tire_set: "",
    wheelbase_mm: 0,
    pressures: basePressures,
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
      status: "",
    },
  });
  const [submissionStatus, setSubmissionStatus] = useState("pending"); // sent, pending, failed
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const toNumberOrUndefined = (value) =>
    value === "" || value === null || value === undefined
      ? undefined
      : Number(value);

  const updateQuickForm = (key, value) => {
    setQuickForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateDetailForm = (key, value) => {
    setDetailForm((prev) => ({ ...prev, [key]: value }));
  };

  const updatePressure = (setFn, type, corner, value) => {
    setFn((prev) => ({
      ...prev,
      pressures: {
        ...prev.pressures,
        [type]: {
          ...prev.pressures[type],
          [corner]: value,
        },
      },
    }));
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

  const buildData = (formState, pressureType) => ({
    date: formState.date || undefined,
    time: formState.time || undefined,
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
      [pressureType]: {
        fl: toNumberOrUndefined(formState.pressures?.[pressureType]?.fl),
        fr: toNumberOrUndefined(formState.pressures?.[pressureType]?.fr),
        rl: toNumberOrUndefined(formState.pressures?.[pressureType]?.rl),
        rr: toNumberOrUndefined(formState.pressures?.[pressureType]?.rr),
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
    setIsSubmitting(true);
    setSubmissionStatus("pending");
    setError("");

    const isQuick = activeTab === "quick";
    const formState = isQuick ? quickForm : detailForm;
    const rawTextValue = isQuick ? quickRawText : detailRawText;
    const imageValue = isQuick ? quickImage : detailImage;
    const actionValue = isQuick ? quickAction : detailAction;
    const confidenceValue = isQuick ? quickConfidence : detailConfidence;
    const pressureType = isQuick ? pressureTypeQuick : pressureTypeDetail;

    try {
      const submissionId = generateUUID();
      const eventIdToSend = event?._id || event?.id || eventId;

      // Ensure track comes from dropdown unless "Other"
      const normalizedFormState = { ...formState, track: trackValue };

      const data = buildData(normalizedFormState, pressureType);
      if (!isQuick) {
        Object.assign(data, buildDetailExtensions(normalizedFormState));
      }

      const payload = {
        submissionId,
        eventId: eventIdToSend,
        runGroup: eventRunGroup || undefined,
        action: actionValue,
        confidence: Number(confidenceValue),
        data,
        raw_text: rawTextValue?.trim() || undefined,
        image_url: imageValue || undefined,
      };

      const response = await createSubmission(payload);

      if (response.success) {
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
        setQuickForm({
          runGroup: "YELLOW",
          date: "",
          time: "",
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
        setDetailForm({
          runGroup: "YELLOW",
          date: "",
          time: "",
          track: "",
          driver_id: "",
          vehicle_id: "",
          session_type: "Practice",
          session_number: 1,
          duration_min: 30,
          tire_set: "",
          wheelbase_mm: 0,
          pressures: {
            unit: "psi",
            cold: { fl: "", fr: "", rl: "", rr: "" },
            hot: { fl: "", fr: "", rl: "", rr: "" },
          },
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
            status: "",
          },
        });
        setError("");

        setTimeout(() => {
          router.push(`/event/${eventId}/submissions`);
        }, 2000);
      } else {
        setSubmissionStatus("failed");
        setError(
          response.message ||
            response.submission?.errorMessage ||
            "Failed to submit notes. Please try again.",
        );
      }
    } catch (error) {
      console.error("Submission error:", error);
      setSubmissionStatus("failed");
      const errorMessage =
        error?.message ||
        error?.error ||
        "Failed to submit notes. Please try again.";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
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
  const trackValue =
    trackSelection === "__OTHER__"
      ? formState.track
      : trackSelection || formState.track || event?.track || "";

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
              className={`tab-button ${isQuickTab ? "active" : ""}`}
              onClick={() => setActiveTab("quick")}
            >
              Quick Submission
            </button>
            <button
              type="button"
              className={`tab-button ${!isQuickTab ? "active" : ""}`}
              onClick={() => setActiveTab("detail")}
            >
              Detail Submission
            </button>
          </div>

          <form onSubmit={handleSubmit} className="notes-form">
            <div className="form-group">
              <label className="form-label">Session Information</label>
              <div className="grid-2">
                <div>
                  <label className="form-label sub-label">Date</label>
                  <input
                    className="input"
                    type="date"
                    value={formState.date}
                    onChange={(e) => updateFormFn("date", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label sub-label">Time</label>
                  <input
                    className="input"
                    type="time"
                    value={formState.time}
                    onChange={(e) => updateFormFn("time", e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <label className="form-label sub-label">Track</label>
                <select
                  className="select"
                  value={trackSelection || (event?.track ? event.track : "")}
                  onChange={(e) => {
                    setTrackSelection(e.target.value);
                    if (e.target.value !== "__OTHER__") {
                      updateFormFn("track", e.target.value);
                    } else {
                      // keep existing manual value
                      updateFormFn("track", formState.track || "");
                    }
                  }}
                >
                  {event?.track && (
                    <option value={event.track}>{event.track}</option>
                  )}
                  {TRACK_OPTIONS.filter((t) => t.id !== event?.track).map(
                    (t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ),
                  )}
                </select>
                {trackSelection === "__OTHER__" && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Type track name"
                      value={formState.track}
                      onChange={(e) => updateFormFn("track", e.target.value)}
                    />
                  </div>
                )}
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
                className="select"
                value={formState.driver_id}
                onChange={(e) => updateFormFn("driver_id", e.target.value)}
              >
                <option value="">Select Driver</option>
                {DRIVER_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Vehicle</label>
              <select
                className="select"
                value={formState.vehicle_id}
                onChange={(e) => updateFormFn("vehicle_id", e.target.value)}
              >
                <option value="">Select Vehicle</option>
                {VEHICLE_OPTIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Session Details</label>
              <div className="grid-2">
                <div>
                  <label className="form-label sub-label">Session Type</label>
                  <select
                    className="select"
                    value={formState.session_type}
                    onChange={(e) =>
                      updateFormFn("session_type", e.target.value)
                    }
                  >
                    {SESSION_TYPE_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
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
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="2450"
                    value={formState.wheelbase_mm}
                    onChange={(e) =>
                      updateFormFn("wheelbase_mm", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div>
                  <label className="form-label sub-label">Tire Set</label>
                  <input
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
                      setFormFn((prev) => ({
                        ...prev,
                        pressures: { ...prev.pressures, unit: e.target.value },
                      }))
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
                      <input
                        className="input"
                        type="text"
                        value={detailForm.tire_inventory.status}
                        onChange={(e) =>
                          updateNested(
                            setDetailForm,
                            ["tire_inventory", "status"],
                            e.target.value,
                          )
                        }
                      />
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
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange(e, setImageValue)}
                  />
                </div>
                <p className="form-hint">
                  Unstructured notes from the mechanic (this becomes{" "}
                  <code>raw_text</code>). Voice input appends into the same
                  field so it can still be reviewed and edited before submit.
                </p>
              </div>
            )}

            <div className="submission-status">
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
                <VoiceInputControl
                  className="voice-input-bottom"
                  textareaRef={quickRawTextRef}
                  onValueChange={setRawTextValue}
                  disabled={isSubmitting}
                />
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Notes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ProtectedRoute>
  );
}
