# Recommendation engine: how inputs become a Takomo iron spec

Status: merged to `dev` 7 Nov 2026 (PR #63, POR-40).
Plan it implements: https://claude.ai/artifact/PMyyUjJe7h8S9S6aLb5DBQ (7 Nov 2026).

## 1. Principle

- The **engine decides, the LLM explains.** Every spec part comes from deterministic code: `engine/fusion.py` fuses the
  evidence and `engine/fit.py` runs Takomo's own rules (`engine/rules.py`) on it. The LLM (chat and explain) turns answers
  into fields and reason codes into sentences. It never picks a value.
- **Every input is an observation with an uncertainty:** `Observation{value, sd, source, method}`, where the source is
  asked, measured, estimated or default.
- **Sources are combined by inverse-variance weighting.** A precise measurement outweighs a vague answer automatically,
  and "nothing known" yields a wide estimate rather than a fake exact one.
- **Confidence is a probability:** the chance that the chosen option is right given the evidence. It is computed per part.
- **The golfer can see why.** Each part lists its inputs, where each came from, and how much each counted. The engine also
  says which missing input would raise confidence most.

## 2. Inputs

| Input | Where it comes from | Enters the engine as | Notes |
|---|---|---|---|
| Profile (hand, sex, score, carry, flight, height, wrist-to-floor, glove, wants) | Chat cards (`/v1/chat`), `lib/fit-request.ts` | `Answers` | Bias and SD from the lab self-report error model |
| Swing video tempo + speed | Device pose keypoints -> API `/v1/swing/analyze` (main's algorithm, `takomo_api/swing`); on-device tempo (`lib/pose/tempo.ts`) as fallback | `backswing_s`, `downswing_s`, `video_speed_7i_mph` (estimated, SD 12 mph, only from >= 100 fps real-time clips) | Video never leaves the device; keypoints are not stored |
| Launch monitor / TrackMan (7-iron, session means) | Extra-data step, manual entry | `speed_7i_mph`, **`carry_7i_yd`**, **`launch_deg`**, **`spin_rpm`**, **`landing_deg`** | Bold = new on this branch |
| Ball-line lie test | Extra-data step: face photo, 4 taps per shot (`components/BallLineTest.tsx`) | **`ball_line_tilt_deg`** (mean of shots, SD 1.65/√n) | Photo stays on the phone; only angles are saved |
| Lie from strike / toe-up (fitting session) | Eval only today | `lie_need_deg` | Beats the ball-line test when both exist |

## 3. Per part: what drives it

### Swing speed (drives head and flex)

All sources go into one inverse-variance estimate. The typical weights, strongest first:

| Source | SD | Method tag |
|---|---|---|
| Launch monitor / TrackMan speed | 1.5 mph | `launch_monitor` |
| Launch monitor carry → speed (no over-report correction) | ≥ 3 mph | `launch_monitor_carry` |
| Asked speed (−2 mph bias) | 5 mph | `questionnaire` |
| Swing video speed (main's pendulum model, not yet validated vs TrackMan) | 12 mph (+5 % without height) | `video_pendulum` |
| Remembered carry → speed (−15 yd over-report, loft corrected) | ≥ 3 mph, usually ~5–6 | `carry_loft_corrected` |
| **New:** typical score → speed prior (84 / 79 / 76 / 72 / 67 mph for buckets 1–5) | 12 mph | `score_prior` |
| Population prior | 10 mph | `population_prior` |

**Fixed bug:** the web used to write a launch-monitor carry into `answers.carry_7i_yd`. The engine then applied the 15 yd
"golfers over-report" correction to a measured number, so a measured 150 yd read about 8 mph too slow. It now goes to
`measurements.carry_7i_yd` and replaces the remembered carry.

### Head

- Unchanged rules: `score_heads`, i.e. skill + speed + priorities + the over-92 cap.
- The confidence integrates over speed and score uncertainty (P(top head)). The head uses a speed estimate *without* the score prior, so the score answer counts once.
- The miss → offset rule from the plan was **not added**. The chat already turns misses ("What bugs you" card) into the
  `wants` priorities, so an extra rule would double count.

### Shaft (flex, material, model)

- **Flex** comes from the speed bucket. The close call is shown with its margin in mph.
- **Material** follows the rules: graphite for lady/senior flex, women, or age 70+.
- **Model** is chosen by flight + tempo (`pick_shaft`).
- **Flight is new.** The needed 7-iron landing angle comes from TrackMan:
  - Landing angle + 0.5° + 1.14 × (31° − own loft). SD 1.2° with a known loft, about 2.5° without.
  - With no landing angle, it is estimated from launch, spin and speed (lab fit, SD 1.8°).
  - The class boundaries come from the lab simulator: steeper than 45° = low flight needed, shallower than 35° = high.
- **Flight and tempo are weighed, not overwritten.** The golfer's answer is a prior: P(answer | true class) is right 70%
  of the time, mostly one step off otherwise (5% two steps), times the population mix. The measurement is a
  likelihood. The posterior picks the class.
  - When the launch monitor and the answer disagree and the answer wins, the reason says so
    (`FLIGHT_LAUNCH_VS_ANSWER`). An unclear video with no tempo answer says "typical tempo assumed"
    (`TEMPO_VIDEO_UNCLEAR_TYPICAL`).
  - A clear video or TrackMan reading wins over a wrong answer.
  - A video timing that sits on a class edge with a big SD cannot overrule a clear answer. The engine then says
    "video timing was unclear" (`TEMPO_VIDEO_UNCLEAR`).
- **Video tempo fix:** main's phase detector takes "Address" as the lowest hand point up to 4 s before the top. On real
  clips that can be a waggle or the set-up, which makes the backswing too long and tips the swing into "smooth".
  - Tempo now starts at the **takeaway**: walking back from the fastest backswing frame, it is where the hands slow below
    10% of that speed (`takeawayFrame` in `lib/swing/phases.ts`).
  - Main's event frames are unchanged, and the parity test still passes.

### Length

- Unchanged: Takomo's height table, with height fused from the answer and a photo when there is one.

### Lie

| Priority | Source | Notes |
|---|---|---|
| 1 | Strike / toe-up shots (`lie_need_deg`) | — |
| 2 | **Ball-line test:** lie need = −0.65 × mean tilt + 0.4°, model SD 0.5° | Combined with the chart, so 1 shot moves it less than 5 |
| 3 | Static chart from height + wrist-to-floor | ±1° personal offset. No extra population prior on top, so with no shots the lie is exactly Takomo's chart, and a ball-line test that agrees with the chart keeps the value. |

- **Sign:** tilt > 0 means the mark leans toward the toe. The club was toe-up at impact, i.e. too upright, so the golfer
  needs flatter. This follows the lab's `camera/ball_line.py` and DATA_DICTIONARY.
- **Why k ≈ −0.65 and not −1:** face rotation exaggerates the mark, and the test only measures "relative to my current
  club", whose lie is unknown.
- **Tuning (lab train, golfers whose only lie evidence is this test):**

| Method | Lie right |
|---|---|
| Chart only | 33.7% |
| Old 1:1 mapping | 39.8% |
| Tuned mapping | 43.5% |

### Grip, hand

- Unchanged: measured hand length > glove answer > default M. Hand is asked.

### Stock or custom

- The rule is unchanged: stock = KBS Tour / Tour Lite steel + standard length and lie + standard or midsize grip.
- **New:** `StockAdvice.close_call_parts` lists custom parts where "standard" still has at least 30% probability.
- When every reason for custom is such a close call, purchase adds `STOCK_CLOSE_CALL`: "Standard is nearly as likely for
  lie, so a stock set (30-day returns) is worth considering."
- The recommendation itself stays custom, because Takomo's rules decide that. Whether to flip it to stock is a
  **business call for Takomo**.

## 4. Explainability: what the golfer sees

- **`PartState.inputs`** is the evidence chain behind each part. Each item has a label, a display value, a source tag
  and its weight (its share of the inverse-variance estimate).
  - Categorical inputs (flight, tempo) show "used" instead of a percentage.
  - Converted values (carry → speed, score → speed) are marked "≈ … (converted)".
- **"Why? What this is based on"** is a drawer under each part on *My fit, under the hood* (`components/FittingData.tsx`).
  It shows one line per input with a weight bar. Example:
  - Launch monitor speed · 81 mph · MEASURED · 82%
  - Launch monitor carry · ≈85 mph (converted) · 14%
- **`FitState.next_steps`** ranks missing inputs by expected confidence gain. For each candidate (launch monitor, ball-line
  test, swing video, glove, height, carry), the engine reruns as if it were measured at today's best estimate, so the
  value stays the same and only the uncertainty shrinks.
  - Gain = Σ Δconfidence, with head and shaft weighted ×2, lie ×1.5 and the rest ×1.
  - Up to 3 steps are returned, each needing a gain ≥ 0.05. The whole run takes about 1.5 ms.
  - Shown as **"Want a surer fit?"** on the results page and as "Next: …" on the live fit card.
- **Reason codes** are new codes only, no renames:
  - `SPEED_FROM_SCORE`, `FLIGHT_FROM_LAUNCH`, `FLIGHT_LAUNCH_VS_ANSWER`, `TEMPO_FROM_VIDEO`, `TEMPO_VIDEO_UNCLEAR`,
    `TEMPO_VIDEO_UNCLEAR_TYPICAL`, `LIE_FROM_BALL_LINE`, `STOCK_CLOSE_CALL`
  - `NEXT_LAUNCH_MONITOR`, `NEXT_BALL_LINE`, `NEXT_SWING_VIDEO`, `NEXT_GLOVE`, `NEXT_HEIGHT`, `NEXT_CARRY`
  - The LLM still gets only labels, confidence, reason codes and close calls. `inputs` is not sent to it, so the mph
    guard is unaffected.

## 5. Accuracy (synthetic lab data, never real golfers)

Dev split, 3000 golfers, no own loft. Full tables are in `docs/EVAL.md`.

| Run | Before | After | Lab reference |
|---|---|---|---|
| Answers only (E1) | 78.06 | **78.77** | today's rules 77.10 |
| Answers + evidence (E2) | 84.75 | **85.35** | rules + measurements 83.58 |
| E2 full spec exact | 27.6% | **30.4%** | 25.3% |
| Shipped web inputs (E-UI, answers + video tempo) | 77.81 | **78.37** | — |
| E-UI + launch monitor speed | 79.66 | **80.01** | — |

Per part on E2:

| Part | Before | After |
|---|---|---|
| Shaft model | 71.6 | 75.2 |
| Flex | 86.5 | 87.1 |
| Material | 94.5 | 95.5 |
| Lie | 55.7 | 56.9 |
| Head | 92.9 | 92.9 |

- All tuning was done on train only; dev was run once.
- The lie gain is small overall because only 20% of lab golfers have a ball-line test and about 25% have toe-up data.

## 6. What to verify before merging

1. **Ball-line sign and scale on a real club.** Confirm with Takomo (Jonas) that "line leans toward the toe → go flatter"
   matches their fitting practice, and that about 0.65° of lie per 1° of tilt is sane. Both come from the lab simulator
   only.
2. **The flight thresholds** (45° / 35° landing) are the lab's definition. Takomo may use different windows.
3. **The score-based speed prior** helps on lab data. It is a population average, so for a fast high-handicapper it pulls
   speed down until a carry or TrackMan number arrives. Its weight is small (SD 12 mph).
4. **The takeaway fix:** check it on the Saturday TrackMan clips. The backswing should now start when the club starts
   moving.
5. **The UI pieces,** checked in a headless phone-size browser:
   - the ball-line tap flow
   - the Why drawer
   - "Want a surer fit?"
   
   They are not yet tested on a real iPhone (camera capture, tap accuracy on small screens).
6. **The stock close-call wording:** is "worth considering" the line Takomo wants?

## 7. Files

- API:
  - `engine/fusion.py`: carry, ball-line, flight and score prior, plus evidence weights
  - `engine/fit.py`: posteriors, `inputs`, `next_steps`, stock close call
  - `schema.py`
  - `eval/dev_split.py`
  - `tests/test_recommendation.py`
- Shared: `reason_codes.json`, `fit_state.schema.json`
- Web:
  - `lib/fit-request.ts`
  - `lib/enrichment-schema.ts`
  - `lib/lie/ball-line.ts`
  - `components/BallLineTest.tsx`
  - `routes/enrichment.tsx`
  - `components/FittingData.tsx`: `WhyDrawer`, `NextSteps`
  - `components/LiveFitCard.tsx`
  - `lib/swing/phases.ts` and `pipeline.ts`: takeaway
  - Tests: `test/ball-line.test.ts`, `test/why-drawer.test.tsx`, `test/fit-request.test.ts`, `lib/swing/swing.test.ts`
