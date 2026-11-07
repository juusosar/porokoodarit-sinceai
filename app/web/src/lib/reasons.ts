import codes from "@shared/reason_codes.json";
import type { Reason } from "@/types/fit-state";

type Code = { part: string; text: string };
const CODES = (codes as { codes: Record<string, Code> }).codes;

/** Render a reason code with its params, same rules as the API templates (missing param -> "?"). */
export function renderReason(r: Reason): string {
  const tpl = CODES[r.code]?.text ?? r.code;
  const params = (r.params ?? {}) as Record<string, unknown>;
  const text = tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] === undefined || params[k] === null ? "?" : String(params[k]),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}
