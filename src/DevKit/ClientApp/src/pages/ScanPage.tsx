import { useState } from 'react'
import {
  Search, FolderTree, FileCode, Loader2, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Eye, Cpu, Package, Layers, FileText,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'
import OpenInClaude from '../components/OpenInClaude'

const API = '/api/scan'

async function scanApi<T = Record<string, unknown>>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await res.json() as T
}

interface ProjectInfo {
  name: string; path: string; type: string; framework: string
  dependencies: string[]; projectReferences: string[]; fileCount: number
}

interface ScannedFile {
  relativePath: string; fileName: string; extension: string
  sizeKb: number; content?: string
}

interface ScanResult {
  rootPath: string; framework: string; tree: string
  summary: {
    totalFiles: number; totalFolders: number
    projects: ProjectInfo[]; namespaces: string[]; technologies: string[]
  }
  configFiles: ScannedFile[]; sourceFiles: ScannedFile[]
}

function Section({ title, icon, desc, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; desc?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card mb-4">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        {icon}
        <h3 className="text-sm font-semibold text-gray-200 flex-1">{title}</h3>
      </button>
      {desc && open && <p className="text-xs text-gray-500 mt-1 ml-8">{desc}</p>}
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

export default function ScanPage() {
  const [rootPath, setRootPath] = useState('')
  const [maxDepth, setMaxDepth] = useState(10)
  const [includeContents, setIncludeContents] = useState(true)
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')
  const [fileViewer, setFileViewer] = useState<{ path: string; content: string; loading: boolean } | null>(null)

  const handleScan = async () => {
    setLoading(true); setError(''); setScan(null)
    try {
      const res = await scanApi<{ success: boolean; scan?: ScanResult; error?: string }>('', {
        rootPath: rootPath || undefined,
        maxDepth,
        includeFileContents: includeContents,
      })
      if (!res.success) throw new Error(res.error)
      setScan(res.scan!)
    } catch (e) { setError(e instanceof Error ? e.message : 'Scan failed') }
    finally { setLoading(false) }
  }

  const handleTreeOnly = async () => {
    setLoading(true); setError(''); setScan(null)
    try {
      const res = await scanApi<{ success: boolean; rootPath: string; framework: string; tree: string; summary: ScanResult['summary']; error?: string }>('/tree', {
        rootPath: rootPath || undefined, maxDepth,
      })
      if (!res.success) throw new Error(res.error)
      setScan({
        rootPath: res.rootPath, framework: res.framework, tree: res.tree,
        summary: res.summary, configFiles: [], sourceFiles: [],
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Scan failed') }
    finally { setLoading(false) }
  }

  const handleReadFile = async (relativePath: string) => {
    setFileViewer({ path: relativePath, content: '', loading: true })
    try {
      const res = await scanApi<{ success: boolean; content?: string; error?: string }>('/file', {
        rootPath: rootPath || undefined, relativePath,
      })
      if (!res.success) throw new Error(res.error)
      setFileViewer({ path: relativePath, content: res.content || '', loading: false })
    } catch (e) {
      setFileViewer({ path: relativePath, content: `Error: ${e instanceof Error ? e.message : 'Failed'}`, loading: false })
    }
  }

  const frameworkLabel: Record<string, string> = {
    dotnet: '.NET', nextjs: 'Next.js', nodejs: 'Node.js', python: 'Python', go: 'Go', unknown: 'Unknown',
  }

  const frameworkColor: Record<string, string> = {
    dotnet: 'text-violet-400', nextjs: 'text-white', nodejs: 'text-green-400',
    python: 'text-yellow-400', go: 'text-cyan-400', unknown: 'text-gray-400',
  }

  function buildScanContext(s: ScanResult): string {
    const parts: string[] = []
    parts.push(`PROJE TARAMA SONUCU`)
    parts.push(`Root: ${s.rootPath}`)
    parts.push(`Framework: ${s.framework}`)
    parts.push(`Dosya: ${s.summary.totalFiles}, Klasor: ${s.summary.totalFolders}, Proje: ${s.summary.projects.length}`)
    parts.push('')

    if (s.summary.technologies.length > 0) {
      parts.push(`TEKNOLOJILER: ${s.summary.technologies.join(', ')}`)
      parts.push('')
    }

    if (s.summary.projects.length > 0) {
      parts.push('PROJELER:')
      s.summary.projects.forEach(p => {
        parts.push(`  ${p.name} (${p.type}) [${p.framework}] - ${p.path}`)
        if (p.projectReferences.length > 0) parts.push(`    References: ${p.projectReferences.join(', ')}`)
        if (p.dependencies.length > 0) parts.push(`    Dependencies: ${p.dependencies.join(', ')}`)
      })
      parts.push('')
    }

    if (s.summary.namespaces.length > 0) {
      parts.push(`NAMESPACES: ${s.summary.namespaces.join(', ')}`)
      parts.push('')
    }

    parts.push('KLASOR AGACI:')
    parts.push(s.tree)

    if (s.sourceFiles.length > 0) {
      parts.push('')
      parts.push(`KAYNAK DOSYALAR (${s.sourceFiles.length}):`)
      s.sourceFiles.forEach(f => parts.push(`  ${f.relativePath} (${f.sizeKb}KB)`))
    }

    return parts.join('\n')
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Search className="w-6 h-6 text-emerald-400" /> Project Scanner
        </h1>
        <p className="text-gray-400 mt-1">Mevcut projenin yapisini tara, dosyalari incele, teknolojileri tespit et</p>
      </div>

      {/* SCAN FORM */}
      <div className="card mb-4">
        <div className="grid grid-cols-4 gap-4 items-end">
          <div className="col-span-2">
            <PathPicker value={rootPath} onChange={setRootPath} label="Proje Root Dizini"
              placeholder="C:\source\myproject" hint="Bos birakirsan aktif profilin workspace'i kullanilir" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Derinlik</label>
            <input type="number" min={1} max={20} value={maxDepth}
              onChange={e => setMaxDepth(parseInt(e.target.value) || 10)}
              className="input-field text-sm font-mono w-full" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="includeContents" checked={includeContents}
              onChange={e => setIncludeContents(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500" />
            <label htmlFor="includeContents" className="text-xs text-gray-400">Dosya iceriklerini dahil et</label>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={handleScan} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Tam Tarama
          </button>
          <button onClick={handleTreeOnly} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderTree className="w-4 h-4" />}
            Sadece Agac
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-4 border-red-800 bg-red-950/10">
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* SCAN RESULTS */}
      {scan && (
        <>
          {/* HEADER */}
          <div className="card mb-4 border-emerald-800/30 bg-emerald-950/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-gray-200">{scan.rootPath}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {scan.summary.totalFiles} dosya, {scan.summary.totalFolders} klasor, {scan.summary.projects.length} proje
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${frameworkColor[scan.framework] || 'text-gray-400'}`}>
                  {frameworkLabel[scan.framework] || scan.framework}
                </span>
                <OpenInClaude
                  contextData={buildScanContext(scan)}
                  contextType="project-scan"
                  clipboardPrompt="Asagidaki proje tarama sonucunu incele. Projenin yapisini, teknolojilerini, dependency'lerini anla. Bundan sonra bu proje uzerinde calisacagiz, dogru DEVKIT_PATH marker'lari uret."
                />
              </div>
            </div>
          </div>

          {/* TECHNOLOGIES */}
          {scan.summary.technologies.length > 0 && (
            <Section title={`Teknolojiler (${scan.summary.technologies.length})`} icon={<Cpu className="w-4 h-4 text-amber-400" />}>
              <div className="flex flex-wrap gap-2">
                {scan.summary.technologies.map(tech => (
                  <span key={tech} className="px-2.5 py-1 bg-amber-900/20 border border-amber-800/30 rounded-lg text-xs text-amber-300 font-mono">
                    {tech}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* PROJECTS */}
          {scan.summary.projects.length > 0 && (
            <Section title={`Projeler (${scan.summary.projects.length})`} icon={<Package className="w-4 h-4 text-violet-400" />}>
              <div className="space-y-2">
                {scan.summary.projects.map((proj, i) => (
                  <div key={i} className="bg-gray-800/30 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-violet-300">{proj.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300">{proj.type}</span>
                        {proj.framework && <span className="text-xs text-gray-500 font-mono">{proj.framework}</span>}
                        <span className="text-xs text-gray-600">{proj.fileCount} files</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{proj.path}</p>

                    {proj.projectReferences.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs text-gray-600">References: </span>
                        <span className="text-xs text-blue-400 font-mono">{proj.projectReferences.join(', ')}</span>
                      </div>
                    )}

                    {proj.dependencies.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-gray-600">Dependencies: </span>
                        <span className="text-xs text-gray-400 font-mono">{proj.dependencies.slice(0, 10).join(', ')}{proj.dependencies.length > 10 ? ` +${proj.dependencies.length - 10}` : ''}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* NAMESPACES */}
          {scan.summary.namespaces.length > 0 && (
            <Section title={`Namespace'ler (${scan.summary.namespaces.length})`} icon={<Layers className="w-4 h-4 text-cyan-400" />} defaultOpen={false}>
              <div className="flex flex-wrap gap-1.5">
                {scan.summary.namespaces.map(ns => (
                  <span key={ns} className="px-2 py-0.5 bg-gray-800/40 rounded text-xs text-cyan-300 font-mono">{ns}</span>
                ))}
              </div>
            </Section>
          )}

          {/* FOLDER TREE */}
          <Section title="Klasor Agaci" icon={<FolderTree className="w-4 h-4 text-green-400" />} defaultOpen={false}>
            <pre className="bg-gray-950 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-auto max-h-96 whitespace-pre">
              {scan.tree}
            </pre>
          </Section>

          {/* SOURCE FILES */}
          {scan.sourceFiles.length > 0 && (
            <Section title={`Kaynak Dosyalar (${scan.sourceFiles.length})`} icon={<FileCode className="w-4 h-4 text-blue-400" />} defaultOpen={false}>
              <div className="space-y-0.5 max-h-96 overflow-auto">
                {scan.sourceFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40 rounded group">
                    <FileCode className="w-3 h-3 text-gray-600 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-400 flex-1 truncate">{f.relativePath}</span>
                    <span className="text-xs text-gray-600">{f.sizeKb}KB</span>
                    <button onClick={() => handleReadFile(f.relativePath)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-opacity">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* CONFIG FILES */}
          {scan.configFiles.length > 0 && (
            <Section title={`Config Dosyalar (${scan.configFiles.length})`} icon={<FileText className="w-4 h-4 text-orange-400" />} defaultOpen={false}>
              <div className="space-y-0.5 max-h-96 overflow-auto">
                {scan.configFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800/40 rounded group">
                    <FileText className="w-3 h-3 text-gray-600 flex-shrink-0" />
                    <span className="text-xs font-mono text-orange-300 flex-1 truncate">{f.relativePath}</span>
                    <span className="text-xs text-gray-600">{f.sizeKb}KB</span>
                    <button onClick={() => handleReadFile(f.relativePath)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-opacity">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* FILE VIEWER MODAL */}
      {fileViewer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8"
          onClick={() => setFileViewer(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-mono text-gray-300">{fileViewer.path}</span>
              <button onClick={() => setFileViewer(null)} className="text-gray-500 hover:text-gray-300 text-sm">Kapat</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {fileViewer.loading ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Okunuyor...
                </div>
              ) : (
                <pre className="text-xs font-mono text-gray-300 whitespace-pre">{fileViewer.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* USAGE GUIDE */}
      {!scan && !loading && !error && (
        <div className="card border-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Nasil Kullanilir?</h3>
          <div className="space-y-3 text-xs text-gray-500">
            <p>
              <span className="text-emerald-400 font-semibold">Tam Tarama:</span> Projenin tum yapisini tarar.
              Klasor agaci, projeler, dependency'ler, namespace'ler, teknolojiler, config dosyalari ve kaynak dosyalari listelenir.
              Claude Desktop uzerinden MCP ile kullanirken Claude bu bilgiyle projenin yapisini anlar ve dogru DEVKIT_PATH marker'lari uretir.
            </p>
            <p>
              <span className="text-emerald-400 font-semibold">Sadece Agac:</span> Hafif versiyon. Sadece klasor/dosya agaci ve ozet.
              Dosya icerigi dahil edilmez. Hizli bir bakis icin kullan.
            </p>
            <p>
              <span className="text-emerald-400 font-semibold">Dosya Okuma:</span> Tarama sonuclarinda herhangi bir dosyanin
              uzerine gelince goz ikonu gorunur. Tiklayinca dosya icerigini goruntulersin.
            </p>

            <div className="border-t border-gray-800 pt-3 mt-3">
              <p className="text-gray-400 font-semibold mb-2">MCP ile Ornek Kullanim (Claude Desktop):</p>
              <div className="space-y-2 font-mono bg-gray-950 rounded-lg p-3">
                <p className="text-cyan-300">"Projeyi tara"</p>
                <p className="text-gray-600">→ Aktif profilin workspace'indeki projeyi tam tarar</p>
                <p className="text-cyan-300 mt-2">"src/MyApp.Domain/Entities/Customer.cs dosyasini oku"</p>
                <p className="text-gray-600">→ Belirtilen dosyanin icerigini okur</p>
                <p className="text-cyan-300 mt-2">"Customer entity'sine Email property'si ekle ve import et"</p>
                <p className="text-gray-600">→ Claude mevcut kodu bilir, dogru DEVKIT_PATH ile gunceller</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}