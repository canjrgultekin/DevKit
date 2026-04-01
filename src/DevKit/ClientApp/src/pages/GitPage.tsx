import { useEffect, useState, useCallback } from 'react'
import {
  GitBranch, GitCommit, GitMerge,
  RefreshCw, Plus, Trash2, Upload, Download,
  Loader2, CheckCircle2, XCircle, Terminal,
  Archive, ArchiveRestore, FileCode, Link, Tag,
  Edit3, ArrowRightLeft, Globe, Lock, AlertTriangle,
} from 'lucide-react'

interface GitResult {
  success: boolean
  output: string
  error: string
  command: string
}

interface StepResult {
  success: boolean
  steps: Array<{ step: string; success: boolean; output: string; error: string }>
  repoUrl?: string
}

const BASE = '/api/git'

async function gitApi<T = GitResult>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    // API error döndüyse, uygun formata çevir
    if (data.error) {
      throw new Error(data.error)
    }
    throw new Error(`Request failed: ${res.status}`)
  }
  return data as T
}

// ===== SECTION WRAPPER =====
function Section({ title, icon, desc, children, accent = 'gray' }: {
  title: string; icon: React.ReactNode; desc?: string; children: React.ReactNode; accent?: string
}) {
  const borderColor = {
    gray: 'border-gray-800', blue: 'border-blue-900/50', green: 'border-green-900/50',
    orange: 'border-orange-900/50', purple: 'border-purple-900/50', amber: 'border-amber-900/50',
    teal: 'border-teal-900/50', pink: 'border-pink-900/50', sky: 'border-sky-900/50',
  }[accent] || 'border-gray-800'

  return (
    <div className={`card ${borderColor}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {desc && <p className="text-xs text-gray-500 mb-3">{desc}</p>}
      {!desc && <div className="mb-3" />}
      {children}
    </div>
  )
}

// ===== STEP RESULTS =====
function StepResults({ result }: { result: StepResult }) {
  return (
    <div className={`card mt-4 ${result.success ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
      <div className="space-y-2">
        {(result.steps || []).map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {s.success ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
            <div className="min-w-0">
              <span className="text-gray-300 font-mono text-xs">{s.step}</span>
              {(s.output || s.error) && (
                <p className="text-gray-500 text-xs mt-0.5 truncate">{s.output || s.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {result.repoUrl && result.success && (
        <p className="mt-3 text-sm text-green-400">
          Repository created: <a href={result.repoUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-300">{result.repoUrl}</a>
        </p>
      )}
    </div>
  )
}

// ===== COMMAND RESULT =====
function CommandResult({ result }: { result: GitResult }) {
  return (
    <div className={`card ${result.success ? 'border-green-800' : 'border-red-800'}`}>
      <div className="flex items-center gap-2 mb-2">
        {result.success ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
        <span className="text-xs font-mono text-gray-500">{result.command}</span>
      </div>
      <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap">
        {result.output || result.error || 'Done'}
      </pre>
    </div>
  )
}

// ===== REMOTE LIST ITEM =====
function RemoteItem({ line, onRemove, loading }: { line: string; onRemove: (name: string) => void; loading: boolean }) {
  const parts = line.split('\t')
  if (parts.length < 2) return null
  const name = parts[0]
  const urlAndType = parts[1]
  const url = urlAndType?.replace(/\s*\((fetch|push)\)/, '').trim()
  const type = urlAndType?.includes('(push)') ? 'push' : 'fetch'

  if (type !== 'fetch') return null // Her remote'u sadece bir kere göster

  return (
    <div className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-mono text-orange-400">{name}</span>
        <p className="text-xs font-mono text-gray-500 truncate">{url}</p>
      </div>
      {name !== 'origin' && (
        <button onClick={() => onRemove(name)} disabled={loading} className="text-gray-600 hover:text-red-400 ml-2">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      {name === 'origin' && (
        <button onClick={() => onRemove(name)} disabled={loading} className="text-gray-600 hover:text-red-400 ml-2" title="Remove origin remote">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ===== MAIN COMPONENT =====
export default function GitPage() {
  const [currentBranch, setCurrentBranch] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [remoteBranches, setRemoteBranches] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [log, setLog] = useState('')
  const [remoteLines, setRemoteLines] = useState<string[]>([])
  const [tags, setTags] = useState('')
  const [isRepo, setIsRepo] = useState(true)
  const [hasRemote, setHasRemote] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<GitResult | null>(null)
  const [stepResult, setStepResult] = useState<StepResult | null>(null)

  // Forms
  const [commitMessage, setCommitMessage] = useState('')
  const [stageAll, setStageAll] = useState(true)
  const [newBranchName, setNewBranchName] = useState('')
  const [checkoutOnCreate, setCheckoutOnCreate] = useState(true)
  const [mergeBranch, setMergeBranch] = useState('')
  const [noFf, setNoFf] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [pushSetUpstream, setPushSetUpstream] = useState(true)

  // Setup forms
  const [initTab, setInitTab] = useState<'github' | 'existing'>('github')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [initCommit, setInitCommit] = useState(true)
  const [initCommitMsg, setInitCommitMsg] = useState('initial commit')
  const [pushAfterConnect, setPushAfterConnect] = useState(true)
  const [ghRepoName, setGhRepoName] = useState('')
  const [ghDescription, setGhDescription] = useState('')
  const [ghPrivate, setGhPrivate] = useState(true)

  // Remote & Tag forms
  const [newRemoteName, setNewRemoteName] = useState('origin')
  const [newRemoteUrl, setNewRemoteUrl] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagMessage, setNewTagMessage] = useState('')
  const [renameBranchOld, setRenameBranchOld] = useState('')
  const [renameBranchNew, setRenameBranchNew] = useState('')
  const [customCommand, setCustomCommand] = useState('')

  // ===== REFRESH =====
  const refresh = useCallback(async () => {
    setLoading('refresh')
    try {
      const statusRes = await gitApi('status')
      if (!statusRes.success && (statusRes.error?.includes('not a git repository') || statusRes.error?.includes('fatal'))) {
        setIsRepo(false)
        setLoading(null)
        return
      }
      setIsRepo(true)

      const [branchRes, logRes, branchesRes, remotesRes, tagsRes] = await Promise.all([
        gitApi('current-branch'), gitApi('log', { count: 15 }), gitApi('branches'), gitApi('remotes'), gitApi('tags'),
      ])

      if (branchRes.success) setCurrentBranch(branchRes.output.trim())
      setStatus(statusRes.output)
      if (logRes.success) setLog(logRes.output)
      if (tagsRes.success) setTags(tagsRes.output)

      if (remotesRes.success && remotesRes.output.trim()) {
        const lines = remotesRes.output.split('\n').filter(l => l.trim())
        setRemoteLines(lines)
        setHasRemote(lines.length > 0)
      } else {
        setRemoteLines([])
        setHasRemote(false)
      }

      if (branchesRes.success) {
        const local: string[] = []
        const remote: string[] = []
        branchesRes.output.split('\n').forEach(b => {
          const trimmed = b.replace('*', '').trim()
          if (!trimmed) return
          if (trimmed.startsWith('remotes/')) {
            if (!trimmed.includes('HEAD')) remote.push(trimmed.replace('remotes/', ''))
          } else {
            local.push(trimmed)
          }
        })
        setBranches(local)
        setRemoteBranches(remote)
      }
    } catch { /* ignore */ }
    finally { setLoading(null) }
  }, [])

  useEffect(() => { refresh() }, [])

  // ===== ACTION RUNNERS =====
  const run = async (action: string, fn: () => Promise<GitResult>) => {
    setLoading(action); setLastResult(null); setStepResult(null)
    try { const r = await fn(); setLastResult(r); await refresh() }
    catch (e) { setLastResult({ success: false, output: '', error: e instanceof Error ? e.message : 'Failed', command: action }) }
    finally { setLoading(null) }
  }

  const runSteps = async (action: string, fn: () => Promise<StepResult>) => {
    setLoading(action); setLastResult(null); setStepResult(null)
    try { const r = await fn(); setStepResult(r); await refresh() }
    catch (e) { setLastResult({ success: false, output: '', error: e instanceof Error ? e.message : 'Failed', command: action }) }
    finally { setLoading(null) }
  }

  const isL = (a: string) => loading === a
  const busy = loading !== null

  // =============================================
  // NOT A REPO SCREEN
  // =============================================
  if (!isRepo && loading !== 'refresh') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-orange-400" /> Git Management
          </h1>
          <div className="flex items-center gap-2 mt-2 bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-300">Bu workspace henuz bir git reposu degil. Asagidan baslatabilirsin.</span>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1 mb-6">
          <button onClick={() => setInitTab('github')}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              initTab === 'github' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Globe className="w-4 h-4" /> Yeni GitHub Repo Olustur
          </button>
          <button onClick={() => setInitTab('existing')}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              initTab === 'existing' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <Link className="w-4 h-4" /> Mevcut Repoya Baglan
          </button>
        </div>

        {/* GitHub Create */}
        {initTab === 'github' && (
          <div className="card border-blue-900/30">
            <p className="text-xs text-gray-500 mb-4">
              GitHub CLI (gh) gerekli. Kurulu degilse: <code className="text-gray-400">winget install GitHub.cli</code> sonra <code className="text-gray-400">gh auth login</code> bir kere calistir.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Repo Adi</label>
                  <input value={ghRepoName} onChange={(e) => setGhRepoName(e.target.value)}
                    placeholder="CentralLogPoc" className="input-field text-sm font-mono" />
                  <p className="text-xs text-gray-600 mt-1">Sadece repo adi, URL degil</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Aciklama (opsiyonel)</label>
                  <input value={ghDescription} onChange={(e) => setGhDescription(e.target.value)}
                    placeholder="Central logging PoC project" className="input-field text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Gorunurluk</label>
                  <div className="flex gap-2">
                    <button onClick={() => setGhPrivate(true)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${ghPrivate ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      <Lock className="w-3 h-3" /> Private
                    </button>
                    <button onClick={() => setGhPrivate(false)}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${!ghPrivate ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      <Globe className="w-3 h-3" /> Public
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Branch</label>
                  <select value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} className="input-field text-sm">
                    <option value="main">main</option>
                    <option value="master">master</option>
                    <option value="develop">develop</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Commit Mesaji</label>
                  <input value={initCommitMsg} onChange={(e) => setInitCommitMsg(e.target.value)} className="input-field text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={initCommit} onChange={(e) => setInitCommit(e.target.checked)} className="rounded border-gray-600" />
                  Tum dosyalari commitle
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={pushAfterConnect} onChange={(e) => setPushAfterConnect(e.target.checked)} className="rounded border-gray-600" />
                  Olusturduktan sonra push yap
                </label>
              </div>

              <button onClick={() => runSteps('github-create', () => gitApi<StepResult>('github-create', {
                repoName: ghRepoName, description: ghDescription || undefined, private: ghPrivate,
                defaultBranch, initialCommit: initCommit, commitMessage: initCommitMsg, pushAfterCreate: pushAfterConnect,
              }))} disabled={busy || !ghRepoName.trim()} className="btn-primary flex items-center gap-2 w-full justify-center py-2.5">
                {isL('github-create') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                Repo Olustur & Push Yap
              </button>
            </div>
          </div>
        )}

        {/* Connect Existing */}
        {initTab === 'existing' && (
          <div className="card border-teal-900/30">
            <p className="text-xs text-gray-500 mb-4">GitHub'da zaten olusturulmus bir repoya baglan.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Repository URL</label>
                <input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/username/my-project.git" className="input-field text-sm font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Branch</label>
                  <select value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} className="input-field text-sm">
                    <option value="main">main</option>
                    <option value="master">master</option>
                    <option value="develop">develop</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Commit Mesaji</label>
                  <input value={initCommitMsg} onChange={(e) => setInitCommitMsg(e.target.value)} className="input-field text-sm" disabled={!initCommit} />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={initCommit} onChange={(e) => setInitCommit(e.target.checked)} className="rounded border-gray-600" />
                  Tum dosyalari commitle
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={pushAfterConnect} onChange={(e) => setPushAfterConnect(e.target.checked)} className="rounded border-gray-600" />
                  Baglandiktan sonra push yap
                </label>
              </div>

              <button onClick={() => runSteps('init-connect', () => gitApi<StepResult>('init-connect', {
                remoteUrl, defaultBranch, initialCommit: initCommit, commitMessage: initCommitMsg, pushAfterConnect,
              }))} disabled={busy || !remoteUrl.trim()} className="btn-primary flex items-center gap-2 w-full justify-center py-2.5">
                {isL('init-connect') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                Baslat & Baglan
              </button>
            </div>
          </div>
        )}

        {stepResult && <StepResults result={stepResult} />}
        {lastResult && <div className="mt-4"><CommandResult result={lastResult} /></div>}
      </div>
    )
  }

  // =============================================
  // MAIN GIT UI
  // =============================================
  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-orange-400" /> Git Management
          </h1>
          <p className="text-gray-400 mt-1">
            Aktif branch: <span className="font-mono text-orange-400 font-semibold">{currentBranch || '...'}</span>
            {!hasRemote && <span className="text-amber-400 ml-3 text-xs">(remote bagli degil)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => run('fetch', () => gitApi('fetch'))} disabled={busy} className="btn-secondary flex items-center gap-1.5 text-sm" title="Fetch: remote'taki degisiklikleri kontrol et">
            {isL('fetch') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Fetch
          </button>
          <button onClick={() => run('pull', () => gitApi('pull'))} disabled={busy} className="btn-secondary flex items-center gap-1.5 text-sm" title="Pull: remote'taki degisiklikleri indir ve birlesir">
            {isL('pull') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Pull
          </button>
          <button onClick={() => run('push', () => gitApi('push', { remote: 'origin', branch: currentBranch, setUpstream: pushSetUpstream }))} disabled={busy}
            className="btn-primary flex items-center gap-1.5 text-sm" title="Push: local commit'leri remote'a gonder">
            {isL('push') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Push
          </button>
          <button onClick={() => refresh()} disabled={busy} className="btn-secondary text-sm" title="Sayfayi yenile">
            {isL('refresh') ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ===== ROW 1: STATUS + COMMIT ===== */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Section title="Durum (Status)" icon={<FileCode className="w-4 h-4 text-blue-400" />}
          desc="Degisen, eklenen, silinen dosyalar burada gorunur" accent="blue">
          <div className="flex gap-1.5 mb-2">
            <button onClick={() => run('stage', () => gitApi('stage', { path: '.' }))} disabled={busy}
              className="btn-secondary text-xs" title="Tum degisiklikleri commit icin hazirla">Stage All</button>
            <button onClick={() => run('reset', () => gitApi('reset'))} disabled={busy}
              className="btn-secondary text-xs" title="Stage edilmis dosyalari geri al">Unstage</button>
            <button onClick={() => run('diff', () => gitApi('diff'))} disabled={busy}
              className="btn-secondary text-xs" title="Degisikliklerin detayini gor">Diff</button>
          </div>
          <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-400 overflow-auto max-h-40 whitespace-pre-wrap">
            {status || '✓ Temiz (degisiklik yok)'}
          </pre>
        </Section>

        <Section title="Commit" icon={<GitCommit className="w-4 h-4 text-green-400" />}
          desc="Degisiklikleri kaydet. Stage All isaretliyse otomatik tum dosyalar dahil edilir" accent="green">
          <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && commitMessage.trim()) { e.preventDefault(); run('commit', () => gitApi('commit', { message: commitMessage, stageAll })); setCommitMessage('') } }}
            placeholder="Commit mesaji yaz... (Ctrl+Enter ile gonder)" className="input-field text-sm h-24 resize-none mb-2" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={stageAll} onChange={(e) => setStageAll(e.target.checked)} className="rounded border-gray-600" />
              Tum dosyalari dahil et
            </label>
            <button onClick={() => { run('commit', () => gitApi('commit', { message: commitMessage, stageAll })); setCommitMessage('') }}
              disabled={busy || !commitMessage.trim()} className="btn-primary text-sm flex items-center gap-1.5">
              {isL('commit') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5" />} Commit
            </button>
          </div>
        </Section>
      </div>

      {/* ===== ROW 2: BRANCHES + MERGE ===== */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Section title="Branch'ler" icon={<GitBranch className="w-4 h-4 text-orange-400" />}
          desc="Yeni branch olustur, aralarinda gec veya sil" accent="orange">

          {/* Create */}
          <div className="flex gap-2 mb-2">
            <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newBranchName.trim()) { run('create-branch', () => gitApi('create-branch', { branch: newBranchName, checkout: checkoutOnCreate })); setNewBranchName('') } }}
              placeholder="yeni-branch-adi" className="input-field text-xs font-mono flex-1" />
            <button onClick={() => { run('create-branch', () => gitApi('create-branch', { branch: newBranchName, checkout: checkoutOnCreate })); setNewBranchName('') }}
              disabled={busy || !newBranchName.trim()} className="btn-primary text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Olustur
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500 mb-3 cursor-pointer">
            <input type="checkbox" checked={checkoutOnCreate} onChange={(e) => setCheckoutOnCreate(e.target.checked)} className="rounded border-gray-700" />
            Olusturduktan sonra bu branch'e gec
          </label>

          {/* Branch list */}
          <div className="space-y-1 max-h-36 overflow-auto">
            {branches.map((branch) => (
              <div key={branch} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                branch === currentBranch ? 'bg-orange-500/10 text-orange-400' : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/60'}`}>
                <button onClick={() => branch !== currentBranch && run('checkout', () => gitApi('checkout', { branch }))}
                  className={`font-mono text-xs truncate flex-1 text-left ${branch === currentBranch ? 'cursor-default font-medium' : 'hover:text-white cursor-pointer'}`}
                  disabled={branch === currentBranch} title={branch === currentBranch ? 'Aktif branch' : `${branch} branch\'ine gec`}>
                  {branch === currentBranch ? '● ' : '  '}{branch}
                </button>
                {branch !== currentBranch && (
                  <button onClick={() => { if (confirm(`"${branch}" branch'i silinsin mi?`)) run('delete-branch', () => gitApi('delete-branch', { branch })) }}
                    className="text-gray-600 hover:text-red-400 ml-2" title="Branch'i sil"><Trash2 className="w-3 h-3" /></button>
                )}
              </div>
            ))}
            {branches.length === 0 && <p className="text-xs text-gray-600 py-2">Henuz branch yok</p>}
          </div>

          {/* Rename */}
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><Edit3 className="w-3 h-3" /> Yeniden Adlandir</p>
            <div className="flex gap-1.5">
              <select value={renameBranchOld} onChange={(e) => setRenameBranchOld(e.target.value)} className="input-field text-xs font-mono flex-1">
                <option value="">sec...</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <input value={renameBranchNew} onChange={(e) => setRenameBranchNew(e.target.value)} placeholder="yeni ad" className="input-field text-xs font-mono flex-1" />
              <button onClick={() => { run('rename', () => gitApi('rename-branch', { oldName: renameBranchOld, newName: renameBranchNew })); setRenameBranchNew('') }}
                disabled={busy || !renameBranchOld || !renameBranchNew.trim()} className="btn-secondary text-xs" title="Yeniden adlandir">
                <ArrowRightLeft className="w-3 h-3" />
              </button>
            </div>
          </div>
        </Section>

        <Section title="Merge (Birlestir)" icon={<GitMerge className="w-4 h-4 text-purple-400" />}
          desc={`Sectigin branch'i aktif branch'e (${currentBranch}) birlestirir`} accent="purple">
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Hangi branch birlestirilsin?</label>
            <select value={mergeBranch} onChange={(e) => setMergeBranch(e.target.value)} className="input-field text-sm font-mono">
              <option value="">Branch sec...</option>
              <optgroup label="Local">
                {branches.filter(b => b !== currentBranch).map(b => <option key={b} value={b}>{b}</option>)}
              </optgroup>
              {remoteBranches.length > 0 && (
                <optgroup label="Remote">
                  {remoteBranches.map(b => <option key={b} value={b}>{b}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer" title="Her zaman merge commit olustur (fast-forward yapma)">
              <input type="checkbox" checked={noFf} onChange={(e) => setNoFf(e.target.checked)} className="rounded border-gray-600" />
              Merge commit olustur (--no-ff)
            </label>
            <div className="flex gap-1.5">
              <button onClick={() => run('merge-abort', () => gitApi('merge-abort'))} disabled={busy}
                className="btn-danger text-xs" title="Devam eden merge islemini iptal et">Iptal</button>
              <button onClick={() => run('merge', () => gitApi('merge', { branch: mergeBranch, noFastForward: noFf }))}
                disabled={busy || !mergeBranch} className="btn-primary text-sm flex items-center gap-1.5">
                {isL('merge') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />} Birlestir
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* ===== ROW 3: REMOTES + STASH ===== */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Section title="Remote Baglantilar" icon={<Link className="w-4 h-4 text-teal-400" />}
          desc="GitHub baglantilari. Repo olustur, bagla, kaldir" accent="teal">

          {/* Remote list */}
          <div className="space-y-1.5 mb-3">
            {remoteLines.length > 0 ? remoteLines.map((line, i) => (
              <RemoteItem key={i} line={line} loading={busy}
                onRemove={(name) => { if (confirm(`"${name}" remote baglantisi kaldirilsin mi?\nKaldirdiktan sonra yeni bir remote ekleyebilirsin.`)) run('remote-remove', () => gitApi('remote-remove', { name })) }} />
            )) : (
              <div className="bg-amber-900/10 border border-amber-800/20 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Remote baglanti yok. Asagidan GitHub repo olustur veya mevcut URL ekle.
                </p>
              </div>
            )}
          </div>

          {/* Remote tab selector */}
          <div className="pt-3 border-t border-gray-800">
            <div className="flex gap-1 bg-gray-800/40 rounded-md p-0.5 mb-3">
              <button onClick={() => setInitTab('github')}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                  initTab === 'github' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Globe className="w-3 h-3" /> GitHub Repo Olustur
              </button>
              <button onClick={() => setInitTab('existing')}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                  initTab === 'existing' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Link className="w-3 h-3" /> URL ile Ekle
              </button>
            </div>

            {initTab === 'github' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={ghRepoName} onChange={(e) => setGhRepoName(e.target.value)}
                    placeholder="repo-adi" className="input-field text-xs font-mono flex-1" />
                  <div className="flex gap-1">
                    <button onClick={() => setGhPrivate(true)}
                      className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${ghPrivate ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                      <Lock className="w-2.5 h-2.5" /> Private
                    </button>
                    <button onClick={() => setGhPrivate(false)}
                      className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors ${!ghPrivate ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-500'}`}>
                      <Globe className="w-2.5 h-2.5" /> Public
                    </button>
                  </div>
                </div>
                <input value={ghDescription} onChange={(e) => setGhDescription(e.target.value)}
                  placeholder="Aciklama (opsiyonel)" className="input-field text-xs" />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={initCommit} onChange={(e) => setInitCommit(e.target.checked)} className="rounded border-gray-700" />
                    Commit
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={pushAfterConnect} onChange={(e) => setPushAfterConnect(e.target.checked)} className="rounded border-gray-700" />
                    Push
                  </label>
                </div>
                <button onClick={() => runSteps('github-create', () => gitApi<StepResult>('github-create', {
                  repoName: ghRepoName, description: ghDescription || undefined, private: ghPrivate,
                  defaultBranch: 'main', initialCommit: initCommit, commitMessage: 'initial commit', pushAfterCreate: pushAfterConnect,
                }))} disabled={busy || !ghRepoName.trim()} className="btn-primary text-xs w-full flex items-center justify-center gap-1.5 py-2">
                  {isL('github-create') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  Repo Olustur & Bagla
                </button>
                <p className="text-xs text-gray-600">gh CLI gerekli: winget install GitHub.cli, sonra gh auth login</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input value={newRemoteName} onChange={(e) => setNewRemoteName(e.target.value)}
                    placeholder="origin" className="input-field text-xs font-mono w-24" />
                  <input value={newRemoteUrl} onChange={(e) => setNewRemoteUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git" className="input-field text-xs font-mono flex-1" />
                  <button onClick={() => { run('remote-add', () => gitApi('remote-add', { name: newRemoteName, url: newRemoteUrl })); setNewRemoteUrl('') }}
                    disabled={busy || !newRemoteName.trim() || !newRemoteUrl.trim()} className="btn-primary text-xs" title="Remote ekle">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-gray-600">GitHub'da zaten var olan bir repoya baglanmak icin URL'ini gir</p>
              </div>
            )}
          </div>
        </Section>

        <Section title="Stash (Gecici Kayit)" icon={<Archive className="w-4 h-4 text-amber-400" />}
          desc="Commit etmeden degisiklikleri gecici olarak kaydet, sonra geri yukle" accent="amber">
          <input value={stashMessage} onChange={(e) => setStashMessage(e.target.value)}
            placeholder="Stash aciklamasi (opsiyonel)" className="input-field text-sm mb-3" />
          <div className="flex gap-2">
            <button onClick={() => { run('stash', () => gitApi('stash', { message: stashMessage || undefined })); setStashMessage('') }} disabled={busy}
              className="btn-secondary text-sm flex-1 flex items-center justify-center gap-1.5" title="Degisiklikleri gecici kaydet">
              <Archive className="w-3.5 h-3.5" /> Kaydet
            </button>
            <button onClick={() => run('stash-pop', () => gitApi('stash-pop'))} disabled={busy}
              className="btn-secondary text-sm flex-1 flex items-center justify-center gap-1.5" title="Son stash'i geri yukle">
              <ArchiveRestore className="w-3.5 h-3.5" /> Geri Yukle
            </button>
            <button onClick={() => run('stash-list', () => gitApi('stash-list'))} disabled={busy}
              className="btn-secondary text-sm flex-1" title="Kayitli stash'leri listele">
              Listele
            </button>
          </div>
        </Section>
      </div>

      {/* ===== ROW 4: TAGS + PUSH SETTINGS ===== */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Section title="Etiketler (Tags)" icon={<Tag className="w-4 h-4 text-pink-400" />}
          desc="Versiyon numaralari icin etiket olustur (v1.0.0 gibi)" accent="pink">
          {tags && (
            <pre className="bg-gray-950 rounded-lg p-2 text-xs font-mono text-gray-400 overflow-auto max-h-16 whitespace-pre-wrap mb-3">{tags}</pre>
          )}
          <div className="flex gap-1.5 mb-2">
            <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
              placeholder="v1.0.0" className="input-field text-xs font-mono w-28" />
            <input value={newTagMessage} onChange={(e) => setNewTagMessage(e.target.value)}
              placeholder="Release notu (opsiyonel)" className="input-field text-xs flex-1" />
            <button onClick={() => { run('create-tag', () => gitApi('create-tag', { tagName: newTagName, message: newTagMessage || undefined })); setNewTagName(''); setNewTagMessage('') }}
              disabled={busy || !newTagName.trim()} className="btn-primary text-xs" title="Etiket olustur">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <button onClick={() => run('push-tags', () => gitApi('push-tags'))} disabled={busy}
            className="btn-secondary text-xs w-full" title="Tum etiketleri remote'a gonder">
            Tum Etiketleri Push Yap
          </button>
        </Section>

        <Section title="Push Ayarlari" icon={<Upload className="w-4 h-4 text-sky-400" />}
          desc="Ust bardaki Push butonunun davranisini ayarla" accent="sky">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer" title="Yeni branch'leri push ederken upstream olarak ayarla">
            <input type="checkbox" checked={pushSetUpstream} onChange={(e) => setPushSetUpstream(e.target.checked)} className="rounded border-gray-600" />
            Yeni branch'lerde upstream otomatik ayarla (-u)
          </label>
          <p className="text-xs text-gray-600 mt-2">Bu isareti olmadigi zaman, yeni olusturulan branch'leri push ederken "upstream not set" hatasi alirsin. Genelde isareti olarak birak.</p>
        </Section>
      </div>

      {/* ===== COMMIT LOG ===== */}
      <Section title="Commit Gecmisi" icon={<GitCommit className="w-4 h-4 text-sky-400" />}
        desc="Son 15 commit" accent="sky">
        <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-400 overflow-auto max-h-44 whitespace-pre">
          {log || 'Henuz commit yok'}
        </pre>
      </Section>

      {/* ===== CUSTOM COMMAND ===== */}
      <div className="mt-4">
        <Section title="Ozel Git Komutu" icon={<Terminal className="w-4 h-4 text-gray-400" />}
          desc="Yukardaki butonlarla yapamayacagin ozel bir komut varsa buraya yaz">
          <div className="flex gap-2">
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg px-3">
              <span className="text-sm text-gray-500 font-mono">git</span>
            </div>
            <input value={customCommand} onChange={(e) => setCustomCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && customCommand.trim() && run('command', () => gitApi('command', { arguments: customCommand }))}
              placeholder="log --oneline -5" className="input-field text-sm font-mono flex-1" />
            <button onClick={() => run('command', () => gitApi('command', { arguments: customCommand }))}
              disabled={busy || !customCommand.trim()} className="btn-primary text-sm">Calistir</button>
          </div>
        </Section>
      </div>

      {/* ===== RESULTS ===== */}
      {stepResult && <div className="mt-4"><StepResults result={stepResult} /></div>}
      {lastResult && <div className="mt-4"><CommandResult result={lastResult} /></div>}
    </div>
  )
}