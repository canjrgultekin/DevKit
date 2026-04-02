import { useState } from 'react'
import {
  GitCompareArrows, Search, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Eye, EyeOff, Minus,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/envcompare'

interface KeyCompare { key: string; values: Record<string, string | null>; status: string; isSensitive: boolean }
interface CompareResult { environments: string[]; keys: KeyCompare[]; totalKeys: number; missingCount: number; differentCount: number; identicalCount: number }

const STATUS_COLORS: Record<string, string> = {
  identical: 'border-l-green-600', different: 'border-l-amber-500', missing: 'border-l-red-500',
}

export default function EnvComparePage() {
  const [projectPath, setProjectPath] = useState('')
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'different' | 'missing' | 'identical'>('all')
  const [searchText, setSearchText] = useState('')
  const [showSensitive, setShowSensitive] = useState(false)

  const handleScan = async () => {
    setLoading(true); setMessage(null)
    try {
      const res = await fetch(`${API}/scan-and-compare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined }),
      }).then(r => r.json()) as { success: boolean; compare: CompareResult; error?: string; message?: string }

      if (!res.success) throw new Error(res.error)
      setResult(res.compare)

      const msg = res.message || `${res.compare.environments.length} environment, ${res.compare.totalKeys} key. ${res.compare.differentCount} farkli, ${res.compare.missingCount} eksik.`
      setMessage({ type: 'success', text: msg })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Tarama hatasi' }) }
    finally { setLoading(false) }
  }

  const filteredKeys = result?.keys.filter(k => {
    if (filter !== 'all' && k.status !== filter) return false
    if (searchText && !k.key.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }) || []

  const maskValue = (val: string | null, isSensitive: boolean) => {
    if (val === null) return null
    if (isSensitive && !showSensitive) return '••••••••'
    return val
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <GitCompareArrows className="w-6 h-6 text-cyan-400" /> Environment Config Comparator
        </h1>
        <p className="text-gray-400 mt-1">appsettings.json ve .env dosyalarini environment'lar arasi karsilastirir</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* Scan */}
      <div className="card mb-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <PathPicker value={projectPath} onChange={setProjectPath} label="Proje Dizini"
              placeholder="C:\source\myproject" hint="Bos birakilirsa aktif profil workspace kullanilir" />
          </div>
          <button onClick={handleScan} disabled={loading} className="btn-primary flex items-center gap-2 mb-0.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Tara ve Karsilastir
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="card text-center py-3 cursor-pointer hover:border-gray-600" onClick={() => setFilter('all')}>
              <p className="text-xl font-bold text-white">{result.totalKeys}</p>
              <p className="text-xs text-gray-500">Toplam Key</p>
            </div>
            <div className="card text-center py-3 cursor-pointer hover:border-green-800" onClick={() => setFilter('identical')}>
              <p className="text-xl font-bold text-green-400">{result.identicalCount}</p>
              <p className="text-xs text-gray-500">Ayni</p>
            </div>
            <div className="card text-center py-3 cursor-pointer hover:border-amber-800" onClick={() => setFilter('different')}>
              <p className="text-xl font-bold text-amber-400">{result.differentCount}</p>
              <p className="text-xs text-gray-500">Farkli</p>
            </div>
            <div className="card text-center py-3 cursor-pointer hover:border-red-800" onClick={() => setFilter('missing')}>
              <p className="text-xl font-bold text-red-400">{result.missingCount}</p>
              <p className="text-xs text-gray-500">Eksik</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4 items-center">
            <div className="flex gap-1">
              {(['all', 'different', 'missing', 'identical'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition-all ${filter === f ? 'bg-brand-600/20 text-brand-400 border border-brand-600' : 'text-gray-400 hover:bg-gray-800 border border-transparent'}`}>
                  {f === 'all' ? 'Tumu' : f === 'different' ? 'Farkli' : f === 'missing' ? 'Eksik' : 'Ayni'}
                </button>
              ))}
            </div>
            <input value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="Key ara..." className="input-field text-sm flex-1" />
            <button onClick={() => setShowSensitive(!showSensitive)} className="btn-secondary text-xs flex items-center gap-1">
              {showSensitive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSensitive ? 'Gizle' : 'Goster'}
            </button>
          </div>

          {/* Comparison Table */}
          <div className="card">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 pb-2 pr-3 w-64">Key</th>
                    {result.environments.map(env => (
                      <th key={env} className="text-left text-xs text-gray-500 pb-2 pr-3">{env}</th>
                    ))}
                    <th className="text-left text-xs text-gray-500 pb-2 w-16">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map(k => (
                    <tr key={k.key} className={`border-b border-gray-800/50 hover:bg-gray-800/30 border-l-2 ${STATUS_COLORS[k.status] || ''}`}>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-300 break-all">
                        {k.key}
                        {k.isSensitive && <span className="ml-1 text-amber-500">🔒</span>}
                      </td>
                      {result.environments.map(env => {
                        const val = k.values[env]
                        const masked = maskValue(val, k.isSensitive)
                        return (
                          <td key={env} className="py-2 pr-3 font-mono text-xs">
                            {val === null ? (
                              <span className="flex items-center gap-1 text-red-400">
                                <Minus className="w-3 h-3" /> eksik
                              </span>
                            ) : (
                              <span className={k.status === 'different' ? 'text-amber-300' : 'text-gray-400'}>
                                {masked}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2">
                        {k.status === 'identical' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                        {k.status === 'different' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        {k.status === 'missing' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      </td>
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