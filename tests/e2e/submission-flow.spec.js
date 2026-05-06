const { test, expect } = require("@playwright/test");

const EVENT_ID = "event-1";
const TRACK_NAME = "Sebring International Raceway";
const SUBMISSION_REF = "SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025";
const QUICK_TRANSCRIPT = "voice transcript note";
const QUICK_PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X2XW4wAAAABJRU5ErkJggg==",
  "base64",
);

const makeDateTime = (isoString) => new Date(isoString).toISOString();

const makeSessionData = ({ tireStatus = "DISCARDED" } = {}) => ({
  date: "2026-04-23",
  time: "15:31",
  track: TRACK_NAME,
  driver_id: "NG",
  vehicle_id: "NG-GT4-2025",
  session_type: "Practice",
  session_number: 3,
  duration_min: 10,
  tire_set: "Y-S3",
  wheelbase_mm: 2550,
  pressures: {
    cold: { fl: 22, fr: 21, rl: 22, rr: 23 },
    hot: { fl: 24, fr: 23, rl: 24, rr: 25 },
  },
  suspension: {
    rebound_fl: 12,
    rebound_fr: 12,
    rebound_rl: 11,
    rebound_rr: 11,
    bump_fl: 5,
    bump_fr: 5,
    bump_rl: 4,
    bump_rr: 4,
    sway_bar_f: "1",
    sway_bar_r: "2",
    wing_angle_deg: 15,
  },
  alignment: {
    camber_fl: -1.5,
    camber_fr: -1.4,
    camber_rl: -2.0,
    camber_rr: -2.0,
    toe_front: "0.05",
    toe_rear: "0.10",
    caster_l: 6.5,
    caster_r: 6.4,
    ride_height_f: 65,
    ride_height_r: 68,
    corner_weight_fl: 310,
    corner_weight_fr: 315,
    corner_weight_rl: 320,
    corner_weight_rr: 322,
    cross_weight_pct: 50.5,
    rake_mm: 3.0,
    wheelbase_mm: 2550,
  },
  tire_temperatures: {
    fl_in: 78.5,
    fl_mid: 80.0,
    fl_out: 82.1,
    fr_in: 77.2,
    fr_mid: 79.0,
    fr_out: 81.3,
    rl_in: 74.0,
    rl_mid: 75.1,
    rl_out: 76.8,
    rr_in: 73.8,
    rr_mid: 75.0,
    rr_out: 76.5,
  },
  tire_inventory: {
    tire_id: "Y-S3",
    manufacturer: "Yokohama",
    model: "S3",
    size: "S3",
    purchase_date: "2026-04-14",
    heat_cycles: 2,
    track_time_min: 15,
    status: tireStatus,
  },
});

