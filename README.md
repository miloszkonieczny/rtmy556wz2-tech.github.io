# MoonTale

MoonTale creates personalized bedtime stories for children, combining reading, imagination and gentle language exposure.

## Status

MoonTale is an early-stage web prototype. It is currently used for active user testing and validation, and is deployed as a static website through GitHub Pages.

Live website: https://moontaleapp.com
Sole public contact email: contact@moontaleapp.com

## Main Features

- Personalized bedtime-story builder
- Multiple interface languages
- Gentle vocabulary exposure
- Parent-selected themes and goals
- Local browser storage for story previews
- Optional parent authentication and private child-profile management
- Responsive design for desktop and mobile use
- Accessibility considerations such as semantic HTML, skip links, labels, and live status regions

## Supported Languages

- English
- Polish
- Spanish
- French
- German

## Technology Overview

- Semantic HTML
- CSS
- Vanilla JavaScript
- GitHub Pages
- Supabase Auth and the RLS-protected `child_profiles` table for optional parent accounts
- Formspree for voluntary waitlist/product-update email submissions
- Google Analytics tag ID `G-716GP23C93`, loaded only after optional analytics consent
- Local browser story generation from predefined templates and vocabulary

No external AI provider is currently connected. MoonTale supports optional parent accounts and private child profiles, but it has no child accounts, payments, subscriptions, public profiles, comments, messaging or public user-generated-content system.

MoonTale does not require a build step to run in production. The development tooling in `package.json` is optional and exists only for formatting checks and lightweight logic tests.
The JavaScript is organized as browser ES modules, with page-specific entry points under `assets/scripts/pages/`.

## Privacy And Data Flow

- Story settings and generated story previews are stored in browser localStorage under `moontaleStoryProfile` and `moontaleSavedStories`.
- Interface language is stored under `moontaleLanguage`.
- Cookie choice is stored under `moontaleCookieConsent`.
- The story builder does not require an email address.
- Supabase stores the parent account email and authenticated child profiles created explicitly on `account.html`; Row Level Security limits each parent to their own profiles.
- Supabase Auth stores a persistent session in browser storage after sign-in. Signing out removes the local session.
- Formspree receives only a minimal waitlist/product-update payload after adult opt-in: `email`, `source`, `adultConfirmation`, `marketingConsent`, `consentTextVersion`, and `submissionDate`.
- Child nickname, age, interests, story settings and generated story text are not sent to Formspree.
- Google Analytics is blocked until optional analytics consent is accepted.
- Browser-only story/profile data can be removed with the “Delete MoonTale stories and profile” control.
- MoonTale is adult-directed for parents, legal guardians or otherwise authorised caregivers.

## Repository Structure

```text
.
├── assets/
│   ├── milo-moonbear.png
│   └── scripts/
│       ├── core/
│       ├── pages/
│       └── services/
├── data/
│   ├── legal-config.js
│   ├── story-content.js
│   └── vocabulary.js
├── docs/
│   └── legal-launch-checklist.md
├── legal/
│   ├── cookies/
│   ├── ip-infringement/
│   ├── legal-notice/
│   ├── privacy/
│   ├── terms/
│   └── index.html
├── locales/
│   ├── en.js
│   ├── pl.js
│   ├── es.js
│   ├── fr.js
│   └── de.js
├── tests/
│   ├── account.test.mjs
│   ├── legal-static.test.mjs
│   └── moontale.test.mjs
├── account.html
├── index.html
├── personalized-bedtime-stories-for-kids.html
├── story-builder.html
├── story.html
├── styles.css
├── robots.txt
├── sitemap.xml
├── CNAME
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json
├── .editorconfig
├── .gitignore
├── .prettierrc
└── .prettierignore
```

## Local Development

Because the site is static, you can preview it by opening `index.html` in a browser.

For a closer GitHub Pages-style preview, run a simple local static server from the repository root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Optional formatting tools:

```bash
npm install
npm test
npm run format:check
npm run format
```

Do not run formatting across the whole repository unless you have reviewed the resulting diff.

## Manual Testing Checklist

Test the main user flow before publishing changes:

1. Open `index.html` and confirm the homepage loads with styling and images.
2. Open `personalized-bedtime-stories-for-kids.html` and confirm links to the homepage and story builder work.
3. Open `story-builder.html`.
4. Choose each supported interface language and confirm the interface updates.
5. Fill in the story builder form and create a story.
6. Confirm `story.html` opens and displays the generated story.
7. Confirm the generated story follows the selected current language.
8. Confirm story creation works without an email address.
9. Open `account.html` and test registration, email confirmation, sign-in, sign-out, password reset and password recovery.
10. While signed in, create, list, edit and delete a child profile, then confirm a second account cannot access it.
11. Confirm Formspree receives only the minimal waitlist/product-update payload when the adult opts in.
12. Confirm the cookie banner appears for a fresh visitor, optional analytics does not load before consent, and the Cookie Settings button reopens the banner.
13. Confirm the “Delete MoonTale stories and profile” control removes only browser story/profile data, not authenticated Supabase profiles.
14. Confirm the legal footer links open the Privacy Policy, Terms, Cookie Policy, Legal Notice, and IP Infringement Policy.
15. Confirm `robots.txt` and `sitemap.xml` are reachable from the site root.

## Contribution Workflow

Use a branch for every change. Avoid committing directly to `main`.

Recommended branch examples:

- `feature/separate-language-files`
- `fix/story-language-generation`
- `refactor/css-architecture`
- `docs/improve-readme`

Use clear, scoped commit messages:

- `feat(i18n): add language configuration`
- `fix(builder): restore continue button validation`
- `refactor(css): separate builder styles`
- `docs: improve project setup guide`
- `test(story): verify selected story language`

See `CONTRIBUTING.md` for more detailed guidelines.

## Known Limitations

- Story generation currently runs in the browser using local templates and browser storage.
- Authenticated profile flows depend on the configured Supabase project and should be tested against the deployed site with two disposable parent accounts before release.
- Interface language, narrative language, and learning language are resolved separately. Invalid or missing learning-language values fall back to Spanish after validation, and the fallback is exposed in story metadata.
- Automated tests cover language resolution, translation fallback, safe storage parsing, vocabulary selection, and story generation.
- Form submissions depend on the configured Formspree endpoint.
- Google Analytics dashboard retention and data-sharing settings must be verified outside the repository.
- Legal review is still needed before direct child interaction, payments, school use, native apps or new providers are added.
- Language support is limited to the languages listed above.
- The prototype should not be treated as medical, developmental, or educational advice.

## Product Roadmap

High-level areas under consideration:

- More robust story quality controls
- Improved language and vocabulary configuration
- Better saved-story management
- More structured accessibility testing
- A clearer separation between content, translations, and application logic

## Contact

Public contact email: contact@moontaleapp.com

## Copyright

© 2026 MoonTale. All rights reserved.
