# Safety Mojo Orientation

Site orientation and worker clearance — the gate between "hired" and "allowed on site".
A separate app that **shares Pre-qual's Supabase database**: it reads Pre-qual's
companies, projects, project members and staff accounts, and adds its own
`orient_*` tables (`supabase/migrations/057_orientation.sql`).

```
orientation/
  server/   Express + Postgres API (workers, staff, badge-system API, scheduler)
  client/   React + Vite + Tailwind web app (worker mobile flow + staff console)
```

## Who uses what

| User | Where | How they sign in |
|---|---|---|
| Frontline worker | `/o/<project code>` on their own phone (site poster QR or texted link) | Mobile number + SMS one-time code — no password, no app install |
| Anyone at a gate | `/v/<pass code>` (what a phone camera opens when it scans a worker's pass) | none — minimal live status |
| GC safety team / gate | `/staff/projects/:id` — compliance, gate check, roster, content, settings, audit | Existing Safety Mojo (Pre-qual) account |
| Subcontractor foreman/admin | same, scoped to their own workers | Existing account |
| Owner EHS | `/staff/portfolio`, `/staff/standard` | Existing account |
| Badge / turnstile system | `GET /api/v1/clearances`, `GET /api/v1/credentials/:code` | Per-project API key |

Roles come from Pre-qual: the project's owner company is the **owner**, members with
role `gc` are the **GC**, members with role `trade` are **subcontractors**, and
`is_mojo_admin` users see everything.

## How clearance works

A worker's required orientation is the union of three layers (FR-8):

1. **Owner baseline:** set once by the owner and required on every project. GCs cannot edit, archive or replace it; the API has no path for that (FR-9).
2. **Project layer:** site hazards, emergency procedures and muster points, PPE, fall protection, LOTO, hot work, confined space, incident reporting and stop-work authority. A project can't open until every one of these sections is published (FR-11).
3. **Trade layer:** modules matched to the worker's trade, either owner-wide or project-specific.

Content is delivered as short chat messages with read-aloud audio (device speech
engine), followed by comprehension checks. A wrong answer re-teaches the point in
different words and asks again with the options shuffled; the answer key never
leaves the server (FR-3, FR-4). Then the worker:

- takes a photo,
- signs an attestation, which records a manifest of the exact module versions and content hashes completed (FR-5),
- gets a QR site pass (FR-14).

The status is **Photo check at gate** until the gate matches the photo at first
arrival, and then **Cleared** (FR-13).

Every module version is immutable once published (database trigger) and carries one change policy for workers who completed an earlier version (FR-10):

| Policy | Effect on workers who completed an earlier version |
|---|---|
| **Full** | They must complete the module again. Their status becomes *Refresh required*. |
| **Delta** | They complete only the new version's "what changed" section. |
| **New workers only** | Their earlier completion stays valid. |

**Expiry** is the earliest of the module expiry periods. The period comes from the
module override, then the project override, then the owner standard. Expiry and
revocation are evaluated at read time, so a pass stops scanning as cleared the
moment it lapses, with no manual step (FR-21). The scheduler sends SMS reminders to
the worker and in-app notifications (Pre-qual's `notifications` table) to the
subcontractor admins and the GC team.

**Audit (FR-24, FR-25):**

- Attempts, completions, attestations and the audit log are append-only (triggers).
- The audit log is a SHA-256 hash chain.
- One-click export per worker, company or project, with an optional date range: a PDF summary plus CSV detail.

**Language quality:** a version can't be published until every language in the
owner standard is complete *and* a named human reviewer has confirmed each
non-English translation. Editing the text clears that sign-off.

## Requirement coverage (PRD v0.1)

| | Status |
|---|---|
| FR-1 to FR-6, FR-8 to FR-11, FR-13 to FR-16, FR-18 to FR-21, FR-24 to FR-26 (all P0) | Implemented |
| FR-7 Pre-arrival window (P1) | Implemented: per-project "opens N days before start" and a 24-hour "starting soon, incomplete" flag |
| FR-12 Media (P1) | Implemented: images and site maps per message. Video not yet. |
| FR-28 Roster intake (P1) | Partly implemented: CSV/paste bulk invite, and duplicate detection by phone number (one worker record per phone). The HR integrations Safety Mojo already supports aren't wired in yet. |
| FR-17 Time-boxed exceptions (P1) | Not yet |
| FR-27 Procore sync (P1) | Not yet. The `/api/v1` status API is the integration point. |
| FR-22, FR-23 (Phase 2) | Not started. The status engine already handles portable completions per project. |

FR-26 is wired into Pre-qual itself: `OrientationComplianceCard` on the submission
review page and the GC profile page calls `orient_company_compliance()`.

## Setup

1. **Database.** Apply `supabase/migrations/057_orientation.sql` to the Pre-qual Supabase project, the same way as the other migrations.
2. **Server.**
   ```bash
   cd orientation/server && cp .env.example .env   # fill in DATABASE_URL, Supabase keys, Twilio, ORIENTATION_TOKEN_SECRET
   npm install && npm run dev                       # :3002
   ```
   Deploy it like `server/` (for example on Railway): `npm run build && npm start`. Run exactly one instance with the scheduler enabled, or set `ORIENTATION_DISABLE_SCHEDULER=true` on the extra instances.
3. **Client.**
   ```bash
   cd orientation/client && cp .env.example .env
   npm install && npm run dev                       # :5175, proxies /api to :3002
   ```
   Deploy it like `client/` (Vercel; `vercel.json` included).
4. **Optional.** Set `VITE_ORIENTATION_URL` in Pre-qual's client env so the compliance card links into the orientation app.

Worker photos go to a **private** Supabase Storage bucket (`orientation-media`, created
on first upload). They're served only through short-lived signed links, to roles
authorized for that project. There's no biometric matching: photos are compared by a
person at the gate.

## Tests

```bash
cd orientation/server
npm test                                                     # status-engine unit tests
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test   # + full end-to-end API flow
```

The end-to-end test creates a scratch database with a stub of the Pre-qual schema
(`test/prequal_stub.sql`) and the orientation migration. It then runs the whole MVP
flow over HTTP: owner baseline, GC project layer and checklist, sub invites, a
worker in Spanish, gate photo match, versioning, revocation, the badge API,
exports, the audit chain and expiry reminders.

### Local demo without Supabase

```bash
cd orientation/server
ADMIN_DATABASE_URL=postgres://postgres@localhost:5432/postgres SUPABASE_JWT_SECRET=dev-jwt-secret \
  npx tsx scripts/dev-seed.ts orient_dev          # prints DATABASE_URL and staff tokens
DATABASE_URL=postgres://postgres@localhost:5432/orient_dev SUPABASE_JWT_SECRET=dev-jwt-secret npm run dev
```

With no `VITE_SUPABASE_URL` set, the client's staff login accepts a pasted token from
the seed output. Without Twilio, one-time codes are logged and shown on screen in
test mode.

## Open product questions carried from the PRD

These still need decisions. The PRD lists them as open questions, so the build
doesn't settle them:

- Pricing and packaging.
- Biometrics policy. The MVP uses human photo matching only.
- Cross-owner portability.
- Content ownership after a project ends.
- Whether non-Safety Mojo gate systems should recognize the pass. Today the QR resolves only against this API.
- The order of languages after English and Spanish.
- The source of pre-qualification data.
