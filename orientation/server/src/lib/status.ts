/**
 * Clearance status engine — pure functions, no I/O.
 *
 * A worker's assigned orientation is the union of the layers that apply to
 * them (FR-8): owner baseline + project layer + trade layer. Each module is
 * versioned (FR-10); a completion binds to one exact version. When a module
 * gets a new version its change policy decides what happens to people who
 * completed an older one:
 *   - new_only : older completions stay valid
 *   - delta    : they must complete the new version's delta section only
 *   - full     : they must complete the whole module again
 *
 * Clearance (FR-13/FR-14) requires every required module to be validly
 * completed and unexpired, an attestation made after the last of those
 * completions (FR-5), and photo identity verified at first arrival (FR-13).
 * Revocation/suspension (FR-16) overrides everything.
 */

export type ChangePolicy = 'full' | 'delta' | 'new_only'

export interface VersionInfo {
  id: string
  version: number
  changePolicy: ChangePolicy
}

export interface RequiredModule {
  moduleId: string
  title: string
  layer: 'baseline' | 'project' | 'trade'
  expiryDays: number
  /** Published versions, any order. */
  versions: VersionInfo[]
}

export interface CompletionInfo {
  moduleVersionId: string
  completedAt: Date
}

export type ModuleStateKind = 'complete' | 'todo' | 'delta' | 'expired'

export interface ModuleState {
  moduleId: string
  title: string
  layer: RequiredModule['layer']
  current: VersionInfo
  state: ModuleStateKind
  /** True when the worker completed an earlier version that no longer counts in full. */
  superseded: boolean
  validCompletion: { moduleVersionId: string; version: number; completedAt: Date } | null
  expiresAt: Date | null
}

export type StoredStatus =
  | 'not_started'
  | 'in_progress'
  | 'refresh_required'
  | 'pending_verification'
  | 'cleared'

export type EffectiveStatus = StoredStatus | 'expired' | 'revoked' | 'suspended'

export interface EnrollmentFacts {
  identityVerifiedAt: Date | null
  revokedAt: Date | null
  revokeKind: 'revoked' | 'suspended' | null
  latestAttestationAt: Date | null
  hasAnyProgress: boolean
}

export interface StatusResult {
  status: StoredStatus
  effectiveStatus: EffectiveStatus
  modules: ModuleState[]
  /** Earliest module expiry among valid completions; null until everything is complete. */
  expiresAt: Date | null
  /** Attestation timestamp that currently covers the requirement, if any. */
  attestedAt: Date | null
  readyToAttest: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS)
}

export function evaluateModule(
  mod: RequiredModule,
  completions: CompletionInfo[],
  now: Date
): ModuleState {
  const versions = [...mod.versions].sort((a, b) => a.version - b.version)
  if (versions.length === 0) throw new Error(`Module ${mod.moduleId} has no published versions`)
  const current = versions[versions.length - 1]
  const byId = new Map(versions.map((v) => [v.id, v]))

  // Latest completion for this module (highest version, then most recent).
  let best: { v: VersionInfo; at: Date } | null = null
  for (const c of completions) {
    const v = byId.get(c.moduleVersionId)
    if (!v) continue
    if (!best || v.version > best.v.version || (v.version === best.v.version && c.completedAt > best.at)) {
      best = { v, at: c.completedAt }
    }
  }

  const base = { moduleId: mod.moduleId, title: mod.title, layer: mod.layer, current }

  if (!best) {
    return { ...base, state: 'todo', superseded: false, validCompletion: null, expiresAt: null }
  }

  let counts = best.v.version === current.version
  let needsDelta = false
  if (!counts) {
    const later = versions.filter((v) => v.version > best!.v.version)
    const meaningful = later.filter((v) => v.changePolicy !== 'new_only')
    if (meaningful.length === 0) {
      counts = true // every later version applies to new workers only
    } else if (
      meaningful.length === 1 &&
      meaningful[0].changePolicy === 'delta' &&
      meaningful[0].version === current.version
    ) {
      needsDelta = true
    }
  }

  if (!counts) {
    return {
      ...base,
      state: needsDelta ? 'delta' : 'todo',
      superseded: true,
      validCompletion: null,
      expiresAt: null,
    }
  }

  const expiresAt = addDays(best.at, mod.expiryDays)
  return {
    ...base,
    state: expiresAt <= now ? 'expired' : 'complete',
    superseded: false,
    validCompletion: { moduleVersionId: best.v.id, version: best.v.version, completedAt: best.at },
    expiresAt,
  }
}

export function evaluateEnrollment(
  modules: RequiredModule[],
  completions: CompletionInfo[],
  facts: EnrollmentFacts,
  now: Date = new Date()
): StatusResult {
  const states = modules.map((m) => evaluateModule(m, completions, now))

  const allValid = states.length > 0 && states.every((s) => s.validCompletion !== null)
  let expiresAt: Date | null = null
  let lastCompletion: Date | null = null
  if (allValid) {
    for (const s of states) {
      if (!expiresAt || s.expiresAt! < expiresAt) expiresAt = s.expiresAt
      const at = s.validCompletion!.completedAt
      if (!lastCompletion || at > lastCompletion) lastCompletion = at
    }
  }

  const allComplete = states.length > 0 && states.every((s) => s.state === 'complete')
  const attestationCovers =
    allValid && facts.latestAttestationAt !== null && facts.latestAttestationAt >= lastCompletion!

  let status: StoredStatus
  if (states.length === 0) {
    status = 'not_started'
  } else if (allValid && attestationCovers) {
    status = facts.identityVerifiedAt ? 'cleared' : 'pending_verification'
  } else if (states.some((s) => s.superseded) && facts.latestAttestationAt) {
    status = 'refresh_required'
  } else if (facts.hasAnyProgress || completions.length > 0) {
    status = 'in_progress'
  } else {
    status = 'not_started'
  }

  let effectiveStatus: EffectiveStatus = status
  if (facts.revokedAt) effectiveStatus = facts.revokeKind ?? 'revoked'
  else if (expiresAt && expiresAt <= now) effectiveStatus = 'expired'

  return {
    status,
    effectiveStatus,
    modules: states,
    expiresAt,
    attestedAt: attestationCovers ? facts.latestAttestationAt : null,
    readyToAttest: allComplete && !attestationCovers,
  }
}

/** Statuses that count as "cleared to be on site". */
export const isCleared = (s: EffectiveStatus) => s === 'cleared'
