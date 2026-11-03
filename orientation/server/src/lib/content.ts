import crypto from 'node:crypto'
import { z } from 'zod'
import type { Check, ModuleContent, Segment } from '../content/templates.js'
import { signedMediaUrl } from './storage.js'

const l10n = z.record(z.string(), z.string().max(4000))

export const segmentSchema = z.object({
  id: z.string().min(1).max(40),
  text: l10n,
  image_path: z.string().max(300).nullish(),
})

export const checkSchema = z.object({
  id: z.string().min(1).max(40),
  prompt: l10n,
  options: z.record(z.string(), z.array(z.string().max(500)).min(2).max(6)),
  correct_index: z.number().int().min(0).max(5),
  reteach: l10n,
})

export const contentSchema = z.object({
  title: l10n.optional(),
  segments: z.array(segmentSchema).max(60),
  checks: z.array(checkSchema).max(20),
  delta: z
    .object({ segments: z.array(segmentSchema).max(60), checks: z.array(checkSchema).max(20) })
    .optional(),
})

export type Content = z.infer<typeof contentSchema>

const present = (s: string | undefined) => typeof s === 'string' && s.trim().length > 0

/**
 * Problems that block publishing a version: every segment and check must be
 * complete in every language of the owner standard, non-English languages
 * must be confirmed by a human reviewer, and a delta policy needs a delta.
 */
export function publishProblems(
  content: Content,
  opts: { languages: string[]; translationsReviewed: Record<string, unknown>; changePolicy: string; version: number }
): string[] {
  const problems: string[] = []
  if (content.segments.length === 0) problems.push('Add at least one content segment')

  const checkParts = (label: string, segs: Segment[], checks: Check[]) => {
    for (const lang of opts.languages) {
      segs.forEach((s, i) => {
        if (!present(s.text[lang])) problems.push(`${label} segment ${i + 1}: missing ${lang.toUpperCase()} text`)
      })
      checks.forEach((c, i) => {
        if (!present(c.prompt[lang])) problems.push(`${label} check ${i + 1}: missing ${lang.toUpperCase()} question`)
        if (!present(c.reteach[lang])) problems.push(`${label} check ${i + 1}: missing ${lang.toUpperCase()} re-teach text`)
        const opts2 = c.options[lang]
        if (!opts2 || opts2.length < 2 || opts2.some((o) => !present(o)))
          problems.push(`${label} check ${i + 1}: ${lang.toUpperCase()} needs at least two answer options`)
      })
    }
    checks.forEach((c, i) => {
      const lens = opts.languages.map((l) => c.options[l]?.length ?? 0)
      if (new Set(lens).size > 1) problems.push(`${label} check ${i + 1}: every language must have the same number of options`)
      if (c.correct_index >= (lens[0] ?? 0)) problems.push(`${label} check ${i + 1}: correct answer is out of range`)
    })
  }
  checkParts('', content.segments as Segment[], content.checks as Check[])

  if (opts.changePolicy === 'delta') {
    if (opts.version === 1) problems.push('The first version of a module cannot use the delta policy')
    else if (!content.delta || content.delta.segments.length === 0)
      problems.push('Delta policy selected: add the delta segments returning workers will see')
    else checkParts('Delta', content.delta.segments as Segment[], content.delta.checks as Check[])
  }

  for (const lang of opts.languages) {
    if (lang === 'en') continue
    if (!opts.translationsReviewed?.[lang])
      problems.push(`${lang.toUpperCase()} translation must be confirmed by a qualified human reviewer before publishing`)
  }
  return [...new Set(problems.map((p) => p.trim()))]
}

export function contentHash(content: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

const pick = (m: Record<string, string | undefined> | undefined, lang: string) => (m?.[lang] ?? m?.en ?? '') as string

/** Worker-facing projection: single language, no answer key. */
export function localizeForWorker(content: ModuleContent & { title?: Record<string, string> }, lang: string, mode: 'full' | 'delta') {
  const part = mode === 'delta' && content.delta ? content.delta : content
  return {
    segments: part.segments.map((s) => ({
      id: s.id,
      text: pick(s.text, lang),
      image_url: signedMediaUrl(s.image_path ?? null, 60 * 60),
    })),
    checks: part.checks.map((c) => ({
      id: c.id,
      prompt: pick(c.prompt, lang),
      options: c.options[lang] ?? c.options.en ?? [],
    })),
  }
}

export function partFor(content: ModuleContent, mode: 'full' | 'delta') {
  return mode === 'delta' && content.delta ? content.delta : content
}

export const localizedTitle = (content: { title?: Record<string, string> }, fallback: string, lang: string) =>
  content.title?.[lang] || content.title?.en || fallback
