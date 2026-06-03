import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import Login from '@/pages/Login'
import SignUp from '@/pages/SignUp'
import OwnerDashboard from '@/pages/OwnerDashboard'
import GCDashboard from '@/pages/GCDashboard'
import TradeDashboard from '@/pages/TradeDashboard'
import PrequalForm from '@/pages/PrequalForm'
import PrequalDetail from '@/pages/PrequalDetail'
import InvitePage from '@/pages/InvitePage'
import CreateProjectPage from '@/pages/CreateProjectPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import InviteAcceptPage from '@/pages/InviteAcceptPage'
import ContractorProfilePage from '@/pages/ContractorProfilePage'
import ProjectSubmissionPage from '@/pages/ProjectSubmissionPage'
import SubmissionReviewPage from '@/pages/SubmissionReviewPage'

function RoleRedirect() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />

  if (profile.role === 'owner') return <Navigate to="/owner" replace />
  if (profile.role === 'gc') return <Navigate to="/gc" replace />
  return <Navigate to="/trade" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />

      {/* Role redirect from root */}
      <Route path="/" element={<RoleRedirect />} />

      {/* Owner routes */}
      <Route
        path="/owner"
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OwnerDashboard />} />
        <Route path="invite" element={<InvitePage />} />
        <Route path="projects/new" element={<CreateProjectPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/invite" element={<InvitePage />} />
        <Route path="projects/:projectId/submissions/:submissionId" element={<SubmissionReviewPage />} />
        <Route path="prequal/:id" element={<PrequalDetail />} />
      </Route>

      {/* GC routes */}
      <Route
        path="/gc"
        element={
          <ProtectedRoute allowedRoles={['gc']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<GCDashboard />} />
        <Route path="invite" element={<InvitePage />} />
        <Route path="profile" element={<ContractorProfilePage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/submit" element={<ProjectSubmissionPage />} />
        <Route path="projects/:projectId/submissions/:submissionId" element={<SubmissionReviewPage />} />
        <Route path="prequal/new" element={<PrequalForm />} />
        <Route path="prequal/:id" element={<PrequalDetail />} />
        <Route path="prequal/:id/edit" element={<PrequalForm />} />
      </Route>

      {/* Trade routes */}
      <Route
        path="/trade"
        element={
          <ProtectedRoute allowedRoles={['trade']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TradeDashboard />} />
        <Route path="profile" element={<ContractorProfilePage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/submit" element={<ProjectSubmissionPage />} />
        <Route path="prequal/new" element={<PrequalForm />} />
        <Route path="prequal/:id" element={<PrequalDetail />} />
        <Route path="prequal/:id/edit" element={<PrequalForm />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
