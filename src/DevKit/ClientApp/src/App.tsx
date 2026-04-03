import { useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderTree, FileUp, Cloud, Settings, GitBranch, Shield, Container, Database, Zap, Package, GitCompareArrows, ScrollText, FolderSync, Boxes, PanelLeftClose, PanelLeftOpen, Search, BookOpen } from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import ScaffoldPage from './pages/ScaffoldPage'
import FileImportPage from './pages/FileImportPage'
import AzurePage from './pages/AzurePage'
import ProfilePage from './pages/ProfilePage'
import GitPage from './pages/GitPage'
import CryptoPage from './pages/CryptoPage'
import DockerPage from './pages/DockerPage'
import SchemaPage from './pages/SchemaPage'
import ApiTestPage from './pages/ApiTestPage'
import PackageAuditPage from './pages/PackageAuditPage'
import EnvComparePage from './pages/EnvComparePage'
import LogViewerPage from './pages/LogViewerPage'
import MigrationPage from './pages/MigrationPage'
import ArchitectureDesignerPage from './pages/ArchitectureDesignerPage'
import ScanPage from './pages/ScanPage'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', docs: 'welcome' },
  { to: '/architect', icon: Boxes, label: 'Architect', docs: 'feat-architect' },
  { to: '/scaffold', icon: FolderTree, label: 'Scaffold', docs: 'feat-scaffold' },
  { to: '/import', icon: FileUp, label: 'File Import', docs: 'feat-import' },
  { to: '/scan', icon: Search, label: 'Scanner', docs: 'feat-scanner' },
  { to: '/git', icon: GitBranch, label: 'Git', docs: 'feat-git' },
  { to: '/docker', icon: Container, label: 'Docker', docs: 'feat-docker' },
  { to: '/schema', icon: Database, label: 'Schema', docs: 'feat-schema' },
  { to: '/apitest', icon: Zap, label: 'API Test', docs: 'feat-apitest' },
  { to: '/audit', icon: Package, label: 'Packages', docs: 'feat-audit' },
  { to: '/envcompare', icon: GitCompareArrows, label: 'Env Compare', docs: 'feat-env' },
  { to: '/logs', icon: ScrollText, label: 'Logs', docs: 'feat-logs' },
  { to: '/migrations', icon: FolderSync, label: 'Migrations', docs: 'feat-migration' },
  { to: '/crypto', icon: Shield, label: 'Crypto', docs: 'feat-crypto' },
  { to: '/azure', icon: Cloud, label: 'Azure', docs: 'feat-azure' },
  { to: '/profile', icon: Settings, label: 'Profiles', docs: 'feat-profiles' },
]

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-12'} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200`}>
        <div className={`p-4 border-b border-gray-800 flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-300">
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          {sidebarOpen && (
            <div>
              <h1 className="text-lg font-bold text-white">DevKit</h1>
              <p className="text-xs text-gray-500">v2.0.0</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {navItems.map(({ to, icon: Icon, label, docs }) => (
            <div key={to} className="flex items-center group">
              <NavLink
                to={to}
                end={to === '/'}
                title={label}
                className={({ isActive }) =>
                  `flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600/20 text-brand-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                {sidebarOpen && label}
              </NavLink>
              {sidebarOpen && docs && (
                <a href={`/docs.html#${docs}`} target="_blank" rel="noopener noreferrer"
                  title={`${label} dokumantasyonu`}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-brand-600/15 text-brand-400 border border-brand-600/30 hover:bg-brand-600/30 hover:border-brand-500 transition-all flex-shrink-0"
                  onClick={e => e.stopPropagation()}>
                  <BookOpen className="w-3 h-3" />
                  Docs
                </a>
              )}
            </div>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="p-3 border-t border-gray-800">
            <a href="/docs.html" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-gray-600 hover:text-brand-400 transition-colors">
              <BookOpen className="w-3 h-3" />
              Dokumantasyon
            </a>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/architect" element={<ArchitectureDesignerPage />} />
          <Route path="/scaffold" element={<ScaffoldPage />} />
          <Route path="/import" element={<FileImportPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/git" element={<GitPage />} />
          <Route path="/docker" element={<DockerPage />} />
          <Route path="/schema" element={<SchemaPage />} />
          <Route path="/apitest" element={<ApiTestPage />} />
          <Route path="/audit" element={<PackageAuditPage />} />
          <Route path="/envcompare" element={<EnvComparePage />} />
          <Route path="/logs" element={<LogViewerPage />} />
          <Route path="/migrations" element={<MigrationPage />} />
          <Route path="/crypto" element={<CryptoPage />} />
          <Route path="/azure" element={<AzurePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
    </div>
  )
}