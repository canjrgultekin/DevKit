import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderTree, FileUp, Cloud, Settings, Loader2, GitBranch } from 'lucide-react'
import { profileApi } from '../api'
import type { DevKitProfile } from '../types'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [activeProfile, setActiveProfile] = useState<{ key: string; profile: DevKitProfile } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    profileApi.getActive().then((data) => {
      if (data.activeProfile && data.profile) {
        setActiveProfile({ key: data.activeProfile, profile: data.profile })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const quickActions = [
    { icon: FolderTree, label: 'Scaffold Project', desc: 'Create project structure from manifest', path: '/scaffold', color: 'bg-emerald-600' },
    { icon: FileUp, label: 'Import Files', desc: 'Drag & drop Claude files into project', path: '/import', color: 'bg-violet-600' },
    { icon: GitBranch, label: 'Git', desc: 'Branch, commit, push, pull, merge', path: '/git', color: 'bg-orange-600' },
    { icon: Cloud, label: 'Azure Deploy', desc: 'Deploy and manage Azure resources', path: '/azure', color: 'bg-sky-600' },
    { icon: Settings, label: 'Profiles', desc: 'Manage project configurations', path: '/profile', color: 'bg-amber-600' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">DevKit Dashboard</h1>
        <p className="text-gray-400">Developer Toolkit & AI Code Integration</p>
      </div>

      {/* Active Profile Card */}
      <div className="card mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Active Profile</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : activeProfile ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="badge-info">{activeProfile.profile.framework}</span>
              <span className="text-xl font-semibold text-white">{activeProfile.profile.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Workspace:</span>
                <p className="text-gray-300 font-mono text-xs mt-1">{activeProfile.profile.workspace || 'Not set'}</p>
              </div>
              {activeProfile.profile.azure && (
                <>
                  <div>
                    <span className="text-gray-500">Resource Group:</span>
                    <p className="text-gray-300 font-mono text-xs mt-1">{activeProfile.profile.azure.resourceGroup}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Subscription:</span>
                    <p className="text-gray-300 font-mono text-xs mt-1">{activeProfile.profile.azure.subscriptionId}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Resources:</span>
                    <p className="text-gray-300 mt-1">{activeProfile.profile.azure.resources?.length || 0} configured</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-3">No active profile configured</p>
            <button onClick={() => navigate('/profile')} className="btn-primary">
              Create Profile
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-4">
        {quickActions.map(({ icon: Icon, label, desc, path, color }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="card hover:border-gray-700 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className={`${color} p-3 rounded-lg group-hover:scale-105 transition-transform`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">{label}</h3>
                <p className="text-sm text-gray-500 mt-1">{desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}