async function mockSubmissionApp(page, options = {}) {
  const submissionRequests = [];
  const rawSubmissionRequests = [];
  const buildSubmissionResponse =
    options.buildSubmissionResponse ||
    ((body) => ({
      submission_ref: body.submission_ref,
      correlation_id: body.correlation_id,
      status: "SENT",
      raw_text: body.raw_text ?? null,
      image_url: body.image_url ?? null,
      payload: body.payload,
      analysis_result: body.analysis_result,
      created_at: makeDateTime("2026-04-23T15:31:00.000Z"),
      updated_at: makeDateTime("2026-04-23T15:33:00.000Z"),
    }));
  const buildRawSubmissionResponse =
    options.buildRawSubmissionResponse ||
    ((body) => ({
      status: "SUCCESS",
      id_seance: "20260423-NG-S01",
      message: "Session stored successfully",
      raw_text: body.raw_text,
    }));

  await page.addInitScript(
    ({ transcript, token }) => {
      localStorage.setItem("sm2_token", token);
      localStorage.setItem(
        "sm2_user",
        JSON.stringify({
          id: "user-1",
          role: "MECHANIC",
          name: "Mechanic One",
        }),
      );

      class FakeSpeechRecognition {
        constructor() {
          this.lang = "en-US";
          this.interimResults = true;
          this.maxAlternatives = 1;
          this.continuous = false;
        }

        start() {
          if (typeof this.onstart === "function") {
            this.onstart();
          }

          queueMicrotask(() => {
            if (typeof this.onresult === "function") {
              this.onresult({
                resultIndex: 0,
                results: [
                  {
                    isFinal: true,
                    0: { transcript },
                  },
                ],
              });
            }

            if (typeof this.onend === "function") {
              this.onend();
            }
          });
        }

        stop() {
          if (typeof this.onend === "function") {
            this.onend();
          }
        }

        abort() {}
      }

      window.SpeechRecognition = FakeSpeechRecognition;
      window.webkitSpeechRecognition = FakeSpeechRecognition;
    },
    { transcript: QUICK_TRANSCRIPT, token: "test-token" },
  );

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === "/api/v1/auth/me") {
      return route.fulfill({
        json: {
          user: {
            id: "user-1",
            role: "MECHANIC",
            name: "Mechanic One",
            email: "mechanic@example.com",
          },
        },
      });
    }

    if (pathname === `/api/v1/events/${EVENT_ID}` && method === "GET") {
      return route.fulfill({
        json: {
          event: {
            id: EVENT_ID,
            name: "Sebring",
            track: TRACK_NAME,
            start_date: "2026-04-20T00:00:00.000Z",
            end_date: "2026-05-01T00:00:00.000Z",
            is_active: true,
          },
        },
      });
    }

    if (pathname === `/api/v1/events/${EVENT_ID}/select` && method === "POST") {
      return route.fulfill({
        json: {
          event: {
            id: EVENT_ID,
            name: "Sebring",
            track: TRACK_NAME,
          },
        },
      });
    }

    if (pathname === `/api/v1/run-groups/event/${EVENT_ID}` && method === "GET") {
      return route.fulfill({
        json: {
          runGroup: {
            id: "run-group-1",
            event_id: EVENT_ID,
            normalized: "BLUE",
            raw_text: "BLUE",
            locked: false,
          },
        },
      });
    }

    if (pathname === "/api/v1/drivers" && method === "GET") {
      return route.fulfill({
        json: {
          drivers: [
            {
              id: "driver-1",
              driver_id: "NG",
              first_name: "Nicolas",
              last_name: "Guigère",
              driver_name: "Nicolas Guigère",
              team_name: "Blue",
              is_active: true,
            },
          ],
        },
      });
    }

    if (pathname === "/api/v1/vehicles" && method === "GET") {
      return route.fulfill({
        json: {
          vehicles: [
            {
              id: "vehicle-1",
              vehicle_id: "NG-GT4-2025",
              driver_id: "NG",
              make: "Porsche",
              model: "GT4 RS Clubsport",
              year: 2025,
              is_active: true,
            },
          ],
        },
      });
    }

    if (pathname === "/api/v1/tracks" && method === "GET") {
      return route.fulfill({
        json: {
          tracks: [
            {
              name: TRACK_NAME,
              country: "USA",
              active: true,
            },
          ],
        },
      });
    }

    if (pathname === "/api/v1/submissions" && method === "POST") {
      const body = request.postDataJSON();
      submissionRequests.push(body);
      return route.fulfill({
        status: 201,
        json: {
          submission: buildSubmissionResponse(body),
        },
      });
    }

    if (pathname === "/api/v1/submissions/raw" && method === "POST") {
      const body = request.postDataJSON();
      rawSubmissionRequests.push(body);
      const rawResponse = buildRawSubmissionResponse(body);
      const statusCode =
        rawResponse?.statusCode ||
        rawResponse?.httpStatus ||
        (String(rawResponse?.status || "").toUpperCase() === "VALIDATION_FAILED" ? 400 : 201);
      const responseBody = rawResponse?.body || rawResponse;

      return route.fulfill({
        status: statusCode,
        json: responseBody,
      });
    }

    return route.fulfill({ status: 200, json: {} });
  });

  submissionRequests.rawSubmissionRequests = rawSubmissionRequests;
  return submissionRequests;
}

