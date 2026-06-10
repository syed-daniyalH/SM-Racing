const { test, expect } = require("@playwright/test");
const fs = require("fs");

const OWNER_USER = {
  id: "owner-1",
  name: "Alex Owner",
  email: "owner@smracing.com",
  role: "OWNER",
  is_active: true,
};

const makeSubmission = ({
  id,
  submissionRef,
  driverFirstName,
  driverLastName,
  driverCode,
  vehicleMake,
  vehicleModel,
  vehicleCode,
  eventName,
  trackName,
  date,
  time,
  sessionNumber,
  runGroup,
  createdAt,
  updatedAt,
}) => ({
  id,
  submission_ref: submissionRef,
  event: {
    id: `${id}-event`,
    name: eventName,
    track: trackName,
  },
  run_group: {
    id: `${id}-group`,
    label: runGroup,
    displayName: runGroup,
    normalized: runGroup,
    rawText: runGroup,
  },
  driver: {
    id: `${id}-driver`,
    first_name: driverFirstName,
    last_name: driverLastName,
    driver_id: driverCode,
  },
  vehicle: {
    id: `${id}-vehicle`,
    make: vehicleMake,
    model: vehicleModel,
    vehicle_id: vehicleCode,
  },
  payload: {
    date,
    time,
    track: trackName,
    driver_id: driverCode,
    vehicle_id: vehicleCode,
    session_type: "Practice",
    session_number: sessionNumber,
    duration_min: 20,
    notes: `${driverFirstName} ${driverLastName} session notes`,
  },
  analysis_result: {
    source_type: "notes",
    confidence: 0.93,
    validation_state: "VALIDATED",
    review_state: "APPROVED",
    parser_version: "test-export-1",
    audit_snippet: "Submission exported from test fixture.",
  },
  raw_text: `${driverFirstName} ${driverLastName} session notes`,
  status: "SENT",
  created_at: createdAt,
  updated_at: updatedAt,
});

const SUBMISSIONS = [
  makeSubmission({
    id: "SUB-A",
    submissionRef: "SUB-A",
    driverFirstName: "Alex",
    driverLastName: "Stone",
    driverCode: "DRV-A",
    vehicleMake: "Apex",
    vehicleModel: "GT4",
    vehicleCode: "CAR-A",
    eventName: "Alpha Event",
    trackName: "Alpha Circuit",
    date: "2026-06-01",
    time: "09:30",
    sessionNumber: 1,
    runGroup: "A",
    createdAt: "2026-06-01T09:31:00.000Z",
    updatedAt: "2026-06-01T09:32:00.000Z",
  }),
  makeSubmission({
    id: "SUB-B",
    submissionRef: "SUB-B",
    driverFirstName: "Blake",
    driverLastName: "Rivers",
    driverCode: "DRV-B",
    vehicleMake: "Bolt",
    vehicleModel: "GT3",
    vehicleCode: "CAR-B",
    eventName: "Bravo Event",
    trackName: "Bravo Raceway",
    date: "2026-06-02",
    time: "10:15",
    sessionNumber: 2,
    runGroup: "B",
    createdAt: "2026-06-02T10:16:00.000Z",
    updatedAt: "2026-06-02T10:17:00.000Z",
  }),
];

async function mockSessionReviewRoutes(page) {
  await page.addInitScript(
    (user) => {
      localStorage.setItem("sm2_token", "owner-token");
      localStorage.setItem("sm2_user", JSON.stringify(user));
    },
    OWNER_USER,
  );

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (method === "GET" && request.url().includes("/api/v1/auth/me")) {
      return route.fulfill({
        json: OWNER_USER,
      });
    }

    if (method === "GET" && request.url().includes("/api/v1/submissions/ocr-intake")) {
      return route.fulfill({
        json: {
          drafts: [],
        },
      });
    }

    if (method === "GET" && pathname.endsWith("/submissions")) {
      return route.fulfill({
        json: {
          submissions: SUBMISSIONS,
        },
      });
    }

    return route.fulfill({
      json: {},
    });
  });
}

async function readDownloadText(download) {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Download path was not available.");
  }

  return fs.readFileSync(downloadPath, "utf8").replace(/^\uFEFF/, "").trim();
}

