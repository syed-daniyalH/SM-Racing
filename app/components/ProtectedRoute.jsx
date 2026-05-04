"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireMechanic = false,
}) {
  const router = useRouter();
  const { user, loading, isAdmin, isMechanic } = useAuth();

  useEffect(() => {
    if (loading) return;

    const loginPath = requireAdmin ? "/admin/login" : "/login";

    if (!user) {
      router.push(loginPath);
      return;
    }

    if (requireAdmin && !isAdmin()) {
      router.push("/admin/login?access=denied");
      return;
    }

    if (requireMechanic && !isMechanic()) {
      router.push("/login");
      return;
    }
  }, [user, loading, requireAdmin, requireMechanic, router]); // Removed isAdmin and isMechanic (they're functions)

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-primary)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            color: "var(--color-text)",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>🏁</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireAdmin && !isAdmin()) {
    return null;
  }

  if (requireMechanic && !isMechanic()) {
    return null;
  }

  return <>{children}</>;
}
