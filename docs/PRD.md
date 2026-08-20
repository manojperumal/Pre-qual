# Pre-Qual — Product Requirements Document

> **Status:** Living document — update this alongside feature work, don't let it drift.
> **Audience:** QA, Engineering, Product.
> **Last updated:** 2026-08-20
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
| **Trade** | Subcontractor | Invited by an Owner or GC; completes contractor profile, submits pre-qualification per project, answers assigned questionnaires |
| **Team member (Admin / Contributor)** | Anyone invited into an existing company | *Admin*: full access to their company's projects/team. *Contributor*: only the projects/assignments they're explicitly on. This is orthogonal to Owner/GC/Trade — every company has its own admin/contributor split. |
| **Mojo Admin** | Internal Mojo staff | Platform-wide visibility across all companies; manual billing overrides; impersonation; global question bank management; independent review queue for flagged answers |

**Important internal distinction:** a user's "effective role" is `profile.company_type ?? profile.role` — the codebase is mid-migration from an older single-table model (`role`, `company_name` directly on `profiles`) to a proper multi-tenant model (`companies` table + `new_company_id` + `company_type`). Both fields currently exist; `company_type` is the source of truth. `user_role` (admin/contributor) is a separate axis — a person's permission level *within* their own company, not their company's type.

⚠️ **Known prior incident** (fixed, but worth QA regression-testing): every signup with `role='owner'` was briefly flagged `is_mojo_admin=true`, giving ordinary customers cross-tenant Mojo access. Fixed in migration `017_fix_is_mojo_admin_flag.sql`. **QA should verify no newly-created Owner account can reach `/mojo-admin`.**

---

## 3. Companies & Profiles

### 3.1 Company record
Every non-Mojo user belongs to a `companies` row: `name`, `type` (owner/gc/trade), address/city/state/zip, phone, website, logo, `billing_mode` (see §8), and (in progress) `quickbooks_customer_id`.

### 3.2 Contractor Profile (5-step wizard)
Trades (and GCs, who can also be pre-qualified) fill out a contractor profile:

1. **Company Info** — name, address, trade type, years in business, license #s, employee count
2. **Insurance** — GL (carrier/policy/limits/expiry), Workers' Comp (carrier/policy/limits/expiry), Umbrella (optional)
3. **Safety Record** — EMR, OSHA recordable incidents (up to 5 years), total hours worked (up to 3 years), TRIR, DART rate
4. **PTP Program** — whether they have a Pre-Task Planning program, plus description
5. **Bonding** — bonding company, single/aggregate limits

**"Profile complete" is currently defined narrowly** as `company_name && gl_carrier` being present — i.e. a profile can be flagged "complete" while insurance is expired, safety fields are blank, etc. **QA note:** confirm with product whether this is the intended completeness bar, or whether it should validate more fields / expiry dates.

### 3.3 Company documents
A shared, company-level document library — Safety Manual, COI, W-9, Loss Runs, License, Other. Distinct from two other document tables in the schema (see §11 Known Gaps).

---

## 4. Projects

### 4.1 CRUD & bulk upload
Owners (and, per a recent change, GCs) can create projects individually or via CSV bulk upload:
- Fields: name, description, address, start date, end date
- CSV bulk upload: downloadable template (available directly from the Projects list, not just inside the upload flow), per-row validation preview (missing name / invalid date format) before import, batch insert
- **Note:** GC project-creation is a newly added capability — GCs previously could only join projects an Owner invited them to. QA should specifically test that a GC creating "Projects I Manage" doesn't unexpectedly appear in / conflict with an Owner's own project list, and that QuickBooks/Supabase RLS permits a GC-owned project insert (this hasn't been confirmed against the live RLS policy, which lives in Supabase and isn't in the repo).

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

**QA test matrix suggestion:** every combination of {Owner, GC} × {invites GC, invites Trade, invites team member} × {email, QR} × {expired token, already-accepted token, wrong-email acceptance}.

---

## 6. Pre-Qualification Submission (per project)

⚠️ **Two parallel data models exist** — flag for engineering to confirm scope before QA plans around either:
1. **Legacy:** `prequalifications` table / `PrequalForm` / `PrequalDetail` pages — a flat single-row form. Routes still exist (`/owner/prequal/:id`, `/gc/prequal/new`, etc.) but **are not linked from the sidebar nav** — unclear if still reachable/used in practice.
2. **Current:** `contractor_profiles` + `project_submissions` — used by all current-generation pages (`ProjectSubmissionPage`, `SubmissionReviewPage`) and the one this PRD assumes is in scope.

### 6.1 Submission flow (current model)
A Trade (or GC submitting as a contractor) on a project:
1. Completes their contractor profile (§3.2) — shared across all projects, not per-project
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

A more flexible, configurable system alongside the fixed contractor profile — for anything Owners/GCs want to ask beyond the standard fields.

### 7.1 Question Bank
Reusable question definitions: category (company info / insurance / safety / PTP / bonding / loss runs / compliance), answer type (yes/no, yes/no + comments, multi-select, document upload, text area, number), hint text, required flag, and whether it's global (system-wide) or company-custom.

- Seeded with ~30 base questions + 78 detailed safety-program questions
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

