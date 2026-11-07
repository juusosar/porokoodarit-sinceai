# Data & privacy

Where each piece of data is processed and stored, and for how long. Reflects the code on `dev` (7 Nov 2026).
Hosting: API on Google Cloud Run, europe-north1 (Finland). Gemini via Vertex AI, location `global`. Web on Vercel.

| Data | Processed on | Sent to | Stored | Retention |
|---|---|---|---|---|
| Card answers (hand, sex, score, carry, loft, flight, height, wrist-to-floor, glove) | Phone | API (Cloud Run), per request | This browser's localStorage | 30 days, or until "Delete my data" |
| Chat messages the golfer types + profile labels | Phone | API, then Gemini (Google) to write the host's reply (last 6 turns) | localStorage (chat history); not stored by the API | 30 days in browser; Gemini per Google's API terms |
| Swing video | Phone (MediaPipe pose, self-hosted WASM) | Nowhere | Not stored | Gone when the page closes |
| Swing timing (backswing / downswing seconds) | Phone | API, per request | localStorage | 30 days, or until "Delete my data" |
| Extra data (launch monitor speed, carry, launch, spin, strike) | Phone | API: speed and carry only | localStorage | 30 days, or until "Delete my data" |
| Fit state (engine labels + reason codes, rebuilt server-side from inputs) | API | Gemini, to word the explanation | Not stored by the API | Gemini per Google's API terms |
| Host lines (chat replies + explanation lines the API signed) | API | ElevenLabs, only when voice is on | Audio in API memory cache (not on disk) | Until instance restart / cache eviction; ElevenLabs per its API terms |
| Request logs (latency, token counts, error codes; an error may quote a short piece of model output) | API | Google Cloud Logging | Cloud Logging | Project log retention |
| Web fonts | Browser | Google Fonts (fonts.googleapis.com / gstatic.com) sees the page request (IP, user agent) | Browser cache | Browser cache |
| TrackMan session data (7 Nov test) | Team laptop | Nowhere | Local dev folder, with signed consent | Hackathon period |

Not built (no data flows): body / hand photo measurement, club tracking in the main flow (bench page only, on device),
server-side "save my fitting" (MongoDB Atlas), analytics events, Modal GPU path.

Rules
- Video never leaves the phone. Only timing numbers do.
- What the golfer types in chat goes to Gemini. Don't type names or contact details; the host never asks for them.
- API keys live only on the server. The voice endpoint only speaks lines the API signed itself.
- Pose model, MediaPipe and ONNX Runtime WASM are self-hosted with the web app. Fonts are the one third-party load.
- "Start over" begins a new fitting; older records stay until they expire (30 days) or "Delete my data" (result page) removes every Takomo key in this browser.
- Every upload has a skip path; the fit works with answers only (lower confidence, shown as such).
- Synthetic lab data is labelled synthetic and never presented as real golfers.
