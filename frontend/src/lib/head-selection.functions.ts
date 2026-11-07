import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { sessionTokenSchema } from './fitting-schema';
import { blueprintSchema, effectiveSpecs, emptySpecs } from './blueprint-schema';
import { headIdSchema, headSelectionSchema } from './head-selection-schema';

export const readHeadSelection = createServerFn({ method: 'POST' }).inputValidator(z.object({ token: sessionTokenSchema })).handler(async ({ data }) => {
  setResponseHeader('Cache-Control', 'no-store');
  const { fittingOwner } = await import('./swing.server');
  const { hash, admin } = await fittingOwner(data.token);
  const { data: row, error } = await admin.from('fitting_head_selections').select('payload').eq('session_hash', hash).maybeSingle();
  if (error) throw new Error('Could not load your selected head. Try again.');
  return row ? headSelectionSchema.parse(row.payload) : null;
});
export const saveHeadSelection = createServerFn({ method: 'POST' }).inputValidator(z.object({ token: sessionTokenSchema, head: headIdSchema })).handler(async ({ data }) => {
  setResponseHeader('Cache-Control', 'no-store');
  const { fittingOwner } = await import('./swing.server');
  const { hash, admin } = await fittingOwner(data.token);
  const { data: row, error: readError } = await admin.from('fitting_blueprints').select('payload').eq('session_hash', hash).maybeSingle();
  if (readError) throw new Error('Could not load your saved specifications. Try again.');
  const specs = row ? effectiveSpecs(blueprintSchema.parse(row.payload)) : { ...emptySpecs };
  const payload = headSelectionSchema.parse({ head: data.head, specs, status: 'saved_selection', selectedAt: new Date().toISOString() });
  const { error } = await admin.from('fitting_head_selections').upsert({ session_hash: hash, payload, updated_at: payload.selectedAt });
  if (error) throw new Error('Could not save your selection. Please try again.');
  return payload;
});