/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Same alias + port conventions as Lovable exports, so their components drop in unchanged.
export default defineConfig({
  // fs.allow: this app + app/shared (reason codes, schema).
  server: { host: "::", port: 5173, fs: { allow: [".", "../shared"] } },
  plugins: [react()],
  // onnxruntime-web finds its .wasm via import.meta.url; pre-bundling breaks that in dev.
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "../shared") } },
  test: { environment: "jsdom", globals: true, setupFiles: [] },
});
