import axiosInstance from "./axiosInstance";
import { normalizeEvent, normalizeList, toApiDate } from "./apiTransforms";

const unwrapEvent = (data) => normalizeEvent(data?.event || data?.data || data);

const unwrapEvents = (data) =>
  normalizeList(data?.events || data?.data || data, normalizeEvent);

const buildEventPayload = (eventData) => {
  const payload = {
    name: eventData?.name?.trim(),
    track: eventData?.track?.trim(),
    start_date: toApiDate(eventData?.start_date || eventData?.startDate),
    end_date: toApiDate(eventData?.end_date || eventData?.endDate),
  };

  const isActive =
    typeof eventData?.is_active === "boolean"
      ? eventData.is_active
      : typeof eventData?.isActive === "boolean"
        ? eventData.isActive
        : typeof eventData?.status === "string"
          ? eventData.status.toLowerCase() !== "archived"
          : undefined;

  if (typeof isActive === "boolean") {
    payload.is_active = isActive;
  }

  return payload;
};

const buildApiError = (error, fallbackMessage) => ({
  status: error.response?.status,
  message:
    error.response?.data?.detail ||
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    fallbackMessage,
  error:
    error.response?.data?.detail ||
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    fallbackMessage,
  data: error.response?.data,
});

export const getEvents = async () => {
  try {
    const response = await axiosInstance.get("/events");
    return { events: unwrapEvents(response.data) };
  } catch (error) {
    console.error("Get Events API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to load events");
  }
};

export const getEventById = async (eventId) => {
  try {
    const response = await axiosInstance.get(`/events/${eventId}`);
    return unwrapEvent(response.data);
  } catch (error) {
    console.error("Get Event By ID API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to load event");
  }
};

export const createEvent = async (eventData) => {
  try {
    const response = await axiosInstance.post(
      "/events",
      buildEventPayload(eventData),
    );
    return {
      success: true,
      event: unwrapEvent(response.data),
    };
  } catch (error) {
    console.error("Create Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to create event");
  }
};

export const updateEvent = async (eventId, eventData) => {
  try {
    const response = await axiosInstance.put(
      `/events/${eventId}`,
      buildEventPayload(eventData),
    );
    return {
      success: true,
      event: unwrapEvent(response.data),
    };
  } catch (error) {
    console.error("Update Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to update event");
  }
};

export const archiveEvent = async (eventId) => {
  try {
    const response = await axiosInstance.delete(`/events/${eventId}`);
    return {
      success: true,
      event: unwrapEvent(response.data),
    };
  } catch (error) {
    console.error("Archive Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to archive event");
  }
};

export const selectActiveEvent = async (eventId) => {
  try {
    const response = await axiosInstance.post(`/events/${eventId}/select`);
    return {
      success: true,
      event: unwrapEvent(response.data),
    };
  } catch (error) {
    console.error("Select Active Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to select active event");
  }
};

export const getActiveEvent = async () => {
  try {
    const response = await axiosInstance.get("/events/active");
    return unwrapEvent(response.data);
  } catch (error) {
    console.error("Get Active Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to load active event");
  }
};
