import { Suspense } from "react";

import LoginClient from "../../login/LoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginClient mode="admin" />
    </Suspense>
  );
}
