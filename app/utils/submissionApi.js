import axiosInstance from "./axiosInstance";
import { normalizeList, normalizeSubmission } from "./apiTransforms";
import { getRunGroupByEvent } from "./runGroupApi";
import { generateUUID } from "./uuid";

/**
 * Submission API Functions
 * All submission-related API calls
 */

/**
 * Create a new submission (MECHANIC)
 * @param {Object} submissionData - Submission data (notes, eventId, etc.)
 * @returns {Promise} API response
 */
const unwrapSubmission = (data) =>
  normalizeSubmission(data?.submission || data?.data || data);

const unwrapSubmissionList = (data) =>
  normalizeList(data?.submissions || data?.data || data, normalizeSubmission);

const buildNetworkErrorMessage = (error, fallbackMessage) => {
  if (error.response) {
    return null;
  }

  const apiBaseURL = axiosInstance.defaults.baseURL || "/api/v1";
  const target =
    apiBaseURL === "/api/v1"
      ? "the local API proxy (/api/v1 -> FastAPI on 127.0.0.1:8000)"
      : apiBaseURL;

  if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
    return `Cannot reach SM2 API at ${target}. Please make sure the backend is running and try again.`;
  }

  return fallbackMessage;
};

const buildApiError = (error, fallbackMessage) => ({
  status: error.response?.status,
  code:
    (!Array.isArray(error.response?.data?.detail) &&
      error.response?.data?.detail &&
      typeof error.response.data.detail === "object" &&
      (error.response.data.detail.code || error.response.data.detail.error_code)) ||
    error.response?.data?.code ||
    null,
  message:
    error.response?.data?.message ||
    (!Array.isArray(error.response?.data?.detail) &&
      error.response?.data?.detail &&
      typeof error.response.data.detail === "object" &&
      (error.response.data.detail.message || error.response.data.detail.msg)) ||
    error.response?.data?.error ||
    (Array.isArray(error.response?.data?.detail)
      ? error.response.data.detail
          .map((item) => item?.msg || item?.message || JSON.stringify(item))
          .join("; ")
      : typeof error.response?.data?.detail === "string"
        ? error.response.data.detail
        : null) ||
    buildNetworkErrorMessage(error, fallbackMessage) ||
    error.message ||
    fallbackMessage,
  error:
    error.response?.data?.error ||
    error.response?.data?.message ||
    (!Array.isArray(error.response?.data?.detail) &&
      error.response?.data?.detail &&
      typeof error.response.data.detail === "object" &&
      (error.response.data.detail.message || error.response.data.detail.msg)) ||
    (Array.isArray(error.response?.data?.detail)
      ? error.response.data.detail
          .map((item) => item?.msg || item?.message || JSON.stringify(item))
          .join("; ")
      : typeof error.response?.data?.detail === "string"
        ? error.response.data.detail
        : null) ||
    buildNetworkErrorMessage(error, fallbackMessage) ||
    error.message ||
    fallbackMessage,
  detail: error.response?.data?.detail,
  data: error.response?.data,
});

const buildSubmissionPayload = async (submissionData) => {
  const legacyEventId = submissionData?.eventId || submissionData?.event_id;
  let runGroupId =
    submissionData?.run_group_id || submissionData?.runGroupId || null;
  const rawText =
    submissionData?.raw_text ?? submissionData?.rawText ?? null;
  const imageUrl = submissionData?.image_url || submissionData?.image || null;

  if (!runGroupId && legacyEventId) {
    const runGroupResponse = await getRunGroupByEvent(legacyEventId);
    const runGroup = runGroupResponse?.runGroup || runGroupResponse;
    runGroupId = runGroup?.id || runGroup?._id || null;
  }

  const nestedPayload = submissionData?.payload || submissionData?.data || {};
  const payloadData = nestedPayload?.data || {};
  const correlationId =
    submissionData?.correlation_id ||
    submissionData?.correlationId ||
    nestedPayload?.correlation_id ||
    nestedPayload?.correlationId ||
    generateUUID();
  const sessionId =
    submissionData?.session_id ||
    submissionData?.sessionId ||
    submissionData?.submission_ref ||
    submissionData?.submissionId ||
    submissionData?.submission_id ||
    nestedPayload?.session_id ||
    nestedPayload?.sessionId ||
    payloadData?.session_id ||
    payloadData?.sessionId ||
    generateUUID();

  const payload = {
    submission_ref: sessionId,
    correlation_id: correlationId,
    event_id: legacyEventId,
    run_group_id: runGroupId,
    driver_id:
      submissionData?.driver_id ||
      submissionData?.driverId ||
      nestedPayload?.driver_id ||
      nestedPayload?.driverId ||
      payloadData?.driver_id ||
      payloadData?.driverId ||
      null,
    vehicle_id:
      submissionData?.vehicle_id ||
      submissionData?.vehicleId ||
      nestedPayload?.vehicle_id ||
      nestedPayload?.vehicleId ||
      payloadData?.vehicle_id ||
      payloadData?.vehicleId ||
      null,
    payload: nestedPayload,
    analysis_result:
      submissionData?.analysis_result ||
      submissionData?.analysisResult ||
      {
        action: submissionData?.action,
        confidence: submissionData?.confidence,
        run_group: submissionData?.runGroup || submissionData?.run_group || null,
      },
  };

  if (typeof rawText === "string" && rawText.trim()) {
    payload.raw_text = rawText;
  }

  if (imageUrl) {
    payload.image_url = imageUrl;
  }

  return payload;
};

