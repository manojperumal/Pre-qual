# Pre-Qual — Product Requirements Document

> **Status:** Living document — update this alongside feature work, don't let it drift.
> **Audience:** QA, Engineering, Product.
> **Last updated:** 2026-10-21
> **Maintainer:** Manoj Perumal

---

## 1. What Pre-Qual Is

Pre-Qual is a contractor pre-qualification platform. Project **Owners** (e.g. developers) and **General Contractors (GCs)** need to verify that the **Trade contractors** working on their projects meet insurance, safety, and compliance requirements before they're allowed on a job. Pre-Qual replaces manual spreadsheet/email collection of COIs, OSHA logs, and safety questionnaires with a structured platform: invite companies into your "ecosystem," assign them projects and questionnaires, collect and review their documentation, and gate submission on payment where applicable.

Mojo (the platform operator) sits behind every transaction as a neutral biller and reviewer — companies pay Mojo (via QuickBooks), not each other, and Mojo staff can review flagged answers independently of the Owner/GC's own decision.

---

## 2. Roles & Personas

| Role | Who | Key capabilities |
|---|---|---|
| **Owner** | Project developer/owner | Create projects, invite GCs/Trades, set billing mode, review/approve submissions & questionnaires, manage own team |
| **GC (General Contractor)** | Coordinates trades on an owner's project | Invited by an Owner; invites/manages Trades on projects they coordinate; reviews Trade submissions; can also own/manage their own projects (see §4.1 note) |
| **Trade** | Subcontractor | Invited by an Owner or GC; completes organization profile, submits pre-qualification per project, answers assigned questionnaires |
| **Team member (Admin / Contributor)** | Anyone invited into an existing company | *Admin*: full access to their company's projects/team, and the only one who can edit the Organization profile. *Contributor*: only the projects/assignments they're explicitly on, and can view (but not edit) the Organization profile. This is orthogonal to Owner/GC/Trade — every company has its own admin/contributor split. |
| **Mojo Admin** | Internal Mojo staff | Platform-wide visibility across all companies; manual billing overrides; impersonation; global question bank management; independent review queue for flagged answers |

**Important internal distinction:** a user's "effective role" is `profile.company_type ?? profile.role` — the codebase is mid-migration from an older single-table model (`role`, `company_name` directly on `profiles`) to a proper multi-tenant model (`companies` table + `new_company_id` + `company_type`). Both fields currently exist; `company_type` is the source of truth. `user_role` (admin/contributor) is a separate axis — a person's permission level *within* their own company, not their company's type.

⚠️ **Known prior incident** (fixed, but worth QA regression-testing): every signup with `role='owner'` was briefly flagged `is_mojo_admin=true`, giving ordinary customers cross-tenant Mojo access. Fixed in migration `017_fix_is_mojo_admin_flag.sql`. **QA should verify no newly-created Owner account can reach `/mojo-admin`.**

---

## 3. Companies & Profiles

### 3.1 Company record
Every non-Mojo user belongs to a `companies` row: `name`, `type` (owner/gc/trade), address/city/state/zip, phone, website, logo, `billing_mode` (see §8), and (in progress) `quickbooks_customer_id`.

### 3.2 Organization Profile vs. My Account (recently split)
The company-level profile and an individual's personal account used to be the same page and the same nav link ("My Profile"). **They are now two distinct destinations:**

- **Organization** — the last item in the sidebar for every role (Owner/GC/Trade). This is the company-wide profile: the 5-step Contractor Profile wizard for GC/Trade, or the company-info form for Owner. **Admin-editable, contributor-viewable**: a non-admin sees every step/field but all inputs and save actions are disabled, with a banner explaining only a company admin can make changes; they can still freely browse all steps read-only (Back/Next are never disabled).
- **My Account** — reached only via clicking the user's name/avatar in the top-right corner. A personal page (full name, read-only email/role, change-password form) that has nothing to do with the company.

