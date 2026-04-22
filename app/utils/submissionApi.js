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

const buildSubmissionPayload = async (submissionData) => {
  const legacyEventId = submissionData?.eventId || submissionData?.event_id;
  let runGroupId =
    submissionData?.run_group_id || submissionData?.runGroupId || null;
  const rawText =
    submissionData?.raw_text ?? submissionData?.rawText ?? null;

  if (!runGroupId && legacyEventId) {
    const runGroupResponse = await getRunGroupByEvent(legacyEventId);
    const runGroup = runGroupResponse?.runGroup || runGroupResponse;
    runGroupId = runGroup?.id || runGroup?._id || null;
  }

  const payload = submissionData?.payload || submissionData?.data || {};
  const payloadData = payload?.data || {};

  return {
    submission_ref:
      submissionData?.submission_ref ||
      submissionData?.submissionId ||
      submissionData?.submission_id ||
      generateUUID(),
    event_id: legacyEventId,
    run_group_id: runGroupId,
    driver_id:
      submissionData?.driver_id ||
      submissionData?.driverId ||
      payload?.driver_id ||
      payload?.driverId ||
      payloadData?.driver_id ||
      payloadData?.driverId ||
      null,
    vehicle_id:
      submissionData?.vehicle_id ||
      submissionData?.vehicleId ||
      payload?.vehicle_id ||
      payload?.vehicleId ||
      payloadData?.vehicle_id ||
      payloadData?.vehicleId ||
      null,
    raw_text: rawText,
    image_url: submissionData?.image_url || submissionData?.image || null,
    payload,
    analysis_result:
      submissionData?.analysis_result ||
      submissionData?.analysisResult ||
      {
        action: submissionData?.action,
        confidence: submissionData?.confidence,
        run_group: submissionData?.runGroup || submissionData?.run_group || null,
      },
  };
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
    throw error.response?.data || error.message;
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
    return response.data || { success: true };
  } catch (error) {
    console.error("Delete Submission API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error.response?.data || error.message;
  }
};
