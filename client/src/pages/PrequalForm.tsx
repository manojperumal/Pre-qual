import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFormContext, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useCreatePrequal, useUpdatePrequal, usePrequal } from '@/hooks/usePrequals'
import { FileUpload } from '@/components/FileUpload'
import { PrequalFormData } from '@/types'
import { CheckCircle, ChevronRight, ChevronLeft, Save } from 'lucide-react'
import clsx from 'clsx'

// ─── Zod schemas per step ───────────────────────────────────────────────────

const step1Schema = z.object({
  company_name: z.string().min(2, 'Company name is required'),
  address: z.string().min(5, 'Address is required'),
  years_in_business: z.coerce.number().int().min(0, 'Must be 0 or more'),
  trade_type: z.string().min(2, 'Trade type / specialty is required'),
  license_numbers: z.string().min(1, 'At least one license number is required'),
  state: z.string().min(2, 'State is required'),
})

const step2Schema = z.object({
  gl_carrier: z.string().min(1, 'GL carrier is required'),
  gl_policy: z.string().min(1, 'GL policy # is required'),
  gl_limits: z.string().min(1, 'GL limits are required'),
  gl_expiry: z.string().min(1, 'GL expiry date is required'),
  wc_carrier: z.string().min(1, 'WC carrier is required'),
  wc_policy: z.string().min(1, 'WC policy # is required'),
  wc_limits: z.string().min(1, 'WC limits are required'),
  wc_expiry: z.string().min(1, 'WC expiry date is required'),
  umbrella_carrier: z.string().optional(),
  umbrella_policy: z.string().optional(),
  umbrella_limits: z.string().optional(),
  umbrella_expiry: z.string().optional(),
})

const step3Schema = z.object({
  emr_value: z.coerce.number().min(0, 'EMR must be a positive number'),
  osha_year1: z.coerce.number().int().min(0),
  osha_year2: z.coerce.number().int().min(0),
  osha_year3: z.coerce.number().int().min(0),
  trir: z.coerce.number().min(0, 'TRIR must be positive'),
  safety_program: z.string().min(10, 'Please describe your safety program (min 10 chars)'),
})

const step4Schema = z.object({
  annual_revenue: z.coerce.number().min(0, 'Annual revenue must be positive'),
  bonding_single: z.coerce.number().min(0, 'Single project bond capacity must be positive'),
  bonding_aggregate: z.coerce.number().min(0, 'Aggregate bond capacity must be positive'),
  bonding_company: z.string().min(1, 'Bonding company is required'),
})

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema).merge(step4Schema)

type FullFormData = z.infer<typeof fullSchema>

// ─── Step metadata ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Company Info', shortLabel: '1' },
  { label: 'Insurance', shortLabel: '2' },
  { label: 'Safety Record', shortLabel: '3' },
  { label: 'Financial & Bonding', shortLabel: '4' },
]

// ─── Step components ─────────────────────────────────────────────────────────