test.describe("submission flow", () => {
  test("detail submissions only render structured inputs and reject empty submits", async ({
    page,
  }) => {
    const requests = await mockSubmissionApp(page);

    await page.goto(`/event/${EVENT_ID}/notes`);
    await expect(page.getByRole("heading", { name: "Submit Notes" })).toBeVisible();
    await page.getByTestId("submission-tab-detail").click();
    await expect(
      page.locator('select[data-testid="submission-track-select"] option[value="__OTHER__"]'),
    ).toHaveText("Other (type manually)");

    await expect(page.getByTestId("quick-raw-notes")).toHaveCount(0);
    await expect(page.getByTestId("quick-photo-input")).toHaveCount(0);
    await expect(page.getByTestId("quick-voice-control")).toHaveCount(0);

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect(page.getByText("Please fix the highlighted fields before submitting.")).toBeVisible({
      timeout: 5000,
    });
    await expect.poll(() => requests.length).toBe(0);

    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(SUBMISSION_REF);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");
    await page.getByTestId("detail-tire-set").fill("Y-S3");
    await page.getByTestId("detail-tire-status").selectOption("DISCARDED");
    await page.getByTestId("detail-pressure-fl").fill("22.1");
    await page.getByTestId("detail-suspension-rebound-fl").fill("12");
    await page.getByTestId("detail-alignment-camber-fl").fill("-1.5");
    await page.getByTestId("detail-temp-fl-in").fill("78.5");

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.locator(".status-message.status-success")).toBeVisible({
      timeout: 5000,
    });

    const body = requests[0];
    expect(body.raw_text).toBeUndefined();
    expect(body.image_url).toBeUndefined();
    expect(body.analysis_result.voice_input_used).toBeUndefined();
    expect(body.analysis_result.submission_mode).toBe("detail");
    expect(body.payload.track).toBe(TRACK_NAME);
    expect(body.payload.tire_inventory.status).toBe("DISCARDED");
    expect(body.payload.pressures.cold.fl).toBe(22.1);
    expect(body.payload.suspension.rebound_fl).toBe(12);
    expect(body.payload.alignment.camber_fl).toBe(-1.5);
    expect(body.payload.tire_temperatures.fl_in).toBe(78.5);
  });

  test("detail drafts autosave and restore on reload", async ({ page }) => {
    await mockSubmissionApp(page);

    const draftKey = `sm2:submission-draft:${EVENT_ID}:user-1`;

    await page.goto(`/event/${EVENT_ID}/notes`);
    await page.getByTestId("submission-tab-detail").click();
    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-DRAFT`);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");
    await page.getByTestId("detail-pressure-fl").fill("22.1");

    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
      .not.toBeNull();
    await expect(page.getByText("Draft saved locally on this device.")).toBeVisible({
      timeout: 5000,
    });

    await page.reload();
    await page.getByTestId("submission-tab-detail").click();
    await expect(page.getByTestId("submission-date")).toHaveValue("2026-04-23");
    await expect(page.getByTestId("submission-session-id")).toHaveValue(`${SUBMISSION_REF}-DRAFT`);
    await expect(page.getByTestId("submission-track-manual")).toHaveValue(TRACK_NAME);
    await expect(page.getByTestId("submission-driver-select")).toHaveValue("NG");
    await expect(page.getByTestId("submission-vehicle-select")).toHaveValue("NG-GT4-2025");
  });

  test("detail submissions show structured warnings when normalized pressure values are skipped", async ({
    page,
  }) => {
    const requests = await mockSubmissionApp(page, {
      buildSubmissionResponse: (body) => ({
        submission_ref: body.submission_ref,
        correlation_id: body.correlation_id,
        status: "SENT",
        raw_text: body.raw_text ?? null,
        image_url: body.image_url ?? null,
        payload: body.payload,
        analysis_result: body.analysis_result,
        structured_ingest_status: "saved_with_warnings",
        structured_ingest_warnings: [
          {
            section: "pressures",
            code: "VALUE_TOO_HIGH",
            field: "cold_fl",
            value: 112,
            message: "cold_fl must be at most 60.0 to be normalized.",
          },
        ],
        created_at: makeDateTime("2026-04-23T15:31:00.000Z"),
        updated_at: makeDateTime("2026-04-23T15:33:00.000Z"),
      }),
    });

    await page.goto(`/event/${EVENT_ID}/notes`);
    await page.getByTestId("submission-tab-detail").click();
    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-WARN`);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");
    await page.getByTestId("detail-tire-set").fill("Y-S3");
    await page.getByTestId("detail-pressure-fl").fill("112");

    await expect(page.getByText("Pressure values outside the SM2 normalized DB limits")).toBeVisible();

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(
      page.getByText("Note saved. Some structured fields could not be normalized, so review the warnings below."),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("cold_fl: cold_fl must be at most 60.0 to be normalized."),
    ).toBeVisible();
  });

  test("quick submissions preserve raw text, photos, and voice data", async ({ page }) => {
    const requests = await mockSubmissionApp(page);

    await page.goto(`/event/${EVENT_ID}/notes`);
    await expect(page.getByTestId("quick-raw-notes")).toBeVisible();
    await expect(page.getByTestId("quick-photo-input")).toBeVisible();
    await expect(page.getByTestId("quick-voice-control")).toBeVisible();
    await expect(
      page.locator('select[data-testid="submission-track-select"] option[value="__OTHER__"]'),
    ).toHaveText("Other (type manually)");

    await page.getByTestId("quick-raw-notes").fill("front pressures were stable");
    await page.getByTestId("quick-photo-input").setInputFiles({
      name: "quick-photo.png",
      mimeType: "image/png",
      buffer: QUICK_PHOTO,
    });
    await page.waitForTimeout(100);

    await page.getByRole("button", { name: "Start Voice Note" }).click();
    await expect(page.getByTestId("quick-raw-notes")).toHaveValue(/voice transcript note/, {
      timeout: 5000,
    });

    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-QUICK`);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.locator(".status-message.status-success")).toBeVisible({
      timeout: 5000,
    });

    const body = requests[0];
    expect(body.raw_text).toContain("front pressures were stable");
    expect(body.raw_text).toContain(QUICK_TRANSCRIPT);
    expect(body.image_url).toContain("data:image/png;base64,");
    expect(body.analysis_result.voice_input_used).toBe(true);
    expect(body.analysis_result.submission_mode).toBe("quick");
    expect(body.payload.track).toBe(TRACK_NAME);
    expect(body.payload.session_type).toBe("Practice");
  });

  test("quick shorthand submissions route to the raw endpoint even when session number is empty", async ({
    page,
  }) => {
    const requests = await mockSubmissionApp(page, {
      buildRawSubmissionResponse: (body) => ({
        status: "SUCCESS",
        id_seance: "20260423-NG-S01",
        message: "Session stored successfully",
        raw_text: body.raw_text,
      }),
    });

    await page.goto(`/event/${EVENT_ID}/notes`);
    await page.getByTestId("quick-raw-notes").fill("s1 30min nico gt4 Y-S3 pf 27 wb 2450");
    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-RAW`);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");
    await page.getByTestId("submission-session-number").fill("");

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect.poll(() => requests.rawSubmissionRequests.length).toBe(1);
    await expect.poll(() => requests.length).toBe(0);
    await expect(page.getByText("Session stored successfully")).toBeVisible({
      timeout: 5000,
    });

    expect(requests.rawSubmissionRequests[0]).toEqual({
      source: "pwa",
      created_by: "Mechanic One",
      eventId: EVENT_ID,
      runGroup: "BLUE",
      raw_text: "s1 30min nico gt4 Y-S3 pf 27 wb 2450",
    });
  });

  test("raw validation failures are shown clearly in the quick submit flow", async ({ page }) => {
    const requests = await mockSubmissionApp(page, {
      buildRawSubmissionResponse: () => ({
        status: "VALIDATION_FAILED",
        message: "vehicle_id does not belong to driver_id",
        errors: [
          {
            field: "vehicle_id",
            message: "vehicle_id does not belong to driver_id",
          },
        ],
      }),
    });

    await page.goto(`/event/${EVENT_ID}/notes`);
    await page.getByTestId("quick-raw-notes").fill("s1 30min nico gt4 Y-S3 pf 27 wb 2450");
    await page.getByTestId("submission-date").fill("2026-04-23");
    await page.getByTestId("submission-time").fill("15:31");
    await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-RAW-ERR`);
    await page.getByTestId("submission-track-select").selectOption("__OTHER__");
    await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
    await page.getByTestId("submission-driver-select").selectOption("NG");
    await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
    await page.getByTestId("submission-session-type").selectOption("Practice");

    await page.getByRole("button", { name: "Submit Notes" }).click();
    await expect.poll(() => requests.rawSubmissionRequests.length).toBe(1);
    await expect(page.getByText("vehicle_id does not belong to driver_id")).toBeVisible({
      timeout: 5000,
    });
  });

  test("quick submissions handle raw-only, voice-only, and image-only payloads", async ({
    page,
  }) => {
    const requests = await mockSubmissionApp(page);

    const scenarios = [
      {
        name: "raw-only",
        sessionId: `${SUBMISSION_REF}-RAW`,
        setup: async () => {
          await page.getByTestId("quick-raw-notes").fill("rear pressures were stable");
        },
        assert: (body) => {
          expect(body.raw_text).toBe("rear pressures were stable");
          expect(body.image_url).toBeUndefined();
          expect(body.analysis_result.voice_input_used).toBe(false);
        },
      },
      {
        name: "voice-only",
        sessionId: `${SUBMISSION_REF}-VOICE`,
        setup: async () => {
          await page.getByRole("button", { name: "Start Voice Note" }).click();
          await expect(page.getByTestId("quick-raw-notes")).toHaveValue(/voice transcript note/, {
            timeout: 5000,
          });
        },
        assert: (body) => {
          expect(body.raw_text).toContain(QUICK_TRANSCRIPT);
          expect(body.image_url).toBeUndefined();
          expect(body.analysis_result.voice_input_used).toBe(true);
        },
      },
      {
        name: "image-only",
        sessionId: `${SUBMISSION_REF}-IMAGE`,
        setup: async () => {
          await page.getByTestId("quick-photo-input").setInputFiles({
            name: "quick-photo.png",
            mimeType: "image/png",
            buffer: QUICK_PHOTO,
          });
        },
        assert: (body) => {
          expect(body.raw_text).toBeUndefined();
          expect(body.image_url).toContain("data:image/png;base64,");
          expect(body.analysis_result.voice_input_used).toBe(false);
        },
      },
    ];

    for (const scenario of scenarios) {
      requests.length = 0;
      await page.goto(`/event/${EVENT_ID}/notes`);
      await expect(page.getByTestId("quick-raw-notes")).toBeVisible();

      await page.getByTestId("submission-date").fill("2026-04-23");
      await page.getByTestId("submission-time").fill("15:31");
      await page.getByTestId("submission-session-id").fill(scenario.sessionId);
      await page.getByTestId("submission-track-select").selectOption("__OTHER__");
      await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
      await page.getByTestId("submission-driver-select").selectOption("NG");
      await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
      await page.getByTestId("submission-session-type").selectOption("Practice");

      await scenario.setup();
      await page.getByRole("button", { name: "Submit Notes" }).click();

      await expect.poll(() => requests.length).toBe(1);
      const body = requests[0];
      scenario.assert(body);
      expect(body.payload.track).toBe(TRACK_NAME);
      expect(body.payload.session_type).toBe("Practice");
      expect(body.analysis_result.submission_mode).toBe("quick");
    }
  });

  test("existing submissions can be reopened and overwritten from the notes screen", async ({
    page,
  }) => {
    await mockSubmissionApp(page);

    const existingSubmission = {
      id: "submission-1",
      submission_ref: "SUB-1",
      correlation_id: "corr-1",
      event_id: EVENT_ID,
      run_group_id: "run-group-1",
      created_by_id: "user-1",
      raw_text: "Initial short note",
      image_url: null,
      payload: {
        data: {
          ...makeSessionData(),
          session_id: "20260423-1531-NG-S3",
        },
      },
      analysis_result: {
        submission_mode: "detail",
        has_structured_data: true,
        confidence: 0.91,
      },
      status: "SENT",
      structured_ingest_status: "saved",
      structured_ingest_warnings: [],
      event: {
        id: EVENT_ID,
        name: "Sebring",
        track: TRACK_NAME,
        start_date: "2026-04-20T00:00:00.000Z",
        end_date: "2026-05-01T00:00:00.000Z",
        is_active: true,
      },
      run_group: {
        id: "run-group-1",
        event_id: EVENT_ID,
        normalized: "BLUE",
        raw_text: "BLUE",
      },
      driver: {
        id: "driver-1",
        driver_id: "NG",
        first_name: "Nicolas",
        last_name: "GuigÃ¨re",
        driver_name: "Nicolas GuigÃ¨re",
        team_name: "Blue",
        is_active: true,
      },
      vehicle: {
        id: "vehicle-1",
        vehicle_id: "NG-GT4-2025",
        driver_id: "NG",
        make: "Porsche",
        model: "GT4 RS Clubsport",
        year: 2025,
        is_active: true,
      },
    };
    const overwriteRequests = [];

    await page.route("**/api/v1/submissions/submission-1", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        return route.fulfill({ json: { submission: existingSubmission } });
      }

      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        overwriteRequests.push(body);
        return route.fulfill({
          json: {
            submission: {
              ...existingSubmission,
              raw_text: body.raw_text,
              image_url: body.image_url,
              payload: body.payload,
              analysis_result: body.analysis_result,
              updated_at: new Date().toISOString(),
            },
          },
        });
      }

      return route.fulfill({ status: 200, json: {} });
    });

    await page.goto(`/event/${EVENT_ID}/notes?submissionId=submission-1&tab=detail`);
    await expect(page.getByText("Overwrite mode enabled.")).toBeVisible();
    await expect(page.getByTestId("detail-raw-notes")).toHaveValue("Initial short note");

    await page.getByTestId("detail-raw-notes").fill("Updated short note");
    await page.getByRole("button", { name: "Overwrite Notes" }).click();

    await expect(
      page.getByText("Notes overwritten successfully! Redirecting..."),
    ).toBeVisible();
    expect(overwriteRequests).toHaveLength(1);
    expect(overwriteRequests[0].raw_text).toBe("Updated short note");
    expect(overwriteRequests[0].payload.session_id).toBe("20260423-1531-NG-S3");
  });
});
