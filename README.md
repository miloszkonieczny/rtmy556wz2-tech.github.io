# MoonTale

MoonTale creates personalized bedtime stories for children, combining parent-guided reading, imagination and gentle language exposure.

## Status

MoonTale is an early-stage, parent-directed web prototype. The public frontend is served at `https://moontaleapp.com`. The production story-generation backend has been prepared as a governed private-pilot service at `https://api.moontaleapp.com/api/story/generate`; public route activation is a separate release step and is not implied by this repository state.

Sole public contact email: `contact@moontaleapp.com`.

## Story Generation Architecture

On approved production origin, MoonTale uses the governed story API rather than silently falling back to the browser template generator. Local loopback development remains available on `localhost`, `127.0.0.1` and `::1`.

The browser sends a bounded story request containing the story configuration required for generation: age band, narrative and learning languages, selected character, mood, controlled interest, goal, reading time, requested vocabulary count, stable vocabulary identifiers and adult-authorization metadata. The production request deliberately excludes the child nickname, parent email, child-profile ID and browser story-generation ID.

For the private pilot, production generation reuses the existing Supabase parent session. The current access token is sent only in the HTTP `Authorization` header to the MoonTale API. It is not placed in the request body, query string, analytics events or application story storage.

The server authenticates the parent through Supabase Auth, applies server-controlled pilot entitlement and quota/admission controls, then runs the frozen governed story pipeline. Provider routing is server-side. Current production-candidate routing uses Groq with Cloudflare Workers AI available within the validated fallback architecture. Candidate.17 / Candidate.18 / Stage 8 safety, quality, repair, schema and finalization boundaries are not implemented in the browser and must not be bypassed by frontend changes.

One deliberate generation action is designed to create exactly one story POST. There is no automatic production template fallback and no hidden same-page retry; a second request requires an explicit Retry action. A successfully accepted story is cached by generation ID so an ordinary reload does not create an accidental second generation request.

## Main Features

- Personalized bedtime-story builder
- Multiple interface languages
- Parent-selected themes and learning goals
- Governed AI story generation for authorized private-pilot sessions
- Local accepted-story caching and saved previews
- Optional parent authentication and private child-profile management
- Optional account-backed story saving for a selected child profile
- Responsive design and semantic/accessibility support
- Consent-gated analytics and minimal waitlist submission

## Languages

The interface supports English, Polish, Spanish, French and German. The currently validated live story-generation language set is narrower than the interface set; unsupported saved language choices are preserved for explicit correction rather than silently substituted.

## Technology

- Semantic HTML, CSS and browser ES modules
- GitHub Pages for the static frontend origin
- Cloudflare proxy/security layer and governed story Worker
- Supabase Auth plus RLS-protected parent/child-profile and account story data
- Groq / Cloudflare Workers AI behind server-side provider routing
- Formspree for voluntary waitlist/product-update submissions
- Google Analytics only after optional analytics consent

No provider API key, trust key or internal service token belongs in browser code.

## Privacy And Data Flow

- Story-builder configuration is stored locally so the builder and story page can complete one deliberate request.
- Accepted stories and bounded generation/save-state markers may be stored in browser `localStorage` to prevent accidental duplicate generation or duplicate account writes.
- A production story request goes only to `https://api.moontaleapp.com/api/story/generate` from the approved production origin.
- The story request body excludes parent email, child nickname and child-profile ID.
- The existing Supabase access token is used only as an Authorization bearer credential for the MoonTale API.
- Signed-in parents may explicitly create private child profiles in Supabase. A successful generated story may be saved to the parent-controlled account when a saved child profile was selected.
- Formspree receives only the minimal waitlist/product-update payload after adult opt-in; child profile and story content are not added to that submission.
- Google Analytics remains consent-gated and must not receive bearer tokens, child profile data, story text or story settings.
- Public legal pages must describe the active provider/data-flow configuration before route activation. Provider retention/transfer details must not be invented or represented as zero-retention unless independently verified.

## Local Development

The frontend can be served locally with a static server, but governed local story generation expects the validated Worker path on loopback.

```bash
python3 -m http.server 8080
```

The full production candidate contains the Worker and its dedicated validation scripts. Do not point local frontend testing at the public production route unless that live test has been separately authorized.

## Testing

The frontend integration is covered by focused Node tests for request construction, production-origin routing, safe error mapping, reload caching, duplicate-save prevention and browser-data cleanup. The full production candidate additionally contains Worker/security and Playwright integration suites.

Typical offline checks in the full candidate include:

```bash
npm run test:second-readiness
npm run test:runtime-relevant
npm run test:candidate17
node --test tests/legal-static.test.mjs tests/story-api.test.mjs tests/integration-state.test.mjs
```

Provider campaigns and deployment scripts are separate controlled operations and must not be run merely to validate frontend code.

## Release Boundary

Frontend implementation readiness does not activate production. Before public story API activation, complete the pre-route audit, confirm public legal/privacy wording against the real provider configuration, run the required browser/account tests, and obtain explicit Founder authorization for the route change.

## Contact

Public contact email: `contact@moontaleapp.com`

## Copyright

© 2026 MoonTale. All rights reserved.
