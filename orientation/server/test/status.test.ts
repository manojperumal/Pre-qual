import { describe, expect, it } from 'vitest'
import { evaluateEnrollment, evaluateModule, type RequiredModule } from '../src/lib/status.js'

const now = new Date('2026-11-03T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)

const mod = (id: string, versions: [string, number, 'full' | 'delta' | 'new_only'][], expiryDays = 365): RequiredModule => ({
  moduleId: id,
  title: id,
  layer: 'baseline',
  expiryDays,
  versions: versions.map(([vid, version, changePolicy]) => ({ id: vid, version, changePolicy })),
})

const facts = (over: Partial<Parameters<typeof evaluateEnrollment>[2]> = {}) => ({
  identityVerifiedAt: null,
  revokedAt: null,
  revokeKind: null,
  latestAttestationAt: null,
  hasAnyProgress: false,
  ...over,
})

describe('evaluateModule', () => {
  it('is todo with no completion', () => {
    expect(evaluateModule(mod('m', [['v1', 1, 'full']]), [], now).state).toBe('todo')
  })

  it('is complete when the current version was completed', () => {
    const s = evaluateModule(mod('m', [['v1', 1, 'full']]), [{ moduleVersionId: 'v1', completedAt: daysAgo(10) }], now)
    expect(s.state).toBe('complete')
    expect(s.expiresAt!.getTime()).toBe(daysAgo(10).getTime() + 365 * 86400000)
  })

  it('expires after the module expiry period', () => {
    const s = evaluateModule(mod('m', [['v1', 1, 'full']], 30), [{ moduleVersionId: 'v1', completedAt: daysAgo(31) }], now)
    expect(s.state).toBe('expired')
  })

  it('new_only versions keep older completions valid', () => {
    const m = mod('m', [['v1', 1, 'full'], ['v2', 2, 'new_only']])
    const s = evaluateModule(m, [{ moduleVersionId: 'v1', completedAt: daysAgo(5) }], now)
    expect(s.state).toBe('complete')
    expect(s.validCompletion!.version).toBe(1)
  })

  it('full re-completion versions supersede older completions', () => {
    const m = mod('m', [['v1', 1, 'full'], ['v2', 2, 'full']])
    const s = evaluateModule(m, [{ moduleVersionId: 'v1', completedAt: daysAgo(5) }], now)
    expect(s.state).toBe('todo')
    expect(s.superseded).toBe(true)
  })

  it('a single current delta version requires the delta only', () => {
    const m = mod('m', [['v1', 1, 'full'], ['v2', 2, 'delta']])
    expect(evaluateModule(m, [{ moduleVersionId: 'v1', completedAt: daysAgo(5) }], now).state).toBe('delta')
  })

  it('two missed delta versions require the full module', () => {
    const m = mod('m', [['v1', 1, 'full'], ['v2', 2, 'delta'], ['v3', 3, 'delta']])
    expect(evaluateModule(m, [{ moduleVersionId: 'v1', completedAt: daysAgo(5) }], now).state).toBe('todo')
  })
})

describe('evaluateEnrollment', () => {
  const mods = [mod('a', [['a1', 1, 'full']]), mod('b', [['b1', 1, 'full']], 30)]
  const done = [
    { moduleVersionId: 'a1', completedAt: daysAgo(2) },
    { moduleVersionId: 'b1', completedAt: daysAgo(1) },
  ]

  it('not_started with nothing done', () => {
    expect(evaluateEnrollment(mods, [], facts(), now).status).toBe('not_started')
  })

  it('in_progress and ready to attest once all modules done', () => {
    const r = evaluateEnrollment(mods, done, facts(), now)
    expect(r.status).toBe('in_progress')
    expect(r.readyToAttest).toBe(true)
  })

  it('pending verification after attestation, cleared after identity check', () => {
    const attested = facts({ latestAttestationAt: daysAgo(0.5) })
    expect(evaluateEnrollment(mods, done, attested, now).status).toBe('pending_verification')
    const r = evaluateEnrollment(mods, done, { ...attested, identityVerifiedAt: now }, now)
    expect(r.status).toBe('cleared')
    expect(r.effectiveStatus).toBe('cleared')
    // earliest module expiry wins (module b: 30 days)
    expect(r.expiresAt!.getTime()).toBe(daysAgo(1).getTime() + 30 * 86400000)
  })

  it('an attestation older than the last completion does not count', () => {
    const r = evaluateEnrollment(mods, done, facts({ latestAttestationAt: daysAgo(1.5) }), now)
    expect(r.status).toBe('in_progress')
  })

  it('revocation overrides clearance', () => {
    const r = evaluateEnrollment(
      mods,
      done,
      facts({ latestAttestationAt: now, identityVerifiedAt: now, revokedAt: now, revokeKind: 'suspended' }),
      now
    )
    expect(r.effectiveStatus).toBe('suspended')
  })

  it('expiry flips effective status automatically', () => {
    const old = [
      { moduleVersionId: 'a1', completedAt: daysAgo(40) },
      { moduleVersionId: 'b1', completedAt: daysAgo(40) },
    ]
    const r = evaluateEnrollment(mods, old, facts({ latestAttestationAt: daysAgo(39), identityVerifiedAt: daysAgo(39) }), now)
    expect(r.status).toBe('cleared')
    expect(r.effectiveStatus).toBe('expired')
  })

  it('a new full version after clearance means refresh required', () => {
    const m2 = [mod('a', [['a1', 1, 'full'], ['a2', 2, 'full']]), mods[1]]
    const r = evaluateEnrollment(m2, done, facts({ latestAttestationAt: now, identityVerifiedAt: now }), now)
    expect(r.status).toBe('refresh_required')
  })
})
