# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: submission-flow.spec.js >> submission flow >> detail submissions show structured warnings when normalized pressure values are skipped
- Location: tests\e2e\submission-flow.spec.js:404:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Submit Notes' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
          - paragraph [ref=e47]: Draft saved locally on this device.
          - generic [ref=e48]:
            - generic [ref=e49]:
              - generic [ref=e50]: Session Information
              - generic [ref=e51]:
                - generic [ref=e52]:
                  - generic [ref=e53]: Date
                  - textbox "Use YYYY-MM-DD." [ref=e54]: 2026-04-23
                - generic [ref=e55]:
                  - generic [ref=e56]: Time
                  - textbox "Use 24-hour HH:MM." [ref=e57]: 15:31
              - generic [ref=e58]:
                - generic [ref=e59]: Session ID
                - 'textbox "Format: YYYYMMDD-HHMM-DRIVERID-S1" [ref=e60]':
                  - /placeholder: YYYYMMDD-HHMM-DRIVERID-S1
                  - text: SEB-20260423-1531-PRACTICE-3-NG-NG-GT4-2025-WARN
                - paragraph [ref=e61]: Auto-generated from date, time, driver, and session number. You can still edit it.
                - button "Use Generated ID" [ref=e63]
              - generic [ref=e64]:
                - generic [ref=e65]: Track
                - combobox "Choose the event track or select Other to type a custom value." [ref=e66]:
                  - option "Select Track"
                  - option "Sebring International Raceway"
                  - option "Other (type manually)" [selected]
                - textbox "Type the exact track name." [ref=e68]:
                  - /placeholder: Type track name
                  - text: Sebring International Raceway
              - generic [ref=e69]:
                - generic [ref=e70]: Run Group
                - textbox "Not assigned yet" [ref=e71]: BLUE
            - generic [ref=e72]:
              - generic [ref=e73]: Driver
              - combobox "Pick the driver assigned to this session." [ref=e74]:
                - option "Select Driver"
                - option "Nicolas Guigère" [selected]
            - generic [ref=e75]:
              - generic [ref=e76]: Vehicle
              - combobox "Pick the vehicle used for this session." [ref=e77]:
                - option "Select Assigned Vehicle"
                - option "NG-GT4-2025" [selected]
            - generic [ref=e78]:
              - generic [ref=e79]: Session Details
              - generic [ref=e80]:
                - generic [ref=e81]:
                  - generic [ref=e82]: Session Type
                  - combobox "Choose the session classification." [ref=e83]:
                    - option "Select session type"
                    - option "Practice" [selected]
                    - option "Qualifying"
                    - option "Race"
                - generic [ref=e84]:
                  - generic [ref=e85]: "Session #"
                  - spinbutton [ref=e86]: "1"
              - generic [ref=e87]:
                - generic [ref=e88]:
                  - generic [ref=e89]: Duration (Minutes)
                  - spinbutton [ref=e90]: "30"
                - generic [ref=e91]:
                  - generic [ref=e92]: Wheelbase (mm)
                  - spinbutton [ref=e93]
                  - paragraph [ref=e94]: Optional. Leave blank if the wheelbase is unknown.
              - generic [ref=e95]:
                - generic [ref=e96]:
                  - generic [ref=e97]: Tire Set
                  - textbox "Y-S3" [ref=e98]
                - generic [ref=e99]:
                  - generic [ref=e100]: Pressure Unit
                  - combobox [ref=e101]:
                    - option "psi" [selected]
            - generic [ref=e102]:
              - generic [ref=e103]:
                - generic [ref=e104]: Pressures
                - combobox [ref=e105]:
                  - option "Cold" [selected]
                  - option "Hot"
              - generic [ref=e106]:
                - generic [ref=e107]:
                  - generic [ref=e108]: FL
                  - spinbutton [active] [ref=e109]: "112"
                - generic [ref=e110]:
                  - generic [ref=e111]: FR
                  - spinbutton [ref=e112]
              - generic [ref=e113]:
                - generic [ref=e114]:
                  - generic [ref=e115]: RL
                  - spinbutton [ref=e116]
                - generic [ref=e117]:
                  - generic [ref=e118]: RR
                  - spinbutton [ref=e119]
              - generic [ref=e120]:
                - strong [ref=e121]: "Structured warning:"
                - text: Pressure values outside the SM2 normalized DB limits will stay on the note, but those pressure fields will be skipped from normalized tables.
                - list [ref=e122]:
                  - listitem [ref=e123]: Cold FL 112 psi is outside the normalized DB range of 5-60 psi. The note can still save, but this pressure value will be skipped from normalized tables.
            - generic [ref=e124]:
              - generic [ref=e126]: Short Notes (Raw Text)
              - textbox "Add a short summary or overwrite note here..." [ref=e127]
              - generic [ref=e128]:
                - generic [ref=e129]: Photo
                - button "Choose File" [ref=e130]
            - generic [ref=e131]:
              - generic [ref=e132]: Suspension
              - generic [ref=e133]:
                - generic [ref=e134]:
                  - generic [ref=e135]: Rebound FL
                  - spinbutton [ref=e136]
                - generic [ref=e137]:
                  - generic [ref=e138]: Rebound FR
                  - spinbutton [ref=e139]
              - generic [ref=e140]:
                - generic [ref=e141]:
                  - generic [ref=e142]: Rebound RL
                  - spinbutton [ref=e143]
                - generic [ref=e144]:
                  - generic [ref=e145]: Rebound RR
                  - spinbutton [ref=e146]
              - generic [ref=e147]:
                - generic [ref=e148]:
                  - generic [ref=e149]: Bump FL
                  - spinbutton [ref=e150]
                - generic [ref=e151]:
                  - generic [ref=e152]: Bump FR
                  - spinbutton [ref=e153]
              - generic [ref=e154]:
                - generic [ref=e155]:
                  - generic [ref=e156]: Bump RL
                  - spinbutton [ref=e157]
                - generic [ref=e158]:
                  - generic [ref=e159]: Bump RR
                  - spinbutton [ref=e160]
              - generic [ref=e161]:
                - generic [ref=e162]:
                  - generic [ref=e163]: Sway Bar F
                  - spinbutton [ref=e164]
                - generic [ref=e165]:
                  - generic [ref=e166]: Sway Bar R
                  - spinbutton [ref=e167]
              - generic [ref=e168]:
                - generic [ref=e169]: Wing Angle (deg)
                - spinbutton [ref=e170]
            - generic [ref=e171]:
              - generic [ref=e172]: Alignment
              - generic [ref=e173]:
                - generic [ref=e174]:
                  - generic [ref=e175]: Camber FL
                  - spinbutton [ref=e176]
                - generic [ref=e177]:
                  - generic [ref=e178]: Camber FR
                  - spinbutton [ref=e179]
              - generic [ref=e180]:
                - generic [ref=e181]:
                  - generic [ref=e182]: Camber RL
                  - spinbutton [ref=e183]
                - generic [ref=e184]:
                  - generic [ref=e185]: Camber RR
                  - spinbutton [ref=e186]
              - generic [ref=e187]:
                - generic [ref=e188]:
                  - generic [ref=e189]: Toe Front
                  - spinbutton [ref=e190]
                - generic [ref=e191]:
                  - generic [ref=e192]: Toe Rear
                  - spinbutton [ref=e193]
              - generic [ref=e194]:
                - generic [ref=e195]:
                  - generic [ref=e196]: Caster L
                  - spinbutton [ref=e197]
                - generic [ref=e198]:
                  - generic [ref=e199]: Caster R
                  - spinbutton [ref=e200]
              - generic [ref=e201]:
                - generic [ref=e202]:
                  - generic [ref=e203]: Ride Height F (mm)
                  - spinbutton [ref=e204]
                - generic [ref=e205]:
                  - generic [ref=e206]: Ride Height R (mm)
                  - spinbutton [ref=e207]
              - generic [ref=e208]:
                - generic [ref=e209]:
                  - generic [ref=e210]: Corner Weight FL (lbs)
                  - spinbutton [ref=e211]
                - generic [ref=e212]:
                  - generic [ref=e213]: Corner Weight FR (lbs)
                  - spinbutton [ref=e214]
              - generic [ref=e215]:
                - generic [ref=e216]:
                  - generic [ref=e217]: Corner Weight RL (lbs)
                  - spinbutton [ref=e218]
                - generic [ref=e219]:
                  - generic [ref=e220]: Corner Weight RR (lbs)
                  - spinbutton [ref=e221]
              - generic [ref=e222]:
                - generic [ref=e223]:
                  - generic [ref=e224]: Cross Weight (%)
                  - spinbutton [ref=e225]
                - generic [ref=e226]:
                  - generic [ref=e227]: Rake (mm)
                  - spinbutton [ref=e228]
            - generic [ref=e229]:
              - generic [ref=e230]: Tire Temperatures
              - generic [ref=e231]:
                - generic [ref=e232]:
                  - generic [ref=e233]: FL (In/Mid/Out)
                  - generic [ref=e234]:
                    - spinbutton [ref=e235]
                    - spinbutton [ref=e236]
                    - spinbutton [ref=e237]
                - generic [ref=e238]:
                  - generic [ref=e239]: FR (In/Mid/Out)
                  - generic [ref=e240]:
                    - spinbutton [ref=e241]
                    - spinbutton [ref=e242]
                    - spinbutton [ref=e243]
              - generic [ref=e244]:
                - generic [ref=e245]:
                  - generic [ref=e246]: RL (In/Mid/Out)
                  - generic [ref=e247]:
                    - spinbutton [ref=e248]
                    - spinbutton [ref=e249]
                    - spinbutton [ref=e250]
                - generic [ref=e251]:
                  - generic [ref=e252]: RR (In/Mid/Out)
                  - generic [ref=e253]:
                    - spinbutton [ref=e254]
                    - spinbutton [ref=e255]
                    - spinbutton [ref=e256]
            - generic [ref=e257]:
              - generic [ref=e258]: Tire Inventory
              - generic [ref=e259]:
                - generic [ref=e260]:
                  - generic [ref=e261]: Tire ID
                  - textbox [ref=e262]
                - generic [ref=e263]:
                  - generic [ref=e264]: Manufacturer
                  - textbox [ref=e265]
              - generic [ref=e266]:
                - generic [ref=e267]:
                  - generic [ref=e268]: Model
                  - textbox [ref=e269]
                - generic [ref=e270]:
                  - generic [ref=e271]: Size
                  - textbox [ref=e272]
              - generic [ref=e273]:
                - generic [ref=e274]:
                  - generic [ref=e275]: Purchase Date
                  - textbox [ref=e276]
                - generic [ref=e277]:
                  - generic [ref=e278]: Heat Cycles
                  - spinbutton [ref=e279]
              - generic [ref=e280]:
                - generic [ref=e281]:
                  - generic [ref=e282]: Track Time (min)
                  - spinbutton [ref=e283]
                - generic [ref=e284]:
                  - generic [ref=e285]: Status
                  - combobox [ref=e286]:
                    - option "Active" [selected]
                    - option "Discarded"
            - generic [ref=e288]: Submission notes close after the event end date.
            - generic [ref=e290]:
              - button "Cancel" [ref=e291] [cursor=pointer]
              - button "Event Closed" [disabled] [ref=e292]
    - contentinfo [ref=e293]:
      - generic [ref=e295]:
        - generic [ref=e296]:
          - generic [ref=e297]:
            - generic [ref=e298]:
              - generic [ref=e299]: SM-2
              - generic [ref=e300]:
                - heading "SM-2" [level=3] [ref=e301]
                - paragraph [ref=e302]: Race Control
            - paragraph [ref=e303]: Professional motorsport operations for race control, event management, structured submissions, and audit-ready admin workflows.
            - generic "Social links" [ref=e304]:
              - link "Email" [ref=e305] [cursor=pointer]:
                - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                - img [ref=e306]
              - link "LinkedIn" [ref=e308] [cursor=pointer]:
                - /url: https://www.linkedin.com/
                - img [ref=e309]
              - link "Twitter" [ref=e311] [cursor=pointer]:
                - /url: https://x.com/
                - img [ref=e312]
              - link "GitHub" [ref=e314] [cursor=pointer]:
                - /url: https://github.com/
                - img [ref=e315]
          - generic [ref=e317]:
            - heading "Product" [level=4] [ref=e318]
            - list [ref=e319]:
              - listitem [ref=e320]:
                - link "Events" [ref=e321] [cursor=pointer]:
                  - /url: /events
                  - generic [ref=e323]: Events
                  - img [ref=e324]
              - listitem [ref=e326]:
                - link "My Submissions" [ref=e327] [cursor=pointer]:
                  - /url: /events
                  - generic [ref=e329]: My Submissions
                  - img [ref=e330]
              - listitem [ref=e332]:
                - link "Support" [ref=e333] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                  - generic [ref=e335]: Support
                  - img [ref=e336]
              - listitem [ref=e338]:
                - link "System Status" [ref=e339] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20System%20Status
                  - generic [ref=e341]: System Status
                  - img [ref=e342]
          - generic [ref=e344]:
            - heading "Resources" [level=4] [ref=e345]
            - list [ref=e346]:
              - listitem [ref=e347]:
                - link "API Reference" [ref=e348] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20API%20Reference
                  - generic [ref=e350]: API Reference
                  - img [ref=e351]
              - listitem [ref=e353]:
                - link "Release Notes" [ref=e354] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Release%20Notes
                  - generic [ref=e356]: Release Notes
                  - img [ref=e357]
              - listitem [ref=e359]:
                - link "Documentation" [ref=e360] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Documentation
                  - generic [ref=e362]: Documentation
                  - img [ref=e363]
              - listitem [ref=e365]:
                - link "Support Center" [ref=e366] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=SM-2%20Support
                  - generic [ref=e368]: Support Center
                  - img [ref=e369]
          - generic [ref=e371]:
            - heading "Company" [level=4] [ref=e372]
            - list [ref=e373]:
              - listitem [ref=e374]:
                - link "About" [ref=e375] [cursor=pointer]:
                  - /url: mailto:info@sm2racing.local?subject=About%20SM-2
                  - generic [ref=e377]: About
                  - img [ref=e378]
              - listitem [ref=e380]:
                - link "Contact" [ref=e381] [cursor=pointer]:
                  - /url: mailto:support@sm2racing.local?subject=Contact%20SM-2
                  - generic [ref=e383]: Contact
                  - img [ref=e384]
              - listitem [ref=e386]:
                - link "Careers" [ref=e387] [cursor=pointer]:
                  - /url: mailto:careers@sm2racing.local?subject=Careers%20at%20SM-2
                  - generic [ref=e389]: Careers
                  - img [ref=e390]
              - listitem [ref=e392]:
                - link "Press" [ref=e393] [cursor=pointer]:
                  - /url: mailto:press@sm2racing.local?subject=SM-2%20Press
                  - generic [ref=e395]: Press
                  - img [ref=e396]
          - generic [ref=e398]:
            - heading "Legal" [level=4] [ref=e399]
            - list [ref=e400]:
              - listitem [ref=e401]:
                - link "Privacy Policy" [ref=e402] [cursor=pointer]:
                  - /url: mailto:privacy@sm2racing.local?subject=SM-2%20Privacy%20Policy
                  - generic [ref=e404]: Privacy Policy
                  - img [ref=e405]
              - listitem [ref=e407]:
                - link "Terms of Service" [ref=e408] [cursor=pointer]:
                  - /url: mailto:legal@sm2racing.local?subject=SM-2%20Terms%20of%20Service
                  - generic [ref=e410]: Terms of Service
                  - img [ref=e411]
              - listitem [ref=e413]:
                - link "Security" [ref=e414] [cursor=pointer]:
                  - /url: mailto:security@sm2racing.local?subject=SM-2%20Security
                  - generic [ref=e416]: Security
                  - img [ref=e417]
              - listitem [ref=e419]:
                - link "Compliance" [ref=e420] [cursor=pointer]:
                  - /url: mailto:compliance@sm2racing.local?subject=SM-2%20Compliance
                  - generic [ref=e422]: Compliance
                  - img [ref=e423]
        - generic [ref=e426]:
          - generic [ref=e427]:
            - paragraph [ref=e428]: Copyright 2026 SM-2 Race Control.
            - paragraph [ref=e429]: Built for race-weekend operations, clean reference data, and traceable submission workflows.
          - generic [ref=e430]:
            - generic [ref=e433]: System Online
            - generic [ref=e434]:
              - generic [ref=e435]: SM-2 v1.0.0
              - generic [ref=e436]: Latest
  - alert [ref=e438]
```

# Test source

```ts
  346 |     await page.getByTestId("detail-tire-status").selectOption("DISCARDED");
  347 |     await page.getByTestId("detail-pressure-fl").fill("22.1");
  348 |     await page.getByTestId("detail-suspension-rebound-fl").fill("12");
  349 |     await page.getByTestId("detail-alignment-camber-fl").fill("-1.5");
  350 |     await page.getByTestId("detail-temp-fl-in").fill("78.5");
  351 | 
  352 |     await page.getByRole("button", { name: "Submit Notes" }).click();
  353 |     await expect.poll(() => requests.length).toBe(1);
  354 |     await expect(page.locator(".status-message.status-success")).toBeVisible({
  355 |       timeout: 5000,
  356 |     });
  357 | 
  358 |     const body = requests[0];
  359 |     expect(body.raw_text).toBeUndefined();
  360 |     expect(body.image_url).toBeUndefined();
  361 |     expect(body.analysis_result.voice_input_used).toBeUndefined();
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
> 446 |     await page.getByRole("button", { name: "Submit Notes" }).click();
      |                                                              ^ Error: locator.click: Test timeout of 60000ms exceeded.
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
  462 |     await expect(page.getByTestId("quick-voice-control")).toBeVisible();
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
```