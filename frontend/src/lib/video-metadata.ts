import { validateVideo } from './swing-schema';

export async function inspectVideo(file: File) {
  validateVideo(file);
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This file has no readable video track. Choose another video.');
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('Choose a video shorter than 10 minutes.');
    const stats = await track.computePacketStats(512);
    const encodedFps = Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0 ? stats.averagePacketRate : null;
    return { duration, encodedFps, captureVerified: false as const };
  } finally { input.dispose(); }
}