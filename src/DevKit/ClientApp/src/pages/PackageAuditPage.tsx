import { useState } from 'react'
import {
  Package, Search, Loader2, CheckCircle2, XCircle,
  AlertTriangle, ArrowUp,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/packageaudit'

interface VulnerabilityInfo { severity: string; advisoryUrl: string; description: string }
interface PackageInfo { name: string; currentVersion: string; latestVersion: string | null; status: string; updateType: string | null; isVulnerable: boolean; vulnerabilities: VulnerabilityInfo[]; projectFile: string }
interface AuditSummary { upToDate: number; minor: number; major: number; patch: number; vulnerable: number }
interface AuditResult { framework: string; projectPath: string; packages: PackageInfo[]; totalPackages: number; outdatedCount: number; vulnerableCount: number; summary: AuditSummary }

const UPDATE_COLORS: Record<string, string> = {
  major: 'bg-red-900/30 text-red-400 border-red-800',
  minor: 'bg-amber-900/30 text-amber-400 border-amber-800',
  patch: 'bg-green-900/30 text-green-400 border-green-800',
}

export default function PackageAuditPage() {
  const [projectPath, setProjectPath] = useState('')
  const [framework, setFramework] = useState('dotnet')
  const [result, setResult] = useState<AuditResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'outdated' | 'vulnerable'>('all')
  const [searchText, setSearchText] = useState('')

  const handleAudit = async () => {
    setLoading(true); setMessage(null)
    try {
      const res = await fetch(`${API}/audit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined, framework }),
      }).then(r => r.json()) as { success: boolean; audit: AuditResult; error?: string }

      if (!res.success) throw new Error(res.error)
      setResult(res.audit)
      setMessage({ type: 'success', text: `${res.audit.totalPackages} paket tarandı. ${res.audit.outdatedCount} outdated, ${res.audit.vulnerableCount} vulnerable.` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Tarama hatasi' }) }
    finally { setLoading(false) }
  }

  const filteredPackages = result?.packages.filter(p => {
    if (filter === 'outdated' && p.status !== 'outdated') return false
    if (filter === 'vulnerable' && !p.isVulnerable) return false
    if (searchText && !p.name.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }) || []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Package className="w-6 h-6 text-teal-400" /> Package Auditor
        </h1>
        <p className="text-gray-400 mt-1">NuGet/npm dependency'leri tarar: outdated, vulnerable, versiyon bilgileri</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* Config */}
      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="col-span-2">
            <PathPicker value={projectPath} onChange={setProjectPath} label="Proje Dizini"
              placeholder="C:\source\myproject" hint="Bos birakilirsa aktif profil workspace kullanilir" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Framework</label>
            <select value={framework} onChange={e => setFramework(e.target.value)} className="input-field text-sm">
              <option value="dotnet">.NET (NuGet)</option>
              <option value="nodejs">Node.js (npm)</option>
              <option value="python">Python (pip)</option>
            </select>
          </div>
        </div>
        <button onClick={handleAudit} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Paketleri Tara
        </button>
      </div>

      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            <div className="card text-center py-3 cursor-pointer hover:border-gray-600" onClick={() => setFilter('all')}>
              <p className="text-xl font-bold text-white">{result.totalPackages}</p>
              <p className="text-xs text-gray-500">Toplam</p>
            </div>
            <div className="card text-center py-3">
              <p className="text-xl font-bold text-green-400">{result.summary.upToDate}</p>
              <p className="text-xs text-gray-500">Guncel</p>
            </div>
            <div className="card text-center py-3 cursor-pointer hover:border-amber-800" onClick={() => setFilter('outdated')}>
              <p className="text-xl font-bold text-amber-400">{result.outdatedCount}</p>
              <p className="text-xs text-gray-500">Outdated</p>
            </div>
            <div className="card text-center py-3 cursor-pointer hover:border-red-800" onClick={() => setFilter('vulnerable')}>
              <p className="text-xl font-bold text-red-400">{result.vulnerableCount}</p>
              <p className="text-xs text-gray-500">Vulnerable</p>
            </div>
            <div className="card text-center py-3">
              <div className="flex justify-center gap-2 text-xs">
                <span className="text-red-400">{result.summary.major}M</span>
                <span className="text-amber-400">{result.summary.minor}m</span>
                <span className="text-green-400">{result.summary.patch}p</span>
              </div>
              <p className="text-xs text-gray-500">Major/Minor/Patch</p>
            </div>
          </div>

          {/* Filter + Search */}
          <div className="flex gap-3 mb-4">
            <div className="flex gap-1">
              {(['all', 'outdated', 'vulnerable'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${filter === f ? 'bg-brand-600/20 text-brand-400 border border-brand-600' : 'text-gray-400 hover:bg-gray-800 border border-transparent'}`}>
                  {f === 'all' ? 'Tumu' : f === 'outdated' ? 'Outdated' : 'Vulnerable'}
                </button>
              ))}
            </div>
            <input value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="Paket ara..." className="input-field text-sm flex-1" />
          </div>

          {/* Package Table */}
          <div className="card">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 pb-2 pr-3">Paket</th>
                    <th className="text-left text-xs text-gray-500 pb-2 pr-3">Mevcut</th>
                    <th className="text-left text-xs text-gray-500 pb-2 pr-3">Son</th>
                    <th className="text-left text-xs text-gray-500 pb-2 pr-3">Durum</th>
                    <th className="text-left text-xs text-gray-500 pb-2">Proje</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((pkg, i) => (
                    <tr key={`${pkg.name}-${i}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {pkg.isVulnerable && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                          <span className="font-mono text-gray-200">{pkg.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-400">{pkg.currentVersion}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {pkg.latestVersion ? (
                          <span className="flex items-center gap-1">
                            <ArrowUp className="w-3 h-3 text-amber-400" />
                            <span className="text-emerald-400">{pkg.latestVersion}</span>
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-1">
                          {pkg.updateType && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${UPDATE_COLORS[pkg.updateType] || 'text-gray-400'}`}>
                              {pkg.updateType}
                            </span>
                          )}
                          {pkg.isVulnerable && pkg.vulnerabilities.map((v, vi) => (
                            <span key={vi} className="text-xs px-1.5 py-0.5 rounded border bg-red-900/30 text-red-400 border-red-800">
                              {v.severity || 'vuln'}
                            </span>
                          ))}
                          {!pkg.updateType && !pkg.isVulnerable && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-xs text-gray-500">{pkg.projectFile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}