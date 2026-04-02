import { useState } from 'react'
import {
  Database, Loader2, CheckCircle2, XCircle, Play, RotateCcw,
  Plus, FileCode,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/migration'

interface MigrationFile { version: string; name: string; fileName: string; relativePath: string; type: string; appliedAt: string | null; status: string; sizeKb: number }
interface MigrationStatus { totalFiles: number; applied: number; pending: number; migrations: MigrationFile[] }
interface MigrationRunResult { success: boolean; version: string; message: string; durationMs: number; sql: string }

export default function MigrationPage() {
  const [projectPath, setProjectPath] = useState('')
  const [connStr, setConnStr] = useState('')
  const [migrationsFolder, setMigrationsFolder] = useState('')
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newMigrationName, setNewMigrationName] = useState('')
  const [runResult, setRunResult] = useState<MigrationRunResult | null>(null)
  const [showConnStr, setShowConnStr] = useState(false)

  const handleGetStatus = async () => {
    if (!connStr) { setMessage({ type: 'error', text: 'Connection string gerekli.' }); return }
    setLoading('status'); setMessage(null)
    try {
      const res = await fetch(`${API}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined, connectionString: connStr, migrationsFolder: migrationsFolder || undefined }),
      }).then(r => r.json()) as { success: boolean; status: MigrationStatus; error?: string }

      if (!res.success) throw new Error(res.error)
      setStatus(res.status)
      setMessage({ type: 'success', text: `${res.status.totalFiles} migration: ${res.status.applied} applied, ${res.status.pending} pending.` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Hata' }) }
    finally { setLoading('') }
  }

  const handleApply = async (filePath: string) => {
    setLoading(`apply-${filePath}`); setRunResult(null)
    try {
      const res = await fetch(`${API}/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined, connectionString: connStr, filePath }),
      }).then(r => r.json()) as { success: boolean; result: MigrationRunResult; error?: string }

      if (!res.success) throw new Error(res.error || res.result?.message)
      setRunResult(res.result)
      setMessage({ type: res.result.success ? 'success' : 'error', text: res.result.message })
      if (res.result.success) handleGetStatus()
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Hata' }) }
    finally { setLoading('') }
  }

  const handleRollback = async (migration: MigrationFile) => {
    const downPath = migration.relativePath.replace('.up.sql', '.down.sql')
    setLoading(`rollback-${migration.version}`); setRunResult(null)
    try {
      const res = await fetch(`${API}/rollback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined, connectionString: connStr, filePath: downPath }),
      }).then(r => r.json()) as { success: boolean; result: MigrationRunResult; error?: string }

      if (!res.success) throw new Error(res.error || res.result?.message)
      setRunResult(res.result)
      setMessage({ type: res.result.success ? 'success' : 'error', text: res.result.message })
      if (res.result.success) handleGetStatus()
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Hata' }) }
    finally { setLoading('') }
  }

  const handleGenerate = async () => {
    if (!newMigrationName) return
    setLoading('generate')
    try {
      const res = await fetch(`${API}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined, name: newMigrationName, migrationsFolder: migrationsFolder || undefined }),
      }).then(r => r.json()) as { success: boolean; path: string; message: string; error?: string }

      if (!res.success) throw new Error(res.error)
      setMessage({ type: 'success', text: res.message })
      setNewMigrationName('')
      handleGetStatus()
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Hata' }) }
    finally { setLoading('') }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Database className="w-6 h-6 text-purple-400" /> Migration Manager
        </h1>
        <p className="text-gray-400 mt-1">SQL migration dosyalarini yonet: olustur, uygula, rollback, durum takibi</p>
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
        <div className="space-y-3">
          <PathPicker value={projectPath} onChange={setProjectPath} label="Proje Dizini"
            placeholder="C:\source\myproject" hint="Bos birakilirsa aktif profil workspace" />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Connection String</label>
            <div className="flex gap-2">
              <input type={showConnStr ? 'text' : 'password'} value={connStr} onChange={e => setConnStr(e.target.value)}
                placeholder="Host=localhost;Port=5432;Database=mydb;Username=postgres;Password=postgres"
                className="input-field text-sm font-mono flex-1" />
              <button onClick={() => setShowConnStr(!showConnStr)} className="btn-secondary text-xs">
                {showConnStr ? 'Gizle' : 'Goster'}
              </button>
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Migrations Klasoru (opsiyonel)</label>
              <input value={migrationsFolder} onChange={e => setMigrationsFolder(e.target.value)}
                placeholder="migrations (varsayilan)" className="input-field text-sm" />
            </div>
            <button onClick={handleGetStatus} disabled={loading === 'status' || !connStr} className="btn-primary text-sm flex items-center gap-1.5">
              {loading === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Durum Getir
            </button>
          </div>
        </div>
      </div>

      {/* Generate New Migration */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-green-400" /> Yeni Migration Olustur
        </h3>
        <div className="flex gap-2">
          <input value={newMigrationName} onChange={e => setNewMigrationName(e.target.value)}
            placeholder="add_customer_email_column" className="input-field text-sm font-mono flex-1"
            onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
          <button onClick={handleGenerate} disabled={loading === 'generate' || !newMigrationName} className="btn-secondary text-sm flex items-center gap-1.5">
            {loading === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            Olustur
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1">Up ve down dosyalari otomatik olusturulur: V{'{timestamp}'}_{'{name}'}.up.sql / .down.sql</p>
      </div>

      {/* Migration List */}
      {status && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card text-center py-3">
              <p className="text-xl font-bold text-white">{status.totalFiles}</p>
              <p className="text-xs text-gray-500">Toplam</p>
            </div>
            <div className="card text-center py-3">
              <p className="text-xl font-bold text-green-400">{status.applied}</p>
              <p className="text-xs text-gray-500">Applied</p>
            </div>
            <div className="card text-center py-3">
              <p className="text-xl font-bold text-amber-400">{status.pending}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </div>

          <div className="card">
            <div className="space-y-2">
              {status.migrations.map(m => (
                <div key={m.version}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    m.status === 'applied' ? 'border-green-900/30 bg-green-950/5' : 'border-amber-900/30 bg-amber-950/5'}`}>
                  <div className="flex-shrink-0">
                    {m.status === 'applied' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <div className="w-4 h-4 rounded-full border-2 border-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">V{m.version}</span>
                      <span className="text-sm text-gray-200">{m.name}</span>
                      <span className="text-xs text-gray-600">{m.sizeKb} KB</span>
                    </div>
                    {m.appliedAt && <p className="text-xs text-gray-500 mt-0.5">Applied: {m.appliedAt}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    {m.status === 'pending' && (
                      <button onClick={() => handleApply(m.relativePath)}
                        disabled={loading === `apply-${m.relativePath}`}
                        className="btn-primary text-xs flex items-center gap-1 py-1 px-2">
                        {loading === `apply-${m.relativePath}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Apply
                      </button>
                    )}
                    {m.status === 'applied' && (
                      <button onClick={() => handleRollback(m)}
                        disabled={loading === `rollback-${m.version}`}
                        className="btn-secondary text-xs flex items-center gap-1 py-1 px-2 text-red-400 hover:text-red-300">
                        {loading === `rollback-${m.version}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Run Result */}
      {runResult && (
        <div className={`card mt-4 ${runResult.success ? 'border-green-800' : 'border-red-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${runResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {runResult.success ? 'Basarili' : 'Basarisiz'}
            </span>
            <span className="text-xs text-gray-500">{runResult.durationMs}ms</span>
          </div>
          <p className="text-sm text-gray-300 mb-2">{runResult.message}</p>
          <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap">{runResult.sql}</pre>
        </div>
      )}
    </div>
  )
}