import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { sessionTokenSchema } from './fitting-schema';
import { blueprintSchema, emptySpecs, specsSchema } from './blueprint-schema';

export const readBlueprint = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: sessionTokenSchema }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    const [blueprint, swing] = await Promise.all([
      admin.from('fitting_blueprints').select('payload').eq('session_hash', hash).maybeSingle(),
      admin.from('swing_submissions').select('status').eq('session_hash', hash).maybeSingle(),
    ]);
    if (blueprint.error || swing.error) throw new Error('Could not load your blueprint. Try again.');
    return { blueprint: blueprint.data ? blueprintSchema.parse(blueprint.data.payload) : null, videoSaved: !!swing.data && swing.data.status !== 'awaiting_upload' };
  });
export const saveBlueprint = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: sessionTokenSchema, overrides: specsSchema.partial() }))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { fittingOwner } = await import('./swing.server');
    const { hash, admin } = await fittingOwner(data.token);
    // Baselines are server-owned; this version has no validated mapping.
    const payload = blueprintSchema.parse({ ruleVersion: 'pending-validation-v1', baseline: { ...emptySpecs }, overrides: data.overrides });
    const { error } = await admin.from('fitting_blueprints').upsert({ session_hash: hash, payload, updated_at: new Date().toISOString() });
    if (error) throw new Error('Could not save your adjustments. Please try again.');
    return payload;
  });