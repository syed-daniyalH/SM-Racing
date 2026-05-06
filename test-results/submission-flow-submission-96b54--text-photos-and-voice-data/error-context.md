# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: submission-flow.spec.js >> submission flow >> quick submissions preserve raw text, photos, and voice data
- Location: tests\e2e\submission-flow.spec.js:456:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('quick-voice-control')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('quick-voice-control')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e7] [cursor=pointer]:
          - generic [ref=e8]: SM-2
          - generic [ref=e9]: RACE CONTROL
        - generic [ref=e10]:
          - generic [ref=e11]:
            - button "Events" [ref=e12] [cursor=pointer]:
              - img [ref=e14]
              - generic [ref=e16]: Events
            - button "Submissions" [ref=e17] [cursor=pointer]:
              - img [ref=e19]
              - generic [ref=e23]: Submissions
          - generic [ref=e24]:
            - generic [ref=e26]: MECHANIC
            - button "Logout" [ref=e27] [cursor=pointer]:
              - img [ref=e29]
              - generic [ref=e31]: Logout
    - main [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e35]:
          - button "Back" [ref=e36] [cursor=pointer]:
            - img [ref=e37]
            - generic [ref=e39]: Back
          - heading "Submit Notes" [level=1] [ref=e40]
        - generic [ref=e41]:
          - heading "Sebring" [level=2] [ref=e43]
          - generic [ref=e44]:
            - button "Quick Submission" [ref=e45] [cursor=pointer]
            - button "Detail Submission" [ref=e46] [cursor=pointer]
          - paragraph [ref=e47]: Quick note saved locally on this device.
          - generic [ref=e48]:
            - generic [ref=e49]:
              - generic [ref=e50]: Session Information
              - generic [ref=e51]:
                - generic [ref=e52]:
                  - generic [ref=e53]: Date
                  - textbox "Use YYYY-MM-DD." [ref=e54]
                - generic [ref=e55]:
                  - generic [ref=e56]: Time
                  - textbox "Use 24-hour HH:MM." [ref=e57]: 23:11
              - generic [ref=e58]:
                - generic [ref=e59]: Session ID
                - 'textbox "Format: YYYYMMDD-HHMM-DRIVERID-S1" [ref=e60]':
                  - /placeholder: YYYYMMDD-HHMM-DRIVERID-S1
                - paragraph [ref=e61]: Auto-generated from date, time, driver, and session number. You can still edit it.
                - button "Use Generated ID" [ref=e63]
              - generic [ref=e64]:
                - generic [ref=e65]: Track
                - combobox "Choose the event track or select Other to type a custom value." [ref=e66]:
                  - option "Select Track"
                  - option "Sebring International Raceway" [selected]
                  - option "Other (type manually)"
              - generic [ref=e67]:
                - generic [ref=e68]: Run Group
                - textbox "Not assigned yet" [ref=e69]: BLUE
            - generic [ref=e70]:
              - generic [ref=e71]: Driver
              - combobox "Pick the driver assigned to this session." [ref=e72]:
                - option "Select Driver" [selected]
                - option "Nicolas Guigère"
            - generic [ref=e73]:
              - generic [ref=e74]: Vehicle
              - combobox "Pick the vehicle used for this session." [ref=e75]:
                - option "Select Vehicle" [selected]
                - option "NG-GT4-2025 · Nicolas Guigère"
            - generic [ref=e76]:
              - generic [ref=e77]: Session Details
              - generic [ref=e78]:
                - generic [ref=e79]:
                  - generic [ref=e80]: Session Type
                  - combobox "Choose the session classification." [ref=e81]:
                    - option "Select session type"
                    - option "Practice" [selected]
                    - option "Qualifying"
                    - option "Race"
                - generic [ref=e82]:
                  - generic [ref=e83]: "Session #"
                  - spinbutton [ref=e84]: "1"
              - generic [ref=e85]:
                - generic [ref=e86]:
                  - generic [ref=e87]: Duration (Minutes)
                  - spinbutton [ref=e88]: "30"
                - generic [ref=e89]:
                  - generic [ref=e90]: Wheelbase (mm)
                  - spinbutton [ref=e91]
                  - paragraph [ref=e92]: Optional. Leave blank if the wheelbase is unknown.
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - generic [ref=e95]: Tire Set
                  - textbox "Y-S3" [ref=e96]
                - generic [ref=e97]:
                  - generic [ref=e98]: Pressure Unit
                  - combobox [ref=e99]:
                    - option "psi" [selected]
            - generic [ref=e100]:
              - generic [ref=e101]:
                - generic [ref=e102]: Pressures
                - combobox [ref=e103]:
                  - option "Cold" [selected]
                  - option "Hot"
              - generic [ref=e104]:
                - generic [ref=e105]:
                  - generic [ref=e106]: FL
                  - spinbutton [ref=e107]
                - generic [ref=e108]:
                  - generic [ref=e109]: FR
                  - spinbutton [ref=e110]
              - generic [ref=e111]:
                - generic [ref=e112]:
                  - generic [ref=e113]: RL
                  - spinbutton [ref=e114]
                - generic [ref=e115]:
                  - generic [ref=e116]: RR
                  - spinbutton [ref=e117]
            - generic [ref=e118]:
              - generic [ref=e120]: Race Notes (Raw Text)
              - textbox "e.g. \"s1 30min nico gt4 Y-S3 pf 27 wb 2450\"" [ref=e121]
              - generic [ref=e122]:
                - generic [ref=e123]:
                  - generic [ref=e124]: Voice Submission
                  - strong [ref=e125]: Voice notes now use a dedicated screen.
                  - paragraph [ref=e126]: Open the focused voice workflow to record audio, review the Deepgram transcript, and finalize the linked submission without mixing that state into Quick Submission.
                - button "Open Voice Submission" [ref=e127] [cursor=pointer]
              - generic [ref=e128]:
                - generic [ref=e129]: Photo
                - button "Choose File" [ref=e130]
            - generic [ref=e132]: Submission notes close after the event end date.
            - generic [ref=e134]:
              - button "Cancel" [ref=e135] [cursor=pointer]
              - button "Event Closed" [disabled] [ref=e136]
    - contentinfo [ref=e137]:
      - generic [ref=e139]:
        - generic [ref=e140]:
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]: SM-2
              - generic [ref=e144]:
                - heading "SM-2" [level=3] [ref=e145]
                - paragraph [ref=e146]: Race Control
            - paragraph [ref=e147]: Professional motorsport operations for race control, event management, structured submissions, and audit-ready admin workflows.
            - generic "Social links" [ref=e148]:
              - link "Email" [ref=e149] [cursor=pointer]:
                - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                - img [ref=e150]
              - link "LinkedIn" [ref=e152] [cursor=pointer]:
                - /url: https://www.linkedin.com/
                - img [ref=e153]
              - link "Twitter" [ref=e155] [cursor=pointer]:
                - /url: https://x.com/
                - img [ref=e156]
              - link "GitHub" [ref=e158] [cursor=pointer]:
                - /url: https://github.com/
                - img [ref=e159]
          - generic [ref=e161]:
            - heading "Product" [level=4] [ref=e162]
            - list [ref=e163]:
              - listitem [ref=e164]:
                - link "Events" [ref=e165] [cursor=pointer]:
                  - /url: /events
                  - generic [ref=e167]: Events
                  - img [ref=e168]
              - listitem [ref=e170]:
                - link "My Submissions" [ref=e171] [cursor=pointer]:
                  - /url: /events
                  - generic [ref=e173]: My Submissions
                  - img [ref=e174]
              - listitem [ref=e176]:
                - link "Support" [ref=e177] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                  - generic [ref=e179]: Support
                  - img [ref=e180]
              - listitem [ref=e182]:
                - link "System Status" [ref=e183] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20System%20Status
                  - generic [ref=e185]: System Status
                  - img [ref=e186]
          - generic [ref=e188]:
            - heading "Resources" [level=4] [ref=e189]
            - list [ref=e190]:
              - listitem [ref=e191]:
                - link "API Reference" [ref=e192] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20API%20Reference
                  - generic [ref=e194]: API Reference
                  - img [ref=e195]
              - listitem [ref=e197]:
                - link "Release Notes" [ref=e198] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Release%20Notes
                  - generic [ref=e200]: Release Notes
                  - img [ref=e201]
              - listitem [ref=e203]:
                - link "Documentation" [ref=e204] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Documentation
                  - generic [ref=e206]: Documentation
                  - img [ref=e207]
              - listitem [ref=e209]:
                - link "Support Center" [ref=e210] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                  - generic [ref=e212]: Support Center
                  - img [ref=e213]
          - generic [ref=e215]:
            - heading "Company" [level=4] [ref=e216]
            - list [ref=e217]:
              - listitem [ref=e218]:
                - link "About" [ref=e219] [cursor=pointer]:
                  - /url: mailto:info@sm2racing.local?subject=About%20SM-2
                  - generic [ref=e221]: About
                  - img [ref=e222]
              - listitem [ref=e224]:
                - link "Contact" [ref=e225] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=Contact%20SM-2
                  - generic [ref=e227]: Contact
                  - img [ref=e228]
              - listitem [ref=e230]:
                - link "Careers" [ref=e231] [cursor=pointer]:
                  - /url: mailto:careers@sm2racing.local?subject=Careers%20at%20SM-2
                  - generic [ref=e233]: Careers
                  - img [ref=e234]
              - listitem [ref=e236]:
                - link "Press" [ref=e237] [cursor=pointer]:
                  - /url: mailto:press@sm2racing.local?subject=SM-2%20Press
                  - generic [ref=e239]: Press
                  - img [ref=e240]
          - generic [ref=e242]:
            - heading "Legal" [level=4] [ref=e243]
            - list [ref=e244]:
              - listitem [ref=e245]:
                - link "Privacy Policy" [ref=e246] [cursor=pointer]:
                  - /url: mailto:privacy@sm2racing.local?subject=SM-2%20Privacy%20Policy
                  - generic [ref=e248]: Privacy Policy
                  - img [ref=e249]
              - listitem [ref=e251]:
                - link "Terms of Service" [ref=e252] [cursor=pointer]:
                  - /url: mailto:legal@sm2racing.local?subject=SM-2%20Terms%20of%20Service
                  - generic [ref=e254]: Terms of Service
                  - img [ref=e255]
              - listitem [ref=e257]:
                - link "Security" [ref=e258] [cursor=pointer]:
                  - /url: mailto:security@sm2racing.local?subject=SM-2%20Security
                  - generic [ref=e260]: Security
                  - img [ref=e261]
              - listitem [ref=e263]:
                - link "Compliance" [ref=e264] [cursor=pointer]:
                  - /url: mailto:compliance@sm2racing.local?subject=SM-2%20Compliance
                  - generic [ref=e266]: Compliance
                  - img [ref=e267]
        - generic [ref=e270]:
          - generic [ref=e271]:
            - paragraph [ref=e272]: Copyright 2026 SM-2 Race Control.
            - paragraph [ref=e273]: Built for race-weekend operations, clean reference data, and traceable submission workflows.
          - generic [ref=e274]:
            - generic [ref=e277]: System Online
            - generic [ref=e278]:
              - generic [ref=e279]: SM-2 v1.0.0
              - generic [ref=e280]: Latest
  - alert [ref=e282]