async function openSessionReviewPage(page) {
  const authResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/v1/auth/me") &&
      response.status() === 200,
  );
  const submissionsResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/v1/submissions") &&
      !response.url().includes("/ocr-intake") &&
      response.status() === 200,
  );
  const draftResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/v1/submissions/ocr-intake") &&
      response.status() === 200,
  );

  await page.goto("/admin/submissions", { waitUntil: "domcontentloaded" });
  await Promise.all([authResponse, submissionsResponse, draftResponse]);
}

test.describe("session review exports", () => {
  test("asks for scope before CSV export and respects the current session selection", async ({ page }) => {
    await mockSessionReviewRoutes(page);

    await openSessionReviewPage(page);
    await expect(page.getByRole("heading", { name: "Session Review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open session SUB-A" })).toBeVisible();

    await page.getByRole("button", { name: "Export CSV" }).click();

    const csvDialog = page.getByRole("dialog", { name: /Choose CSV export scope/i });
    await expect(csvDialog).toBeVisible();
    await expect(csvDialog.getByRole("button", { name: /Export selected\/current session only/i })).toBeDisabled();
    await expect(csvDialog.getByText(/No session is currently selected in the drawer/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(csvDialog).toBeHidden();

    await page.getByRole("button", { name: "Open session SUB-A" }).click();
    await expect(page.getByRole("heading", { name: "Session Details" })).toBeVisible();

    const drawer = page.getByRole("dialog", { name: "Session Details" });
    await drawer.getByRole("button", { name: "Export CSV" }).click();
    await expect(csvDialog).toBeVisible();

    const csvDownloadPromise = page.waitForEvent("download");
    await csvDialog.getByRole("button", { name: /Export selected\/current session only/i }).click();
    const csvDownload = await csvDownloadPromise;

    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
    const csvText = await readDownloadText(csvDownload);
    const csvLines = csvText.split(/\r?\n/);

    expect(csvLines[0]).toBe("Submission ID,Date / Time,Driver,Vehicle,Event,Track,Run Group,Submitted Via");
    expect(csvLines).toHaveLength(2);

    const csvRow = csvLines[1].slice(1, -1).split('","');
    expect(csvRow).toHaveLength(8);
    expect(csvRow[0]).toBe("SUB-A");
    expect(csvRow[2]).toBe("Alex Stone");
    expect(csvRow[3]).toBe("Apex GT4");
    expect(csvRow[4]).toBe("Alpha Event");
    expect(csvRow[5]).toBe("Alpha Circuit");
    expect(csvRow[6]).toBe("A");
  });

  test("exports the filtered session list as Excel", async ({ page }) => {
    await mockSessionReviewRoutes(page);

    await openSessionReviewPage(page);
    await expect(page.getByRole("heading", { name: "Session Review" })).toBeVisible();

    await page.getByLabel("Search").fill("Blake");
    await expect(page.getByRole("button", { name: "Open session SUB-B" })).toBeVisible();

    await page.getByRole("button", { name: "Export Excel" }).click();

    const excelDialog = page.getByRole("dialog", { name: /Choose Excel export scope/i });
    await expect(excelDialog).toBeVisible();

    const excelDownloadPromise = page.waitForEvent("download");
    await excelDialog.getByRole("button", { name: /Export all sessions/i }).click();
    const excelDownload = await excelDownloadPromise;

    expect(excelDownload.suggestedFilename()).toMatch(/\.xls$/);
    const excelText = await readDownloadText(excelDownload);
    const excelLines = excelText.split(/\r?\n/);

    expect(excelLines[0]).toBe("Submission ID\tDate / Time\tDriver\tVehicle\tEvent\tTrack\tRun Group\tSubmitted Via");
    expect(excelLines).toHaveLength(2);

    const excelRow = excelLines[1].split("\t");
    expect(excelRow).toHaveLength(8);
    expect(excelRow[0]).toBe("SUB-B");
    expect(excelRow[2]).toBe("Blake Rivers");
    expect(excelRow[3]).toBe("Bolt GT3");
    expect(excelRow[4]).toBe("Bravo Event");
    expect(excelRow[5]).toBe("Bravo Raceway");
    expect(excelRow[6]).toBe("B");
  });
});