export const createSubmission = async (submissionData) => {
  try {
    const response = await axiosInstance.post(
      "/submissions",
      await buildSubmissionPayload(submissionData),
    );
    const submission = unwrapSubmission(response.data);
    const success = submission?.status !== "FAILED";
    return {
      success,
      submission,
      message: success
        ? null
        : submission?.errorMessage || "Submission validation failed.",
    };
  } catch (error) {
    console.error("Create Submission API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to submit notes. Please try again.");
  }
};

/**
 * Get all submissions (OWNER only)
 * @returns {Promise} API response with submissions array
 */
export const getAllSubmissions = async () => {
  try {
    const response = await axiosInstance.get("/submissions");
    return unwrapSubmissionList(response.data);
  } catch (error) {
    console.error("Get All Submissions API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Retry failed submission (OWNER only)
 * @param {string} submissionId - Submission ID
 * @returns {Promise} API response
 */
export const retryFailedSubmission = async (submissionId) => {
  try {
    const response = await axiosInstance.post(`/submissions/${submissionId}/retry`);
    const submission = unwrapSubmission(response.data);
    const success = submission?.status !== "FAILED";
    return {
      success,
      submission,
      message: success
        ? null
        : submission?.errorMessage || "Retry validation failed.",
    };
  } catch (error) {
    console.error("Retry Failed Submission API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Get submission by ID (OWNER + MECHANIC)
 * @param {string} submissionId - Submission ID
 * @returns {Promise} API response with submission data
 */
export const getSubmissionById = async (submissionId) => {
  try {
    const response = await axiosInstance.get(`/submissions/${submissionId}`);
    return unwrapSubmission(response.data);
  } catch (error) {
    console.error("Get Submission By ID API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Get all submissions for a specific event (OWNER + MECHANIC)
 * @param {string} eventId - Event ID
 * @returns {Promise} API response with submissions array
 */
export const getSubmissionsByEvent = async (eventId) => {
  try {
    const response = await axiosInstance.get(`/submissions/event/${eventId}`);
    return unwrapSubmissionList(response.data);
  } catch (error) {
    console.error("Get Submissions By Event API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Get all submissions by a specific user (OWNER + MECHANIC)
 * @param {string} userId - User ID
 * @returns {Promise} API response with submissions array
 */
export const getSubmissionsByUser = async (userId) => {
  try {
    const response = await axiosInstance.get(`/submissions/user/${userId}`);
    return unwrapSubmissionList(response.data);
  } catch (error) {
    console.error("Get Submissions By User API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Update submission (OWNER only)
 * @param {string} submissionId - Submission ID
 * @param {Object} submissionData - Updated submission data
 * @returns {Promise} API response
 */
export const updateSubmission = async (submissionId, submissionData) => {
  try {
    const response = await axiosInstance.put(
      `/submissions/${submissionId}`,
      submissionData,
    );
    return {
      success: true,
      submission: unwrapSubmission(response.data),
    };
  } catch (error) {
    console.error("Update Submission API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};

/**
 * Delete submission (OWNER only)
 * @param {string} submissionId - Submission ID
 * @returns {Promise} API response
 */
export const deleteSubmission = async (submissionId) => {
  try {
    const response = await axiosInstance.delete(`/submissions/${submissionId}`);
    return {
      success: true,
      message: response.data?.message || "Submission deleted successfully",
    };
  } catch (error) {
    console.error("Delete Submission API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};