```

# Test source

```ts
  362 |     expect(body.analysis_result.submission_mode).toBe("detail");
  363 |     expect(body.payload.track).toBe(TRACK_NAME);
  364 |     expect(body.payload.tire_inventory.status).toBe("DISCARDED");
  365 |     expect(body.payload.pressures.cold.fl).toBe(22.1);
  366 |     expect(body.payload.suspension.rebound_fl).toBe(12);
  367 |     expect(body.payload.alignment.camber_fl).toBe(-1.5);
  368 |     expect(body.payload.tire_temperatures.fl_in).toBe(78.5);
  369 |   });
  370 | 
  371 |   test("detail drafts autosave and restore on reload", async ({ page }) => {
  372 |     await mockSubmissionApp(page);
  373 | 
  374 |     const draftKey = `sm2:submission-draft:${EVENT_ID}:user-1`;
  375 | 
  376 |     await page.goto(`/event/${EVENT_ID}/notes`);
  377 |     await page.getByTestId("submission-tab-detail").click();
  378 |     await page.getByTestId("submission-date").fill("2026-04-23");
  379 |     await page.getByTestId("submission-time").fill("15:31");
  380 |     await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-DRAFT`);
  381 |     await page.getByTestId("submission-track-select").selectOption("__OTHER__");
  382 |     await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
  383 |     await page.getByTestId("submission-driver-select").selectOption("NG");
  384 |     await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
  385 |     await page.getByTestId("submission-session-type").selectOption("Practice");
  386 |     await page.getByTestId("detail-pressure-fl").fill("22.1");
  387 | 
  388 |     await expect
  389 |       .poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey))
  390 |       .not.toBeNull();
  391 |     await expect(page.getByText("Draft saved locally on this device.")).toBeVisible({
  392 |       timeout: 5000,
  393 |     });
  394 | 
  395 |     await page.reload();
  396 |     await page.getByTestId("submission-tab-detail").click();
  397 |     await expect(page.getByTestId("submission-date")).toHaveValue("2026-04-23");
  398 |     await expect(page.getByTestId("submission-session-id")).toHaveValue(`${SUBMISSION_REF}-DRAFT`);
  399 |     await expect(page.getByTestId("submission-track-manual")).toHaveValue(TRACK_NAME);
  400 |     await expect(page.getByTestId("submission-driver-select")).toHaveValue("NG");
  401 |     await expect(page.getByTestId("submission-vehicle-select")).toHaveValue("NG-GT4-2025");
  402 |   });
  403 | 
  404 |   test("detail submissions show structured warnings when normalized pressure values are skipped", async ({
  405 |     page,
  406 |   }) => {
  407 |     const requests = await mockSubmissionApp(page, {
  408 |       buildSubmissionResponse: (body) => ({
  409 |         submission_ref: body.submission_ref,
  410 |         correlation_id: body.correlation_id,
  411 |         status: "SENT",
  412 |         raw_text: body.raw_text ?? null,
  413 |         image_url: body.image_url ?? null,
  414 |         payload: body.payload,
  415 |         analysis_result: body.analysis_result,
  416 |         structured_ingest_status: "saved_with_warnings",
  417 |         structured_ingest_warnings: [
  418 |           {
  419 |             section: "pressures",
  420 |             code: "VALUE_TOO_HIGH",
  421 |             field: "cold_fl",
  422 |             value: 112,
  423 |             message: "cold_fl must be at most 60.0 to be normalized.",
  424 |           },
  425 |         ],
  426 |         created_at: makeDateTime("2026-04-23T15:31:00.000Z"),
  427 |         updated_at: makeDateTime("2026-04-23T15:33:00.000Z"),
  428 |       }),
  429 |     });
  430 | 
  431 |     await page.goto(`/event/${EVENT_ID}/notes`);
  432 |     await page.getByTestId("submission-tab-detail").click();
  433 |     await page.getByTestId("submission-date").fill("2026-04-23");
  434 |     await page.getByTestId("submission-time").fill("15:31");
  435 |     await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-WARN`);
  436 |     await page.getByTestId("submission-track-select").selectOption("__OTHER__");
  437 |     await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
  438 |     await page.getByTestId("submission-driver-select").selectOption("NG");
  439 |     await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
  440 |     await page.getByTestId("submission-session-type").selectOption("Practice");
  441 |     await page.getByTestId("detail-tire-set").fill("Y-S3");
  442 |     await page.getByTestId("detail-pressure-fl").fill("112");
  443 | 
  444 |     await expect(page.getByText("Pressure values outside the SM2 normalized DB limits")).toBeVisible();
  445 | 
  446 |     await page.getByRole("button", { name: "Submit Notes" }).click();
  447 |     await expect.poll(() => requests.length).toBe(1);
  448 |     await expect(
  449 |       page.getByText("Note saved. Some structured fields could not be normalized, so review the warnings below."),
  450 |     ).toBeVisible({ timeout: 5000 });
  451 |     await expect(
  452 |       page.getByText("cold_fl: cold_fl must be at most 60.0 to be normalized."),
  453 |     ).toBeVisible();
  454 |   });
  455 | 
  456 |   test("quick submissions preserve raw text, photos, and voice data", async ({ page }) => {
  457 |     const requests = await mockSubmissionApp(page);
  458 | 
  459 |     await page.goto(`/event/${EVENT_ID}/notes`);
  460 |     await expect(page.getByTestId("quick-raw-notes")).toBeVisible();
  461 |     await expect(page.getByTestId("quick-photo-input")).toBeVisible();
> 462 |     await expect(page.getByTestId("quick-voice-control")).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  463 |     await expect(
  464 |       page.locator('select[data-testid="submission-track-select"] option[value="__OTHER__"]'),
  465 |     ).toHaveText("Other (type manually)");
  466 | 
  467 |     await page.getByTestId("quick-raw-notes").fill("front pressures were stable");
  468 |     await page.getByTestId("quick-photo-input").setInputFiles({
  469 |       name: "quick-photo.png",
  470 |       mimeType: "image/png",
  471 |       buffer: QUICK_PHOTO,
  472 |     });
  473 |     await page.waitForTimeout(100);
  474 | 
  475 |     await page.getByRole("button", { name: "Start Voice Note" }).click();
  476 |     await expect(page.getByTestId("quick-raw-notes")).toHaveValue(/voice transcript note/, {
  477 |       timeout: 5000,
  478 |     });
  479 | 
  480 |     await page.getByTestId("submission-date").fill("2026-04-23");
  481 |     await page.getByTestId("submission-time").fill("15:31");
  482 |     await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-QUICK`);
  483 |     await page.getByTestId("submission-track-select").selectOption("__OTHER__");
  484 |     await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
  485 |     await page.getByTestId("submission-driver-select").selectOption("NG");
  486 |     await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
  487 |     await page.getByTestId("submission-session-type").selectOption("Practice");
  488 | 
  489 |     await page.getByRole("button", { name: "Submit Notes" }).click();
  490 |     await expect.poll(() => requests.length).toBe(1);
  491 |     await expect(page.locator(".status-message.status-success")).toBeVisible({
  492 |       timeout: 5000,
  493 |     });
  494 | 
  495 |     const body = requests[0];
  496 |     expect(body.raw_text).toContain("front pressures were stable");
  497 |     expect(body.raw_text).toContain(QUICK_TRANSCRIPT);
  498 |     expect(body.image_url).toContain("data:image/png;base64,");
  499 |     expect(body.analysis_result.voice_input_used).toBe(true);
  500 |     expect(body.analysis_result.submission_mode).toBe("quick");
  501 |     expect(body.payload.track).toBe(TRACK_NAME);
  502 |     expect(body.payload.session_type).toBe("Practice");
  503 |   });
  504 | 
  505 |   test("quick shorthand submissions route to the raw endpoint even when session number is empty", async ({
  506 |     page,
  507 |   }) => {
  508 |     const requests = await mockSubmissionApp(page, {
  509 |       buildRawSubmissionResponse: (body) => ({
  510 |         status: "SUCCESS",
  511 |         id_seance: "20260423-NG-S01",
  512 |         message: "Session stored successfully",
  513 |         raw_text: body.raw_text,
  514 |       }),
  515 |     });
  516 | 
  517 |     await page.goto(`/event/${EVENT_ID}/notes`);
  518 |     await page.getByTestId("quick-raw-notes").fill("s1 30min nico gt4 Y-S3 pf 27 wb 2450");
  519 |     await page.getByTestId("submission-date").fill("2026-04-23");
  520 |     await page.getByTestId("submission-time").fill("15:31");
  521 |     await page.getByTestId("submission-session-id").fill(`${SUBMISSION_REF}-RAW`);
  522 |     await page.getByTestId("submission-track-select").selectOption("__OTHER__");
  523 |     await page.getByTestId("submission-track-manual").fill(TRACK_NAME);
  524 |     await page.getByTestId("submission-driver-select").selectOption("NG");
  525 |     await page.getByTestId("submission-vehicle-select").selectOption("NG-GT4-2025");
  526 |     await page.getByTestId("submission-session-type").selectOption("Practice");
  527 |     await page.getByTestId("submission-session-number").fill("");
  528 | 
  529 |     await page.getByRole("button", { name: "Submit Notes" }).click();
  530 |     await expect.poll(() => requests.rawSubmissionRequests.length).toBe(1);
  531 |     await expect.poll(() => requests.length).toBe(0);
  532 |     await expect(page.getByText("Session stored successfully")).toBeVisible({
  533 |       timeout: 5000,
  534 |     });
  535 | 
  536 |     expect(requests.rawSubmissionRequests[0]).toEqual({
  537 |       source: "pwa",
  538 |       created_by: "Mechanic One",
  539 |       eventId: EVENT_ID,
  540 |       runGroup: "BLUE",
  541 |       raw_text: "s1 30min nico gt4 Y-S3 pf 27 wb 2450",
  542 |     });
  543 |   });
  544 | 
  545 |   test("raw validation failures are shown clearly in the quick submit flow", async ({ page }) => {
  546 |     const requests = await mockSubmissionApp(page, {
  547 |       buildRawSubmissionResponse: () => ({
  548 |         status: "VALIDATION_FAILED",
  549 |         message: "vehicle_id does not belong to driver_id",
  550 |         errors: [
  551 |           {
  552 |             field: "vehicle_id",
  553 |             message: "vehicle_id does not belong to driver_id",
  554 |           },
  555 |         ],
  556 |       }),
  557 |     });
  558 | 
  559 |     await page.goto(`/event/${EVENT_ID}/notes`);
  560 |     await page.getByTestId("quick-raw-notes").fill("s1 30min nico gt4 Y-S3 pf 27 wb 2450");
  561 |     await page.getByTestId("submission-date").fill("2026-04-23");
  562 |     await page.getByTestId("submission-time").fill("15:31");
```