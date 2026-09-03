import { QuestionCategory } from '@/hooks/useQuestionnaires'

export const CATEGORY_ORDER: QuestionCategory[] = [
  'company_info',
  'insurance',
  'safety',
  'ptp',
  'bonding',
  'financial',
  'loss_runs',
  'compliance',
]

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  company_info: 'Company Info',
  insurance: 'Insurance',
  safety: 'Safety',
  ptp: 'PTP Program',
  bonding: 'Bonding',
  financial: 'Financial Review',
  loss_runs: 'Loss Runs',
  compliance: 'Compliance',
}

export const CATEGORY_COLORS: Record<QuestionCategory, string> = {
  company_info: 'bg-blue-100 text-blue-700',
  insurance: 'bg-purple-100 text-purple-700',
  safety: 'bg-red-100 text-red-700',
  ptp: 'bg-orange-100 text-orange-700',
  bonding: 'bg-yellow-100 text-yellow-700',
  financial: 'bg-emerald-100 text-emerald-700',
  loss_runs: 'bg-pink-100 text-pink-700',
  compliance: 'bg-green-100 text-green-700',
}

export interface CategoryGroup<T> {
  category: QuestionCategory
  label: string
  items: T[]
}

/** Groups items by question category, in the canonical category order — used
 * anywhere questions are displayed (response, review, bank) for a consistent,
 * visually organized layout instead of one long flat list. */
export function groupByCategory<T>(
  items: T[],
  getCategory: (item: T) => QuestionCategory | undefined
): CategoryGroup<T>[] {
  const groups = new Map<QuestionCategory, T[]>()
  for (const item of items) {
    const cat = getCategory(item)
    if (!cat) continue
    const list = groups.get(cat) ?? []
    list.push(item)
    groups.set(cat, list)
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    items: groups.get(c)!,
  }))
}
