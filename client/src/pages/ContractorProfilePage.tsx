import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/hooks/useAuth'
import { useContractorProfile, useUpsertContractorProfile } from '@/hooks/useContractorProfile'
import { ContractorProfile } from '@/types'
import { CheckCircle } from 'lucide-react'

const STEPS = [
  'Company Info',
  'Insurance',
  'Safety Record',
  'PTP Program',
  'Bonding',
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              i < current
                ? 'bg-brand-600 text-white'
                : i === current
                ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-8 ${i < current ? 'bg-brand-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-sm text-gray-500">
        Step {current + 1} of {total} — {STEPS[current]}
      </span>
    </div>
  )
}

export default function ContractorProfilePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saved, setSaved] = useState(false)
  const { data: existing, isLoading } = useContractorProfile(profile?.id)
  const upsert = useUpsertContractorProfile()

  const dashPath = profile?.role === 'gc' ? '/gc' : '/trade'

  // Step 1: Company Info
  const companyForm = useForm<Partial<ContractorProfile>>()
  // Step 2: Insurance
  const insuranceForm = useForm<Partial<ContractorProfile>>()
  // Step 3: Safety
  const safetyForm = useForm<Partial<ContractorProfile>>()
  // Step 4: PTP
  const ptpForm = useForm<Partial<ContractorProfile>>()
  // Step 5: Bonding
  const bondingForm = useForm<Partial<ContractorProfile>>()

  const hasPtp = ptpForm.watch('has_ptp_program')

  useEffect(() => {
    if (existing) {
      companyForm.reset(existing)
      insuranceForm.reset(existing)
      safetyForm.reset(existing)
      ptpForm.reset(existing)
      bondingForm.reset(existing)
    }
  }, [existing])

  async function saveStep(data: Partial<ContractorProfile>) {
    if (!profile?.id) return
    await upsert.mutateAsync({ ...data, user_id: profile.id })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleNext(data: Partial<ContractorProfile>) {
    await saveStep(data)
    if (step < STEPS.length - 1) setStep(step + 1)
  }

  async function handleSubmit(data: Partial<ContractorProfile>) {
    await saveStep(data)
    navigate(dashPath)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link to={dashPath} className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Contractor Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Complete your profile to submit pre-qualifications</p>
      </div>

      <StepIndicator current={step} total={STEPS.length} />

      {saved && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} />
          Saved
        </div>
      )}

      {/* Step 1: Company Info */}
      {step === 0 && (
        <form onSubmit={companyForm.handleSubmit(handleNext)} className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Company Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Company Name</label>
              <input className="input-field" {...companyForm.register('company_name')} />
            </div>
            <div>
              <label className="label">Trade Type</label>
              <input className="input-field" {...companyForm.register('trade_type')} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input-field" {...companyForm.register('address')} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input-field" {...companyForm.register('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input-field" {...companyForm.register('state')} />
            </div>
            <div>
              <label className="label">ZIP</label>
              <input className="input-field" {...companyForm.register('zip')} />
            </div>
            <div>
              <label className="label">Years in Business</label>
              <input className="input-field" type="number" {...companyForm.register('years_in_business', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Employee Count</label>
              <input className="input-field" type="number" {...companyForm.register('employee_count', { valueAsNumber: true })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">License Numbers</label>
              <input className="input-field" {...companyForm.register('license_numbers')} />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button type="button" onClick={companyForm.handleSubmit(saveStep)} className="btn-secondary">
              Save Draft
            </button>
            <button type="submit" className="btn-primary">Next</button>
          </div>
        </form>
      )}

      {/* Step 2: Insurance */}
      {step === 1 && (
        <form onSubmit={insuranceForm.handleSubmit(handleNext)} className="card p-6 space-y-6">
          <h2 className="text-base font-semibold text-gray-900">Insurance</h2>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">General Liability</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Carrier</label>
                <input className="input-field" {...insuranceForm.register('gl_carrier')} />
              </div>
              <div>
                <label className="label">Policy #</label>
                <input className="input-field" {...insuranceForm.register('gl_policy')} />
              </div>
              <div>
                <label className="label">Limits</label>
                <input className="input-field" {...insuranceForm.register('gl_limits')} />
              </div>
              <div>
                <label className="label">Expiry Date</label>
                <input className="input-field" type="date" {...insuranceForm.register('gl_expiry')} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Workers Compensation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Carrier</label>
                <input className="input-field" {...insuranceForm.register('wc_carrier')} />
              </div>
              <div>
                <label className="label">Policy #</label>
                <input className="input-field" {...insuranceForm.register('wc_policy')} />
              </div>
              <div>
                <label className="label">Limits</label>
                <input className="input-field" {...insuranceForm.register('wc_limits')} />
              </div>
              <div>
                <label className="label">Expiry Date</label>
                <input className="input-field" type="date" {...insuranceForm.register('wc_expiry')} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Umbrella (optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Carrier</label>
                <input className="input-field" {...insuranceForm.register('umbrella_carrier')} />
              </div>
              <div>
                <label className="label">Policy #</label>
                <input className="input-field" {...insuranceForm.register('umbrella_policy')} />
              </div>
              <div>
                <label className="label">Limits</label>
                <input className="input-field" {...insuranceForm.register('umbrella_limits')} />
              </div>
              <div>
                <label className="label">Expiry Date</label>
                <input className="input-field" type="date" {...insuranceForm.register('umbrella_expiry')} />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(0)} className="btn-secondary">Back</button>
              <button type="button" onClick={insuranceForm.handleSubmit(saveStep)} className="btn-secondary">Save Draft</button>
            </div>
            <button type="submit" className="btn-primary">Next</button>
          </div>
        </form>
      )}

      {/* Step 3: Safety Record */}
      {step === 2 && (
        <form onSubmit={safetyForm.handleSubmit(handleNext)} className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Safety Record</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">EMR Value</label>
              <input className="input-field" type="number" step="0.01" {...safetyForm.register('emr_value', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">TRIR</label>
              <input className="input-field" type="number" step="0.01" {...safetyForm.register('trir', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">DART Rate</label>
              <input className="input-field" type="number" step="0.01" {...safetyForm.register('dart_rate', { valueAsNumber: true })} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">OSHA Recordable Incidents (last 5 years, Y1=most recent)</h3>
            <div className="grid grid-cols-5 gap-2">
              {[1,2,3,4,5].map(y => (
                <div key={y}>
                  <label className="label text-xs">Year {y}</label>
                  <input
                    className="input-field"
                    type="number"
                    {...safetyForm.register(`osha_incidents_y${y}` as keyof ContractorProfile, { valueAsNumber: true })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Total Hours Worked (last 3 years)</h3>
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3].map(y => (
                <div key={y}>
                  <label className="label text-xs">Year {y}</label>
                  <input
                    className="input-field"
                    type="number"
                    {...safetyForm.register(`total_hours_y${y}` as keyof ContractorProfile, { valueAsNumber: true })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">Back</button>
              <button type="button" onClick={safetyForm.handleSubmit(saveStep)} className="btn-secondary">Save Draft</button>
            </div>
            <button type="submit" className="btn-primary">Next</button>
          </div>
        </form>
      )}

      {/* Step 4: PTP Program */}
      {step === 3 && (
        <form onSubmit={ptpForm.handleSubmit(handleNext)} className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">PTP Program</h2>
          <div>
            <label className="label">Do you have a Pre-Task Planning (PTP) program?</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="true"
                  {...ptpForm.register('has_ptp_program')}
                  onChange={() => ptpForm.setValue('has_ptp_program', true)}
                  checked={hasPtp === true}
                />
                <span className="text-sm">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="false"
                  {...ptpForm.register('has_ptp_program')}
                  onChange={() => ptpForm.setValue('has_ptp_program', false)}
                  checked={hasPtp === false}
                />
                <span className="text-sm">No</span>
              </label>
            </div>
          </div>

          {hasPtp === true && (
            <div>
              <label className="label">PTP Program Description</label>
              <textarea
                className="input-field min-h-[100px]"
                placeholder="Describe your PTP program..."
                {...ptpForm.register('ptp_description')}
              />
            </div>
          )}

          {hasPtp === false && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Note: Not having a PTP program is flagged as a safety risk.
            </div>
          )}

          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">Back</button>
              <button type="button" onClick={ptpForm.handleSubmit(saveStep)} className="btn-secondary">Save Draft</button>
            </div>
            <button type="submit" className="btn-primary">Next</button>
          </div>
        </form>
      )}

      {/* Step 5: Bonding */}
      {step === 4 && (
        <form onSubmit={bondingForm.handleSubmit(handleSubmit)} className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Bonding</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Bonding Company</label>
              <input className="input-field" {...bondingForm.register('bonding_company')} />
            </div>
            <div>
              <label className="label">Single Project Limit ($)</label>
              <input className="input-field" type="number" {...bondingForm.register('bonding_single', { valueAsNumber: true })} />
            </div>
            <div>
              <label className="label">Aggregate Limit ($)</label>
              <input className="input-field" type="number" {...bondingForm.register('bonding_aggregate', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(3)} className="btn-secondary">Back</button>
              <button type="button" onClick={bondingForm.handleSubmit(saveStep)} className="btn-secondary">Save Draft</button>
            </div>
            <button type="submit" className="btn-primary" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving...' : 'Submit Profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