function Step1({ errors }: { errors: Record<string, { message?: string }> }) {
  const { register } = useFormContext()

  const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
    'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
  ]

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Company Information & Licenses</h3>
      <p className="text-sm text-gray-500 mb-4">Basic company details and licensing information</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Company Name *</label>
          <input className="input-field" placeholder="Acme Construction LLC" {...register('company_name')} />
          {errors.company_name && <p className="form-error">{errors.company_name.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label">Business Address *</label>
          <input className="input-field" placeholder="123 Main St, City, State 12345" {...register('address')} />
          {errors.address && <p className="form-error">{errors.address.message}</p>}
        </div>

        <div>
          <label className="label">Years in Business *</label>
          <input className="input-field" type="number" min={0} placeholder="10" {...register('years_in_business')} />
          {errors.years_in_business && <p className="form-error">{errors.years_in_business.message}</p>}
        </div>

        <div>
          <label className="label">State *</label>
          <select className="input-field" {...register('state')}>
            <option value="">Select state...</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.state && <p className="form-error">{errors.state.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label">Trade Type / Specialty *</label>
          <input
            className="input-field"
            placeholder="e.g., Electrical, Plumbing, HVAC, Concrete..."
            {...register('trade_type')}
          />
          {errors.trade_type && <p className="form-error">{errors.trade_type.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label">License Numbers *</label>
          <input
            className="input-field"
            placeholder="e.g., CA-LIC-123456, CSLB-654321"
            {...register('license_numbers')}
          />
          <p className="mt-1 text-xs text-gray-400">Separate multiple license numbers with commas</p>
          {errors.license_numbers && <p className="form-error">{errors.license_numbers.message}</p>}
        </div>
      </div>
    </div>
  )
}

function Step2({
  errors,
  prequalId,
}: {
  errors: Record<string, { message?: string }>
  prequalId: string | null
}) {
  const { register } = useFormContext()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Insurance Certificates</h3>
        <p className="text-sm text-gray-500">Provide current insurance coverage details</p>
      </div>

      {/* General Liability */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h4 className="font-medium text-gray-800 text-sm">General Liability (GL) *</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Carrier</label>
            <input className="input-field" placeholder="Insurance carrier name" {...register('gl_carrier')} />
            {errors.gl_carrier && <p className="form-error">{errors.gl_carrier.message}</p>}
          </div>
          <div>
            <label className="label">Policy #</label>
            <input className="input-field" placeholder="Policy number" {...register('gl_policy')} />
            {errors.gl_policy && <p className="form-error">{errors.gl_policy.message}</p>}
          </div>
          <div>
            <label className="label">Coverage Limits</label>
            <input className="input-field" placeholder="e.g., $1,000,000 per occurrence" {...register('gl_limits')} />
            {errors.gl_limits && <p className="form-error">{errors.gl_limits.message}</p>}
          </div>
          <div>
            <label className="label">Expiry Date</label>
            <input className="input-field" type="date" {...register('gl_expiry')} />
            {errors.gl_expiry && <p className="form-error">{errors.gl_expiry.message}</p>}
          </div>
        </div>
      </div>

      {/* Workers Comp */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h4 className="font-medium text-gray-800 text-sm">Workers' Compensation *</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Carrier</label>
            <input className="input-field" placeholder="Insurance carrier name" {...register('wc_carrier')} />
            {errors.wc_carrier && <p className="form-error">{errors.wc_carrier.message}</p>}
          </div>
          <div>
            <label className="label">Policy #</label>
            <input className="input-field" placeholder="Policy number" {...register('wc_policy')} />
            {errors.wc_policy && <p className="form-error">{errors.wc_policy.message}</p>}
          </div>
          <div>
            <label className="label">Coverage Limits</label>
            <input className="input-field" placeholder="e.g., $500,000 per occurrence" {...register('wc_limits')} />
            {errors.wc_limits && <p className="form-error">{errors.wc_limits.message}</p>}
          </div>
          <div>
            <label className="label">Expiry Date</label>
            <input className="input-field" type="date" {...register('wc_expiry')} />
            {errors.wc_expiry && <p className="form-error">{errors.wc_expiry.message}</p>}
          </div>
        </div>
      </div>

      {/* Umbrella / Excess (optional) */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <h4 className="font-medium text-gray-800 text-sm">Umbrella / Excess (Optional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Carrier</label>
            <input className="input-field" placeholder="Insurance carrier name" {...register('umbrella_carrier')} />
          </div>
          <div>
            <label className="label">Policy #</label>
            <input className="input-field" placeholder="Policy number" {...register('umbrella_policy')} />
          </div>
          <div>
            <label className="label">Coverage Limits</label>
            <input className="input-field" placeholder="e.g., $5,000,000" {...register('umbrella_limits')} />
          </div>
          <div>
            <label className="label">Expiry Date</label>
            <input className="input-field" type="date" {...register('umbrella_expiry')} />
          </div>
        </div>
      </div>

      {/* COI Upload */}
      {prequalId && (
        <FileUpload
          prequalId={prequalId}
          docType="coi"
          label="Upload Certificate of Insurance (COI)"
        />
      )}
    </div>
  )
}

function Step3({
  errors,
  prequalId,
}: {
  errors: Record<string, { message?: string }>
  prequalId: string | null
}) {
  const { register } = useFormContext()
  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Safety Record (EMR)</h3>
        <p className="text-sm text-gray-500">Experience Modification Rate and OSHA recordables</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Experience Modification Rate (EMR) *</label>
          <input
            className="input-field"
            type="number"
            step="0.01"
            min={0}
            placeholder="e.g., 0.85"
            {...register('emr_value')}
          />
          <p className="mt-1 text-xs text-gray-400">Industry average = 1.0; lower is better</p>
          {errors.emr_value && <p className="form-error">{errors.emr_value.message}</p>}
        </div>

        <div>
          <label className="label">TRIR (Total Recordable Incident Rate) *</label>
          <input
            className="input-field"
            type="number"
            step="0.01"
            min={0}
            placeholder="e.g., 2.5"
            {...register('trir')}
          />
          {errors.trir && <p className="form-error">{errors.trir.message}</p>}
        </div>
      </div>

      {/* OSHA 300 Log */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-gray-800 text-sm">OSHA 300 Recordables (last 3 years)</h4>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <label className="label">{currentYear - n} ({n === 1 ? 'Last year' : `${n} yrs ago`})</label>
              <input
                className="input-field"
                type="number"
                min={0}
                placeholder="0"
                {...register(`osha_year${n}` as 'osha_year1' | 'osha_year2' | 'osha_year3')}
              />
              {errors[`osha_year${n}`] && (
                <p className="form-error">{errors[`osha_year${n}`].message}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Safety Program Description *</label>
        <textarea
          className="input-field"
          rows={4}
          placeholder="Describe your company's safety program, training procedures, and safety culture..."
          {...register('safety_program')}
        />
        {errors.safety_program && <p className="form-error">{errors.safety_program.message}</p>}
      </div>

      {prequalId && (
        <FileUpload
          prequalId={prequalId}
          docType="safety"
          label="Upload Safety Program Documentation"
        />
      )}
    </div>
  )
}

function Step4({
  errors,
  prequalId,
}: {
  errors: Record<string, { message?: string }>
  prequalId: string | null
}) {
  const { register } = useFormContext()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Financial & Bonding</h3>
        <p className="text-sm text-gray-500">Financial capacity and surety bonding information</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Annual Revenue *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              className="input-field pl-7"
              type="number"
              min={0}
              placeholder="5000000"
              {...register('annual_revenue')}
            />
          </div>
          {errors.annual_revenue && <p className="form-error">{errors.annual_revenue.message}</p>}
        </div>

        <div>
          <label className="label">Single Project Bond Capacity *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              className="input-field pl-7"
              type="number"
              min={0}
              placeholder="2000000"
              {...register('bonding_single')}
            />
          </div>
          {errors.bonding_single && <p className="form-error">{errors.bonding_single.message}</p>}
        </div>

        <div>
          <label className="label">Aggregate Bond Capacity *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              className="input-field pl-7"
              type="number"
              min={0}
              placeholder="10000000"
              {...register('bonding_aggregate')}
            />
          </div>
          {errors.bonding_aggregate && <p className="form-error">{errors.bonding_aggregate.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label">Bonding Company *</label>
          <input
            className="input-field"
            placeholder="e.g., Travelers, Zurich, Hartford"
            {...register('bonding_company')}
          />
          {errors.bonding_company && <p className="form-error">{errors.bonding_company.message}</p>}
        </div>
      </div>

      {prequalId && (
        <FileUpload
          prequalId={prequalId}
          docType="financial"
          label="Upload Financial Statements / Bond Letter"
        />
      )}
    </div>
  )
}

// ─── Step schemas and fields ─────────────────────────────────────────────────

const STEP_SCHEMAS = [step1Schema, step2Schema, step3Schema, step4Schema]
const STEP_FIELDS: (keyof FullFormData)[][] = [
  ['company_name', 'address', 'years_in_business', 'trade_type', 'license_numbers', 'state'],
  ['gl_carrier', 'gl_policy', 'gl_limits', 'gl_expiry', 'wc_carrier', 'wc_policy', 'wc_limits', 'wc_expiry'],
  ['emr_value', 'osha_year1', 'osha_year2', 'osha_year3', 'trir', 'safety_program'],
  ['annual_revenue', 'bonding_single', 'bonding_aggregate', 'bonding_company'],
]

// ─── Main PrequalForm component ─────────────────────────────────────────────

export default function PrequalForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditing = !!id

  const [step, setStep] = useState(0)
  const [prequalId, setPrequalId] = useState<string | null>(id ?? null)
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: existingPrequal } = usePrequal(id)
  const createPrequal = useCreatePrequal()
  const updatePrequal = useUpdatePrequal()

  const methods = useForm<FullFormData>({
    resolver: zodResolver(fullSchema),
    mode: 'onChange',
    defaultValues: {
      years_in_business: 0,
      osha_year1: 0,
      osha_year2: 0,
      osha_year3: 0,
      emr_value: 1.0,
      trir: 0,
      annual_revenue: 0,
      bonding_single: 0,
      bonding_aggregate: 0,
    },
  })

  const { handleSubmit, trigger, formState: { errors, isSubmitting }, reset } = methods

  // Populate form when editing existing record
  useEffect(() => {
    if (existingPrequal) {
      reset({
        company_name: existingPrequal.company_name ?? '',
        address: existingPrequal.address ?? '',
        years_in_business: existingPrequal.years_in_business ?? 0,
        trade_type: existingPrequal.trade_type ?? '',
        license_numbers: existingPrequal.license_numbers ?? '',
        state: existingPrequal.state ?? '',
        gl_carrier: existingPrequal.gl_carrier ?? '',
        gl_policy: existingPrequal.gl_policy ?? '',
        gl_limits: existingPrequal.gl_limits ?? '',
        gl_expiry: existingPrequal.gl_expiry ?? '',
        wc_carrier: existingPrequal.wc_carrier ?? '',
        wc_policy: existingPrequal.wc_policy ?? '',
        wc_limits: existingPrequal.wc_limits ?? '',
        wc_expiry: existingPrequal.wc_expiry ?? '',
        umbrella_carrier: existingPrequal.umbrella_carrier ?? '',
        umbrella_policy: existingPrequal.umbrella_policy ?? '',
        umbrella_limits: existingPrequal.umbrella_limits ?? '',
        umbrella_expiry: existingPrequal.umbrella_expiry ?? '',
        emr_value: existingPrequal.emr_value ?? 1.0,
        osha_year1: existingPrequal.osha_year1 ?? 0,
        osha_year2: existingPrequal.osha_year2 ?? 0,
        osha_year3: existingPrequal.osha_year3 ?? 0,
        trir: existingPrequal.trir ?? 0,
        safety_program: existingPrequal.safety_program ?? '',
        annual_revenue: existingPrequal.annual_revenue ?? 0,
        bonding_single: existingPrequal.bonding_single ?? 0,
        bonding_aggregate: existingPrequal.bonding_aggregate ?? 0,
        bonding_company: existingPrequal.bonding_company ?? '',
      })
    }
  }, [existingPrequal, reset])

  const roleBase = profile?.role === 'gc' ? '/gc' : '/trade'

  async function saveProgress(data: Partial<PrequalFormData>, status: 'draft' | 'submitted' = 'draft') {
    setSaveError(null)
    try {
      if (!prequalId) {
        // Create a new prequal
        const result = await createPrequal.mutateAsync({
          ...data,
          applicant_id: profile?.id,
          status,
        })
        setPrequalId(result.id)
        return result.id
      } else {
        await updatePrequal.mutateAsync({ id: prequalId, data: { ...data, status } })
        return prequalId
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setSaveError(message)
      return null
    }
  }

  async function handleNext() {
    const fields = STEP_FIELDS[step]
    const valid = await trigger(fields)
    if (!valid) return

    // Save progress on each step
    const data = methods.getValues()
    const stepData = Object.fromEntries(fields.map((f) => [f, data[f]])) as Partial<PrequalFormData>
    await saveProgress(stepData)

    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function handleBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  async function onFinalSubmit(data: FullFormData) {
    const resultId = await saveProgress(data as unknown as Partial<PrequalFormData>, 'submitted')
    if (resultId) {
      setSubmitted(true)
      setTimeout(() => {
        navigate(roleBase)
      }, 2000)
    }
  }

  // Validate step via STEP_SCHEMAS
  async function handleStepSubmit() {
    const stepSchema = STEP_SCHEMAS[step]
    const data = methods.getValues()
    const result = stepSchema.safeParse(data)
    if (!result.success) {
      // Trigger validation display
      await trigger(STEP_FIELDS[step])
      return
    }
    if (step < STEPS.length - 1) {
      await handleNext()
    } else {
      handleSubmit(onFinalSubmit)()
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Submitted Successfully!</h2>
        <p className="text-gray-500 mb-4">Your pre-qualification has been submitted for review.</p>
        <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
      </div>
    )
  }

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Pre-Qualification' : 'New Pre-Qualification'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete all sections to submit your pre-qualification
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors',
                    i < step
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : i === step
                      ? 'border-brand-600 text-brand-600 bg-white'
                      : 'border-gray-300 text-gray-400 bg-white'
                  )}
                >
                  {i < step ? <CheckCircle size={16} /> : i + 1}
                </div>
                <span
                  className={clsx(
                    'mt-1 text-xs text-center hidden sm:block',
                    i === step ? 'text-brand-600 font-medium' : 'text-gray-400'
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-0.5 mx-2',
                    i < step ? 'bg-brand-600' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center mt-1 sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step].label}
        </p>
      </div>

      {/* Form card */}
      <div className="card p-6 sm:p-8">
        {saveError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {saveError}
          </div>
        )}

        <FormProvider {...methods}>
          <form noValidate>
            {step === 0 && <Step1 errors={errors as Record<string, { message?: string }>} />}
            {step === 1 && (
              <Step2
                errors={errors as Record<string, { message?: string }>}
                prequalId={prequalId}
              />
            )}
            {step === 2 && (
              <Step3
                errors={errors as Record<string, { message?: string }>}
                prequalId={prequalId}
              />
            )}
            {step === 3 && (
              <Step4
                errors={errors as Record<string, { message?: string }>}
                prequalId={prequalId}
              />
            )}
          </form>
        </FormProvider>

        {/* Navigation buttons */}
        <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0}
            className="btn-secondary disabled:opacity-40"
          >
            <ChevronLeft size={16} className="mr-1" />
            Previous
          </button>

          <div className="flex items-center gap-3">
            {/* Save as draft */}
            <button
              type="button"
              onClick={async () => {
                const data = methods.getValues()
                await saveProgress(data as unknown as Partial<PrequalFormData>, 'draft')
              }}
              disabled={isSubmitting || createPrequal.isPending || updatePrequal.isPending}
              className="btn-secondary text-sm"
            >
              <Save size={14} className="mr-1" />
              Save Draft
            </button>

            {isLastStep ? (
              <button
                type="button"
                onClick={handleStepSubmit}
                disabled={isSubmitting || createPrequal.isPending || updatePrequal.isPending}
                className="btn-primary"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Pre-Qual'}
                <CheckCircle size={16} className="ml-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStepSubmit}
                disabled={isSubmitting || createPrequal.isPending || updatePrequal.isPending}
                className="btn-primary"
              >
                Next Step
                <ChevronRight size={16} className="ml-1" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-save indicator */}
      {(createPrequal.isPending || updatePrequal.isPending) && (
        <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400" />
          Saving...
        </p>
      )}
    </div>
  )
}
