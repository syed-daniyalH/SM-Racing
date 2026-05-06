"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { loginOwnerUser, loginUser } from "../utils/authApi";
import "./Login.css";

const TELEMETRY_BACKGROUND =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663611619053/EBPeWtZXBpCFLD2Dqq5aDH/racing-telemetry-bg-TCNJDDSXNs3PoAhwXNBQab.webp";
const CHECKERED_FLAG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663611619053/EBPeWtZXBpCFLD2Dqq5aDH/checkered-flag-icon-BK4bojoYYoDd6y4gzs53PF.webp";

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

function LoginInputIcon({ type }) {
  const path =
    type === "mail" ? (
      <>
        <path d="M4 6.75A2.75 2.75 0 0 1 6.75 4h10.5A2.75 2.75 0 0 1 20 6.75v10.5A2.75 2.75 0 0 1 17.25 20H6.75A2.75 2.75 0 0 1 4 17.25V6.75Z" />
        <path d="m6 7.5 6 4.5 6-4.5" />
      </>
    ) : (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8.5 10V8.25A3.5 3.5 0 0 1 12 4.75a3.5 3.5 0 0 1 3.5 3.5V10" />
      </>
    );

  return (
    <svg
      className="login-input__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

function BrandFlag() {
  return (
    <div className="login-brand__flag" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={CHECKERED_FLAG} alt="" className="login-brand__flag-image" />
    </div>
  );
}

function LoadingIcon() {
  return (
    <svg
      className="login-button__spinner"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="login-button__spinner-track" cx="12" cy="12" r="8.5" />
      <path
        className="login-button__spinner-path"
        d="M20.5 12a8.5 8.5 0 0 1-8.5 8.5"
      />
    </svg>
  );
}

function AlertIcon({ tone = "error" }) {
  const colorClass =
    tone === "success" ? "login-alert__icon login-alert__icon--success" : "login-alert__icon";

  return (
    <svg
      className={colorClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tone === "success" ? (
        <>
          <path d="m9 12 2 2 4-5" />
          <circle cx="12" cy="12" r="9" />
        </>
      ) : (
        <>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.5h3.4L21 17.5a1.8 1.8 0 0 1-1.6 2.7H4.6A1.8 1.8 0 0 1 3 17.5L10.3 4.5Z" />
        </>
      )}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="login-button__arrow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export default function LoginContent({ mode = "standard" } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [portalNotice, setPortalNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user } = useAuth();
  const isAdminPortal = mode === "admin";
  const portalTargetPath = isAdminPortal ? "/login" : "/admin/login";

  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `url('${TELEMETRY_BACKGROUND}')`,
    }),
    []
  );

  useEffect(() => {
    const signupState = searchParams.get("signup");
    const accessStatus = searchParams.get("access");

    if (signupState === "pending" || signupState === "success") {
      setSuccessTitle("Request submitted");
      setSuccess(
        "Your account request has been sent to an owner for approval. You can sign in after the request is approved.",
      );
      router.replace("/login", { scroll: false });
      const timer = window.setTimeout(() => {
        setSuccess("");
        setSuccessTitle("");
      }, 5000);

      return () => window.clearTimeout(timer);
    }

    if (isAdminPortal && accessStatus === "denied") {
      setPortalNotice("This portal requires an OWNER account.");
      router.replace("/admin/login", { scroll: false });
      const timer = window.setTimeout(() => {
        setPortalNotice("");
      }, 7000);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [isAdminPortal, searchParams, router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const currentRole = String(user.role || "").toUpperCase();
    const hasOwnerAccess = currentRole === "OWNER";

    if (isAdminPortal) {
      if (hasOwnerAccess) {
        router.replace("/admin/users");
      }
      return;
    }

    router.replace(hasOwnerAccess ? "/admin/users" : "/events");
  }, [isAdminPortal, router, user]);

  const handlePortalSwitch = () => {
    const destination = user
      ? `/admin/signout?next=${encodeURIComponent(portalTargetPath)}`
      : portalTargetPath;

    router.push(destination);
  };

  const emailError = useMemo(() => {
    if (!error) return "";
    if (error.toLowerCase().includes("email")) {
      return error;
    }
    return "";
  }, [error]);

  const passwordError = useMemo(() => {
    if (!error) return "";
    if (error.toLowerCase().includes("password")) {
      return error;
    }
    return "";
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSuccessTitle("");
    setIsLoading(true);

    if (!email || !password) {
      setError("Please enter both email and password.");
      setIsLoading(false);
      return;
    }

    try {
      const loginAction = isAdminPortal ? loginOwnerUser : loginUser;
      const response = await loginAction({ email, password });
      const userData = response.user || response.data?.user || response;
      const token = response.token || response.data?.token || response.accessToken;

      if (userData) {
        login(userData, token);
        const userRole = userData.role || userData.roleName;
        const redirectPath = isAdminPortal
          ? "/admin/users"
          : userRole === "OWNER"
            ? "/admin/users"
            : "/events";

        router.replace(redirectPath);
        return;
      }

      setError(
        safeErrorMessage(response.message, "") ||
          safeErrorMessage(response.error, "") ||
          "Login failed. Invalid response from server."
      );
    } catch (loginError) {
      console.error("Login error:", loginError);

      let errorMessage = "Invalid email or password.";
      const status = loginError?.status ?? loginError?.response?.status;
      const rawCandidate =
        loginError?.message ||
        loginError?.error ||
        loginError?.response?.data?.detail ||
        loginError?.response?.data?.message ||
        loginError?.response?.data?.error ||
        (typeof loginError === "string" ? loginError : "");

      if (status === 404) {
        errorMessage =
          "Authentication service unavailable. Please check the backend server and API URL.";
      } else if (status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (status === 401) {
        errorMessage = "Invalid email or password.";
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
      <div className="login-background" style={backgroundStyle} />
      <div className="login-background__overlay" />
      <div className="login-background__grid" />
      <div className="login-background__glow login-background__glow--orange" />
      <div className="login-background__glow login-background__glow--teal" />

      <main className="login-shell">
        <section className="login-hero" aria-label="SM-2 Race Control brand">
          <div className="login-hero__accent" />
          <BrandFlag />
          <h1 className="login-brand">
            <span className="login-brand__orange">SM</span>
            <span className="login-brand__white">-2</span>
          </h1>
          <p className="login-hero__title">RACE CONTROL</p>
          <p className="login-hero__subtitle">
                {isAdminPortal ? "Owner Portal Access" : "Race Operations Platform"}
          </p>
          <div className="login-portal-switch" role="group" aria-label="Switch login portal">
            <button
              type="button"
              className={`login-portal-switch__button ${!isAdminPortal ? "is-active" : ""}`}
              onClick={handlePortalSwitch}
              disabled={!isAdminPortal}
              aria-current={!isAdminPortal ? "page" : undefined}
            >
              Driver Login
            </button>
            <button
              type="button"
              className={`login-portal-switch__button ${isAdminPortal ? "is-active" : ""}`}
              onClick={handlePortalSwitch}
              disabled={isAdminPortal}
              aria-current={isAdminPortal ? "page" : undefined}
            >
              Owner Login
            </button>
          </div>
        </section>

        <section className="login-card" aria-label="Login form">
          <div className="login-card__inner">
            {success ? (
              <div className="login-state">
                <AlertIcon tone="success" />
                <h2 className="login-state__title">
                  {successTitle ||
                    (isAdminPortal
                      ? "Owner authentication successful"
                      : "Authentication successful")}
                </h2>
                <p className="login-state__text">
                  {success ||
                    (isAdminPortal
                      ? "Redirecting to the owner dashboard..."
                      : "Redirecting to dashboard...")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="login-form">
                {portalNotice && (
                  <div className="login-alert" role="status">
                    <AlertIcon />
                    <div className="login-alert__copy">
                      <p className="login-alert__title">Portal access required</p>
                      <p className="login-alert__text">{portalNotice}</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="login-alert" role="alert">
                    <AlertIcon />
                    <div className="login-alert__copy">
                      <p className="login-alert__title">Authentication issue</p>
                      <p className="login-alert__text">{error}</p>
                    </div>
                  </div>
                )}

                <div className="login-field">
                  <label htmlFor="email" className="login-field__label">
                    Email Address
                  </label>
                  <div className="login-field__control">
                    <LoginInputIcon type="mail" />
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={isAdminPortal ? "owner@smracing.com" : "driver@smracing.com"}
                      className="login-input"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck="false"
                      disabled={isLoading}
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={emailError ? "email-error" : undefined}
                    />
                  </div>
                  {emailError && (
                    <p id="email-error" className="login-field__error">
                      {emailError}
                    </p>
                  )}
                </div>

                <div className="login-field">
                  <div className="login-field__header">
                    <label htmlFor="password" className="login-field__label">
                      Password
                    </label>
                    <span className="login-field__hint">Forgot?</span>
                  </div>
                  <div className="login-field__control">
                    <LoginInputIcon type="lock" />
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="login-input"
                      autoComplete="current-password"
                      disabled={isLoading}
                      aria-invalid={Boolean(passwordError)}
                      aria-describedby={passwordError ? "password-error" : undefined}
                    />
                  </div>
                  {passwordError && (
                    <p id="password-error" className="login-field__error">
                      {passwordError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="login-button"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <LoadingIcon />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      Login
                      <ArrowIcon />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        {!success && (
          <section className="login-cta" aria-label="Signup link">
            {isAdminPortal ? (
              <p className="login-cta__text">
                {user ? (
                  <>
                    Signed in as <strong>{user.name || user.email}</strong>.{" "}
                    <button
                      type="button"
                    className="login-cta__link"
                    onClick={() => router.push("/admin/signout?next=/login")}
                  >
                    Switch account
                  </button>
                  </>
                ) : (
                  "Owners can sign in here to reach the owner portal."
                )}
              </p>
            ) : (
              <p className="login-cta__text">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="login-cta__link"
                  onClick={() => router.push("/signup")}
                >
                  Create a new account
                </button>
              </p>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
