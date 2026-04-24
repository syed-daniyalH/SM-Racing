"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { loginUser } from "../utils/authApi";
import "./Login.css";

const isHtmlLikeError = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();
  return (
    text.startsWith("<!DOCTYPE html") ||
    text.startsWith("<html") ||
    text.includes("__next_f") ||
    text.includes("This page could not be found")
  );
};

const safeErrorMessage = (value, fallback) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  if (!text || isHtmlLikeError(text)) {
    return fallback;
  }

  return text;
};

export default function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // Check for signup success message
  useEffect(() => {
    const signupSuccess = searchParams.get("signup");
    if (signupSuccess === "success") {
      setSuccess("Signup successful! Please login with your credentials.");
      // Remove the query parameter from URL
      router.replace("/login", { scroll: false });
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    }
  }, [searchParams, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter both email and password");
      setIsLoading(false);
      return;
    }

    try {
      // Call login API
      const response = await loginUser({ email, password });

      // Handle different response structures
      // Backend might return: { success, user, token } or { user, token } or just { user, token }
      const userData = response.user || response.data?.user || response;
      const token =
        response.token || response.data?.token || response.accessToken;
      const isSuccess = response.success !== false; // Default to true if not specified

      // Check if we have user data
      if (userData) {
        // Store user data and token
        login(userData, token);

        // Redirect based on role
        const userRole = userData.role || userData.roleName;
        const redirectPath =
          userRole === "OWNER" || userRole === "ADMIN"
            ? "/admin/users"
            : "/events";

        // Use window.location for reliable redirect
        // This ensures the page fully reloads and state is fresh
        window.location.href = redirectPath;
      } else {
        // Show error with response details for debugging
        console.error("Login failed - Invalid response structure:", response);
        setError(
          safeErrorMessage(response.message, "") ||
            safeErrorMessage(response.error, "") ||
            "Login failed. Invalid response from server."
        );
      }
    } catch (error) {
      // Handle API errors
      console.error("Login error:", error);

      let errorMessage = "Invalid email or password";
      const status = error?.status ?? error?.response?.status;
      const rawCandidate =
        error?.message ||
        error?.error ||
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        (typeof error === "string" ? error : "");

      if (status === 404) {
        errorMessage =
          "Authentication service unavailable. Please check the backend server and API URL.";
      } else if (status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (status === 401) {
        errorMessage = "Invalid email or password";
      } else {
        errorMessage = safeErrorMessage(rawCandidate, errorMessage);
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="racing-lines"></div>
        <div className="racing-grid"></div>
      </div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-container">
              <div className="logo-icon">🏁</div>
              <h1 className="app-logo">
                <span className="logo-sm">SM-2</span>
                <span className="logo-title">RACE CONTROL</span>
              </h1>
            </div>
            <p className="login-subtitle">Login to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">📧</span>
                Email Address
              </label>
              <input
                type="email"
                className="input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span className="label-icon">🔒</span>
                Password
              </label>
              <input
                type="password"
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="error-text">{error}</div>}
            {success && <div className="success-text">{success}</div>}

            <button
              type="submit"
              className="btn btn-primary login-button"
              disabled={isLoading}
            >
              <span>{isLoading ? "Logging in..." : "Login"}</span>
              {!isLoading && <span className="btn-arrow">→</span>}
            </button>
          </form>

          <div className="login-footer">
            <p className="footer-text">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="link-button"
              >
                Create a new account
              </button>
            </p>
          </div>

          <div className="login-info">
            <p className="info-text">
              <strong>API Connected:</strong> Backend authentication enabled
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// export default function LoginContent() {
//   return (
//     <Suspense fallback={<div>Loading...</div>}>
//       <LoginContent />
//     </Suspense>
//   );
// }
