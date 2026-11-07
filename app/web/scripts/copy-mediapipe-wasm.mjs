// Self-host MediaPipe WASM (no third-party CDN at runtime: privacy + works behind strict proxies).
// Copies the non-module build into public/mediapipe/wasm (gitignored). Runs before dev/build.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dst = join(root, "public/mediapipe/wasm");
mkdirSync(dst, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) cpSync(join(src, f), join(dst, f));
console.log("mediapipe wasm ->", dst);
