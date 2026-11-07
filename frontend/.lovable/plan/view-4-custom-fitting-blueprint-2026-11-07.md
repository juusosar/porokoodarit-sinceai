# View 4 — Custom Fitting Blueprint

## What to build
Replace the current fitting summary with a specifications-focused Step 4 page. Keep the saved golfer profile available here, without introducing club models, checkout, lie simulators or standard-comparison toggles.

Use the official Takomo brand book: Midnight Black, Washed White, Tiger Orange, Barlow Condensed headings and Barlow body text. Preserve the short, candid golf-friend voice.

## Page layout
1. **Step header:** Takomo logo and Step 4 / 5.
2. **Grant introduction:** real approved Grant photo and a short message tailored to the available data. Use approved video/audio only when available; no nonfunctional sound toggle or implied live human review.
3. **Evidence strip:** show the actual state of each source: video saved / analysis pending, manually entered report numbers, self-reported geometry. Do not label these verified measurements.
4. **Blueprint:** four clearly separated sections for shaft material/flex/weight, club length, lie angle and grip size. Each shows its value, supporting inputs, source and limitations. Missing or unsupported calculations show “Not determined yet” rather than invented specs.
5. **Profile details:** compact expandable saved profile, including the golfer’s future outlook, plus optional measurements. Maintain access to the information currently shown on the results page.
6. **Manual overrides:** an accessible side panel for editing specs, saving or cancelling and restoring the calculated baseline. Mark manual values as user-selected, not validated recommendations.
7. **Next step:** “Proceed to recommended club heads”. Enable only when Step 5 and a supported handoff exist. Keep a working return to optional data; do not link to a missing page or fabricate head recommendations in this scope.

## Shaft weight control
- Responsive 60–130g track with keyboard-accessible adjustments and a grams value.
- Position the marker mathematically: `(weight - 60) / 70` of the track width. Keep labels inside the available width on mobile.
- A calculated baseline and a user-selected weight remain separate. Dragging the control makes a manual override, not a newly optimal recommendation.
- The brief’s 95g is an example. Only label a weight recommended when a validated fitting rule supports it; otherwise show the manual value or an unset state.
- Preserve initial baselines when editing material, flex, weight, length, lie or grip; cancel discards unsaved edits and reset restores the baseline.

## Trust safeguards and brief adjustments
- Do not hardcode 97% fit confidence: there is no validated confidence calculation yet. Use source/status labels until one exists.
- Do not claim “cross-referenced TrackMan”, “Video Tempo verified”, “Geometry verified”, “Grant Certified” or “Master Fitter Verification” without the relevant integration, measurement validation or actual review.
- KBS Tour 90 / Regular / 95g, +0.5 inch, 1° upright and Lamkin Crossline Midsize are illustrative examples, not universal outputs.
- Do not infer upright lie from a push/slice or heel/toe strike alone. Do not claim hand-length calibration when only glove size was collected.
- Keep current ability separate from the golfer’s future outlook; no guessed future swing speed.
- A weight control is not a stocked shaft catalogue. Named shaft/grip combinations require verified product availability.

## Technical approach
- Keep `/results` as View 4 and preserve its own title, description and social metadata.
- Reuse the shared fitting/enrichment reads and saved swing status. Skipped enrichment and unverified capture timing remain explicit.
- Introduce a typed blueprint model with nullable baseline specs, provenance, rule version and separate manual overrides. Use a pure calculation boundary so validated Takomo mappings can be added without changing the page.
- Store blueprint overrides separately in Lovable Cloud under the same capability scope, so chat autosaves cannot overwrite them. Await save before a future Step 5 handoff; retain edits on failure and offer retry.
- Use existing buttons, sliders, sheet/dialog controls and semantic theme tokens. No new dependencies are needed for the weight control.

## Verification
- Test 60g/95g/130g marker calculations, range validation, override/cancel/reset behavior and immutable baselines.
- Test missing inputs, skipped enrichment, manual provenance and absence of false verification or automatic impact-to-lie changes.
- Exercise the actual confirmed-profile → optional-data → blueprint → override → save → reload flow, including a failed save retry.
- Check desktop and mobile layout, slider label containment, keyboard interaction and no horizontal overflow.

## Dependencies and boundaries
The page and manual editing can be built now. Personalized calculated baselines require validated shaft/flex/weight, height+wrist-to-floor length/lie and glove-to-grip mappings, plus a supported product catalogue. Until supplied, the page must make those gaps visible rather than present sample specs as recommendations.

Real swing analysis, TrackMan link import, approved Grant audio/video and Step 5 recommendations remain separate dependencies. This change does not complete them.