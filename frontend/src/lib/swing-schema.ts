import { z } from 'zod';
import { sessionTokenSchema } from './fitting-schema';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const videoDetailsSchema = z.object({
  filename: z.string().min(1).max(200),
  mime: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  size: z.number().int().positive().max(MAX_VIDEO_BYTES),
});
export const videoTimingSchema = z.object({
  duration: z.number().positive().max(600),
  encodedFps: z.number().positive().max(1000).nullable(),
  captureVerified: z.literal(false),
});
export const swingRequestSchema = z.object({ token: sessionTokenSchema });
export function speedReadiness(encodedFps: number | null, captureVerified: boolean) {
  return captureVerified && encodedFps !== null && encodedFps >= 60;
}
export function validateVideo(file: { name: string; type: string; size: number }) {
  const parsed = videoDetailsSchema.safeParse({ filename: file.name, mime: file.type, size: file.size });
  if (!parsed.success) throw new Error('Choose an MP4, MOV or WebM video under 50 MB.');
  return parsed.data;
}