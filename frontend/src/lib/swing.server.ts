import { fittingSchema } from './fitting-schema';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export async function fittingOwner(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await supabaseAdmin.from('fitting_sessions').select('snapshot').eq('session_hash', hash).maybeSingle();
  if (error || !data || !fittingSchema.parse(data.snapshot).confirmed) throw new Error('Confirm your profile with Grant before sending a video.');
  return { hash, admin: supabaseAdmin };
}
export function hasVideoSignature(bytes: Uint8Array, mime: string) {
  if (mime === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp';
}