import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { sessionTokenSchema } from './fitting-schema';
import { enrichmentSchema, activeEnrichment } from './enrichment-schema';

export const readEnrichment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: sessionTokenSchema }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const { data: row, error } = await admin.from('fitting_enrichment').select('payload').eq('session_hash', hash).maybeSingle();
    if (error) throw new Error('Your extra data could not be loaded.');
    return row ? enrichmentSchema.parse(row.payload) : null;
  });
export const saveEnrichment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: sessionTokenSchema, payload: enrichmentSchema }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const payload = activeEnrichment(data.payload);
    const { error } = await admin.from('fitting_enrichment').upsert({ session_hash: hash, payload, updated_at: new Date().toISOString() });
    if (error) throw new Error('Could not save your extra data. Please try again.');
    return payload;
  });