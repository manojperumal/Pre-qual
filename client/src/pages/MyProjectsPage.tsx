import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects, useMyProjects, useCompanyProjects } from '@/hooks/useProjects'
import { useProjectSubmission } from '@/hooks/useContractorProfile'
import { FolderOpen, Send, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

const SUBMISSION_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_more_info: 'bg-orange-100 text-orange-700',
}

function SubmissionStatusIcon({ status }: { status: string | undefined }) {
  if (status === 'approved') return <CheckCircle size={14} className="text-green-500" />
  if (status === 'under_review' || status === 'submitted') return <Clock size={14} className="text-yellow-500" />
  if (status === 'rejected' || status === 'needs_more_info') return <AlertCircle size={14} className="text-red-500" />
  return null
}

function ProjectCard({ project, userId, basePath }: { project: any; userId: string; basePath: string }) {
  const { data: submission } = useProjectSubmission(project.id, userId)
  const memberCount = project.project_members?.[0]?.count ?? 0

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link to={`${basePath}/projects/${project.id}`} className="font-semibold text-gray-900 hover:text-brand-600 truncate block">
            {project.name}
          </Link>
          {project.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{project.description}</p>
          )}
        </div>
        <FolderOpen size={16} className="text-brand-400 flex-shrink-0 mt-0.5" />
      </div>

      {(project.start_date || project.end_date) && (
        <p className="text-xs text-gray-400 mt-2">
          {project.start_date ? format(new Date(project.start_date), 'MMM d, yyyy') : '—'}
          {' → '}
          {project.end_date ? format(new Date(project.end_date), 'MMM d, yyyy') : '—'}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1">{memberCount} member{memberCount !== 1 ? 's' : ''}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        {submission ? (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${SUBMISSION_COLORS[submission.status] ?? 'bg-gray-100 text-gray-600'}`}>
            <SubmissionStatusIcon status={submission.status} />
            {submission.status.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-xs text-gray-400">No submission yet</span>
        )}
        <Link
          to={`${basePath}/projects/${project.id}/submit`}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Send size={12} />
          {submission ? 'Update' : 'Submit Pre-Qual'}
        </Link>
      </div>
    </div>
  )
}

export default function MyProjectsPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const basePath = '/' + location.pathname.split('/')[1]

  const companyId = profile?.new_company_id ?? (profile as any)?.company_id ?? null
  const isTeamMember = profile?.user_role === 'contributor'
  const memberRole: 'admin' | 'contributor' = profile?.user_role ?? 'admin'

  const { data: companyProjects = [], isLoading: companyLoading } = useCompanyProjects(
    isTeamMember && memberRole === 'admin' ? companyId : undefined
  )
  const { data: memberProjects = [], isLoading: memberProjectsLoading } = useMyProjects(
    (isTeamMember && memberRole === 'contributor') ? profile?.id : undefined
  )
  const { data: allProjects = [], isLoading: allProjectsLoading } = useProjects(
    !isTeamMember ? profile?.id : undefined
  )

  const isLoading = isTeamMember
    ? (memberRole === 'admin' ? companyLoading : memberProjectsLoading)
    : allProjectsLoading
  const projects = isTeamMember
    ? (memberRole === 'admin' ? companyProjects : memberProjects)
    : allProjects.filter((p) => p.owner_id !== profile?.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
        <p className="mt-1 text-sm text-gray-500">Projects you're assigned to</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <FolderOpen size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="font-semibold text-gray-700">No projects yet</p>
          <p className="text-sm mt-1">Accept an invitation to join a project</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} userId={profile?.id ?? ''} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  )
}