The 5-step Contractor Profile wizard itself (GC/Trade):
1. **Company Info** — name, address, trade type, years in business, license #s, employee count
2. **Insurance** — GL (carrier/policy/limits/expiry), Workers' Comp (carrier/policy/limits/expiry), Umbrella (optional). **Can now attach the actual COI file** directly on this step (writes into the shared `company_documents` library, type `coi`).
3. **Safety Record** — EMR, OSHA recordable incidents (up to 5 years), total hours worked (up to 3 years), TRIR, DART rate. **Can now attach a Safety Manual / OSHA logs file** directly on this step (`company_documents`, type `safety_manual`).
4. **PTP Program** — whether they have a Pre-Task Planning program, plus description. **Can now attach the PTP Program Plan file** (`company_documents`, type `ptp_plan`, new).
5. **Bonding** — bonding company, single/aggregate limits. **Can now attach a Bonding Document file** (`company_documents`, type `bond`, new).

**"Profile complete" is currently defined narrowly** as `company_name && gl_carrier` being present — i.e. a profile can be flagged "complete" while insurance is expired, safety fields are blank, etc. **QA note:** confirm with product whether this is the intended completeness bar, or whether it should validate more fields / expiry dates.

### 3.3 Company documents (Document Library) — now a genuinely unified pool
A shared, company-level document library — Safety Manual, COI, W-9, Loss Runs, License, SOP, PTP Program Plan, Bonding Document, Other. As of this update, **three previously-separate sources all feed the same `company_documents` table/bucket**, and are therefore all available to questionnaire AI-complete (§11):
1. Manual uploads via the Document Library page itself
2. Files attached directly on the Organization profile's Insurance/Safety/PTP/Bonding steps (§3.2, new)
3. **Published** Ask Mojo drafts (§11a) — and now also **unpublished Ask Mojo reference documents**, uploaded mid-draft to ground a thread, even before the thread is published

Distinct from `submission_documents` (per-project pre-qual uploads, §6) and `contractor_documents` (an older, unrelated table) — see §12 Known Gaps.

---

## 4. Projects

### 4.1 CRUD & bulk upload
Owners (and, per a recent change, GCs) can create projects individually or via CSV bulk upload:
- Fields: name, description, address, start date, end date
- CSV bulk upload: downloadable template (available directly from the Projects list, not just inside the upload flow), per-row validation preview (missing name / invalid date format) before import, batch insert
- **Note:** GC project-creation is a newly added capability — GCs previously could only join projects an Owner invited them to. QA should specifically test that a GC creating "Projects I Manage" doesn't unexpectedly appear in / conflict with an Owner's own project list, and that QuickBooks/Supabase RLS permits a GC-owned project insert (this hasn't been confirmed against the live RLS policy, which lives in Supabase and isn't in the repo).
- GCs can now also **add an existing trade from their ecosystem directly to a specific project** from the Projects I Manage / project detail page, rather than only via a fresh invitation.

### 4.2 Project membership
Companies join a project via invitation acceptance (`project_members` table, role = owner/gc/trade per member). A project can have exactly one coordinating GC (assumption baked into billing logic — see §8) plus any number of Trades.

---

## 5. Invitations

- **Two invite categories:**
  - *New-company invites* (`gc`, `trade`) — bring an entirely new company into the ecosystem
  - *Team-member invites* (`gc_member`, `owner_member`, `trade_member`) — add a colleague to the sender's own existing company, with a chosen `intended_user_role` (admin or contributor)
