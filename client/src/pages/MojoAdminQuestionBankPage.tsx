import { useQuestionBank, useUpdateQuestionMojoReview, QuestionCategory } from '@/hooks/useQuestionnaires'
import { ShieldCheck } from 'lucide-react'

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  company_info: 'Company Info',
  insurance: 'Insurance',
  safety: 'Safety',
  ptp: 'PTP Program',
  bonding: 'Bonding',
  loss_runs: 'Loss Runs',
  compliance: 'Compliance',
}

export default function MojoAdminQuestionBankPage() {
  const { data: questions = [], isLoading } = useQuestionBank()
  const updateMojoReview = useUpdateQuestionMojoReview()

  const globalQuestions = questions.filter((q) => q.is_global)
  const grouped = Object.entries(CATEGORY_LABELS)
    .map(([value, label]) => ({
      value: value as QuestionCategory,
      label,
      questions: globalQuestions.filter((q) => q.category === value),
    }))
    .filter((g) => g.questions.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Global Question Bank</h1>
        <p className="mt-1 text-sm text-gray-500">
          Toggle which global questions require Mojo review before a company sees the answer as final.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.value} className="card overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{group.label}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {group.questions.map((q) => (
                  <div key={q.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <p className="text-sm text-gray-900 flex-1">{q.question_text}</p>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={q.requires_mojo_review}
                        onChange={(e) => updateMojoReview.mutate({ id: q.id, requiresMojoReview: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <ShieldCheck size={13} className={q.requires_mojo_review ? 'text-brand-600' : 'text-gray-300'} />
                      Mojo Review
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
