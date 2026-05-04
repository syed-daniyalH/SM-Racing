export const toApiDate = (value) => {
  if (!value) {
    return value;
  }

  if (typeof value === "string" && value.includes("T")) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const normalizeUser = (user) => {
  if (!user) return null;

  const id = user.id || user._id || user.user_id || user.userId || null;

  return {
    ...user,
    id,
    _id: id,
    role: user.role || user.userRole || "MECHANIC",
    isActive: user.is_active ?? user.isActive ?? true,
    lastLoginAt: user.last_login_at || user.lastLoginAt || null,
    lastLogoutAt: user.last_logout_at || user.lastLogoutAt || null,
    activeEventId: user.active_event_id || user.activeEventId || null,
    createdAt: user.created_at || user.createdAt || null,
    updatedAt: user.updated_at || user.updatedAt || null,
  };
};

export const normalizeEvent = (event) => {
  if (!event) return null;

  const id = event.id || event._id || null;

  return {
    ...event,
    id,
    _id: id,
    startDate: event.start_date || event.startDate || null,
    endDate: event.end_date || event.endDate || null,
    createdById: event.created_by_id || event.createdById || null,
    isActive: event.is_active ?? event.isActive ?? true,
    notes: event.notes || event.description || event.event_notes || null,
    createdAt: event.created_at || event.createdAt || null,
    updatedAt: event.updated_at || event.updatedAt || null,
  };
};

export const normalizeRunGroup = (runGroup) => {
  if (!runGroup) return null;

  const id = runGroup.id || runGroup._id || null;

  return {
    ...runGroup,
    id,
    _id: id,
    eventId: runGroup.event_id || runGroup.eventId || null,
    rawText: runGroup.raw_text || runGroup.rawText || null,
    normalized: runGroup.normalized || null,
    createdById: runGroup.created_by_id || runGroup.createdById || null,
    locked: runGroup.locked ?? false,
    createdAt: runGroup.created_at || runGroup.createdAt || null,
    updatedAt: runGroup.updated_at || runGroup.updatedAt || null,
  };
};

const normalizeStringList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeStructuredWarnings = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((warning) =>
      warning && typeof warning === "object"
        ? {
            ...warning,
            section: warning.section || "structured_ingest",
            code: warning.code || "STRUCTURED_WARNING",
            message: warning.message || "Structured normalization completed with a warning.",
          }
        : null,
    )
    .filter(Boolean);
};

export const normalizeDriver = (driver) => {
  if (!driver) return null;

  const id = driver.id || driver._id || driver.driver_id || driver.driverId || null;
  const firstName = driver.first_name || driver.firstName || "";
  const lastName = driver.last_name || driver.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName =
    driver.display_name ||
    driver.displayName ||
    driver.team_name ||
    driver.teamName ||
    "";

  return {
    ...driver,
    id,
    _id: id,
    driverCode: driver.driver_id || driver.driverId || "",
    firstName,
    lastName,
    fullName: fullName || driver.driver_name || driver.driverName || displayName || "",
    driverName: driver.driver_name || driver.driverName || fullName || displayName || "",
    displayName,
    teamName: driver.team_name || driver.teamName || displayName || "",
    licenseNumber: driver.license_number || driver.licenseNumber || "",
    aliases: normalizeStringList(driver.aliases || driver.alias_list || driver.aliasList),
    notes: driver.notes || driver.description || "",
    isActive: driver.is_active ?? driver.isActive ?? true,
    createdById: driver.created_by_id || driver.createdById || null,
    createdAt: driver.created_at || driver.createdAt || null,
    updatedAt: driver.updated_at || driver.updatedAt || null,
  };
};

export const normalizeVehicle = (vehicle) => {
  if (!vehicle) return null;

  const id = vehicle.id || vehicle._id || vehicle.vehicle_id || vehicle.vehicleId || null;

  return {
    ...vehicle,
    id,
    _id: id,
    vehicleCode: vehicle.vehicle_id || vehicle.vehicleId || "",
    driverId: vehicle.driver_id || vehicle.driverId || null,
    make: vehicle.make || "",
    model: vehicle.model || "",
    year: vehicle.year ?? null,
    vin: vehicle.vin || vehicle.vehicle_identification_number || "",
    registrationNumber:
      vehicle.registration_number ||
      vehicle.registrationNumber ||
      vehicle.car_number ||
      vehicle.carNumber ||
      "",
    vehicleClass:
      vehicle.vehicle_class || vehicle.class || vehicle.vehicleClass || "",
    wheelbaseMm: vehicle.wheelbase_mm ?? vehicle.wheelbaseMm ?? null,
    notes: vehicle.notes || vehicle.description || "",
    isActive: vehicle.is_active ?? vehicle.isActive ?? true,
    createdAt: vehicle.created_at || vehicle.createdAt || null,
    updatedAt: vehicle.updated_at || vehicle.updatedAt || null,
  };
};

