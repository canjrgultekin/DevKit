import { useEffect, useState } from 'react'
import {
  Container, Plus, Trash2, Play, Square, RefreshCw,
  Loader2, CheckCircle2, XCircle, Eye, FileCode,
  Download, Settings2, Boxes, Terminal, Plug,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/docker'

async function dockerApi<T = Record<string, unknown>>(endpoint: string, method: 'GET' | 'POST' = 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return await res.json() as T
}

interface ServiceTemplate {
  id: string; name: string; category: string; description: string; image: string;
  defaultPorts: Array<{ host: number; container: number; description: string }>
  defaultEnv: Record<string, string>; volumes: string[]
  connectionStringKey: string; connectionStringTemplate: string
  configKeys: Record<string, string>; dependsOn: string[]
}

interface SelectedSvc { id: string; containerName?: string; enabled: boolean }
interface CustomSvc { name: string; buildContext: string; dockerfile: string; ports: Array<{ host: number; container: number }>; env: Record<string, string>; dependsOn: string[] }

function Section({ title, icon, desc, children }: { title: string; icon: React.ReactNode; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-1">{icon}<h3 className="text-sm font-semibold text-gray-200">{title}</h3></div>
      {desc && <p className="text-xs text-gray-500 mb-3">{desc}</p>}
      {!desc && <div className="mb-3" />}
      {children}
    </div>
  )
}

export default function DockerPage() {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([])
  const [selected, setSelected] = useState<SelectedSvc[]>([])
  const [customServices, setCustomServices] = useState<CustomSvc[]>([])
  const [projectName, setProjectName] = useState('myapp')
  const [outputPath, setOutputPath] = useState('')
  const [appSettingsPath, setAppSettingsPath] = useState('')
  const [generatedYml, setGeneratedYml] = useState('')
  const [connectionStrings, setConnectionStrings] = useState<Record<string, string>>({})
  const [showYml, setShowYml] = useState(false)
  const [loading, setLoading] = useState('')
  const [lastResult, setLastResult] = useState<{ success: boolean; output: string; error: string; command: string } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    dockerApi<{ services: ServiceTemplate[] }>('services', 'GET').then(d => {
      setTemplates(d.services || [])
    })
  }, [])

  const categories = [...new Set(templates.map(t => t.category))]

  const toggleService = (id: string) => {
    setSelected(prev => {
      const exists = prev.find(s => s.id === id)
      if (exists) return prev.filter(s => s.id !== id)
      return [...prev, { id, enabled: true }]
    })
  }

  const isSelected = (id: string) => selected.some(s => s.id === id)

  const hasPortConflict = () => {
    const ids = selected.map(s => s.id)
    if (ids.includes('jaeger') && ids.includes('otelcollector')) return 'managed'
    return null
  }

  const addCustomService = () => {
    setCustomServices(prev => [...prev, { name: `app-${prev.length + 1}`, buildContext: '.', dockerfile: 'Dockerfile', ports: [{ host: 8080 + prev.length, container: 8080 }], env: {}, dependsOn: [] }])
  }

  const removeCustomService = (idx: number) => {
    setCustomServices(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCustomService = (idx: number, field: string, value: unknown) => {
    setCustomServices(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  // ===== GENERATE =====
  const handleGenerate = async () => {
    if (selected.length === 0 && customServices.length === 0) { setMessage({ type: 'error', text: 'En az bir servis sec' }); return }

    setLoading('generate'); setMessage(null)
    try {
      const res = await dockerApi<{ success: boolean; yml: string; connectionStrings: Record<string, string>; error?: string }>('generate', 'POST', {
        services: selected.map(s => ({ id: s.id, containerName: s.containerName })),
        customServices,
        projectName,
        networkName: `${projectName}-net`,
      })
      if (!res.success) throw new Error(res.error)
      setGeneratedYml(res.yml)
      setConnectionStrings(res.connectionStrings || {})
      setShowYml(true)
      setMessage({ type: 'success', text: 'docker-compose.yml olusturuldu' })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Failed' }) }
    finally { setLoading('') }
  }

  // ===== SAVE =====
  const handleSave = async () => {
    if (!outputPath || !generatedYml) return
    setLoading('save')
    try {
      const hasOtel = selected.some(s => s.id === 'otelcollector')
      const otelConfig = hasOtel ? {
        enableJaeger: selected.some(s => s.id === 'jaeger'),
        enableZipkin: selected.some(s => s.id === 'zipkin'),
        enablePrometheus: selected.some(s => s.id === 'grafana'),
        enableElastic: selected.some(s => s.id === 'elasticsearch'),
        elasticHost: 'elasticsearch:9200',
      } : undefined

      const res = await dockerApi<{ success: boolean; filePath?: string; error?: string }>('save', 'POST', {
        outputPath, content: generatedYml, otelConfig,
      })
      if (!res.success) throw new Error(res.error)
      setMessage({ type: 'success', text: `Kaydedildi: ${res.filePath}${hasOtel ? ' + otel-collector-config.yml' : ''}` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' }) }
    finally { setLoading('') }
  }

  // ===== INJECT APPSETTINGS =====
  const handleInject = async () => {
    if (!appSettingsPath || Object.keys(connectionStrings).length === 0) return
    setLoading('inject')
    try {
      const res = await dockerApi<{ success: boolean; error?: string }>('inject-appsettings', 'POST', {
        appSettingsPath, connectionStrings,
      })
      if (!res.success) throw new Error(res.error)
      setMessage({ type: 'success', text: `${Object.keys(connectionStrings).length} key appsettings'e eklendi` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Inject failed' }) }
    finally { setLoading('') }
  }

  // ===== DOCKER COMMANDS =====
  const runCmd = async (action: string, endpoint: string, body: Record<string, unknown> = {}) => {
    setLoading(action); setLastResult(null)
    try {
      const res = await dockerApi<{ success: boolean; output: string; error: string; command: string }>(`compose/${endpoint}`, 'POST', { workingDir: outputPath, ...body })
      setLastResult(res)
    } catch (e) { setLastResult({ success: false, output: '', error: e instanceof Error ? e.message : 'Failed', command: action }) }
    finally { setLoading('') }
  }

  const isL = (a: string) => loading === a
  const busy = loading !== ''

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Container className="w-6 h-6 text-blue-400" /> Docker Compose Manager
        </h1>
        <p className="text-gray-400 mt-1">Servisleri sec, docker-compose.yml olustur, appsettings'e bagla, calistir</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* ===== STEP 1: PROJECT SETTINGS ===== */}
      <Section title="Proje Ayarlari" icon={<Settings2 className="w-4 h-4 text-gray-400" />}
        desc="Compose dosyasinin olusturulacagi dizin ve proje adi">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Proje Adi</label>
            <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="myapp" className="input-field text-sm font-mono" />
          </div>
          <div className="col-span-2">
            <PathPicker value={outputPath} onChange={setOutputPath} label="Compose Dosya Yolu"
              placeholder="C:\source\myproject" hint="docker-compose.yml burada olusturulur" />
          </div>
        </div>
      </Section>

      {/* ===== STEP 2: SERVICE SELECTION ===== */}
      <Section title="Servis Secimi" icon={<Boxes className="w-4 h-4 text-violet-400" />}
        desc="Projenin ihtiyac duydugu servisleri sec. Sectigin her servisin connection string'i otomatik olusturulur">

        {categories.map(cat => (
          <div key={cat} className="mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{cat}</h4>
            <div className="grid grid-cols-2 gap-2">
              {templates.filter(t => t.category === cat).map(tmpl => {
                const sel = isSelected(tmpl.id)
                return (
                  <button key={tmpl.id} onClick={() => toggleService(tmpl.id)}
                    className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all border ${
                      sel ? 'border-brand-500 bg-brand-600/10' : 'border-gray-800 bg-gray-800/30 hover:border-gray-700'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                      sel ? 'border-brand-500 bg-brand-600' : 'border-gray-600'}`}>
                      {sel && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200">{tmpl.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tmpl.description}</p>
                      <p className="text-xs text-gray-600 font-mono mt-1">
                        {tmpl.defaultPorts.map(p => `${p.host}`).join(', ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {hasPortConflict() && (
          <div className="bg-blue-900/10 border border-blue-800/20 rounded-lg px-3 py-2 mt-2">
            <p className="text-xs text-blue-300">Jaeger + OTel Collector birlikte secildi. Otomatik olarak: OTel Collector OTLP portlarini (4317/4318) alir, Jaeger sadece UI portunu (16686) kullanir. OTel config'inde Jaeger'e trace export otomatik ayarlanir.</p>
          </div>
        )}
      </Section>

      {/* ===== STEP 3: CUSTOM SERVICES ===== */}
      <Section title="Kendi Projelerini Ekle" icon={<Plug className="w-4 h-4 text-teal-400" />}
        desc="Kendi uygulamalarin icin servis tanimlari ekle (Dockerfile gerekli)">

        {customServices.map((svc, idx) => (
          <div key={idx} className="bg-gray-800/30 rounded-lg p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-teal-400">{svc.name}</span>
              <button onClick={() => removeCustomService(idx)} className="text-gray-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Servis adi</label>
                <input value={svc.name} onChange={e => updateCustomService(idx, 'name', e.target.value)} className="input-field text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Build context</label>
                <input value={svc.buildContext} onChange={e => updateCustomService(idx, 'buildContext', e.target.value)} className="input-field text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Dockerfile</label>
                <input value={svc.dockerfile} onChange={e => updateCustomService(idx, 'dockerfile', e.target.value)} className="input-field text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Port (host:container)</label>
                <input value={svc.ports.map(p => `${p.host}:${p.container}`).join(', ')}
                  onChange={e => updateCustomService(idx, 'ports', e.target.value.split(',').map(p => { const [h, c] = p.trim().split(':'); return { host: parseInt(h) || 8080, container: parseInt(c) || 8080 } }))}
                  className="input-field text-xs font-mono" placeholder="5000:8080" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addCustomService} className="btn-secondary text-xs flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Proje Servisi Ekle
        </button>
      </Section>

      {/* ===== GENERATE + SAVE ===== */}
      <div className="flex gap-3 mb-4">
        <button onClick={handleGenerate} disabled={busy || (selected.length === 0 && customServices.length === 0)}
          className="btn-primary flex items-center gap-2">
          {isL('generate') ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
          Compose Olustur
        </button>

        {generatedYml && (
          <>
            <button onClick={() => setShowYml(!showYml)} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Eye className="w-4 h-4" /> {showYml ? 'Gizle' : 'Goster'}
            </button>
            <button onClick={handleSave} disabled={busy || !outputPath}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              {isL('save') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Kaydet
            </button>
          </>
        )}
      </div>

      {/* ===== YML PREVIEW ===== */}
      {showYml && generatedYml && (
        <Section title="docker-compose.yml" icon={<FileCode className="w-4 h-4 text-green-400" />}>
          <pre className="bg-gray-950 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-auto max-h-96 whitespace-pre">
            {generatedYml}
          </pre>
        </Section>
      )}

      {/* ===== CONNECTION STRINGS ===== */}
      {Object.keys(connectionStrings).length > 0 && (
        <Section title="Connection Strings & Config" icon={<Plug className="w-4 h-4 text-amber-400" />}
          desc="Secilen servislerin local baglanti adresleri. appsettings.json'a otomatik eklenebilir">

          <div className="space-y-1.5 mb-4">
            {Object.entries(connectionStrings).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 bg-gray-800/40 rounded-lg px-3 py-1.5">
                <span className="text-xs font-mono text-amber-400 w-64 truncate">{key}</span>
                <span className="text-xs font-mono text-gray-400 flex-1 truncate">{val}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <PathPicker value={appSettingsPath} onChange={setAppSettingsPath}
                placeholder="C:\source\myproject\appsettings.json"
                hint="appsettings.json dosyasini sec" mode="file" fileFilter="JSON (*.json)|*.json" />
            </div>
            <button onClick={handleInject} disabled={busy || !appSettingsPath}
              className="btn-primary text-sm flex items-center gap-1.5 mb-0.5">
              {isL('inject') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              AppSettings'e Ekle
            </button>
          </div>
        </Section>
      )}

      {/* ===== DOCKER COMMANDS ===== */}
      {generatedYml && outputPath && (
        <Section title="Docker Komutlari" icon={<Terminal className="w-4 h-4 text-sky-400" />}
          desc="docker compose komutlarini tek tikla calistir">

          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => runCmd('up', 'up', { detached: true })} disabled={busy}
              className="btn-primary text-sm flex items-center gap-1.5">
              {isL('up') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Up (Baslat)
            </button>
            <button onClick={() => runCmd('down', 'down')} disabled={busy}
              className="btn-danger text-sm flex items-center gap-1.5">
              {isL('down') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
              Down (Durdur)
            </button>
            <button onClick={() => runCmd('down-v', 'down', { removeVolumes: true })} disabled={busy}
              className="btn-danger text-sm flex items-center gap-1.5">
              Down + Volume Sil
            </button>
            <button onClick={() => runCmd('ps', 'ps')} disabled={busy}
              className="btn-secondary text-sm flex items-center gap-1.5">
              Status
            </button>
            <button onClick={() => runCmd('logs', 'logs', { tail: 100 })} disabled={busy}
              className="btn-secondary text-sm flex items-center gap-1.5">
              Logs
            </button>
            <button onClick={() => runCmd('pull', 'pull')} disabled={busy}
              className="btn-secondary text-sm flex items-center gap-1.5">
              Pull
            </button>
            <button onClick={() => runCmd('build', 'build')} disabled={busy}
              className="btn-secondary text-sm flex items-center gap-1.5">
              Build
            </button>
            <button onClick={() => runCmd('restart', 'restart')} disabled={busy}
              className="btn-secondary text-sm flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Restart
            </button>
          </div>

          {selected.length > 0 && (
            <div className="pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Servis bazli islem:</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.map(s => {
                  const tmpl = templates.find(t => t.id === s.id)
                  return (
                    <div key={s.id} className="flex items-center gap-1 bg-gray-800/40 rounded-lg px-2 py-1">
                      <span className="text-xs font-mono text-gray-400">{tmpl?.name || s.id}</span>
                      <button onClick={() => runCmd(`logs-${s.id}`, 'logs', { serviceName: s.containerName || s.id, tail: 50 })}
                        disabled={busy} className="text-sky-400 hover:text-sky-300 text-xs ml-1">logs</button>
                      <button onClick={() => runCmd(`restart-${s.id}`, 'restart', { serviceName: s.containerName || s.id })}
                        disabled={busy} className="text-amber-400 hover:text-amber-300 text-xs">restart</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ===== COMMAND RESULT ===== */}
      {lastResult && (
        <div className={`card ${lastResult.success ? 'border-green-800' : 'border-red-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            {lastResult.success ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className="text-xs font-mono text-gray-500">{lastResult.command}</span>
          </div>
          <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-300 overflow-auto max-h-60 whitespace-pre-wrap">
            {lastResult.output || lastResult.error || 'Done'}
          </pre>
        </div>
      )}
    </div>
  )
}