- **Two delivery modes:** email (via SMTP, falls back to logging the link if unconfigured — **QA must confirm SMTP is actually configured in whichever environment they're testing, or invite emails silently won't send**) or QR code (skips email-match verification on acceptance, since there's no real recipient email).
- Invitations expire after **7 days** and can be linked to zero, one, or multiple projects (`invitation_projects` join table).
- Acceptance sets the acceptor's company on team-member invites, and inserts `project_members` for every linked project.
- Sender gets a notification when their invite is accepted (§10).
- Invited GCs/Trades the sender has an ongoing relationship with are now listed directly on the GCs/Trades pages (not only visible via the Recent Invitations panel), including projects they're on.

**QA test matrix suggestion:** every combination of {Owner, GC} × {invites GC, invites Trade, invites team member} × {email, QR} × {expired token, already-accepted token, wrong-email acceptance}.

---

## 6. Pre-Qualification Submission (per project)

⚠️ **Two parallel data models exist** — flag for engineering to confirm scope before QA plans around either:
1. **Legacy:** `prequalifications` table / `PrequalForm` / `PrequalDetail` pages — a flat single-row form. Routes still exist (`/owner/prequal/:id`, `/gc/prequal/new`, etc.) but **are not linked from the sidebar nav** — unclear if still reachable/used in practice.
2. **Current:** `contractor_profiles` + `project_submissions` — used by all current-generation pages (`ProjectSubmissionPage`, `SubmissionReviewPage`) and the one this PRD assumes is in scope.

### 6.1 Submission flow (current model)
A Trade (or GC submitting as a contractor) on a project:
1. Completes their Organization profile (§3.2) — shared across all projects, not per-project
2. Uploads project-specific documents: COI, OSHA 300 Log, OSHA 301 Log, OSHA Citations, 5-Year Loss Runs, and (if they have a PTP program) PTP Photos
3. Saves as **draft** or **submits** — submission takes a snapshot of the profile at that moment
4. Auto-flagged if: no PTP program (`flagged_no_ptp`), or EMR > 1.0 (`flagged_high_emr`)
5. **Submission is blocked if payment is required and unpaid** (§8) — attempting to submit without payment should show a clear error, not fail silently

### 6.2 Statuses
`draft → submitted → under_review → approved | rejected | needs_more_info`

### 6.3 Review
The governing Owner/GC sees the full profile snapshot, uploaded docs, risk flags, and any prior reviewer notes, and can Approve / Reject / Request More Info — re-decidable even after an earlier decision (i.e. an Owner can flip a decision later).

---

## 7. Questionnaires

A more flexible, configurable system alongside the fixed Organization profile — for anything Owners/GCs want to ask beyond the standard fields.

### 7.1 Question Bank
Reusable question definitions: category (company info / insurance / safety / PTP / bonding / loss runs / compliance / financial review), answer type (yes/no, yes/no + comments, multi-select, document upload, text area, number), hint text, required flag, and whether it's global (system-wide) or company-custom.

- Seeded with ~30 base questions + 78 detailed safety-program questions, plus a newer Financial Review category
- **`requires_mojo_review`** flag — routes an individual answer to Mojo's own review queue regardless of the Owner/GC's decision (global questions: Mojo-only toggle; company questions: any company admin)
- **Conditional logic** — a question in a given questionnaire can depend on another question's answer (show/hide)
- **File type restriction** — document-upload questions can restrict allowed file types
- **Tags, versioning, duplication** — every edit snapshots the prior version; questions can be duplicated as a starting point for a variant

### 7.2 Questionnaires (templates)
Named collections of question-bank questions, optionally a system-wide template (e.g. the seeded "GC-Prequal" template), shared/editable by any admin at the owning company (not locked to whoever created it).

### 7.3 Assignment
Three ways to assign a questionnaire to a company:
1. **Direct** — one company, optionally scoped to one project
2. **Whole-project rule** — auto-fans-out to every company currently on the project, and auto-catches-up new companies that join later
3. **Exemption** — a company can be explicitly exempted from a project-wide rule without deleting the rule (auditable — this should leave a trace, not just silently vanish)

Assignments target a company, not an individual — any admin/contributor there can complete it, but `assignee_id` records who actually did the work.

### 7.4 Response lifecycle
`pending → in_progress → submitted → approved | rejected | needs_more_info`

Each answer can carry respondent-facing comments and internal Mojo feedback, and shows a live **AI vs. manual vs. pending** answer breakdown while the respondent works through it. Answers can be **AI-suggested** (§11) — visibly marked as such everywhere they're displayed, and the mark clears the moment a human edits that answer.

### 7.5 Mojo review queue
Independent of the main approve/reject decision — any answer flagged `requires_mojo_review` surfaces in a separate Mojo Admin queue, regardless of what the Owner/GC decided on the questionnaire as a whole.

### 7.6 Review tooling (new) — three independent layers of reviewer feedback
A reviewer (Owner/GC) now has three distinct, independently-usable tools when reviewing a submitted questionnaire, in addition to the existing overall decision:

1. **Overall decision** (unchanged mechanism, relabeled for clarity): **Accept** / **Send Back for Clarification** / **Reject** at the whole-questionnaire level, setting `questionnaire_assignments.status`.
2. **Per-question Approve/Reject** (`questionnaire_responses.review_status`: pending/approved/rejected) — a reviewer can approve or reject each individual answer with one click (click again to undo back to pending), independent of the overall decision. The contractor sees the same Approved/Rejected badge on their own response page.
3. **Per-question "needs clarification" flag** (`questionnaire_responses.needs_clarification`) with its own note (reuses the `mojo_feedback` field) — lets a reviewer mark specific answers as needing more info without changing the overall status. When the assignment is sent back, the contractor's response page shows a banner with the reviewer's overall note plus a jump-link list of exactly which questions were flagged, each with an amber border and a "Needs your attention" badge.
4. **Per-question note thread (audit trail)** — a new, separate, append-only thread (`questionnaire_response_notes`) on every question, open to both parties (the contractor's whole company and whoever assigned it). Each note shows its author, their role, and a timestamp. This is distinct from the single-value `company_comments`/`mojo_feedback` fields, which only ever hold the latest value with no history — the note thread is a genuine back-and-forth conversation log. Collapsible per question, shown on both the review page and the response page.

**AI Summary (new):** at the top of the review page, a reviewer can click "Generate Summary" to have Claude read every question/answer for that submission on demand (not persisted — regenerated each time) and return two bullet lists: **"Pay closer attention to"** (risk flags, missing info, concerning or inconsistent answers) and **"Overall summary"** (a concise read of how the contractor answered as a whole). This is purely advisory — it doesn't change any data, just helps a reviewer triage before deciding.

---

## 8. Billing

- **Billing mode** (per company, set by that company's own admin): `pays_all` (the inviting company covers everyone it invites) vs `platform_only` (invited companies pay their own way). Mojo is always the actual payee either way — this setting only decides *who* gets billed.
- **Payment is required at submission time, not invite acceptance** — a company can join for free and complete its profile before any money changes hands.
- **Governing billing company logic:** if the submitting company *is* the project's coordinating GC, the Project Owner governs billing; otherwise (a Trade), the coordinating GC governs if one exists, else the Owner.
- **Pricing:** $150 one-time per-project fee, or $450/year platform-wide subscription (covers all projects for that company).
- **No auto-renewal yet** — an annual subscription just records a fixed one-year active window; nothing re-charges automatically when it lapses. **This is a known gap, not a bug** — flag it if QA finds a subscription silently expiring with no renewal prompt, that's currently expected.
- **Payment processor: migrated from Stripe to QuickBooks Payments.** Stripe code and its DB columns have been fully removed. The QuickBooks OAuth connection (one platform-wide sandbox company, admin-authorized from the Mojo Admin dashboard) has been **confirmed working end-to-end** — token exchange and storage verified against a live sandbox connection. **Not yet verified: an actual charge** (`/api/payments/project`, `/api/payments/subscription`) — the request/response shape for QuickBooks' Payments API charge call was written from documentation, not tested live, since a real project/company on `platform_only` billing hasn't been run through it yet. **QA should treat any payment-flow test as the first real test of that code path** and report the exact error if a charge fails — that's expected to need at least one iteration.
- **Manual override:** Mojo Admin can mark a project as paid or activate a subscription directly, for payments handled outside the platform (check/wire).

---

## 9. Mojo Admin

Platform-wide internal role, separate layout/nav from customer-facing roles:
- **Dashboard** — company counts by type, active subscription count, pending review count, recent companies, QuickBooks connection status
- **Companies** — list + detail view (team roster, ecosystem stats, billing mode)
- **Question Bank admin** — manage global questions, toggle Mojo-review requirement
- **Review Queue** — flagged-answer review, independent of company-level decisions
- **Impersonation** — view/act as any company's admin, with actions attributed to that admin's real account (not Mojo) — **QA should specifically verify the attribution**, since a mis-attributed impersonated action is a serious audit-trail bug
- **Manual billing overrides** (§8)
- **Domo dashboard embed** — on an Owner company's detail page, Mojo Admin can paste a public Domo dashboard embed URL; it then renders as an iframe on that Owner's home page. Enforced at the database level (a trigger) so only a Mojo admin can ever set it, even via a direct API call — an Owner's own admin cannot set this for themselves despite otherwise having broad update rights on their own company record. Both the admin form and the render step validate the URL is `https://` on a `*.domo.com` host before it's used. **QA should verify:** a non-Domo URL is rejected by the form, an Owner cannot set/change it themselves, and clearing the field removes the dashboard from the Owner's home page.

---

## 10. Notifications

In-app notifications, generated entirely by database triggers (not application code) on:
1. Invitation accepted → notifies sender
2. Questionnaire assignment created → notifies assignee
3. Questionnaire assignment submitted → notifies assigner; decided → notifies assignee
4. Project submission created/submitted → notifies project owner; decided → notifies contractor

QA should verify links inside notifications route to the correct role-prefixed path (`/owner/...`, `/gc/...`, `/trade/...`) for the recipient's actual role — a notification generated once but read via a different role context is an easy place for a broken link to hide.

---

## 11. AI Features

### 11a. Ask Mojo (AI document drafting)
A chat-based tool (any role/company) for drafting safety manuals, SOPs, and similar documents from scratch or from an uploaded reference document, with a running "current draft" per thread. A company admin can **publish** a finished draft directly into the Document Library (§3.3). Reference documents uploaded mid-thread (before publishing) are now also automatically available to questionnaire AI-complete below, not just the final published document.

### 11b. AI-assisted questionnaire autofill ("Complete with AI")
Given a contractor's documents, an LLM (Claude) proposes answers for a questionnaire, with a strict "only answer from what's actually in the documents, never guess" instruction, plus an internal confidence/source note for Mojo review. PDFs, Word docs, images (JPEG/PNG/GIF/WEBP), and CSV/plain-text files are all supported — PDFs and images are sent natively, Word docs are text-extracted first, and CSV/text files are now sent as plain text (previously, any non-PDF/Word file was mistakenly sent to Claude mislabeled as a JPEG image, which failed outright on anything else, including CSVs).

**Document sources are now a single, genuinely unified pool.** AI-complete automatically pulls in, for the responding company:
1. The company's shared Document Library (§3.3) — including files attached directly on the Organization profile, and Ask Mojo drafts/reference documents
2. Everything uploaded to any of that company's own project pre-qualification submissions (COI, OSHA logs, Loss Runs, PTP Photos), across every user at the company
3. Answers already given to other document-upload questions within the same questionnaire
4. Anything manually uploaded for this specific AI-complete request (still supported, for one-off documents not otherwise on file)

**The contractor can now pick and choose which on-file documents to use** before running AI-complete — the "already on file" list is a checklist (all checked by default); unchecking a document excludes it from that run. Capped at 25 auto-included documents (newest first) to bound cost/context — if truncated, the UI says so rather than silently dropping older documents.

**Mislabeled/corrupted files are now skipped, not fatal.** If a file's extension says it's an image but its actual bytes don't match (a renamed screenshot, a corrupted upload, etc.), the server verifies the real file signature (JPEG/PNG/GIF/WEBP magic bytes) before sending it to Claude, skips anything that doesn't match, and reports which file(s) were skipped back to the UI — previously, one bad file failed the entire AI-complete request with an opaque "Could not process image" error.

**AI answers never overwrite a human-entered answer.** If a person has already typed/selected an answer to a question (whether from scratch or editing a prior AI suggestion), AI-complete skips that question entirely — both in what it asks Claude to answer and, as a second safety check, in what it's willing to save.

**QA priorities for this feature:**
- Verify it never fabricates an answer when the source document doesn't actually contain the needed info
- Verify AI-suggested answers are visibly marked as such everywhere answers are displayed, and the mark clears on edit
- Verify a human-entered answer is never overwritten by a later AI-complete run
- Test with malformed/corrupted uploads of each supported type (PDF, .doc, .docx, image, CSV, text)
- Verify unchecking a document in the "on file" list actually excludes it from the AI request (not just the display)

### 11c. AI review summary
See §7.6 — an on-demand, non-persisted bullet-point summary for a reviewer, generated by the same underlying model.

---

## 12. Dashboards & Analytics

- **Owner/GC/Trade dashboards** now include charts (submission trend, status breakdown, questionnaire/project-status breakdown) alongside the existing stat cards, built with Recharts. **These currently run on placeholder data** (`client/src/lib/dummyAnalytics.ts`) — not yet wired to real queries. Every dashboard stat card is clickable (links to the relevant list page, or scrolls to the relevant section on the same page) — "drillable" by design.
- **Safety Scorecard** (Owner only, sidebar: Safety Scorecard) — a new dedicated page modeled on an external scorecard dashboard: Project/Subcontractor/Month filters, speedometer-style gauges (banded red/amber/green with a needle) for an overall Safety Score and for five categories (Pre Task Plan, Observation, Responsiveness, Kudos, WPS), each with its own MoM trend chart, a by-subcontractor bar chart, and an overview table. **Also running entirely on placeholder data** (`client/src/lib/dummyScorecard.ts`) — not yet connected to real tracking data (PTP submissions, observations, kudos, WPS, responsiveness logs), which doesn't exist yet as a data source anywhere else in the app. Every gauge/card is drillable (scrolls to its detail table).

**This section is explicitly flagged for product/engineering follow-up:** both the dashboard charts and the Safety Scorecard are UI/UX work built ahead of the real data pipeline, specifically so stakeholders could react to the layout and design before committing engineering time to the underlying queries and (for the Scorecard) an entirely new tracking data model. **Do not test these for data accuracy** — there is none yet by design. Do test layout, responsiveness, and that every drillable card/gauge navigates or scrolls correctly.

---

## 13. Known Gaps / In-Progress Work

- **QuickBooks migration:** OAuth connection confirmed working against a live sandbox. **The actual charge call is not yet verified** — this is the one remaining piece before billing can be called done. See §8.
- **Dashboard charts and Safety Scorecard run on placeholder data** — see §12. Needs real reporting queries (dashboards) and an entirely new tracking data model (Scorecard categories) before they reflect reality.
- **No subscription auto-renewal** (§8) — by design for now, not a bug.
- **Legacy `prequalifications` model** — unclear if still in scope; confirm with engineering before writing test cases against it.
- **Multiple document tables** (`company_documents`, `submission_documents`, `contractor_documents` for questionnaires) — `company_documents` is now the unified hub for the Document Library/Organization profile/Ask Mojo (§3.3), but `submission_documents` (per-project pre-qual uploads) and the older `contractor_documents` table remain separate and functionally overlapping; worth a further consolidation conversation, not urgent for QA.
- **"Profile complete" check is shallow** (§3.2) — doesn't check expiry dates or full-field completeness.
- **GC has two separate "projects" nav entries** whose purpose isn't obviously distinct to a user — see Open Question #4. Deliberately left as-is pending a product decision.
- **Reviewer-side access to the three new per-question review tools (§7.6) and the AI summary (§11c) is currently scoped to whoever is a member of the assignee's company, or the specific person who created the assignment** — another admin at the *reviewing* (Owner/GC) company who didn't personally create the assignment may not see it. This mirrors a pre-existing limitation in the underlying access check and wasn't widened as part of this work; flag if a demo needs multiple reviewer-side admins on the same assignment.

---

## 14. Out of Scope (not built, don't test for)

- Payment processor auto-retry/dunning on failed/expired subscriptions
- Any GC-to-GC or Trade-to-Trade invitation (only Owner→GC/Trade and GC→Trade exist)
- Multi-currency billing (USD only)
- Mobile app (web-responsive only)
- Real data behind the dashboard charts or Safety Scorecard (§12) — UI/UX only for now

---

## 15. Open Questions (log new ones here as they come up)

| # | Question | Raised by | Status |
|---|---|---|---|
| 1 | Is the legacy `prequalifications` flow still reachable/used, or fully dead code? | PRD authoring | Open |
| 2 | Is "profile complete" = `company_name && gl_carrier` the intended bar, or should it check more fields/expiry? | PRD authoring | Open |
| 3 | Does GC-owned project creation work under current Supabase RLS, or does it need a policy update? | PRD authoring | Open |
| 4 | GC sidebar has two separate project lists — "My Projects" (invited onto by an Owner) and "Projects I Manage" (created by the GC itself, added for the CSV bulk-upload feature). Product flagged this as confusing/possibly redundant. Does a GC actually need to own/manage its own projects independent of an Owner, or should that capability (and its nav entry) not exist at all? | Manoj, 2026-08-20 | Open — deliberately left as-is pending this decision |
| 5 | What should actually drive the Safety Scorecard's five categories (Pre Task Plan, Observation, Responsiveness, Kudos, WPS)? There's no existing data source for any of them — this needs a product decision on what to track and how it's captured (manual entry? a new submission type? an integration?) before the Scorecard can move off placeholder data. | Manoj, 2026-10-21 | Open |
| 6 | Should another admin at the reviewing (Owner/GC) company — not just whoever created the assignment — be able to see and use the per-question review tools (§7.6)? Current access check only recognizes the assignee's company or the literal creator. | PRD authoring | Open |

---

## 16. Change Log

| Date | Change |
|---|---|
| 2026-08-16 | Initial PRD drafted from full codebase review, ahead of QA test planning. |
| 2026-08-20 | QuickBooks OAuth connection confirmed working end-to-end (§8); Stripe DB columns dropped. AI questionnaire autofill expanded to auto-gather company documents + submission history, and to never overwrite human-entered answers (§11). Mojo Admin can now embed a per-Owner Domo dashboard (§9). Added Open Question #4 on the GC's two overlapping project-list nav entries. |
| 2026-10-21 | **Organization vs. My Account split** (§3.2): company profile moved to its own last-in-sidebar "Organization" page (admin-edit/contributor-view), personal account moved to a new "My Account" page behind the top-right avatar. **Document unification** (§3.3, §11b): Organization profile can now attach files directly (COI/safety manual/PTP plan/bond, two new document types); Ask Mojo reference documents (not just published drafts) now feed AI-complete; AI-complete lets the contractor pick/exclude on-file documents before running; CSV/text files and genuinely-validated images are now handled correctly (previously any non-PDF/Word file was mis-sent as a JPEG, breaking on CSVs and silently risking corrupted-image crashes). **Reviewer tooling** (§7.6, §11c): added an on-demand AI review summary, per-question Approve/Reject, a per-question "needs clarification" flag with contractor-facing banner/badges, and a full per-question note audit trail visible to both parties. **Dashboards & Safety Scorecard** (§12, new section): added charts to Owner/GC/Trade dashboards and a new speedometer-gauge Safety Scorecard page, both intentionally built on placeholder data ahead of the real reporting/tracking pipeline; made all dashboard/scorecard stat cards drillable. Added Open Questions #5 and #6. |
