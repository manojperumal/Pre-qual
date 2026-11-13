import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import WorkerFlow from './pages/worker/WorkerFlow'
import WorkerHome from './pages/worker/WorkerHome'
import Pass from './pages/worker/Pass'
import VerifyPage from './pages/VerifyPage'
import StaffLayout from './components/StaffLayout'
import Login from './pages/staff/Login'
import Projects from './pages/staff/Projects'
import ProjectPage from './pages/staff/ProjectPage'
import Portfolio from './pages/staff/Portfolio'
import Standard from './pages/staff/Standard'
import ModuleEditor from './pages/staff/ModuleEditor'
import WorkerRecord from './pages/staff/WorkerRecord'
import { flushProgress } from './lib/offline'

void flushProgress()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Worker (mobile, no account) */}
        <Route path="/o/:code" element={<WorkerFlow />} />
        <Route path="/pass/:id" element={<Pass />} />
        <Route path="/me" element={<WorkerHome />} />
        {/* Anyone scanning a pass */}
        <Route path="/v/:token" element={<VerifyPage />} />
        {/* Staff (Safety Mojo accounts) */}
        <Route path="/staff/login" element={<Login />} />
        <Route path="/staff" element={<StaffLayout />}>
          <Route index element={<Projects />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="standard" element={<Standard />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="modules/:id" element={<ModuleEditor />} />
          <Route path="workers/:id" element={<WorkerRecord />} />
        </Route>
        <Route path="/" element={<Navigate to="/me" replace />} />
        <Route path="*" element={<Navigate to="/me" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
