import axiosInstance from "./axiosInstance";
import { normalizeRunGroup } from "./apiTransforms";

/**
 * Run Group API Functions
 * All run group-related API calls
 */

/**
 * Create/Set run group for an event (OWNER only)
 * @param {Object} runGroupData - { eventId, rawText }
 * @returns {Promise} API response
 */
const unwrapRunGroup = (data) =>
  normalizeRunGroup(data?.runGroup || data?.data || data);

const buildRunGroupPayload = (runGroupData) => ({
  event_id: runGroupData?.event_id || runGroupData?.eventId,
  raw_text:
    runGroupData?.raw_text ||
    runGroupData?.rawText ||
    runGroupData?.runGroup ||
    runGroupData?.value,
});

export const setRunGroup = async (runGroupData) => {
  try {
    const response = await axiosInstance.post(
      "/run-groups",
      buildRunGroupPayload(runGroupData),
    );
    return {
      success: true,
      runGroup: unwrapRunGroup(response.data),
    };
  } catch (error) {
    console.error("Set Run Group API Error:", {
      url: error.config?.url,
      method: error.config?.method,
      data: error.config?.data,
      status: error.response?.status,
      responseData: error.response?.data
    });
    throw error.response?.data || error.message;
  }
}

/**
 * Get run group by event ID (OWNER + MECHANIC)
 * @param {string|number} eventId - Event ID
 * @returns {Promise} API response with run group data
 */
export const getRunGroup = async (eventId) => {
  try {
    const response = await axiosInstance.get(`/run-groups/event/${eventId}`);
    return unwrapRunGroup(response.data);
  } catch (error) {
    console.error("Get Run Group API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error.response?.data || error.message;
  }
}

/**
 * Get run group by event ID (Alternative route)
 * @param {string|number} eventId - Event ID
 * @returns {Promise} API response with run group data
 */
export const getRunGroupByEvent = async (eventId) => {
  try {
    const response = await axiosInstance.get(`/run-groups/event/${eventId}`);
    return unwrapRunGroup(response.data);
  } catch (error) {
    console.error("Get Run Group By Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error.response?.data || error.message;
  }
}

/**
 * Update run group (OWNER only)
 * @param {Object} runGroupData - { eventId, rawText }
 * @returns {Promise} API response
 */
export const updateRunGroup = async (runGroupData) => {
  try {
    const eventId = runGroupData?.event_id || runGroupData?.eventId;
    const response = await axiosInstance.put(
      `/run-groups/event/${eventId}`,
      {
        raw_text:
          runGroupData?.raw_text ||
          runGroupData?.rawText ||
          runGroupData?.runGroup ||
          runGroupData?.value,
        locked: runGroupData?.locked,
      },
    );
    return {
      success: true,
      runGroup: unwrapRunGroup(response.data),
    };
  } catch (error) {
    console.error("Update Run Group API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error.response?.data || error.message;
  }
}

/**
 * Delete run group (OWNER only)
 * @param {string|number} eventId - Event ID
 * @returns {Promise} API response
 */
export const deleteRunGroup = async (eventId) => {
  throw new Error(
    `Run group deletion is not supported in the FastAPI backend for event ${eventId}.`,
  );
};
