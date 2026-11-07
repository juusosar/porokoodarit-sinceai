// Swing result kept in this browser: timing numbers only. The video never leaves the device.
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
