const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value);

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

export const normalizeSubmission = (submission) => {
  if (!submission) return null;

  const id = submission.id || submission._id || null;
  const runGroup = normalizeRunGroup(submission.run_group || submission.runGroup);
  const event = normalizeEvent(submission.event);
  const payload = submission.payload || submission.data || {};

  return {
    ...submission,
    id,
    _id: id,
    submissionId: submission.submission_ref || submission.submissionId || id,
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
    userId: submission.created_by_id || submission.userId || null,
    raw_text: submission.raw_text || submission.rawText || "",
    image: submission.image_url || submission.image || null,
    data: payload,
    payload,
    status: submission.status || "PENDING",
    errorMessage: submission.error_message || submission.errorMessage || null,
    createdAt: submission.created_at || submission.createdAt || null,
    updatedAt: submission.updated_at || submission.updatedAt || null,
  };
};

export const normalizeList = (items, normalizer) =>
  Array.isArray(items) ? items.map(normalizer).filter(Boolean) : [];
