import { useState, useRef, useEffect } from 'react'
import {
  ScrollText, Search, Loader2, CheckCircle2, XCircle,
   RefreshCw, ArrowDown,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/logviewer'

interface LogEntry { lineNumber: number; timestamp: string; level: string; message: string; exception: string | null; sourceContext: string | null; correlationId: string | null; properties: Record<string, string>; raw: string }
interface LogSummary { verbose: number; debug: number; information: number; warning: number; error: number; fatal: number }
interface LogResult { entries: LogEntry[]; totalLines: number; filteredCount: number; filePath: string; summary: LogSummary }

const LEVEL_COLORS: Record<string, string> = {
  verbose: 'text-gray-500', debug: 'text-gray-400', information: 'text-blue-400',
  warning: 'text-amber-400', error: 'text-red-400', fatal: 'text-red-500 font-bold',
}

const LEVEL_BG: Record<string, string> = {
  verbose: '', debug: '', information: '',
  warning: 'bg-amber-950/10', error: 'bg-red-950/15', fatal: 'bg-red-950/25',
}

export default function LogViewerPage() {
  const [projectPath, setProjectPath] = useState('')
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState('')
  const [result, setResult] = useState<LogResult | null>(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [levelFilter, setLevelFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [tail, setTail] = useState(200)
  const [autoScroll, setAutoScroll] = useState(true)
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set())
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && logEndRef.current)
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [result, autoScroll])

  const handleScanFiles = async () => {
    setLoading('scan'); setMessage(null)
    try {
      const res = await fetch(`${API}/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: projectPath || undefined }),
      }).then(r => r.json()) as { success: boolean; files: string[]; error?: string }

      if (!res.success) throw new Error(res.error)
      setLogFiles(res.files)
      if (res.files.length > 0) setSelectedFile(res.files[0])
      setMessage({ type: 'success', text: `${res.files.length} log dosyasi bulundu.` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Tarama hatasi' }) }
    finally { setLoading('') }
  }

  const handleReadLogs = async () => {
    if (!selectedFile) return
    setLoading('read')
    try {
      const res = await fetch(`${API}/read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: projectPath || undefined, filePath: selectedFile,
          tail, level: levelFilter || undefined,
          search: searchText || undefined, correlationId: correlationId || undefined,
        }),
      }).then(r => r.json()) as { success: boolean; logs: LogResult; error?: string }

      if (!res.success) throw new Error(res.error)
      setResult(res.logs)
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Okuma hatasi' }) }
    finally { setLoading('') }
  }

  const toggleExpand = (lineNumber: number) => {
    setExpandedLines(prev => {
      const next = new Set(prev)
      next.has(lineNumber) ? next.delete(lineNumber) : next.add(lineNumber)
      return next
    })
  }

  const levelKey = (level: string) => level.toLowerCase().replace('vrb', 'verbose').replace('dbg', 'debug').replace('inf', 'information').replace('wrn', 'warning').replace('err', 'error').replace('ftl', 'fatal')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-orange-400" /> Log Viewer
        </h1>
        <p className="text-gray-400 mt-1">Structured log dosyalarini renkli, filtrelenebilir, aranabilir goruntule</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* File Selection */}
      <div className="card mb-4">
        <div className="flex gap-4 items-end mb-3">
          <div className="flex-1">
            <PathPicker value={projectPath} onChange={setProjectPath} label="Proje Dizini"
              placeholder="C:\source\myproject" hint="Bos birakilirsa aktif profil workspace" />
          </div>
          <button onClick={handleScanFiles} disabled={loading === 'scan'} className="btn-secondary text-sm flex items-center gap-1.5 mb-0.5">
            {loading === 'scan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Log Dosyalarini Bul
          </button>
        </div>

        {logFiles.length > 0 && (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Log Dosyasi</label>
              <select value={selectedFile} onChange={e => setSelectedFile(e.target.value)} className="input-field text-sm font-mono">
                {logFiles.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs text-gray-400 mb-1">Satir</label>
              <select value={tail} onChange={e => setTail(Number(e.target.value))} className="input-field text-sm">
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
            <button onClick={handleReadLogs} disabled={loading === 'read'} className="btn-primary text-sm flex items-center gap-1.5 mb-0.5">
              {loading === 'read' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Oku
            </button>
          </div>
        )}
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="text-xs text-gray-500">{result.totalLines} satir, {result.filteredCount} gosteriliyor</span>
            <span className="text-xs text-gray-600">|</span>
            {result.summary.information > 0 && <span className="text-xs text-blue-400">INF: {result.summary.information}</span>}
            {result.summary.warning > 0 && <span className="text-xs text-amber-400">WRN: {result.summary.warning}</span>}
            {result.summary.error > 0 && <span className="text-xs text-red-400">ERR: {result.summary.error}</span>}
            {result.summary.fatal > 0 && <span className="text-xs text-red-500">FTL: {result.summary.fatal}</span>}
            {result.summary.debug > 0 && <span className="text-xs text-gray-400">DBG: {result.summary.debug}</span>}
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <select value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setTimeout(handleReadLogs, 0) }} className="input-field text-xs w-32">
              <option value="">Tum Level'lar</option>
              <option value="verbose">Verbose</option>
              <option value="debug">Debug</option>
              <option value="information">Information</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
            <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Mesaj ara..."
              className="input-field text-xs flex-1" onKeyDown={e => e.key === 'Enter' && handleReadLogs()} />
            <input value={correlationId} onChange={e => setCorrelationId(e.target.value)} placeholder="Correlation ID..."
              className="input-field text-xs w-48" onKeyDown={e => e.key === 'Enter' && handleReadLogs()} />
            <button onClick={() => setAutoScroll(!autoScroll)}
              className={`btn-secondary text-xs flex items-center gap-1 ${autoScroll ? 'text-brand-400' : ''}`}>
              <ArrowDown className="w-3 h-3" /> Auto-scroll
            </button>
          </div>

          {/* Log Entries */}
          <div className="card p-0">
            <div className="max-h-[calc(100vh-450px)] overflow-auto font-mono text-xs">
              {result.entries.map(entry => {
                const lk = levelKey(entry.level)
                const isExpanded = expandedLines.has(entry.lineNumber)
                return (
                  <div key={entry.lineNumber}
                    onClick={() => toggleExpand(entry.lineNumber)}
                    className={`px-3 py-1 border-b border-gray-800/30 cursor-pointer hover:bg-gray-800/30 ${LEVEL_BG[lk] || ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-gray-600 w-10 text-right flex-shrink-0">{entry.lineNumber}</span>
                      <span className="text-gray-600 w-24 flex-shrink-0">{entry.timestamp.substring(11, 23) || entry.timestamp.substring(0, 12)}</span>
                      <span className={`w-12 flex-shrink-0 ${LEVEL_COLORS[lk] || 'text-gray-400'}`}>
                        {entry.level.substring(0, 3).toUpperCase()}
                      </span>
                      {entry.sourceContext && <span className="text-violet-400 flex-shrink-0">[{entry.sourceContext.split('.').pop()}]</span>}
                      <span className="text-gray-300 break-all">{entry.message}</span>
                    </div>
                    {isExpanded && (
                      <div className="ml-12 mt-1 space-y-1">
                        {entry.correlationId && <p className="text-cyan-400">CorrelationId: {entry.correlationId}</p>}
                        {entry.sourceContext && <p className="text-gray-500">Source: {entry.sourceContext}</p>}
                        {Object.entries(entry.properties).map(([k, v]) => (
                          <p key={k} className="text-gray-500">{k}: {v}</p>
                        ))}
                        {entry.exception && (
                          <pre className="text-red-400 whitespace-pre-wrap mt-1 p-2 bg-red-950/20 rounded">{entry.exception}</pre>
                        )}
                        <p className="text-gray-700 mt-1">Raw: {entry.raw}</p>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}