export const normalizeTrack = (track) => {
  if (!track) return null;

  const id = track.id || track._id || track.track_id || track.trackId || null;
  const trackName = track.track_name || track.trackName || "";
  const displayName =
    track.display_name ||
    track.displayName ||
    track.name ||
    trackName;
  const shortCode = track.short_code || track.shortCode || track.code || "";
  const country = track.country || track.country_name || track.countryName || "";
  const isActive =
    track.is_active ??
    track.isActive ??
    track.active ??
    (typeof track.status === "string" ? track.status.toLowerCase() !== "archived" : true);

  return {
    ...track,
    id,
    _id: id,
    trackName,
    displayName: displayName || trackName,
    shortCode: String(shortCode || "").toUpperCase(),
    country,
    latitude: track.latitude ?? track.lat ?? null,
    longitude: track.longitude ?? track.lng ?? track.lon ?? null,
    notes: track.notes || track.description || "",
    status: String(track.status || "").toLowerCase() || (isActive ? "active" : "archived"),
    isActive,
    createdAt: track.created_at || track.createdAt || null,
    updatedAt: track.updated_at || track.updatedAt || null,
    archivedAt: track.archived_at || track.archivedAt || null,
  };
};

export const normalizeSubmission = (submission) => {
  if (!submission) return null;

  const id = submission.id || submission._id || null;
  const runGroup = normalizeRunGroup(submission.run_group || submission.runGroup);
  const event = normalizeEvent(submission.event);
  const payload = submission.payload || submission.data || {};
  const analysisResult = submission.analysis_result || submission.analysisResult || {};
  const sessionPayload =
    payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  const structuredIngestWarnings = normalizeStructuredWarnings(
    submission.structured_ingest_warnings || submission.structuredIngestWarnings,
  );

  return {
    ...submission,
    id,
    _id: id,
    submissionId: submission.submission_ref || submission.submissionId || id,
    correlationId: submission.correlation_id || submission.correlationId || null,
    eventId: submission.event_id || submission.eventId || event?.id || null,
    runGroup:
      runGroup?.normalized ||
      runGroup?.rawText ||
      submission.runGroup ||
      null,
    run_group: runGroup,
    event,
    driver: submission.driver || null,
    vehicle: submission.vehicle || null,
    createdByUser: submission.created_by_user || submission.createdByUser || null,
    userId: submission.created_by_id || submission.userId || null,
    raw_text: submission.raw_text || submission.rawText || "",
    image: submission.image_url || submission.image || null,
    data: sessionPayload,
    payload,
    analysis_result: analysisResult,
    analysisResult,
    submissionMode:
      analysisResult?.submission_mode || analysisResult?.submissionMode || null,
    sourceType:
      analysisResult?.source_type || analysisResult?.sourceType || null,
    structuredOnly:
      analysisResult?.structured_only ?? analysisResult?.structuredOnly ?? false,
    hasStructuredData:
      analysisResult?.has_structured_data ?? analysisResult?.hasStructuredData ?? false,
    hasRawText:
      analysisResult?.has_raw_text ?? analysisResult?.hasRawText ?? false,
    hasImage:
      analysisResult?.has_image ?? analysisResult?.hasImage ?? false,
    structuredIngestStatus:
      submission.structured_ingest_status ||
      submission.structuredIngestStatus ||
      (structuredIngestWarnings.length ? "saved_with_warnings" : "skipped"),
    structuredIngestWarnings,
    hasStructuredWarnings: structuredIngestWarnings.length > 0,
    confidence:
      analysisResult?.confidence ??
      analysisResult?.confidence_score ??
      submission.confidence ??
      payload?.confidence ??
      null,
    status: submission.status || "PENDING",
    errorMessage: submission.error_message || submission.errorMessage || null,
    createdAt: submission.created_at || submission.createdAt || null,
    updatedAt: submission.updated_at || submission.updatedAt || null,
  };
};

export const normalizeList = (items, normalizer) =>
  Array.isArray(items) ? items.map(normalizer).filter(Boolean) : [];
