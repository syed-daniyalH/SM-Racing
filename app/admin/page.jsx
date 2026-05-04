"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../context/AuthContext";

export default function AdminPortalEntry() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    const currentRole = String(user?.role || "").toUpperCase();
    const hasAdminAccess = currentRole === "OWNER" || currentRole === "ADMIN";

    router.replace(hasAdminAccess ? "/admin/users" : "/admin/login");
  }, [loading, router, user]);

  return null;
}
