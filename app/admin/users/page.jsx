"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SortOutlinedIcon from "@mui/icons-material/SortOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { useAuth } from "../../context/AuthContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import Loader from "../../components/Common/Loader";
import StatusBadge from "../../components/Common/StatusBadge";
import { DrawerShell, EmptyStatePanel, MetricCard } from "../fleet/_components/ManagementUi";
import { createAdminUser, getUsers, resetUserPassword } from "../../utils/authApi";
import "../fleet/fleetManagement.css";
import "./UsersManagement.css";

const INITIAL_FORM_VALUES = {
  name: "",
  email: "",
  password: "",
  role: "MECHANIC",
};

const INITIAL_PASSWORD_FORM_VALUES = {
  password: "",
  confirmPassword: "",
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "mechanic", label: "Mechanic" },
];

const SORT_OPTIONS = [
  { value: "latest", label: "Latest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
];

const normalizeRole = (role) => String(role || "MECHANIC").toUpperCase();

const formatRoleLabel = (role) => {
  const normalized = normalizeRole(role);
  return `${normalized.charAt(0)}${normalized.slice(1).toLowerCase()}`;
};

const getRoleTone = (role) => {
  switch (normalizeRole(role)) {
    case "OWNER":
      return "accent";
    case "ADMIN":
      return "success";
    default:
      return "neutral";
  }
};

const getAccountTone = (isActive) => (isActive === false ? "danger" : "success");

const getAccountLabel = (isActive) => (isActive === false ? "Inactive" : "Active");

const formatDate = (value) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const buildSearchText = (user) =>
  [user.name, user.email, user.role, getAccountLabel(user.isActive)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const sortUsers = (users, mode) => {
  const compareByName = (left, right) =>
    (left.name || "").localeCompare(right.name || "", undefined, {
      sensitivity: "base",
    });

  const compareByCreatedAt = (left, right) =>
    new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();

  const sorted = [...users];

  switch (mode) {
    case "oldest":
      return sorted.sort(
        (left, right) => compareByCreatedAt(left, right) || compareByName(left, right),
      );
    case "name":
      return sorted.sort(
        (left, right) => compareByName(left, right) || compareByCreatedAt(right, left),
      );
    case "latest":
    default:
      return sorted.sort(
        (left, right) => compareByCreatedAt(right, left) || compareByName(left, right),
      );
  }
};

const getApiErrorMessage = (error, fallback) => {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.detail || error.message || error.error || fallback;
};

export default function UsersManagement() {
  const router = useRouter();
  const { logout, user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_VALUES);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortMode, setSortMode] = useState("latest");
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState(INITIAL_PASSWORD_FORM_VALUES);
  const [passwordError, setPasswordError] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const refreshUsers = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");

      const response = await getUsers();
      setUsers(response.users || []);
    } catch (error) {
      console.error("Failed to load users:", error);
      setUsers([]);
      setPageError(getApiErrorMessage(error, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (!notice) return undefined;

    const timeout = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const summaryCounts = useMemo(() => {
    const activeUsers = users.filter((user) => user.isActive !== false).length;
    const inactiveUsers = users.length - activeUsers;
    const elevatedUsers = users.filter((user) =>
      ["OWNER", "ADMIN"].includes(normalizeRole(user.role)),
    ).length;

    return {
      total: users.length,
      active: activeUsers,
      inactive: inactiveUsers,
      elevated: elevatedUsers,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let nextUsers = [...users];

    if (query) {
      nextUsers = nextUsers.filter((user) => buildSearchText(user).includes(query));
    }

    if (statusFilter !== "all") {
      nextUsers = nextUsers.filter((user) => {
        const isActive = user.isActive !== false;
        return statusFilter === "active" ? isActive : !isActive;
      });
    }

    if (roleFilter !== "all") {
      nextUsers = nextUsers.filter(
        (user) => normalizeRole(user.role).toLowerCase() === roleFilter,
      );
    }

    return sortUsers(nextUsers, sortMode);
  }, [roleFilter, searchQuery, sortMode, statusFilter, users]);

  const hasFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== "all" ||
    roleFilter !== "all" ||
    sortMode !== "latest";

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setRoleFilter("all");
    setSortMode("latest");
  };

  const handleFormChange = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));

    if (formError) {
      setFormError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);

    const name = formData.name.trim();
    const email = formData.email.trim();
    const password = formData.password;
    const role = normalizeRole(formData.role);

    if (!name || !email || !password) {
      setFormError("Please fill in name, email, and password.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await createAdminUser({
        name,
        email,
        password,
        role,
      });

      const createdUser = response.user;

      setUsers((current) => [createdUser, ...current.filter((user) => user.id !== createdUser.id)]);
      setFormData(INITIAL_FORM_VALUES);
      setShowForm(false);
      setNotice({
        tone: "success",
        title: "User created",
        message: `${createdUser.name} has been added to the system and can sign in immediately.`,
      });
    } catch (error) {
      console.error("Failed to create user:", error);
      setFormError(getApiErrorMessage(error, "Failed to create user. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const canResetPassword = useCallback(
    (targetUser) => {
      const currentRole = normalizeRole(currentUser?.role);
      const targetRole = normalizeRole(targetUser?.role);

      if (!targetUser?.id || !currentUser?.id) {
        return false;
      }

      if (currentRole === "OWNER") {
        return true;
      }

      if (targetRole === "OWNER") {
        return false;
      }

      return currentRole === "ADMIN";
    },
    [currentUser],
  );

  const getPasswordActionTitle = (targetUser) => {
    if (canResetPassword(targetUser)) {
      return `Change password for ${targetUser.name}`;
    }

    if (normalizeRole(targetUser.role) === "OWNER") {
      return "Only an owner can reset an owner password";
    }

    return "You do not have access to reset this password";
  };

  const openPasswordPanel = (targetUser) => {
    setPasswordTarget(targetUser);
    setPasswordForm(INITIAL_PASSWORD_FORM_VALUES);
    setPasswordError("");
  };

  const closePasswordPanel = () => {
    if (isResettingPassword) return;
    setPasswordTarget(null);
    setPasswordForm(INITIAL_PASSWORD_FORM_VALUES);
    setPasswordError("");
  };

  const handlePasswordFormChange = (field, value) => {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (passwordError) {
      setPasswordError("");
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();

    if (!passwordTarget) return;

    const nextPassword = passwordForm.password.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!nextPassword || !confirmPassword) {
      setPasswordError("Enter and confirm the new temporary password.");
      return;
    }

    if (nextPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordError("Password confirmation does not match.");
      return;
    }

    try {
      setIsResettingPassword(true);
      setPasswordError("");

      const response = await resetUserPassword(passwordTarget.id, nextPassword);
      const updatedUser = response.user;

      setUsers((current) =>
        current.map((user) => (user.id === updatedUser.id ? { ...user, ...updatedUser } : user)),
      );
      setNotice({
        tone: "success",
        title: "Password updated",
        message: `${updatedUser.name} can now sign in with the new temporary password.`,
      });
      setPasswordTarget(null);
      setPasswordForm(INITIAL_PASSWORD_FORM_VALUES);
      setPasswordError("");
    } catch (error) {
      console.error("Failed to reset password:", error);
      setPasswordError(getApiErrorMessage(error, "Failed to update password. Please try again."));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const NoticeIcon = notice?.tone === "danger" ? ErrorOutlineOutlinedIcon : CheckCircleOutlineOutlinedIcon;
  const PageErrorIcon = ErrorOutlineOutlinedIcon;

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="fleet-page users-management-page">
        <div className="fleet-page-shell">
          <header className="fleet-page-header">
            <div className="fleet-page-heading">
              <p className="users-page-eyebrow">Admin Operations</p>
              <h1 className="fleet-page-title">User Management</h1>
              <p className="fleet-page-subtitle">
                Manage system users, access roles, and account status from a single high-trust
                operations surface.
              </p>
            </div>

            <div className="fleet-page-actions">
              <button
                onClick={() => setShowForm((current) => !current)}
                className="fleet-btn fleet-btn-primary"
                type="button"
              >
                <AddOutlinedIcon sx={{ fontSize: 18 }} />
                {showForm ? "Hide Form" : "Create User"}
              </button>
              <button
                onClick={() => router.push("/admin/events")}
                className="fleet-btn fleet-btn-secondary"
                type="button"
              >
                Events
              </button>
              <button onClick={logout} className="fleet-btn fleet-btn-secondary" type="button">
                Logout
              </button>
            </div>
          </header>

          {pageError ? (
            <div className="fleet-notice fleet-notice-danger" role="alert">
              <div className="fleet-notice-icon" aria-hidden="true">
                <PageErrorIcon fontSize="inherit" />
              </div>
              <div className="fleet-notice-copy">
                <p className="fleet-notice-title">Unable to load users</p>
                <p className="fleet-notice-message">{pageError}</p>
              </div>
            </div>
          ) : null}

          {notice ? (
            <div className={`fleet-notice fleet-notice-${notice.tone}`} role="status">
              <div className="fleet-notice-icon" aria-hidden="true">
                <NoticeIcon fontSize="inherit" />
              </div>
              <div className="fleet-notice-copy">
                <p className="fleet-notice-title">{notice.title}</p>
                <p className="fleet-notice-message">{notice.message}</p>
              </div>
            </div>
          ) : null}

          <section className="fleet-page-section">
            <div className="fleet-summary-grid">
              <MetricCard
                icon={PeopleAltOutlinedIcon}
                value={summaryCounts.total}
                label="Total Users"
                helper="All accounts with access to the admin system."
                tone="accent"
              />
              <MetricCard
                icon={CheckCircleOutlineOutlinedIcon}
                value={summaryCounts.active}
                label="Active Users"
                helper="Enabled accounts currently allowed to sign in."
                tone="success"
              />
              <MetricCard
                icon={ArchiveOutlinedIcon}
                value={summaryCounts.inactive}
                label="Inactive Users"
                helper="Disabled accounts retained for audit visibility."
                tone="danger"
              />
              <MetricCard
                icon={AdminPanelSettingsOutlinedIcon}
                value={summaryCounts.elevated}
                label="Elevated Roles"
                helper="Owner and admin access holders."
                tone="neutral"
              />
            </div>
          </section>

          <section className="fleet-page-section">
            <div className="fleet-section-header">
              <div>
                <h2 className="fleet-section-title">User Directory</h2>
                <p className="fleet-section-subtitle">
                  Search by name, email, or role. Filters keep active and inactive accounts easy to
                  manage.
                </p>
              </div>
            </div>

            <div className="fleet-toolbar">
              <div className="fleet-field fleet-search-field" style={{ gridColumn: "1 / -1" }}>
                <label className="fleet-label" htmlFor="user-search">
                  Search
                </label>
                <div className="fleet-search-input-wrap">
                  <SearchOutlinedIcon className="fleet-search-icon" sx={{ fontSize: 18 }} />
                  <input
                    id="user-search"
                    className="fleet-input"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search users by name, email, or role..."
                    type="search"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="fleet-field">
                <label className="fleet-label" htmlFor="user-status-filter">
                  Status
                </label>
                <select
                  id="user-status-filter"
                  className="fleet-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fleet-field">
                <label className="fleet-label" htmlFor="user-role-filter">
                  Role
                </label>
                <select
                  id="user-role-filter"
                  className="fleet-select"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  {ROLE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fleet-field">
                <label className="fleet-label" htmlFor="user-sort-mode">
                  Sort
                </label>
                <select
                  id="user-sort-mode"
                  className="fleet-select"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="users-toolbar-meta">
              <span>
                Showing {filteredUsers.length} of {users.length} users
              </span>

              <div className="fleet-page-actions">
                {hasFilters ? (
                  <button type="button" className="fleet-btn fleet-btn-secondary" onClick={resetFilters}>
                    <TuneOutlinedIcon sx={{ fontSize: 18 }} />
                    Reset Filters
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {showForm ? (
            <section className="users-form-card">
              <div className="users-form-header">
                <div>
                  <h3 className="fleet-section-title">Create New User</h3>
                  <p className="users-form-copy">
                    New accounts are created active by default and can log in immediately once the
                    credentials are shared.
                  </p>
                </div>

                <StatusBadge label="ACTIVE BY DEFAULT" tone="success" />
              </div>

              <form onSubmit={handleSubmit}>
                <div className="fleet-form-grid">
                  <div className="fleet-field fleet-span-2">
                    <label className="fleet-label" htmlFor="user-name">
                      Name
                    </label>
                    <input
                      id="user-name"
                      type="text"
                      className="fleet-input"
                      placeholder="Full name"
                      value={formData.name}
                      onChange={(event) => handleFormChange("name", event.target.value)}
                      autoComplete="name"
                    />
                  </div>

                  <div className="fleet-field">
                    <label className="fleet-label" htmlFor="user-email">
                      Email
                    </label>
                    <input
                      id="user-email"
                      type="email"
                      className="fleet-input"
                      placeholder="Email address"
                      value={formData.email}
                      onChange={(event) => handleFormChange("email", event.target.value)}
                      autoComplete="email"
                    />
                  </div>

                  <div className="fleet-field">
                    <label className="fleet-label" htmlFor="user-password">
                      Password
                    </label>
                    <input
                      id="user-password"
                      type="password"
                      className="fleet-input"
                      placeholder="Temporary password"
                      value={formData.password}
                      onChange={(event) => handleFormChange("password", event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="fleet-field fleet-span-2">
                    <label className="fleet-label" htmlFor="user-role">
                      Role
                    </label>
                    <select
                      id="user-role"
                      className="fleet-select"
                      value={formData.role}
                      onChange={(event) => handleFormChange("role", event.target.value)}
                    >
                      <option value="MECHANIC">MECHANIC</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="OWNER">OWNER</option>
                    </select>
                  </div>
                </div>

                {formError ? (
                  <div
                    className="fleet-notice fleet-notice-danger"
                    role="alert"
                    style={{ marginTop: "1rem" }}
                  >
                    <div className="fleet-notice-icon" aria-hidden="true">
                      <ErrorOutlineOutlinedIcon fontSize="inherit" />
                    </div>
                    <div className="fleet-notice-copy">
                      <p className="fleet-notice-title">Check the form</p>
                      <p className="fleet-notice-message">{formError}</p>
                    </div>
                  </div>
                ) : null}

                <div className="users-form-actions">
                  <button
                    type="button"
                    className="fleet-btn fleet-btn-secondary"
                    onClick={() => {
                      setShowForm(false);
                      setFormError("");
                      setFormData(INITIAL_FORM_VALUES);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="fleet-btn fleet-btn-primary" disabled={isSaving}>
                    <AddOutlinedIcon sx={{ fontSize: 18 }} />
                    {isSaving ? "Saving..." : "Save User"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="fleet-page-section">
            <div className="fleet-table-card users-table-card">
              <div className="fleet-table-scroll">
                {loading ? (
                  <Loader
                    label="Loading users"
                    fullHeight={false}
                    sublabel="Fetching the latest access directory."
                  />
                ) : filteredUsers.length ? (
                  <div
                    className="fleet-table"
                    style={{ "--fleet-columns": "1.35fr 1.9fr 0.9fr 0.9fr 0.9fr 1.1fr" }}
                  >
                    <div className="fleet-table-header">
                      <div className="fleet-table-header-cell">Name</div>
                      <div className="fleet-table-header-cell">Email</div>
                      <div className="fleet-table-header-cell">Role</div>
                      <div className="fleet-table-header-cell">Status</div>
                      <div className="fleet-table-header-cell">Created</div>
                      <div className="fleet-table-header-cell">Admin Actions</div>
                    </div>

                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`fleet-table-row ${user.isActive === false ? "inactive" : ""}`}
                      >
                        <div className="fleet-table-cell" data-label="Name">
                          <div className="fleet-cell-stack">
                            <strong>{user.name}</strong>
                            <span className="fleet-muted">Access account</span>
                          </div>
                        </div>

                        <div className="fleet-table-cell fleet-muted" data-label="Email">
                          {user.email}
                        </div>

                        <div className="fleet-table-cell" data-label="Role">
                          <StatusBadge label={formatRoleLabel(user.role)} tone={getRoleTone(user.role)} />
                        </div>

                        <div className="fleet-table-cell" data-label="Status">
                          <StatusBadge
                            label={getAccountLabel(user.isActive)}
                            tone={getAccountTone(user.isActive)}
                          />
                        </div>

                        <div className="fleet-table-cell fleet-mono" data-label="Created">
                          {formatDate(user.createdAt)}
                        </div>

                        <div className="fleet-table-cell users-action-cell" data-label="Admin Actions">
                          <button
                            type="button"
                            className="users-password-action"
                            onClick={() => openPasswordPanel(user)}
                            disabled={!canResetPassword(user)}
                            title={getPasswordActionTitle(user)}
                            aria-label={getPasswordActionTitle(user)}
                          >
                            <LockResetOutlinedIcon sx={{ fontSize: 18 }} />
                            Change PW
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyStatePanel
                    icon={PeopleAltOutlinedIcon}
                    title="No users found"
                    description={
                      hasFilters
                        ? "Adjust the search or filters to surface more accounts, or reset the view to show everything."
                        : "Create the first access account to start managing the admin directory."
                    }
                    action={
                      hasFilters ? (
                        <div className="fleet-page-actions">
                          <button
                            type="button"
                            className="fleet-btn fleet-btn-secondary"
                            onClick={resetFilters}
                          >
                            <SortOutlinedIcon sx={{ fontSize: 18 }} />
                            Reset Filters
                          </button>
                          <button
                            type="button"
                            className="fleet-btn fleet-btn-primary"
                            onClick={() => setShowForm(true)}
                          >
                            <AddOutlinedIcon sx={{ fontSize: 18 }} />
                            Create User
                          </button>
                        </div>
                      ) : (
                        <div className="fleet-page-actions">
                          <button
                            type="button"
                            className="fleet-btn fleet-btn-primary"
                            onClick={() => setShowForm(true)}
                          >
                            <AddOutlinedIcon sx={{ fontSize: 18 }} />
                            Create User
                          </button>
                        </div>
                      )
                    }
                  />
                )}
              </div>
            </div>
          </section>

          <DrawerShell
            open={Boolean(passwordTarget)}
            title="Change User Password"
            subtitle={
              passwordTarget
                ? `Set a new temporary password for ${passwordTarget.name}. Passwords are never displayed after saving.`
                : ""
            }
            onClose={isResettingPassword ? undefined : closePasswordPanel}
            footer={
              <>
                <button
                  type="button"
                  className="fleet-btn fleet-btn-secondary"
                  onClick={closePasswordPanel}
                  disabled={isResettingPassword}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="user-password-reset-form"
                  className="fleet-btn fleet-btn-primary"
                  disabled={isResettingPassword}
                >
                  <LockResetOutlinedIcon sx={{ fontSize: 18 }} />
                  {isResettingPassword ? "Updating..." : "Update Password"}
                </button>
              </>
            }
          >
            <form
              id="user-password-reset-form"
              className="users-password-form"
              onSubmit={handlePasswordReset}
            >
              <div className="users-password-target-card">
                <div className="users-password-target-icon" aria-hidden="true">
                  <LockResetOutlinedIcon fontSize="small" />
                </div>
                <div>
                  <p className="users-password-target-label">Selected Account</p>
                  <h3>{passwordTarget?.name || "User"}</h3>
                  <p>{passwordTarget?.email || "-"}</p>
                </div>
                {passwordTarget ? (
                  <StatusBadge
                    label={formatRoleLabel(passwordTarget.role)}
                    tone={getRoleTone(passwordTarget.role)}
                  />
                ) : null}
              </div>

              <div className="fleet-form-grid">
                <div className="fleet-field">
                  <label className="fleet-label" htmlFor="reset-user-password">
                    New Temporary Password
                  </label>
                  <input
                    id="reset-user-password"
                    type="password"
                    className="fleet-input"
                    placeholder="Minimum 8 characters"
                    value={passwordForm.password}
                    onChange={(event) => handlePasswordFormChange("password", event.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <div className="fleet-field">
                  <label className="fleet-label" htmlFor="reset-user-password-confirm">
                    Confirm Password
                  </label>
                  <input
                    id="reset-user-password-confirm"
                    type="password"
                    className="fleet-input"
                    placeholder="Re-enter password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      handlePasswordFormChange("confirmPassword", event.target.value)
                    }
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <p className="users-password-helper">
                Share the temporary password through a secure channel. The user should replace it
                after sign-in when self-service password change is added.
              </p>

              {passwordError ? (
                <div className="fleet-notice fleet-notice-danger users-password-error" role="alert">
                  <div className="fleet-notice-icon" aria-hidden="true">
                    <ErrorOutlineOutlinedIcon fontSize="inherit" />
                  </div>
                  <div className="fleet-notice-copy">
                    <p className="fleet-notice-title">Password not updated</p>
                    <p className="fleet-notice-message">{passwordError}</p>
                  </div>
                </div>
              ) : null}
            </form>
          </DrawerShell>
        </div>
      </div>
    </ProtectedRoute>
  );
}
