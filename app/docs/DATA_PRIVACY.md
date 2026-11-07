# Data & privacy

Where each piece of data is processed and stored, and for how long. Hosting: US regions.

| Data | Processed on | Sent to | Stored | Retention |
|---|---|---|---|---|
| Questionnaire answers + measured numbers (no media) | Phone | API (Cloud Run), per request | This browser's localStorage (MVP "saved fitting") | Until "Start over"; server copy (Atlas, opt-in, 30 d) not built yet |
| Body / hand photo | Phone | Nowhere (only measured numbers leave) | Not stored | None |
| Swing video (full) | Phone (MediaPipe pose) | Nowhere | Not stored | None |
| Pose landmarks / tempo numbers | Phone | API | Not stored by default | Request lifetime |
| Swing clip (~1.5 s, 640px) | Modal GPU (YOLO) | Modal, only after explicit consent | Temp file | Deleted right after processing |
| Fit state (engine labels + reason codes, rebuilt server-side from inputs) | API | LLM provider (Gemini; others if switched) | Not stored by API | Provider's API retention policy |
| Host line text (spoken_line, no personal data) | API | ElevenLabs (US/EU servers), only when voice is on | Audio clip in API memory cache (not on disk) | Until instance restart / cache eviction; ElevenLabs per its API policy |
| Saved fitting (spec, no media) | API | MongoDB Atlas, opt-in only | Atlas | 30 days |
| Anonymous usage events | Phone / API | MongoDB Atlas | Atlas | Hackathon period |
| TrackMan session data (7 Nov) | Team laptop | Nowhere | Local dev folder, with signed consent | Hackathon period |

Rules
- No names, faces or video are ever sent to an LLM.
- API keys live only on the server. The voice endpoint only speaks lines the API signed itself.
- Pose model + MediaPipe WASM are self-hosted with the web app: no third-party CDN sees the session.
- Every upload has a skip path; the fit works with answers only (lower confidence, shown as such).
- Synthetic lab data is labelled synthetic and never presented as real golfers.
