import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { swingRequestSchema, videoDetailsSchema, videoTimingSchema } from './swing-schema';

export const prepareSwing = createServerFn({ method: 'POST' })
  .inputValidator(swingRequestSchema.extend({ video: videoDetailsSchema }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const { data: old, error: readError } = await admin.from('swing_submissions').select('object_path').eq('session_hash', hash).maybeSingle();
    if (readError) throw new Error('Could not prepare your upload. Try again.');
    // One immutable object per upload; no capability permits overwriting an existing video.
    const ext = data.video.mime === 'video/webm' ? 'webm' : data.video.mime === 'video/quicktime' ? 'mov' : 'mp4';
    const path = `${hash}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.from('swing_submissions').upsert({ session_hash: hash, object_path: path, filename: data.video.filename, mime_type: data.video.mime, size_bytes: data.video.size, status: 'awaiting_upload', metadata: {}, updated_at: new Date().toISOString() });
    if (error) throw new Error('Could not prepare your upload. Try again.');
    if (old) await admin.storage.from('swing-videos').remove([old.object_path]);
    const signed = await admin.storage.from('swing-videos').createSignedUploadUrl(path);
    if (signed.error) throw new Error('Could not create your private upload. Try again.');
    return { signedUrl: signed.data.signedUrl, path };
  });

export const finishSwing = createServerFn({ method: 'POST' })
  .inputValidator(swingRequestSchema.extend({ timing: videoTimingSchema }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner, hasVideoSignature } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const { data: row, error } = await admin.from('swing_submissions').select('*').eq('session_hash', hash).maybeSingle();
    if (error || !row) throw new Error('Your upload was not found. Choose your video again.');
    const info = await admin.storage.from('swing-videos').info(row.object_path);
    if (info.error || info.data.size !== row.size_bytes || info.data.contentType !== row.mime_type) throw new Error('Your video upload is incomplete. Try again.');
    const downloaded = await admin.storage.from('swing-videos').download(row.object_path);
    if (downloaded.error || !hasVideoSignature(new Uint8Array(await downloaded.data.slice(0, 16).arrayBuffer()), row.mime_type)) {
      await admin.storage.from('swing-videos').remove([row.object_path]);
      throw new Error('This file is not a supported video. Choose another.');
    }
    // Browser timing is a hint, not an authorized measurement. No processor is configured yet.
    const { error: saveError } = await admin.from('swing_submissions').update({ status: 'needs_processor', metadata: { ...data.timing, source: 'browser_metadata', captureVerified: false }, updated_at: new Date().toISOString() }).eq('session_hash', hash).eq('object_path', row.object_path);
    if (saveError) throw new Error('Video received, but its status could not be saved. Try again.');
    return { status: 'needs_processor' };
  });

export const readSwing = createServerFn({ method: 'POST' }).inputValidator(swingRequestSchema)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const { data: row, error } = await admin.from('swing_submissions').select('*').eq('session_hash', hash).maybeSingle();
    if (error) throw new Error('Could not load your video. Try again.');
    if (!row) return null;
    const signed = row.status !== 'awaiting_upload' ? await admin.storage.from('swing-videos').createSignedUrl(row.object_path, 600) : null;
    if (signed?.error) throw new Error('Could not load your private preview. Try again.');
    return { filename: row.filename, size: row.size_bytes, status: row.status, metadata: row.metadata, url: signed?.data?.signedUrl ?? null };
  });

export const deleteSwing = createServerFn({ method: 'POST' }).inputValidator(swingRequestSchema)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const { data: row, error } = await admin.from('swing_submissions').select('object_path').eq('session_hash', hash).maybeSingle();
    if (error) throw new Error('Could not delete your video. Try again.');
    if (row) {
      const removed = await admin.storage.from('swing-videos').remove([row.object_path]);
      if (removed.error) throw new Error('Could not delete your video. Try again.');
      const deleted = await admin.from('swing_submissions').delete().eq('session_hash', hash);
      if (deleted.error) throw new Error('Could not finish deletion. Try again.');
    }
    return { deleted: true };
  });