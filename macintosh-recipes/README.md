# MacIntosh Family Recipes

Design 11: a searchable recipe list beside a readable transcription and original scan.

## Shared data

Vercel hosts the static interface. Supabase project `ybvirernmgqbwomanfqc` stores the shared collection, family accounts, permanent contributor colors, pending recipe proposals, prior versions, and private attachments. No recipes or submissions are kept solely in browser storage. Signed-in pages reload saved data every 20 seconds while visible; Refresh loads it immediately.

All 343 recovered import records are preserved exactly in `original_snapshot`. Recipe corrections create a prior-version record; approval uses version checks to prevent stale overwrites. Every source review flag remains until an owner explicitly verifies the transcription. Scan filenames and page references are retained; actual source PDFs must be uploaded before they can be displayed. No illustrative scan or food image is used as recipe evidence.

## Family access

The owner creates single-use invitation links in **Family & sources** and shares them personally. Each member chooses a password of at least 12 characters. Links expire after seven days. Sign-in uses Supabase Auth; account creation additionally requires a strong, server-stored, hashed invitation. Invitations bypass the need for a paid email service. Invitations are a capability: send each link only to its intended recipient.

Members browse all published recipes and submit new recipes or edits. Only the owner approves publication, invites family, adds contributor records, uploads whole source PDFs, and exports backups. All contributor colors are stored, never regenerated when a page loads. Original attribution and the person who submitted a recipe remain separate.

## Build and deployment

`npm ci` then `npm run build` produces `dist/`. Deploy this directory/project with Vercel. `vercel.json` configures the build and basic response headers. The browser includes only the Supabase publishable key; service credentials are available exclusively inside the Supabase Edge Function.

Database setup is in `schema.sql`; the Edge Function is in `edge/index.ts`. Hosted schema changes were applied through named Supabase migrations. The Edge Function validates bearer tokens and membership for every signed-in action. Registration instead validates and atomically consumes a single-use invite; platform JWT checking is disabled because the function handles these two authentication paths itself.

## Limits and unresolved setup

Keep both services on their free plans. Supabase's free project can pause after one week of inactivity; the owner can resume it in the Supabase dashboard. Private file storage has a free-plan quota; each upload in this interface is limited to 20 MB. Download JSON backups regularly; source PDFs should also be retained separately.

Original PDFs `Recipe box 1.pdf` and `Recipe box 2.pdf` were not present in the recovered site repository or found in the accessible Library. Upload files with these exact names in **Family & sources** to connect existing page references. The site shows honest missing-scan states until then.

Initial publication was made using a temporary Vercel deployment because the connected Vercel tool did not expose deployment access and the CLI was not signed in. A temporary deployment must be claimed by the owner before its expiration to keep it; a preview URL alone does not establish permanent hosting.

Family members who forget passwords currently need account recovery arranged by the owner in the Supabase dashboard. No transactional email service has been configured.

## Recipe deletion

The owner can delete a recipe from its detail view after confirmation. The server enforces owner membership and a current version; deleted recipes are hidden from every account, pending proposals are rejected, and the original record and history remain stored. Source references are omitted from the readable recipe view; originals remain available through the scan tab.

## Web Analytics

Vercel Web Analytics uses the framework-neutral `inject()` integration because this is a plain JavaScript site. Analytics URLs omit query strings and fragments, including private invitation tokens. Enable Web Analytics in the Vercel project dashboard and deploy to activate collection.

## Quick edit

Owner-only editable rows support filtering, bulk category/contributor changes, and tab-separated spreadsheet pasting. Save changes uses the existing version-checked API and keeps failed rows dirty. Original import records and history remain preserved.

## Categories and card photos

The owner adds shared categories in Family & sources. Categories appear in filters, the recipe editor, and Quick edit. Edit a recipe to upload a card photo or select an existing attached image; choose No card photo to return to the default tile. Family proposals require approval. Originals remain separate.

## Interface update — October 2, 2026

This project continues the supplied `macintosh-recipes-categories-photos.zip`.
The shared “Codex Link Help” conversation confirms that archive includes Quick
edit, shared categories, and optional card photos. The older “Build master family
recipe dataset” chat contains a separate, unfinished Firebase migration; this
update retains the Supabase integration in the supplied archive.

The interface now includes:

- Warm paper colours, clearer recipe typography, and a compact owner management menu.
- Mobile category expansion and full-width filter rows, plus Clear filters.
- Recipe URLs, browser Back navigation, and restoration of list position and focus.
- Unsaved-change protection and save/upload status in the recipe editor, grouped fields, and local photo previews.
- Background polling that leaves unchanged content and scan viewers intact; polling pauses during cooking mode and open dialogs.
- Cooking mode with ingredient checkboxes and a selectable current step. Progress lasts for the current browser session and is not saved to the family database.
- Labelled before/after submission comparisons with changed fields first.
- Keyboard-accessible tabs, named dialogs, live result counts, and account recovery guidance.

### Local verification

Run `npm ci`, `npm test`, and `npm run test:browser`.
The browser tests use mock family data and intercept remote requests; they never
write to the live Supabase project. Screenshots are written to `test-results/`.
The browser configuration uses installed Google Chrome on macOS. On another
platform, replace `launchOptions.executablePath` in `playwright.config.js` with
your browser path, or use Playwright's installed Chromium.

Build with `npm run build`; deployable static files are in `dist/`. These local
changes have not been deployed. The supplied ZIP does not include the schema or
Edge Function mentioned above, so live backend validation remains outstanding.
