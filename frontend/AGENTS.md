<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Fitting continuity
- Keep fitting snapshots (answers, messages, corrections, final profile and confirmation) in Lovable Cloud; use the shared fitting read hook on subsequent pages so results consume the same profile.
- Anonymous fitting access uses a browser-generated 256-bit capability, hashed server-side to scope every database read/write; deny direct visitor table access so one visitor cannot browse another fitting.
- Queue autosaves and await confirmation save before video navigation so earlier drafts cannot overwrite the confirmed profile.
- Store swing submissions separately from fitting snapshots; private object access is capability-scoped server-side so chat autosaves cannot overwrite videos.
- Read video packet timing with an event-loaded browser parser; encoded FPS is never treated as verified capture FPS or a real-world speed measurement.
- Keep swing processing pending until a validated processor exists; only real upload and verification events advance the status display.
- Store optional enrichment separately from chat snapshots, with the same capability scope, so old autosaves cannot overwrite measurements; keep measurement provenance and skip state explicit.
- Keep fitting blueprint baselines and manual overrides separate in capability-scoped storage; only versioned validated mappings may populate baselines, so edits and chat autosaves cannot masquerade as calculated recommendations.
- Save head selections separately with a server-read specification snapshot; shortlist browsing order is not a validated fit score and a saved selection is never an order confirmation.
- Reveal isolated product photography with a shared viewport-observed component and reduced-motion fallback, keeping scroll effects independent of fitting logic.
- Mark meaningful below-fold sections for a shared scroll observer; preserve first-viewport visibility, keyboard access and chat pacing independently of presentation motion.
- Keep the blueprint presentation in the club page's collapsed fitting-data section; the legacy results path forwards to the club page so saved bookmarks remain valid.
- Use the shared field-keyed QuestionInfo with tooltips in profiling and popovers elsewhere; keep rationale independent of answer collection and fitting calculations.
- Pace chat presentation separately from canonical streamed messages, preserving complete snapshots while delaying question controls until the reply is fully displayed.
- Starting a fresh fitting rotates the browser capability without deleting previous Cloud records; resuming uses the current saved capability.
