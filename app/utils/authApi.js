import axios from "axios";

import axiosInstance from "./axiosInstance";
import { normalizeUser } from "./apiTransforms";

const HTML_ERROR_MARKERS = [
  "<!DOCTYPE html",
  "<html",
  "This page could not be found",
  "__next_f",
];

const isHtmlLikeError = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return HTML_ERROR_MARKERS.some((marker) =>
    trimmed.toLowerCase().includes(marker.toLowerCase()),
  );
};

const getErrorDetail = (error) =>
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.data?.detail ||
  error?.data?.message ||
  error?.data?.error ||
  error?.message ||
  error?.error ||
  "";

const buildApiError = (error, fallbackMessage) => {
  const status = error?.response?.status ?? error?.status ?? null;
  const detail = getErrorDetail(error);
  const message =
    typeof detail === "string" && detail.trim() && !isHtmlLikeError(detail)
      ? detail.trim()
      : fallbackMessage;

  return {
    success: false,
    status,
    message,
    error: message,
    data: error?.response?.data ?? error?.data ?? null,
  };
};

const createTokenClient = (token) =>
  axios.create({
    baseURL: axiosInstance.defaults.baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

const extractToken = (response) =>
  response?.data?.access_token ||
  response?.data?.accessToken ||
  response?.data?.token ||
  response?.access_token ||
  response?.accessToken ||
  response?.token ||
  null;

const fetchCurrentUserWithToken = async (token) => {
  const tokenClient = createTokenClient(token);
  const response = await tokenClient.get("/auth/me");
  return normalizeUser(response.data);
};

/**
 * Register a new mechanic account.
 */
export const registerUser = async (userData) => {
  try {
    const payload = {
      name: userData.name,
      email: userData.email,
      password: userData.password,
    };

    const response = await axiosInstance.post("/auth/register", payload);
    return {
      success: true,
      user: normalizeUser(response.data),
    };
  } catch (error) {
    console.error("Signup API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to create user");
  }
};

/**
 * Create a user from the admin area with an explicit role.
 */
export const createAdminUser = async (userData) => {
  try {
    const response = await axiosInstance.post("/users", {
      name: userData.name,
      email: userData.email,
      password: userData.password,
      role: userData.role,
    });

    return {
      success: true,
      user: normalizeUser(response.data),
    };
  } catch (error) {
    console.error("Admin user create API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to create user");
  }
};

/**
 * List users for the admin area.
 */
export const getUsers = async () => {
  try {
    const response = await axiosInstance.get("/users");
    const users = Array.isArray(response.data)
      ? response.data
      : response.data?.users || [];

    return {
      users: users.map(normalizeUser),
    };
  } catch (error) {
    console.error("Get Users API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to load users");
  }
};

/**
 * Reset a user password from the admin area.
 */
export const resetUserPassword = async (userId, password) => {
  try {
    const response = await axiosInstance.patch(`/users/${userId}/password`, {
      password,
    });

    return {
      success: true,
      user: normalizeUser(response.data),
    };
  } catch (error) {
    console.error("Admin password reset API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to update password");
  }
};

/**
 * Delete a user from the admin area when the account is no longer referenced.
 */
export const deleteUser = async (userId) => {
  try {
    const response = await axiosInstance.delete(`/users/${userId}`);

    return {
      success: true,
      message: response.data?.message || "User deleted successfully",
    };
  } catch (error) {
    console.error("Admin user delete API Error:", {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw buildApiError(error, "Failed to delete user");
  }
};

/**
 * Login user and return a normalized user plus token.
 */
export const loginUser = async (credentials) => {
  try {
    const response = await axiosInstance.post("/auth/login", credentials);
    const token = extractToken(response);

    if (!token) {
      throw new Error("Login succeeded but no access token was returned");
    }

    const user = await fetchCurrentUserWithToken(token);

    return {
      success: true,
      user,
      token,
      accessToken: token,
      tokenType: "bearer",
    };
  } catch (error) {
    console.error("Login API Error:", {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw buildApiError(error, "Invalid email or password");
  }
};

/**
 * Logout user and revoke the token server-side.
 */
export const logoutUser = async () => {
  try {
    const response = await axiosInstance.post("/auth/logout");
    return response.data || { success: true };
  } catch (error) {
    console.error("Logout API Error:", error);
    throw buildApiError(error, "Failed to log out");
  }
};

/**
 * Fetch the current authenticated user.
 */
export const getMe = async () => {
  try {
    const response = await axiosInstance.get("/auth/me");
    return {
      success: true,
      user: normalizeUser(response.data),
    };
  } catch (error) {
    console.error("GetMe API Error:", error);
    throw buildApiError(error, "Failed to load current user");
  }
};
