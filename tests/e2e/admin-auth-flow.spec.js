const { test, expect } = require("@playwright/test");

const ADMIN_USER = {
  id: "admin-1",
  name: "Admin One",
  email: "admin@smracing.com",
  role: "ADMIN",
  is_active: true,
  created_at: "2026-05-04T12:00:00.000Z",
  updated_at: "2026-05-04T12:00:00.000Z",
  last_login_at: "2026-05-04T12:00:00.000Z",
  last_logout_at: null,
};

async function mockAdminAuthRoutes(page) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === "/api/v1/auth/admin-login" && method === "POST") {
      return route.fulfill({
        json: {
          access_token: "admin-token",
          token_type: "bearer",
        },
      });
    }

    if (pathname === "/api/v1/auth/me" && method === "GET") {
      return route.fulfill({
        json: ADMIN_USER,
      });
    }

    if (pathname === "/api/v1/auth/logout" && method === "POST") {
      return route.fulfill({
        json: {
          message: "Logged out successfully",
        },
      });
    }

    if (pathname === "/api/v1/users" && method === "GET") {
      return route.fulfill({
        json: {
          users: [],
        },
      });
    }

    return route.fulfill({
      status: 200,
      json: {},
    });
  });
}

test.describe("admin auth flow", () => {
  test("admin login authenticates and reaches the admin portal", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("sm2_token");
      localStorage.removeItem("sm2_user");
    });

    await mockAdminAuthRoutes(page);

    await page.goto("/admin/login");
    await expect(page.getByText("RACE CONTROL")).toBeVisible();
    await expect(page.getByText("Admin Portal Access")).toBeVisible();

    await page.getByLabel("Email Address").fill("admin@smracing.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Login" }).click();

    await page.waitForURL("**/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("admin sign out revokes the token and returns to admin login", async ({ page }) => {
    await page.addInitScript((user) => {
      localStorage.setItem("sm2_token", "admin-token");
      localStorage.setItem("sm2_user", JSON.stringify(user));
    }, ADMIN_USER);

    await mockAdminAuthRoutes(page);

    await page.goto("/admin/signout?next=/admin/login");
    await expect(page.getByText("RACE CONTROL")).toBeVisible();
    await expect(page.getByText("Admin Portal Sign Out")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signed out successfully" })).toBeVisible();
    await expect(page.getByText("Session cleared and token revoked successfully.")).toBeVisible();

    await page.waitForURL("**/admin/login");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("sm2_token"))).toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("sm2_user"))).toBeNull();
  });
});
