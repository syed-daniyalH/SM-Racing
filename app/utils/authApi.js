import axios from "axios";

import axiosInstance from "./axiosInstance";
import { normalizeUser } from "./apiTransforms";

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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
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
    throw error.response?.data || error.message;
  }
};
