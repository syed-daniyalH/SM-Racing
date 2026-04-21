import axios from "axios";

// Create axios instance with base configuration.
// Local development uses /api/v1 through the Next.js proxy.
// Production should set NEXT_PUBLIC_API_URL to the Render backend /api/v1 URL.
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api/v1",

  headers: {
    "Content-Type": "application/json",
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    "Cache-Control": "no-cache, no-store, must-revalidate", // Prevent 304 responses
    Pragma: "no-cache",
    Expires: "0",
  },
});

// Request interceptor - Add auth token to every request
axiosInstance.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem("sm2_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor - Handle errors globally
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      // Clear token and user data
      localStorage.removeItem("sm2_token");
      localStorage.removeItem("sm2_user");

      // Redirect to login if not already there
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
