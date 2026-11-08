// Swing result kept in this browser: timing (+ estimated speed) numbers only. The video never leaves the device.
import { z } from "zod";
import { sessionTokenSchema } from "./fitting-schema";
import { readLocal, removeLocal, writeLocal } from "./local-store";

export const swingRecordSchema = z.object({
  filename: z.string().max(200),
  size: z.number().int().nonnegative(),
  encodedFps: z.number().positive().max(1000).nullable(),
  /** Playback slowdown the golfer picked (1 = normal speed, 4 / 8 = slow motion). */
  slowMo: z.number().min(1).max(16).optional(),
  /** Pose-based tempo (MediaPipe in the browser); null when the body wasn't readable. */
  tempo: z
    .object({
      backswingS: z.number().positive().max(5),
      downswingS: z.number().positive().max(5),
      ratio: z.number().positive().max(20).nullable(),
      sd: z.number().positive().max(1),
    })
    .nullable(),
  /** Club speed estimated by the API from pose keypoints (main's model). Wide SD: a hint for the engine. */
  speed: z.object({ value: z.number().min(30).max(130), sd: z.number().positive().max(40) }).nullable().optional(),
  /** Who read the timing: the API (main's algorithm on keypoints) or this device (fallback). */
  source: z.enum(["server", "device"]).optional(),
  /** Upstream algorithm version when the API read it, e.g. "main@7234843". */
  algorithm: z.string().max(40).optional(),
  /** API notes (why a value is missing or less certain), or why the device read was used instead. */
  notes: z.array(z.string().max(40)).max(12).optional(),
  fallback: z.enum(["off", "unreachable", "no_read"]).optional(),
  /** Own shaft length from the optional down-the-line clip (API), used for the speed estimate. */
  shaftM: z.number().min(0.5).max(1.3).nullable().optional(),
  /** Down-the-line clip given (and read on the device). */
  dtl: z.boolean().optional(),
  /** Swing events found, real ms from the clip start (Address, Top, Impact, ...). */
  events: z.record(z.string().max(30), z.number().min(0).max(60_000)).optional(),
  /** Every intermediate number of the read, shown on the result and summary screens. Numbers only. */
  read: z
    .object({
      samples: z.number().int().nonnegative(),
      fps: z.number().positive().max(1000),
      durationS: z.number().nonnegative().max(60),
      heightM: z.number().positive().max(3).optional(),
      heightFrom: z.enum(["profile", "default"]).optional(),
      shaftUsedM: z.number().positive().max(2).optional(),
      shaftFrom: z.enum(["down_the_line", "default"]).optional(),
      handTravelM: z.number().nonnegative().max(5).nullable().optional(),
      handSpeedMps: z.number().nonnegative().max(50).nullable().optional(),
      dtl: z
        .object({
          samples: z.number().int().nonnegative(),
          addressMs: z.number().nullable(),
          stillSamples: z.number().int().nonnegative(),
          headFound: z.number().int().nonnegative(),
          shaftPx: z.number().nullable(),
          shoulderPx: z.number().nullable(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  analyzedAt: z.string().datetime(),
});
export type SwingRecord = z.infer<typeof swingRecordSchema>;

export function readSwing(token: string): SwingRecord | null {
  const raw = readLocal<unknown>("swing", sessionTokenSchema.parse(token));
  const parsed = swingRecordSchema.safeParse(raw);
  return raw && parsed.success ? parsed.data : null;
}
export function saveSwing(token: string, record: SwingRecord): void {
  writeLocal("swing", sessionTokenSchema.parse(token), swingRecordSchema.parse(record));
}
export function deleteSwing(token: string): void {
  removeLocal("swing", sessionTokenSchema.parse(token));
}
