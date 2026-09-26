# Frontend AI legal review gate

Date: 2026-09-25

The frontend integration candidate updates public transparency text to match the verified governed story data flow. These edits are engineering transparency drafts, not legal advice or counsel approval.

## Provider facts independently checked for this engineering review

### Groq
Official Groq documentation reviewed on 2026-09-25 states that inference customer data is not retained by default, except that inputs/outputs may be temporarily logged for system reliability or abuse investigation for up to 30 days. Groq documents a Zero Data Retention control in Data Controls and states that usage metadata is retained but does not contain customer inputs/outputs. Groq also documents U.S. GCP data location for retained customer data and SCC availability where applicable.

Sources:
- https://console.groq.com/docs/your-data
- https://console.groq.com/docs/legal/services-agreement

**Still account-specific:** verify the MoonTale Production Groq organization's actual Data Controls/ZDR setting before making any stronger public retention statement. Do not infer that ZDR is enabled merely because the feature exists.

### Cloudflare Workers AI
Official Cloudflare Workers AI documentation reviewed on 2026-09-25 states that Cloudflare does not use Workers AI Customer Content to train Workers AI models or improve Cloudflare/third-party services without explicit consent, and does not make that content available to other Cloudflare customers. It notes that Customer Content may be stored when the customer deliberately uses Cloudflare storage services such as R2, KV, Durable Objects or Vectorize in conjunction with Workers AI.

Source:
- https://developers.cloudflare.com/workers-ai/platform/data-usage/

**Architecture-specific:** the MoonTale integration must continue to keep story prose/prompts out of Durable Object admission state and logs; the existing frozen security design is intended to store only bounded admission/security state. Reverify that invariant in the final pre-route audit.

### Supabase
The connected MoonTale project `ftbpmhjcvhelchqoqjjr` was rechecked read-only on 2026-09-25:
- project status: `ACTIVE_HEALTHY`;
- primary region: `eu-west-1` (Ireland);
- RLS enabled on both `public.child_profiles` and `public.stories`.

Supabase documentation states that the selected project region controls where primary project data is stored. Public policy text should still describe deletion/retention based on MoonTale's actual application behavior rather than treating project-region selection as a complete compliance conclusion.

Sources:
- https://supabase.com/docs/guides/platform/regions
- https://supabase.com/privacy

## Items still requiring human/legal verification before public route activation

- actual Groq MoonTale Production Data Controls/ZDR setting;
- any Cloudflare account-level settings or contractual terms that change the general Workers AI documentation above;
- final international-transfer disclosure and processor/subprocessor wording;
- Supabase `stories` application-level retention/deletion policy and parent-facing deletion workflow;
- final parent-facing wording for private-pilot access and unauthorised/unenrolled states;
- legal review of the final Privacy Policy and Terms against the verified active production configuration.

Do not activate the public story API route until this review is explicitly closed.
