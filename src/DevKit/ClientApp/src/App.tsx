import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderTree, FileUp, Cloud, Settings, Terminal, GitBranch, Shield, Container, Database, Zap, Package, GitCompareArrows, ScrollText, FolderSync, Boxes } from 'lucide-react'
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

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/architect', icon: Boxes, label: 'Architect' },
  { to: '/scaffold', icon: FolderTree, label: 'Scaffold' },
  { to: '/import', icon: FileUp, label: 'File Import' },
  { to: '/git', icon: GitBranch, label: 'Git' },
  { to: '/docker', icon: Container, label: 'Docker' },
  { to: '/schema', icon: Database, label: 'Schema' },
  { to: '/apitest', icon: Zap, label: 'API Test' },
  { to: '/audit', icon: Package, label: 'Packages' },
  { to: '/envcompare', icon: GitCompareArrows, label: 'Env Compare' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/migrations', icon: FolderSync, label: 'Migrations' },
  { to: '/crypto', icon: Shield, label: 'Crypto' },
  { to: '/azure', icon: Cloud, label: 'Azure' },
  { to: '/profile', icon: Settings, label: 'Profiles' },
]

export default function App() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">DevKit</h1>
              <p className="text-xs text-gray-500">v2.0.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600/20 text-brand-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <Icon className="w-4.5 h-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">Developer Toolkit & AI Companion</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/architect" element={<ArchitectureDesignerPage />} />
          <Route path="/scaffold" element={<ScaffoldPage />} />
          <Route path="/import" element={<FileImportPage />} />
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