import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useCreateProject } from '@/hooks/useProjects'

const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function CreateProjectPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const createProject = useCreateProject()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!profile?.id) return
    try {
      await createProject.mutateAsync({
        name: data.name,
        description: data.description,
        ownerId: profile.id,
      })
      navigate('/owner')
    } catch (err) {
      console.error('Failed to create project', err)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link to="/owner" className="text-sm text-brand-600 hover:text-brand-700 mb-2 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
        <p className="mt-1 text-sm text-gray-500">Set up a project to manage pre-qualifications</p>
      </div>

      {createProject.isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to create project. Please try again.
        </div>
      )}

      <div className="card p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="label" htmlFor="name">
              Project Name *
            </label>
            <input
              id="name"
              type="text"
              className="input-field"
              placeholder="Downtown Office Tower"
              {...register('name')}
            />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              className="input-field resize-none"
              placeholder="Brief description of the project..."
              {...register('description')}
            />
            {errors.description && <p className="form-error">{errors.description.message}</p>}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Link to="/owner" className="btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || createProject.isPending}
              className="btn-primary"
            >
              {isSubmitting || createProject.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
