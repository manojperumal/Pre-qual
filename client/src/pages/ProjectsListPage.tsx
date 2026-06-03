import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { FolderOpen, Plus } from 'lucide-react'
import { format } from 'date-fns'

export default function ProjectsListPage() {
  const { profile } = useAuth()
  const { data: projects = [], isLoading } = useProjects(profile?.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">All your pre-qualification projects</p>
        </div>
        <Link
          to="/owner/projects/new"
          className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-4"
        >
          <Plus size={16} />
          New Project
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to start managing pre-qualifications</p>
          <Link to="/owner/projects/new" className="btn-primary mt-5 inline-flex items-center gap-2">
            <Plus size={16} />
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const memberCount = project.project_members?.[0]?.count ?? 0
            return (
              <Link
                key={project.id}
                to={`/owner/projects/${project.id}`}
                className="card-hover p-5 block"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <FolderOpen size={18} className="text-brand-400 flex-shrink-0 ml-2 mt-0.5" />
                </div>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-gray-400">
                    {memberCount} member{memberCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {format(new Date(project.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
