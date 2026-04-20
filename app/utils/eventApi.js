import axiosInstance from "./axiosInstance";
import { normalizeEvent, normalizeList, toApiDate } from "./apiTransforms";

const unwrapEvent = (data) => normalizeEvent(data?.event || data?.data || data);

const unwrapEvents = (data) =>
  normalizeList(data?.events || data?.data || data, normalizeEvent);

const buildEventPayload = (eventData) => ({
  name: eventData?.name?.trim(),
  track: eventData?.track?.trim(),
  start_date: toApiDate(eventData?.start_date || eventData?.startDate),
  end_date: toApiDate(eventData?.end_date || eventData?.endDate),
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
  }
};
