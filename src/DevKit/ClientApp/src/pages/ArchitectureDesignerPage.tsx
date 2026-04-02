import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Boxes, Save, Upload, Trash2,
  Loader2, CheckCircle2, XCircle, Settings2, Database, Server,
  MessageSquare, BarChart3, Shield, Container, Cpu,
  FileJson, Layers, ArrowRight, X, Copy, Plus,
} from 'lucide-react'

const API = '/api/architecturedesigner'

async function archApi<T = Record<string, unknown>>(endpoint: string, method = 'POST', body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${API}/${endpoint}`, opts)
  return await res.json() as T
}

// ═══ TYPES ═══
interface ArchComponent { id: string; name: string; type: string; category: string; config: Record<string, string>; x: number; y: number }
interface ArchConnection { id: string; sourceId: string; targetId: string; label: string; type: string }
interface ArchDesign { id: string; name: string; description: string; solutionName: string; outputPath: string; framework: string; architecture: string; components: ArchComponent[]; connections: ArchConnection[]; createdAt: string; updatedAt: string }

// ═══ CONSTANTS ═══
const CATEGORY_ICONS: Record<string, typeof Database> = {
  project: Layers, database: Database, messaging: MessageSquare,
  observability: BarChart3, cicd: Cpu, gateway: Shield,
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  project: { bg: 'bg-blue-950/40', border: 'border-blue-700', text: 'text-blue-400' },
  infrastructure: { bg: 'bg-emerald-950/40', border: 'border-emerald-700', text: 'text-emerald-400' },
  cloud: { bg: 'bg-violet-950/40', border: 'border-violet-700', text: 'text-violet-400' },
}

const TYPE_COLORS: Record<string, string> = {
  webapi: 'border-blue-500', classlib: 'border-sky-600', worker: 'border-indigo-500',
  console: 'border-gray-500', test: 'border-yellow-600', nextjs: 'border-white', react: 'border-cyan-500',
  postgresql: 'border-blue-400', mssql: 'border-red-500', mongodb: 'border-green-500',
  redis: 'border-red-400', couchbase: 'border-red-600',
  kafka: 'border-orange-400', rabbitmq: 'border-orange-500', servicebus: 'border-purple-500',
  elasticsearch: 'border-yellow-400', kibana: 'border-pink-400', logstash: 'border-yellow-500',
  jaeger: 'border-cyan-400', zipkin: 'border-orange-300', grafana: 'border-orange-500',
  otelcollector: 'border-teal-400', prometheus: 'border-orange-600',
  jenkins: 'border-red-400', apigateway: 'border-purple-400', bff: 'border-purple-500', nginx: 'border-green-400',
}

const TEMPLATES: Record<string, Array<{ type: string; label: string; category: string; defaultConfig: Record<string, string> }>> = {
  project: [
    { type: 'webapi', label: 'Web API', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk.Web', framework: 'net9.0' } },
    { type: 'classlib', label: 'Class Library', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk', framework: 'net9.0' } },
    { type: 'worker', label: 'Worker Service', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk.Worker', framework: 'net9.0' } },
    { type: 'console', label: 'Console App', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk', outputType: 'Exe', framework: 'net9.0' } },
    { type: 'test', label: 'Test Project', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk', framework: 'net9.0', testFramework: 'xunit' } },
    { type: 'nextjs', label: 'Next.js App', category: 'project', defaultConfig: { framework: 'nextjs', version: '15' } },
    { type: 'react', label: 'React App', category: 'project', defaultConfig: { framework: 'react', bundler: 'vite' } },
  ],
  database: [
    { type: 'postgresql', label: 'PostgreSQL', category: 'infrastructure', defaultConfig: { image: 'postgres:17', port: '5432' } },
    { type: 'mssql', label: 'SQL Server', category: 'infrastructure', defaultConfig: { image: 'mcr.microsoft.com/mssql/server:2022-latest', port: '1433' } },
    { type: 'mongodb', label: 'MongoDB', category: 'infrastructure', defaultConfig: { image: 'mongo:8', port: '27017' } },
    { type: 'redis', label: 'Redis', category: 'infrastructure', defaultConfig: { image: 'redis:7-alpine', port: '6379' } },
    { type: 'couchbase', label: 'Couchbase', category: 'infrastructure', defaultConfig: { image: 'couchbase:latest', port: '8091' } },
  ],
  messaging: [
    { type: 'kafka', label: 'Apache Kafka', category: 'infrastructure', defaultConfig: { image: 'confluentinc/cp-kafka:7.7.1', port: '9092' } },
    { type: 'rabbitmq', label: 'RabbitMQ', category: 'infrastructure', defaultConfig: { image: 'rabbitmq:4-management', port: '5672', mgmtPort: '15672' } },
    { type: 'servicebus', label: 'Azure Service Bus', category: 'cloud', defaultConfig: { type: 'managed' } },
  ],
  observability: [
    { type: 'elasticsearch', label: 'Elasticsearch', category: 'infrastructure', defaultConfig: { image: 'docker.elastic.co/elasticsearch/elasticsearch:8.17.0', port: '9200' } },
    { type: 'kibana', label: 'Kibana', category: 'infrastructure', defaultConfig: { image: 'docker.elastic.co/kibana/kibana:8.17.0', port: '5601' } },
    { type: 'logstash', label: 'Logstash', category: 'infrastructure', defaultConfig: { image: 'docker.elastic.co/logstash/logstash:8.17.0', port: '5044' } },
    { type: 'jaeger', label: 'Jaeger', category: 'infrastructure', defaultConfig: { image: 'jaegertracing/all-in-one:1.64', port: '16686' } },
    { type: 'zipkin', label: 'Zipkin', category: 'infrastructure', defaultConfig: { image: 'openzipkin/zipkin:3', port: '9411' } },
    { type: 'grafana', label: 'Grafana', category: 'infrastructure', defaultConfig: { image: 'grafana/grafana:11.4.0', port: '3000' } },
    { type: 'otelcollector', label: 'OTel Collector', category: 'infrastructure', defaultConfig: { image: 'otel/opentelemetry-collector-contrib:0.115.1', port: '4317' } },
    { type: 'prometheus', label: 'Prometheus', category: 'infrastructure', defaultConfig: { image: 'prom/prometheus:v2.54.0', port: '9090' } },
  ],
  gateway: [
    { type: 'apigateway', label: 'API Gateway', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk.Web', type: 'gateway' } },
    { type: 'bff', label: 'BFF', category: 'project', defaultConfig: { sdk: 'Microsoft.NET.Sdk.Web', type: 'bff' } },
    { type: 'nginx', label: 'Nginx', category: 'infrastructure', defaultConfig: { image: 'nginx:alpine', port: '80' } },
  ],
  cicd: [
    { type: 'jenkins', label: 'Jenkins', category: 'infrastructure', defaultConfig: { image: 'jenkins/jenkins:lts', port: '8080' } },
  ],
}

const CONNECTION_TYPES = [
  { value: 'references', label: 'Project Reference', color: '#3b82f6' },
  { value: 'uses', label: 'Uses (DB/Cache)', color: '#10b981' },
  { value: 'publishes-to', label: 'Publishes To', color: '#f59e0b' },
  { value: 'consumes-from', label: 'Consumes From', color: '#8b5cf6' },
  { value: 'depends-on', label: 'Depends On', color: '#6b7280' },
]

const CONN_COLORS: Record<string, string> = Object.fromEntries(CONNECTION_TYPES.map(c => [c.value, c.color]))

function generateId() { return Math.random().toString(36).substring(2, 10) }

export default function ArchitectureDesignerPage() {
  const [design, setDesign] = useState<ArchDesign>({
    id: generateId(), name: '', description: '', solutionName: '', outputPath: '',
    framework: 'dotnet', architecture: 'clean', components: [], connections: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
  const [selectedComponent, setSelectedComponent] = useState<ArchComponent | null>(null)
  const [connectMode, setConnectMode] = useState<{ sourceId: string; type: string } | null>(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'palette' | 'properties' | 'connections'>('palette')
  const [showMetadata, setShowMetadata] = useState(true)
  const [generatedManifest, setGeneratedManifest] = useState('')
  const [generatedDocker, setGeneratedDocker] = useState('')
  const [showOutput, setShowOutput] = useState<'manifest' | 'docker' | null>(null)
  const [dragOffset, setDragOffset] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [newCfgKey, setNewCfgKey] = useState('')
  const [newCfgValue, setNewCfgValue] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)

  // ═══ COMPONENT MANAGEMENT ═══
  const addComponent = (template: typeof TEMPLATES['project'][0]) => {
    const baseName = design.solutionName || 'MyProject'
    let name = template.category === 'project'
      ? `${baseName}.${template.label.replace(/\s/g, '')}`
      : template.label

    let counter = 2
    const originalName = name
    while (design.components.some(c => c.name === name)) {
      name = `${originalName}${counter++}`
    }

    const comp: ArchComponent = {
      id: generateId(), name, type: template.type, category: template.category,
      config: { ...template.defaultConfig },
      x: 50 + Math.random() * 400, y: 50 + Math.random() * 300,
    }

    setDesign(prev => ({ ...prev, components: [...prev.components, comp], updatedAt: new Date().toISOString() }))
    setSelectedComponent(comp)
    setActiveTab('properties')
  }

  const removeComponent = (id: string) => {
    setDesign(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== id),
      connections: prev.connections.filter(c => c.sourceId !== id && c.targetId !== id),
      updatedAt: new Date().toISOString(),
    }))
    if (selectedComponent?.id === id) setSelectedComponent(null)
  }

  const updateComponent = (id: string, updates: Partial<ArchComponent>) => {
    setDesign(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === id ? { ...c, ...updates } : c),
      updatedAt: new Date().toISOString(),
    }))
    if (selectedComponent?.id === id)
      setSelectedComponent(prev => prev ? { ...prev, ...updates } : null)
  }

  const updateConfig = (id: string, key: string, value: string) => {
    setDesign(prev => ({
      ...prev,
      components: prev.components.map(c =>
        c.id === id ? { ...c, config: { ...c.config, [key]: value } } : c
      ),
    }))
    if (selectedComponent?.id === id)
      setSelectedComponent(prev => prev ? { ...prev, config: { ...prev.config, [key]: value } } : null)
  }

  const removeConfigKey = (id: string, key: string) => {
    setDesign(prev => ({
      ...prev,
      components: prev.components.map(c => {
        if (c.id !== id) return c
        const newConfig = { ...c.config }
        delete newConfig[key]
        return { ...c, config: newConfig }
      }),
    }))
    if (selectedComponent?.id === id)
      setSelectedComponent(prev => {
        if (!prev) return null
        const newConfig = { ...prev.config }
        delete newConfig[key]
        return { ...prev, config: newConfig }
      })
  }

  const handleAddConfig = () => {
    if (!newCfgKey.trim() || !selectedComponent) return
    updateConfig(selectedComponent.id, newCfgKey.trim(), newCfgValue.trim())
    setNewCfgKey('')
    setNewCfgValue('')
  }

  // ═══ CONNECTION MANAGEMENT ═══
  const startConnect = (sourceId: string, type: string) => {
    setConnectMode({ sourceId, type })
    setMessage({ type: 'success', text: 'Hedef component\'e tiklayin...' })
  }

  const finishConnect = (targetId: string) => {
    if (!connectMode || connectMode.sourceId === targetId) {
      setConnectMode(null); setMessage(null); return
    }

    const exists = design.connections.some(c =>
      c.sourceId === connectMode.sourceId && c.targetId === targetId && c.type === connectMode.type
    )
    if (exists) {
      setMessage({ type: 'error', text: 'Bu baglanti zaten mevcut.' })
      setConnectMode(null); return
    }

    const conn: ArchConnection = {
      id: generateId(), sourceId: connectMode.sourceId, targetId,
      label: '', type: connectMode.type,
    }
    setDesign(prev => ({ ...prev, connections: [...prev.connections, conn] }))
    setConnectMode(null)
    setMessage({ type: 'success', text: 'Baglanti eklendi.' })
    setTimeout(() => setMessage(null), 2000)
  }

  const removeConnection = (id: string) => {
    setDesign(prev => ({ ...prev, connections: prev.connections.filter(c => c.id !== id) }))
  }

  // ═══ CANVAS DRAG ═══
  const handleCanvasMouseDown = (e: React.MouseEvent, comp: ArchComponent) => {
    if (connectMode) { finishConnect(comp.id); return }
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragOffset({ id: comp.id, ox: e.clientX - comp.x, oy: e.clientY - comp.y })
    setSelectedComponent(comp)
    setActiveTab('properties')
  }

  const handleCanvasMouseMove = useCallback((e: MouseEvent) => {
    if (!dragOffset) return
    const newX = Math.max(0, e.clientX - dragOffset.ox)
    const newY = Math.max(0, e.clientY - dragOffset.oy)
    setDesign(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === dragOffset.id ? { ...c, x: newX, y: newY } : c),
    }))
  }, [dragOffset])

  const handleCanvasMouseUp = useCallback(() => { setDragOffset(null) }, [])

  useEffect(() => {
    if (dragOffset) {
      window.addEventListener('mousemove', handleCanvasMouseMove)
      window.addEventListener('mouseup', handleCanvasMouseUp)
      return () => { window.removeEventListener('mousemove', handleCanvasMouseMove); window.removeEventListener('mouseup', handleCanvasMouseUp) }
    }
  }, [dragOffset, handleCanvasMouseMove, handleCanvasMouseUp])

  // ═══ ACTIONS ═══
  const handleValidate = async () => {
    setLoading('validate')
    try {
      const res = await archApi<{ success: boolean; errors: string[] }>('validate', 'POST', { design })
      if (res.success) setMessage({ type: 'success', text: 'Tasarim gecerli!' })
      else setMessage({ type: 'error', text: `Hatalar: ${res.errors.join(', ')}` })
    } catch { setMessage({ type: 'error', text: 'Dogrulama hatasi.' }) }
    finally { setLoading('') }
  }

  const handleToManifest = async () => {
    setLoading('manifest')
    try {
      const res = await archApi<{ success: boolean; manifest: string; errors?: string[] }>('to-manifest', 'POST', { design })
      if (res.success) { setGeneratedManifest(res.manifest); setShowOutput('manifest') }
      else setMessage({ type: 'error', text: res.errors?.join(', ') || 'Manifest olusturulamadi.' })
    } catch { setMessage({ type: 'error', text: 'Hata.' }) }
    finally { setLoading('') }
  }

  const handleToDocker = async () => {
    setLoading('docker')
    try {
      const res = await archApi<{ success: boolean; dockerCompose: string }>('to-docker', 'POST', { design })
      if (res.success) { setGeneratedDocker(res.dockerCompose); setShowOutput('docker') }
      else setMessage({ type: 'error', text: 'Docker compose olusturulamadi.' })
    } catch { setMessage({ type: 'error', text: 'Hata.' }) }
    finally { setLoading('') }
  }

  const handleSave = async () => {
    if (!design.outputPath) { setMessage({ type: 'error', text: 'Output path gerekli.' }); return }
    setLoading('save')
    try {
      const filePath = `${design.outputPath}/architecture.json`
      const res = await archApi<{ success: boolean; message: string }>('save', 'POST', { design, filePath })
      setMessage({ type: res.success ? 'success' : 'error', text: res.message })
    } catch { setMessage({ type: 'error', text: 'Kaydetme hatasi.' }) }
    finally { setLoading('') }
  }

  const handleLoad = async () => {
    const filePath = prompt('Tasarim dosya yolu (architecture.json):')
    if (!filePath) return
    setLoading('load')
    try {
      const res = await archApi<{ success: boolean; design: ArchDesign }>('load', 'POST', { filePath })
      if (res.success) { setDesign(res.design); setSelectedComponent(null); setMessage({ type: 'success', text: 'Tasarim yuklendi.' }) }
      else setMessage({ type: 'error', text: 'Yuklenemedi.' })
    } catch { setMessage({ type: 'error', text: 'Yukleme hatasi.' }) }
    finally { setLoading('') }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)
  const getComponentCenter = (comp: ArchComponent) => ({ x: comp.x + 90, y: comp.y + 35 })
  const busy = loading !== ''

  return (
    <div className="flex h-full">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="flex border-b border-gray-800">
          {(['palette', 'properties', 'connections'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500 hover:text-gray-300'}`}>
              {tab === 'palette' ? 'Components' : tab === 'properties' ? 'Properties' : 'Connections'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3">
          {/* ═══ PALETTE TAB ═══ */}
          {activeTab === 'palette' && (
            <div className="space-y-4">
              {Object.entries(TEMPLATES).map(([category, items]) => {
                const Icon = CATEGORY_ICONS[category] || Server
                return (
                  <div key={category}>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                      <Icon className="w-3 h-3" /> {category}
                    </h4>
                    <div className="space-y-1">
                      {items.map(t => (
                        <button key={t.type} onClick={() => addComponent(t)}
                          className="w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-all hover:bg-gray-800/50 border-transparent hover:border-gray-700">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${TYPE_COLORS[t.type]?.replace('border-', 'bg-') || 'bg-gray-500'}`} />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ PROPERTIES TAB ═══ */}
          {activeTab === 'properties' && selectedComponent && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Component Name</label>
                <input value={selectedComponent.name}
                  onChange={e => updateComponent(selectedComponent.id, { name: e.target.value })}
                  className="input-field text-sm font-mono" />
              </div>

              {/* Type + Category */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Type</label>
                  <span className="text-sm text-gray-300">{selectedComponent.type}</span>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Category</label>
                  <span className="text-sm text-gray-300">{selectedComponent.category}</span>
                </div>
              </div>

              {/* ═══ CONFIG SECTION ═══ */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400 font-semibold">Component Config</label>
                  <span className="text-xs text-gray-600">{Object.keys(selectedComponent.config).length} tanim</span>
                </div>
                <p className="text-xs text-gray-600 mb-2">Docker image, port, framework, custom parametreler</p>

                {/* Mevcut config listesi */}
                <div className="space-y-1.5 mb-3">
                  {Object.entries(selectedComponent.config).map(([key, value]) => (
                    <div key={key} className="flex gap-1 items-center bg-gray-800/30 rounded-lg px-2 py-1.5">
                      <span className="text-xs text-cyan-400 font-mono w-24 truncate flex-shrink-0" title={key}>{key}</span>
                      <input value={value} onChange={e => updateConfig(selectedComponent.id, key, e.target.value)}
                        className="input-field text-xs font-mono flex-1 py-1" />
                      <button onClick={() => removeConfigKey(selectedComponent.id, key)}
                        className="text-gray-600 hover:text-red-400 flex-shrink-0 p-0.5" title="Sil">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Yeni config ekleme */}
                <div className="border border-dashed border-gray-700 rounded-lg p-2.5 bg-gray-800/10">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Yeni Config Ekle
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5 items-center">
                      <label className="text-xs text-gray-500 w-12">Key</label>
                      <input value={newCfgKey} onChange={e => setNewCfgKey(e.target.value)}
                        placeholder="ornek: port, topics, maxMemory"
                        className="input-field text-xs font-mono flex-1 py-1" />
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <label className="text-xs text-gray-500 w-12">Value</label>
                      <input value={newCfgValue} onChange={e => setNewCfgValue(e.target.value)}
                        placeholder="ornek: 5432, order-events, 256mb"
                        className="input-field text-xs font-mono flex-1 py-1"
                        onKeyDown={e => { if (e.key === 'Enter') handleAddConfig() }} />
                    </div>
                    <button onClick={handleAddConfig} disabled={!newCfgKey.trim()}
                      className="btn-secondary text-xs w-full flex items-center justify-center gap-1 py-1.5 mt-1">
                      <Plus className="w-3 h-3" /> Config Ekle
                    </button>
                  </div>
                </div>
              </div>

              {/* ═══ CONNECTION BUTTONS ═══ */}
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">Baglanti Kur</label>
                <p className="text-xs text-gray-600 mb-2">Bir tip sec, sonra canvas'ta hedef component'e tikla</p>
                <div className="grid grid-cols-2 gap-1">
                  {CONNECTION_TYPES.map(ct => (
                    <button key={ct.value} onClick={() => startConnect(selectedComponent.id, ct.value)}
                      className={`text-xs px-2 py-1.5 rounded border transition-all ${
                        connectMode?.sourceId === selectedComponent.id && connectMode?.type === ct.value
                          ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: ct.color }} />
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delete */}
              <button onClick={() => removeComponent(selectedComponent.id)}
                className="w-full btn-secondary text-xs text-red-400 hover:text-red-300 flex items-center justify-center gap-1.5 mt-4">
                <Trash2 className="w-3 h-3" /> Component'i Sil
              </button>
            </div>
          )}

          {activeTab === 'properties' && !selectedComponent && (
            <div className="text-center mt-8">
              <Boxes className="w-10 h-10 text-gray-800 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Duzenlemek icin canvas'tan bir component secin</p>
            </div>
          )}

          {/* ═══ CONNECTIONS TAB ═══ */}
          {activeTab === 'connections' && (
            <div className="space-y-2">
              {design.connections.length === 0 ? (
                <div className="text-center mt-4">
                  <p className="text-xs text-gray-500">Henuz baglanti yok</p>
                  <p className="text-xs text-gray-600 mt-1">Component sec → Baglanti tipi sec → Hedef component'e tikla</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-2">{design.connections.length} baglanti</p>
                  {design.connections.map(conn => {
                    const source = design.components.find(c => c.id === conn.sourceId)
                    const target = design.components.find(c => c.id === conn.targetId)
                    if (!source || !target) return null
                    return (
                      <div key={conn.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-800 text-xs">
                        <span className="text-gray-300 truncate flex-1">{source.name.split('.').pop()}</span>
                        <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: CONN_COLORS[conn.type] || '#6b7280' }} />
                        <span className="text-gray-300 truncate flex-1">{target.name.split('.').pop()}</span>
                        <span className="text-gray-600 flex-shrink-0 text-[10px]">{conn.type}</span>
                        <button onClick={() => removeConnection(conn.id)} className="text-gray-600 hover:text-red-400 flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER CANVAS ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-2 flex items-center gap-2 flex-wrap">
          <Boxes className="w-5 h-5 text-purple-400" />
          <span className="text-sm font-bold text-white mr-2">Architecture Designer</span>
          <button onClick={() => setShowMetadata(!showMetadata)} className="btn-secondary text-xs flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> Meta
          </button>
          <div className="flex-1" />
          <button onClick={handleLoad} disabled={busy} className="btn-secondary text-xs flex items-center gap-1">
            <Upload className="w-3 h-3" /> Yukle
          </button>
          <button onClick={handleSave} disabled={busy} className="btn-secondary text-xs flex items-center gap-1">
            {loading === 'save' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Kaydet
          </button>
          <button onClick={handleValidate} disabled={busy} className="btn-secondary text-xs flex items-center gap-1">
            {loading === 'validate' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Dogrula
          </button>
          <button onClick={handleToManifest} disabled={busy} className="btn-primary text-xs flex items-center gap-1">
            {loading === 'manifest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3" />} Manifest
          </button>
          <button onClick={handleToDocker} disabled={busy} className="btn-secondary text-xs flex items-center gap-1">
            {loading === 'docker' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Container className="w-3 h-3" />} Docker
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mx-4 mt-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
            message.type === 'success' ? 'bg-green-950/20 text-green-400' : 'bg-red-950/20 text-red-400'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Metadata Panel */}
        {showMetadata && (
          <div className="mx-4 mt-2 px-4 py-3 rounded-lg border border-gray-800 bg-gray-900/30">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Design Name</label>
                <input value={design.name} onChange={e => setDesign(p => ({ ...p, name: e.target.value }))}
                  placeholder="My Architecture" className="input-field text-xs" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Solution Name</label>
                <input value={design.solutionName} onChange={e => setDesign(p => ({ ...p, solutionName: e.target.value }))}
                  placeholder="MyProject" className="input-field text-xs font-mono" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Output Path</label>
                <input value={design.outputPath} onChange={e => setDesign(p => ({ ...p, outputPath: e.target.value }))}
                  placeholder="C:\source\myproject" className="input-field text-xs font-mono" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Framework</label>
                  <select value={design.framework} onChange={e => setDesign(p => ({ ...p, framework: e.target.value }))} className="input-field text-xs">
                    <option value="dotnet">.NET</option><option value="nextjs">Next.js</option>
                    <option value="nodejs">Node.js</option><option value="python">Python</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Architecture</label>
                  <select value={design.architecture} onChange={e => setDesign(p => ({ ...p, architecture: e.target.value }))} className="input-field text-xs">
                    <option value="clean">Clean</option><option value="hexagonal">Hexagonal</option>
                    <option value="ddd">DDD</option><option value="modular-monolith">Modular Monolith</option>
                    <option value="microservices">Microservices</option><option value="simple">Simple</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 overflow-auto relative bg-gray-950/50 m-2 rounded-xl border border-gray-800"
          style={{ backgroundImage: 'radial-gradient(circle, #1f2937 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onClick={() => { if (!connectMode) setSelectedComponent(null) }}>

          {/* SVG Connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {design.connections.map(conn => {
              const source = design.components.find(c => c.id === conn.sourceId)
              const target = design.components.find(c => c.id === conn.targetId)
              if (!source || !target) return null
              const s = getComponentCenter(source)
              const t = getComponentCenter(target)
              const color = CONN_COLORS[conn.type] || '#6b7280'
              const midX = (s.x + t.x) / 2
              const midY = (s.y + t.y) / 2
              return (
                <g key={conn.id}>
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={color} strokeWidth={2} strokeDasharray={conn.type === 'depends-on' ? '6 3' : ''} />
                  <circle cx={t.x} cy={t.y} r={4} fill={color} />
                  {conn.type !== 'uses' && (
                    <text x={midX} y={midY - 6} textAnchor="middle" fill={color} fontSize={9} fontFamily="monospace">{conn.type}</text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Components */}
          {design.components.map(comp => {
            const isSelected = selectedComponent?.id === comp.id
            const isConnectSource = connectMode?.sourceId === comp.id
            const isConnectTarget = connectMode && connectMode.sourceId !== comp.id
            const catColor = CATEGORY_COLORS[comp.category] || CATEGORY_COLORS.project
            const borderColor = TYPE_COLORS[comp.type] || 'border-gray-600'

            return (
              <div key={comp.id}
                onMouseDown={e => { e.stopPropagation(); handleCanvasMouseDown(e, comp) }}
                onClick={e => e.stopPropagation()}
                className={`absolute rounded-xl border-2 px-3 py-2 cursor-move transition-shadow select-none ${catColor.bg} ${
                  isSelected ? 'ring-2 ring-brand-500 shadow-lg shadow-brand-500/20' :
                  isConnectSource ? 'ring-2 ring-amber-500' :
                  isConnectTarget ? 'ring-1 ring-green-500 ring-dashed cursor-pointer' :
                  ''} ${borderColor}`}
                style={{ left: comp.x, top: comp.y, zIndex: isSelected ? 10 : 2, minWidth: 180 }}>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TYPE_COLORS[comp.type]?.replace('border-', 'bg-') || 'bg-gray-500'}`} />
                  <span className="text-sm font-medium text-white truncate">{comp.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{comp.type}</span>
                  {comp.config.port && <span className="text-xs text-gray-600">:{comp.config.port}</span>}
                  {comp.config.framework && <span className="text-xs text-gray-600">{comp.config.framework}</span>}
                </div>
              </div>
            )
          })}

          {/* Empty state */}
          {design.components.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Boxes className="w-16 h-16 text-gray-800 mx-auto mb-4" />
                <p className="text-gray-600 text-sm">Sol panelden component ekleyerek tasarima baslayin</p>
                <p className="text-gray-700 text-xs mt-1">Component'leri surukleyerek konumlandirin, tiklayin ve baglantilar kurun</p>
              </div>
            </div>
          )}

          {/* Stats badge */}
          {design.components.length > 0 && (
            <div className="absolute bottom-3 right-3 bg-gray-900/80 rounded-lg px-3 py-1.5 text-xs text-gray-500 border border-gray-800" style={{ zIndex: 20 }}>
              {design.components.filter(c => c.category === 'project').length} proje &middot; {design.components.filter(c => c.category === 'infrastructure').length} infra &middot; {design.connections.length} baglanti
            </div>
          )}
        </div>

        {/* Generated Output Panel */}
        {showOutput && (
          <div className="mx-2 mb-2 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden" style={{ maxHeight: 300 }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
              <span className="text-sm font-semibold text-white">
                {showOutput === 'manifest' ? 'Manifest JSON' : 'Docker Compose'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(showOutput === 'manifest' ? generatedManifest : generatedDocker)}
                  className="btn-secondary text-xs flex items-center gap-1"><Copy className="w-3 h-3" /> Kopyala</button>
                <button onClick={() => setShowOutput(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono text-gray-300 overflow-auto" style={{ maxHeight: 240 }}>
              {showOutput === 'manifest' ? generatedManifest : generatedDocker}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}