Each answer can carry respondent-facing comments and internal Mojo feedback. Answers can be **AI-suggested** (§9) — QA should verify AI-suggested answers are clearly distinguishable from human-entered ones in the review UI.

### 7.5 Mojo review queue
Independent of the main approve/reject decision — any answer flagged `requires_mojo_review` surfaces in a separate Mojo Admin queue, regardless of what the Owner/GC decided on the questionnaire as a whole.

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

One AI feature exists: **AI-assisted questionnaire autofill.** Given a contractor's documents, an LLM (Claude) proposes answers for a questionnaire, with a strict "only answer from what's actually in the documents, never guess" instruction, plus an internal confidence/source note for Mojo review. PDFs, Word docs, and images are all supported (PDFs and images sent natively; Word docs text-extracted first).

**Document sources — this was recently expanded.** AI-complete no longer only looks at documents manually re-uploaded for that one request. It now automatically pulls in, for the responding company:
1. That company's shared document library (Safety Manual, COI, W-9, Loss Runs, License — from company profile/settings)
2. Everything uploaded to any of that company's own project pre-qualification submissions (COI, OSHA logs, Loss Runs, PTP Photos), across every user at the company
3. Answers already given to other document-upload questions within the same questionnaire
4. Anything manually uploaded for this specific AI-complete request (still supported, for one-off documents not otherwise on file)

The contractor sees what's already on file (with its source) before running AI-complete, so they know what they don't need to re-upload. Capped at 25 auto-included documents (newest first) to bound cost/context — if truncated, the UI says so rather than silently dropping older documents.

**AI answers never overwrite a human-entered answer.** If a person has already typed/selected an answer to a question (whether from scratch or editing a prior AI suggestion), AI-complete skips that question entirely — both in what it asks Claude to answer and, as a second safety check, in what it's willing to save. This was a real gap until recently (an AI-complete run used to silently overwrite manual answers) — QA should regression-test this specifically: manually answer a question, then run AI-complete, and confirm that answer is untouched.

**QA priorities for this feature:**
- Verify it never fabricates an answer when the source document doesn't actually contain the needed info (this is the stated design intent — test it directly with a document that's missing the relevant field)
- Verify AI-suggested answers are visibly marked as such, not indistinguishable from human answers, in every place answers are displayed (assignment page, review page)
- Verify a human-entered answer is never overwritten by a later AI-complete run (see above)
- Test with malformed/corrupted uploads of each supported type (PDF, .doc, .docx, image)
- **Not yet tested end-to-end against a live case** as of this writing — the document-gathering logic and human-answer protection are implemented and typecheck clean, but no real assignment has been run through the full flow yet to confirm actual answer accuracy against real documents.

---

## 12. Known Gaps / In-Progress Work

- **QuickBooks migration:** OAuth connection confirmed working against a live sandbox. **The actual charge call is not yet verified** — this is the one remaining piece before billing can be called done. See §8.
- **AI questionnaire autofill:** document-gathering expansion and human-answer protection are built but not yet run against a real live case end-to-end. See §11.
- **No subscription auto-renewal** (§8) — by design for now, not a bug.
- **Legacy `prequalifications` model** — unclear if still in scope; confirm with engineering before writing test cases against it.
- **Three separate document tables** (`company_documents`, `submission_documents`, `contractor_documents` for questionnaires) — functionally overlapping; worth a consolidation conversation, not urgent for QA.
- **"Profile complete" check is shallow** (§3.2) — doesn't check expiry dates or full-field completeness.
- **GC has two separate "projects" nav entries** whose purpose isn't obviously distinct to a user — see Open Question #4. Deliberately left as-is pending a product decision.

---

## 13. Out of Scope (not built, don't test for)

- Payment processor auto-retry/dunning on failed/expired subscriptions
- Any GC-to-GC or Trade-to-Trade invitation (only Owner→GC/Trade and GC→Trade exist)
- Multi-currency billing (USD only)
- Mobile app (web-responsive only)

---

## 14. Open Questions (log new ones here as they come up)

| # | Question | Raised by | Status |
|---|---|---|---|
| 1 | Is the legacy `prequalifications` flow still reachable/used, or fully dead code? | PRD authoring | Open |
| 2 | Is "profile complete" = `company_name && gl_carrier` the intended bar, or should it check more fields/expiry? | PRD authoring | Open |
| 3 | Does GC-owned project creation work under current Supabase RLS, or does it need a policy update? | PRD authoring | Open |
| 4 | GC sidebar has two separate project lists — "My Projects" (invited onto by an Owner) and "Projects I Manage" (created by the GC itself, added for the CSV bulk-upload feature). Product flagged this as confusing/possibly redundant. Does a GC actually need to own/manage its own projects independent of an Owner, or should that capability (and its nav entry) not exist at all? | Manoj, 2026-08-20 | Open — deliberately left as-is pending this decision |

---

## 15. Change Log

| Date | Change |
|---|---|
| 2026-08-16 | Initial PRD drafted from full codebase review, ahead of QA test planning. |
| 2026-08-20 | QuickBooks OAuth connection confirmed working end-to-end (§8); Stripe DB columns dropped. AI questionnaire autofill expanded to auto-gather company documents + submission history, and to never overwrite human-entered answers (§11). Mojo Admin can now embed a per-Owner Domo dashboard (§9). Added Open Question #4 on the GC's two overlapping project-list nav entries. |
