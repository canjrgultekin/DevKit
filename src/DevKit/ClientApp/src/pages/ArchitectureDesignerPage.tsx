import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Boxes, Save, Upload, Trash2, Plus,
  Loader2, CheckCircle2, XCircle, Settings2, Database, Server,
  MessageSquare, BarChart3, Shield, Container, Cpu,
  FileJson, Layers, ArrowRight, X, Copy,
  PanelLeftClose, PanelLeftOpen, AlertTriangle, Rocket,
} from 'lucide-react'
import OpenInClaude from '../components/OpenInClaude'

const API = '/api/architecturedesigner'

async function archApi<T = Record<string, unknown>>(endpoint: string, method = 'POST', body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${API}/${endpoint}`, opts)
  return await res.json() as T
}

// ═══ TYPES ═══
interface ArchComponent { id: string; name: string; type: string; category: string; config: Record<string, string>; x: number; y: number; w?: number; h?: number }
interface ArchConnection { id: string; sourceId: string; targetId: string; label: string; type: string }
interface ArchDesign { id: string; name: string; description: string; solutionName: string; outputPath: string; framework: string; architecture: string; components: ArchComponent[]; connections: ArchConnection[]; createdAt: string; updatedAt: string }

// ═══ SMART DEFAULT CONFIGS ═══
const SMART_DEFAULTS: Record<string, Record<string, string>> = {
  webapi: { sdk: 'Microsoft.NET.Sdk.Web', framework: 'net9.0', port: '5001', swagger: 'true', healthChecks: 'true' },
  classlib: { sdk: 'Microsoft.NET.Sdk', framework: 'net9.0' },
  worker: { sdk: 'Microsoft.NET.Sdk.Worker', framework: 'net9.0' },
  console: { sdk: 'Microsoft.NET.Sdk', framework: 'net9.0', outputType: 'Exe' },
  test: { sdk: 'Microsoft.NET.Sdk', framework: 'net9.0', testFramework: 'xunit', mocking: 'NSubstitute', assertion: 'FluentAssertions' },
  nextjs: { framework: 'nextjs', version: '15', styling: 'tailwindcss', stateManagement: 'zustand', apiClient: 'tanstack-query', port: '3000' },
  react: { framework: 'react', bundler: 'vite', styling: 'tailwindcss', port: '5173' },
  apigateway: { sdk: 'Microsoft.NET.Sdk.Web', framework: 'net9.0', pattern: 'YARP', port: '5000', rateLimit: 'true' },
  bff: { sdk: 'Microsoft.NET.Sdk.Web', framework: 'net9.0', port: '5002' },
  postgresql: { image: 'postgres:17', port: '5432', database: 'appdb', username: 'postgres', password: 'postgres' },
  mssql: { image: 'mcr.microsoft.com/mssql/server:2022-latest', port: '1433', password: 'YourStr0ngP@ssword!' },
  mongodb: { image: 'mongo:8', port: '27017', username: 'admin', password: 'admin' },
  redis: { image: 'redis:7-alpine', port: '6379', maxMemory: '256mb' },
  couchbase: { image: 'couchbase:latest', port: '8091' },
  kafka: { image: 'confluentinc/cp-kafka:7.7.1', port: '9092', topics: 'events', partitions: '3' },
  rabbitmq: { image: 'rabbitmq:4-management', port: '5672', mgmtPort: '15672', username: 'guest', password: 'guest' },
  servicebus: { type: 'managed', connectionString: '' },
  elasticsearch: { image: 'docker.elastic.co/elasticsearch/elasticsearch:8.17.0', port: '9200', javaOpts: '-Xms512m -Xmx512m' },
  kibana: { image: 'docker.elastic.co/kibana/kibana:8.17.0', port: '5601' },
  logstash: { image: 'docker.elastic.co/logstash/logstash:8.17.0', port: '5044' },
  jaeger: { image: 'jaegertracing/all-in-one:1.64', port: '16686' },
  zipkin: { image: 'openzipkin/zipkin:3', port: '9411' },
  grafana: { image: 'grafana/grafana:11.4.0', port: '3000', adminPassword: 'admin' },
  otelcollector: { image: 'otel/opentelemetry-collector-contrib:0.115.1', port: '4317', protocol: 'grpc' },
  prometheus: { image: 'prom/prometheus:v2.54.0', port: '9090' },
  jenkins: { image: 'jenkins/jenkins:lts', port: '8080' },
  nginx: { image: 'nginx:alpine', port: '80' },
}
const HIDDEN_CONFIG_KEYS = new Set(['hosting', 'sdk', 'outputType', 'layer', 'pattern'])
const TYPE_ICONS: Record<string, string> = {
  webapi: '🌐', classlib: '📦', worker: '⚙️', console: '💻', test: '🧪',
  nextjs: '▲', react: '⚛️',
  postgresql: '🐘', mssql: '🗄️', mongodb: '🍃', redis: '⚡', couchbase: '🔴',
  kafka: '📨', rabbitmq: '🐇', servicebus: '☁️',
  elasticsearch: '🔍', kibana: '📊', logstash: '📥', jaeger: '🔭', zipkin: '📡',
  grafana: '📈', otelcollector: '📡', prometheus: '🔥',
  jenkins: '🔨', apigateway: '🚪', bff: '🖥️', nginx: '🔷',
}

const TYPE_SHAPES: Record<string, string> = {
  postgresql: 'rounded-t-xl rounded-b-3xl', mssql: 'rounded-t-xl rounded-b-3xl',
  mongodb: 'rounded-t-xl rounded-b-3xl', redis: 'rounded-t-xl rounded-b-3xl',
  couchbase: 'rounded-t-xl rounded-b-3xl',
  kafka: 'rounded-2xl', rabbitmq: 'rounded-2xl', servicebus: 'rounded-2xl',
  elasticsearch: 'rounded-lg', kibana: 'rounded-lg', logstash: 'rounded-lg',
  jaeger: 'rounded-lg', zipkin: 'rounded-lg', grafana: 'rounded-lg',
  otelcollector: 'rounded-lg', prometheus: 'rounded-lg',
  jenkins: 'rounded-lg',
  apigateway: 'rounded-xl border-dashed', bff: 'rounded-xl border-dashed',
  nginx: 'rounded-xl',
  webapi: 'rounded-xl', classlib: 'rounded-md', worker: 'rounded-xl',
  console: 'rounded-md', test: 'rounded-md border-dashed',
  nextjs: 'rounded-xl', react: 'rounded-xl',
}
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

const TEMPLATES: Record<string, Array<{ type: string; label: string; category: string }>> = {
  project: [
    { type: 'webapi', label: 'Web API', category: 'project' },
    { type: 'classlib', label: 'Class Library', category: 'project' },
    { type: 'worker', label: 'Worker Service', category: 'project' },
    { type: 'console', label: 'Console App', category: 'project' },
    { type: 'test', label: 'Test Project', category: 'project' },
    { type: 'nextjs', label: 'Next.js App', category: 'project' },
    { type: 'react', label: 'React App', category: 'project' },
  ],
  database: [
    { type: 'postgresql', label: 'PostgreSQL', category: 'infrastructure' },
    { type: 'mssql', label: 'SQL Server', category: 'infrastructure' },
    { type: 'mongodb', label: 'MongoDB', category: 'infrastructure' },
    { type: 'redis', label: 'Redis', category: 'infrastructure' },
    { type: 'couchbase', label: 'Couchbase', category: 'infrastructure' },
  ],
  messaging: [
    { type: 'kafka', label: 'Apache Kafka', category: 'infrastructure' },
    { type: 'rabbitmq', label: 'RabbitMQ', category: 'infrastructure' },
    { type: 'servicebus', label: 'Azure Service Bus', category: 'cloud' },
  ],
  observability: [
    { type: 'elasticsearch', label: 'Elasticsearch', category: 'infrastructure' },
    { type: 'kibana', label: 'Kibana', category: 'infrastructure' },
    { type: 'logstash', label: 'Logstash', category: 'infrastructure' },
    { type: 'jaeger', label: 'Jaeger', category: 'infrastructure' },
    { type: 'zipkin', label: 'Zipkin', category: 'infrastructure' },
    { type: 'grafana', label: 'Grafana', category: 'infrastructure' },
    { type: 'otelcollector', label: 'OTel Collector', category: 'infrastructure' },
    { type: 'prometheus', label: 'Prometheus', category: 'infrastructure' },
  ],
  gateway: [
    { type: 'apigateway', label: 'API Gateway', category: 'project' },
    { type: 'bff', label: 'BFF', category: 'project' },
    { type: 'nginx', label: 'Nginx', category: 'infrastructure' },
  ],
  cicd: [
    { type: 'jenkins', label: 'Jenkins', category: 'infrastructure' },
  ],
}

const CONNECTION_TYPES = [
  { value: 'references', label: 'Project Reference', color: '#3b82f6', desc: 'Proje arasi csproj referansi' },
  { value: 'uses', label: 'Uses (DB/Cache)', color: '#10b981', desc: 'DB, cache, observability kullanimi' },
  { value: 'publishes-to', label: 'Publishes To', color: '#f59e0b', desc: 'Mesaj/event yayinlama' },
  { value: 'consumes-from', label: 'Consumes From', color: '#8b5cf6', desc: 'Mesaj/event tuketme' },
  { value: 'depends-on', label: 'Depends On', color: '#6b7280', desc: 'Baslama sirasi bagimliligi' },
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
  const [connectCount, setConnectCount] = useState(0)
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [validated, setValidated] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Array<{ component?: string; field: string; message: string }>>([])
  const canvasRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null)
  // Design degisince validation resetle
  useEffect(() => { setValidated(false); setValidationErrors([]) }, [design])

  // ESC ile connect mode iptal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectMode) {
        setConnectMode(null)
        setMessage({ type: 'success', text: `${connectCount} baglanti eklendi.` })
        setConnectCount(0)
        setTimeout(() => setMessage(null), 2000)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [connectMode, connectCount])

  // ═══ COMPONENT MANAGEMENT ═══
  const addComponent = (template: { type: string; label: string; category: string }) => {
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
      config: { ...(SMART_DEFAULTS[template.type] || {}) },
      x: 50 + Math.floor(Math.random() * 400), y: 50 + Math.floor(Math.random() * 300),
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
  const getComponentLang = (comp: ArchComponent): string => {
    if (comp.type === 'nextjs' || comp.type === 'react') return 'js'
    if (comp.type === 'console' || comp.type === 'webapi' || comp.type === 'classlib' || comp.type === 'worker' || comp.type === 'test' || comp.type === 'apigateway' || comp.type === 'bff') return 'dotnet'
    return 'infra'
  }
  // ═══ CONNECTION MANAGEMENT (MULTI-TARGET) ═══
  const startConnect = (sourceId: string, type: string) => {
    setConnectMode({ sourceId, type })
    setConnectCount(0)
    setMessage({ type: 'success', text: 'Hedeflere tiklayarak baglanti kurun. Bitince ESC basin.' })
  }

  const finishConnect = (targetId: string) => {
    if (!connectMode || connectMode.sourceId === targetId) return

    const source = design.components.find(c => c.id === connectMode.sourceId)
    const target = design.components.find(c => c.id === targetId)
    if (!source || !target) return

    const type = connectMode.type
    const srcLang = getComponentLang(source)
    const tgtLang = getComponentLang(target)

    if (type === 'references') {
      if (target.category !== 'project') {
        setMessage({ type: 'error', text: 'Project Reference sadece projeler arasi kurulabilir.' }); return
      }
      if (srcLang !== tgtLang) {
        setMessage({ type: 'error', text: `Farkli diller arasi referans kurulamaz (${srcLang} → ${tgtLang}). API baglantisi icin "Uses" kullanin.` }); return
      }
    }
    if (type === 'uses' && target.category === 'project') {
      setMessage({ type: 'error', text: 'Uses baglantisi DB/Cache/Observability icin. Projeler arasi "Project Reference" kullanin.' }); return
    }
    if ((type === 'publishes-to' || type === 'consumes-from') &&
        target.type !== 'kafka' && target.type !== 'rabbitmq' && target.type !== 'servicebus') {
      setMessage({ type: 'error', text: 'Pub/Sub sadece messaging componentlere kurulabilir (Kafka, RabbitMQ, Service Bus).' }); return
    }

    const exists = design.connections.some(c =>
      c.sourceId === connectMode.sourceId && c.targetId === targetId && c.type === type
    )
    if (exists) {
      setMessage({ type: 'error', text: 'Bu baglanti zaten mevcut. Baska sec veya ESC bas.' }); return
    }

    const conn: ArchConnection = { id: generateId(), sourceId: connectMode.sourceId, targetId, label: '', type }
    setDesign(prev => ({ ...prev, connections: [...prev.connections, conn] }))
    setConnectCount(prev => prev + 1)
    autoConfigFromConnection(source, target, type)
    setMessage({ type: 'success', text: `${connectCount + 1} baglanti eklendi. Devam edin veya ESC.` })
  }

  const autoConfigFromConnection = (source: ArchComponent, target: ArchComponent, connType: string) => {
    const lang = getComponentLang(source)

    if (connType === 'uses') {
      if (lang === 'dotnet') {
        const cfgMap: Record<string, Record<string, string>> = {
          postgresql: { dbProvider: 'Npgsql', connectionString: `Host=localhost;Port=${target.config.port || '5432'};Database=${target.config.database || 'appdb'};Username=${target.config.username || 'postgres'};Password=${target.config.password || 'postgres'}` },
          mssql: { dbProvider: 'SqlServer', connectionString: `Server=localhost,${target.config.port || '1433'};Database=appdb;User Id=sa;Password=${target.config.password || 'YourStr0ngP@ssword!'};TrustServerCertificate=true` },
          mongodb: { mongoUrl: `mongodb://${target.config.username || 'admin'}:${target.config.password || 'admin'}@localhost:${target.config.port || '27017'}` },
          redis: { redisConnection: `localhost:${target.config.port || '6379'}` },
          elasticsearch: { elasticUrl: `http://localhost:${target.config.port || '9200'}` },
          otelcollector: { otelEndpoint: `http://localhost:${target.config.port || '4317'}` },
          jaeger: { jaegerEndpoint: `http://localhost:${target.config.port || '16686'}` },
          grafana: { grafanaUrl: `http://localhost:${target.config.port || '3000'}` },
        }
        const autoConfig = cfgMap[target.type]
        if (autoConfig) {
          Object.entries(autoConfig).forEach(([k, v]) => {
            if (!source.config[k]) updateConfig(source.id, k, v)
          })
        }
      }

      if (lang === 'js') {
        const cfgMap: Record<string, Record<string, string>> = {
          postgresql: { dbPackage: 'pg', dbUrl: `postgresql://${target.config.username || 'postgres'}:${target.config.password || 'postgres'}@localhost:${target.config.port || '5432'}/${target.config.database || 'appdb'}` },
          mongodb: { dbPackage: 'mongoose', mongoUrl: `mongodb://${target.config.username || 'admin'}:${target.config.password || 'admin'}@localhost:${target.config.port || '27017'}` },
          redis: { cachePackage: 'ioredis', redisUrl: `redis://localhost:${target.config.port || '6379'}` },
          elasticsearch: { searchPackage: '@elastic/elasticsearch', elasticUrl: `http://localhost:${target.config.port || '9200'}` },
        }
        const autoConfig = cfgMap[target.type]
        if (autoConfig) {
          Object.entries(autoConfig).forEach(([k, v]) => {
            if (!source.config[k]) updateConfig(source.id, k, v)
          })
        }
      }
    }

    if (connType === 'publishes-to' || connType === 'consumes-from') {
      const role = connType === 'publishes-to' ? 'producer' : 'consumer'

      if (lang === 'dotnet') {
        if (target.type === 'kafka' && !source.config.kafkaBroker) {
          updateConfig(source.id, 'kafkaBroker', `localhost:${target.config.port || '9092'}`)
          updateConfig(source.id, 'kafkaRole', role)
          if (target.config.topics && !source.config.kafkaTopics) updateConfig(source.id, 'kafkaTopics', target.config.topics)
        }
        if (target.type === 'rabbitmq' && !source.config.rabbitHost) {
          updateConfig(source.id, 'rabbitHost', 'localhost')
          updateConfig(source.id, 'rabbitPort', target.config.port || '5672')
          updateConfig(source.id, 'rabbitRole', role)
        }
        if (target.type === 'servicebus' && !source.config.serviceBusConnection) {
          updateConfig(source.id, 'serviceBusConnection', target.config.connectionString || '')
        }
      }

      if (lang === 'js') {
        if (target.type === 'kafka' && !source.config.kafkaPackage) {
          updateConfig(source.id, 'kafkaPackage', 'kafkajs')
          updateConfig(source.id, 'kafkaBroker', `localhost:${target.config.port || '9092'}`)
          updateConfig(source.id, 'kafkaRole', role)
          if (target.config.topics && !source.config.kafkaTopics) updateConfig(source.id, 'kafkaTopics', target.config.topics)
        }
        if (target.type === 'rabbitmq' && !source.config.rabbitPackage) {
          updateConfig(source.id, 'rabbitPackage', 'amqplib')
          updateConfig(source.id, 'rabbitUrl', `amqp://guest:guest@localhost:${target.config.port || '5672'}`)
          updateConfig(source.id, 'rabbitRole', role)
        }
      }
    }
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
  const handleResizeStart = (e: React.MouseEvent, comp: ArchComponent) => {
    e.stopPropagation()
    e.preventDefault()
    setResizing({ id: comp.id, startX: e.clientX, startY: e.clientY, startW: comp.w || 180, startH: comp.h || 52 })
  }

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizing) return
    const newW = Math.max(140, resizing.startW + (e.clientX - resizing.startX))
    const newH = Math.max(40, resizing.startH + (e.clientY - resizing.startY))
    setDesign(prev => ({
      ...prev,
      components: prev.components.map(c => c.id === resizing.id ? { ...c, w: newW, h: newH } : c),
    }))
  }, [resizing])

  const handleResizeEnd = useCallback(() => { setResizing(null) }, [])

  useEffect(() => {
    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => { window.removeEventListener('mousemove', handleResizeMove); window.removeEventListener('mouseup', handleResizeEnd) }
    }
  }, [resizing, handleResizeMove, handleResizeEnd])
  useEffect(() => {
    if (dragOffset) {
      window.addEventListener('mousemove', handleCanvasMouseMove)
      window.addEventListener('mouseup', handleCanvasMouseUp)
      return () => { window.removeEventListener('mousemove', handleCanvasMouseMove); window.removeEventListener('mouseup', handleCanvasMouseUp) }
    }
  }, [dragOffset, handleCanvasMouseMove, handleCanvasMouseUp])

  // ═══ VALIDATION (DETAYLI) ═══
  const handleValidate = () => {
    const errs: Array<{ component?: string; field: string; message: string }> = []

    if (!design.solutionName.trim())
      errs.push({ field: 'solutionName', message: 'Solution Name bos. Meta panelinden girin.' })
    if (!design.outputPath.trim())
      errs.push({ field: 'outputPath', message: 'Output Path bos. Meta panelinden girin.' })
    if (design.components.length === 0)
      errs.push({ field: 'components', message: 'En az bir component ekleyin.' })

    const projects = design.components.filter(c => c.category === 'project')
    if (projects.length === 0 && design.components.length > 0)
      errs.push({ field: 'components', message: 'En az bir proje (Web API, Class Library vb.) ekleyin.' })

    // Duplicate isim kontrolu
    const names = design.components.map(c => c.name)
    names.filter((n, i) => names.indexOf(n) !== i).forEach(d =>
      errs.push({ component: d, field: 'name', message: `"${d}" ismi birden fazla component'te var.` })
    )

    // Baglanti dogrulama
    const ids = new Set(design.components.map(c => c.id))
    design.connections.forEach(conn => {
      if (!ids.has(conn.sourceId))
        errs.push({ field: 'connection', message: 'Baglanti kaynak component bulunamadi.' })
      if (!ids.has(conn.targetId))
        errs.push({ field: 'connection', message: 'Baglanti hedef component bulunamadi.' })
    })

    // Port cakismasi
    const ports = design.components.filter(c => c.config.port).map(c => ({ n: c.name, p: c.config.port }))
    const portMap = new Map<string, string[]>()
    ports.forEach(p => portMap.set(p.p, [...(portMap.get(p.p) || []), p.n]))
    portMap.forEach((ns, p) => {
      if (ns.length > 1) errs.push({ field: 'port', message: `Port ${p} cakismasi: ${ns.join(', ')}` })
    })

    setValidationErrors(errs)
    setValidated(errs.length === 0)
    setMessage(errs.length === 0
      ? { type: 'success', text: 'Tasarim gecerli! Manifest veya Docker olusturabilirsiniz.' }
      : { type: 'error', text: `${errs.length} hata bulundu.` }
    )
  }

  // ═══ MANIFEST + DIRECT SCAFFOLD ═══
  const handleToManifest = async () => {
    if (!validated) { setMessage({ type: 'error', text: 'Once "1. Dogrula" butonuna basin.' }); return }
    setLoading('manifest')
    try {
      const res = await archApi<{ success: boolean; manifest: string; errors?: string[] }>('to-manifest', 'POST', { design })
      if (res.success) { setGeneratedManifest(res.manifest); setShowOutput('manifest') }
      else setMessage({ type: 'error', text: res.errors?.join(', ') || 'Manifest olusturulamadi.' })
    } catch { setMessage({ type: 'error', text: 'Hata.' }) }
    finally { setLoading('') }
  }

  const handleScaffold = async () => {
    if (!generatedManifest) return
    setLoading('scaffold')
    try {
      const el = document.getElementById('output-editor') as HTMLTextAreaElement
      const parsed = JSON.parse(el ? el.value : generatedManifest)

      const allProjects = [...(parsed.projects || []), ...(parsed.frontends || [])]
      const dotnetProjects = allProjects.filter((p: Record<string, string>) => !['nextjs', 'react', 'nodejs', 'python'].includes(p.type))
      const nextjsProjects = allProjects.filter((p: Record<string, string>) => p.type === 'nextjs' || p.type === 'react')
      const nodeProjects = allProjects.filter((p: Record<string, string>) => p.type === 'nodejs')

      const results: string[] = []
      const doScaffold = async (projects: unknown[], framework: string) => {
        if (!projects || projects.length === 0) return
        const res = await fetch('/api/scaffolding', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifest: { ...parsed, framework, projects, frontends: undefined }, mode: 'create' }),
        }).then(r => r.json()) as { success?: boolean; message?: string; error?: string }
        results.push(`${framework}: ${res.success ? 'OK' : res.error || 'Hata'}`)
      }

      if (dotnetProjects.length > 0) await doScaffold(dotnetProjects, 'dotnet')
      if (nextjsProjects.length > 0) await doScaffold(nextjsProjects, 'nextjs')
      if (nodeProjects.length > 0) await doScaffold(nodeProjects, 'nodejs')

      try {
        const profileKey = design.name || design.solutionName || 'MyProject'
        const profileWorkspace = design.outputPath.endsWith(design.solutionName)
          ? design.outputPath : `${design.outputPath}\\${design.solutionName}`
        await fetch(`/api/profile/${encodeURIComponent(profileKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: design.solutionName, workspace: profileWorkspace }),
        })
        await fetch(`/api/profile/active/${encodeURIComponent(profileKey)}`, { method: 'PUT' })
        results.push('Profil aktif')
      } catch { results.push('Profil olusturulamadi') }

      setMessage({ type: 'success', text: results.join(' | ') })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Scaffold hatasi' }) }
    finally { setLoading('') }
  }
  // ═══ DOCKER ═══
  const handleToDocker = async () => {
    if (!validated) { setMessage({ type: 'error', text: 'Once "1. Dogrula" butonuna basin.' }); return }
    setLoading('docker')
    try {
      const res = await archApi<{ success: boolean; dockerCompose: string }>('to-docker', 'POST', { design })
      if (res.success) { setGeneratedDocker(res.dockerCompose); setShowOutput('docker') }
      else setMessage({ type: 'error', text: 'Docker compose olusturulamadi.' })
    } catch { setMessage({ type: 'error', text: 'Hata.' }) }
    finally { setLoading('') }
  }

  // ═══ SAVE / LOAD ═══
  const handleSave = async () => {
    if (!design.outputPath) { setMessage({ type: 'error', text: 'Output path gerekli. Meta panelinden girin.' }); return }
    setLoading('save')
    try {
      const filePath = `${design.outputPath}\\${design.solutionName || 'architecture'}.design.json`
      const res = await archApi<{ success: boolean; message: string }>('save', 'POST', { design, filePath })
      setMessage({ type: res.success ? 'success' : 'error', text: res.message })
    } catch { setMessage({ type: 'error', text: 'Kaydetme hatasi.' }) }
    finally { setLoading('') }
  }

  const handleLoad = async () => {
    // Dosya secici dialog ac
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setLoading('load')
      try {
        const text = await file.text()
        const loaded = JSON.parse(text) as ArchDesign
        setDesign(loaded)
        setSelectedComponent(null)
        setMessage({ type: 'success', text: `"${loaded.name || file.name}" yuklendi.` })
      } catch { setMessage({ type: 'error', text: 'Gecersiz JSON dosyasi.' }) }
      finally { setLoading('') }
    }
    input.click()
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)
  const getComponentCenter = (comp: ArchComponent) => ({ x: comp.x + (comp.w || 180) / 2, y: comp.y + (comp.h || 52) / 2 })
  const busy = loading !== ''

  function buildArchContext(): string {
    const parts: string[] = []
    parts.push('MIMARI TASARIM')
    parts.push(`Solution: ${design.solutionName}`)
    parts.push(`Framework: ${design.framework} | Architecture: ${design.architecture}`)
    parts.push(`Output: ${design.outputPath}`)
    parts.push('')

    const projects = design.components.filter(c => c.category === 'project')
    const infra = design.components.filter(c => c.category !== 'project')

    if (projects.length > 0) {
      parts.push(`PROJELER (${projects.length}):`)
      projects.forEach(p => {
        parts.push(`  ${p.name} (${p.type}) port:${p.config.port || '-'}`)
        const conns = design.connections.filter(c => c.sourceId === p.id)
        if (conns.length > 0) {
          conns.forEach(c => {
            const target = design.components.find(t => t.id === c.targetId)
            if (target) parts.push(`    → ${c.type}: ${target.name}`)
          })
        }
      })
      parts.push('')
    }

    if (infra.length > 0) {
      parts.push(`ALTYAPI (${infra.length}):`)
      infra.forEach(i => {
        const hosting = i.config.hosting === 'existing' ? 'mevcut' : 'docker'
        parts.push(`  ${i.name} (${i.type}) [${hosting}] port:${i.config.port || '-'}`)
      })
      parts.push('')
    }

    if (generatedManifest) {
      parts.push('SCAFFOLD MANIFEST:')
      parts.push(generatedManifest)
    }

    return parts.join('\n')
  }

  return (
    <div className="flex h-full">
      {/* ═══ LEFT SIDEBAR (collapsible) ═══ */}
      {sidebarOpen && (
        <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
          {/* Tabs */}
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
    <span className="text-xs text-gray-600">
      {Object.keys(selectedComponent.config).filter(k => !HIDDEN_CONFIG_KEYS.has(k)).length} tanim
    </span>
  </div>

  {/* Infra: Docker vs Existing toggle */}
  {(selectedComponent.category === 'infrastructure' || selectedComponent.category === 'cloud') && (
    <div className="flex gap-1 mb-3">
      <button onClick={() => {
        if (selectedComponent.config.hosting === 'existing') {
          const defaults = SMART_DEFAULTS[selectedComponent.type] || {}
          updateConfig(selectedComponent.id, 'hosting', 'docker')
          if (defaults.image && !selectedComponent.config.image) updateConfig(selectedComponent.id, 'image', defaults.image)
        } else {
          updateConfig(selectedComponent.id, 'hosting', 'docker')
        }
      }} className={`flex-1 text-xs py-1.5 rounded border transition-all ${
        selectedComponent.config.hosting !== 'existing'
          ? 'border-brand-500 bg-brand-600/20 text-brand-400'
          : 'border-gray-700 text-gray-500 hover:border-gray-600'
      }`}>
        <Container className="w-3 h-3 inline mr-1" /> Docker
      </button>
      <button onClick={() => {
        updateConfig(selectedComponent.id, 'hosting', 'existing')
        removeConfigKey(selectedComponent.id, 'image')
        if (!selectedComponent.config.host) updateConfig(selectedComponent.id, 'host', 'localhost')
        if (!selectedComponent.config.port) {
          const defaults = SMART_DEFAULTS[selectedComponent.type] || {}
          updateConfig(selectedComponent.id, 'port', defaults.port || '')
        }
      }} className={`flex-1 text-xs py-1.5 rounded border transition-all ${
        selectedComponent.config.hosting === 'existing'
          ? 'border-emerald-500 bg-emerald-600/20 text-emerald-400'
          : 'border-gray-700 text-gray-500 hover:border-gray-600'
      }`}>
        <Server className="w-3 h-3 inline mr-1" /> Mevcut Servis
      </button>
    </div>
  )}

  <p className="text-xs text-gray-600 mb-2">
    {selectedComponent.config.hosting === 'existing'
      ? 'Mevcut servis baglanti bilgileri (host, port, connectionString)'
      : 'Docker image, port, framework, custom parametreler'}
  </p>

  {/* Mevcut config listesi (hidden keyler filtrelenmis) */}
  <div className="space-y-1.5 mb-3">
    {Object.entries(selectedComponent.config)
      .filter(([key]) => !HIDDEN_CONFIG_KEYS.has(key))
      .map(([key, value]) => (
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

{/* ═══ CONNECTION BUTTONS (smart filtered) ═══ */}
<div>
  <label className="block text-xs text-gray-400 font-semibold mb-1">Baglanti Kur</label>
  <p className="text-xs text-gray-600 mb-2">Tip sec → hedeflere tikla → ESC ile bitir</p>
  <div className="grid grid-cols-2 gap-1">
    {CONNECTION_TYPES
      .filter(ct => {
        const cat = selectedComponent.category
        if (ct.value === 'references') return cat === 'project'
        if (ct.value === 'uses') return cat === 'project'
        if (ct.value === 'publishes-to') return cat === 'project'
        if (ct.value === 'consumes-from') return cat === 'project'
        if (ct.value === 'depends-on') return true
        return true
      })
      .map(ct => {
        const validTargets = design.components.filter(c => {
          if (c.id === selectedComponent.id) return false
          if (ct.value === 'references') return c.category === 'project' && getComponentLang(c) === getComponentLang(selectedComponent)
          if (ct.value === 'uses') return c.category === 'infrastructure' || c.category === 'cloud'
          if (ct.value === 'publishes-to') return c.type === 'kafka' || c.type === 'rabbitmq' || c.type === 'servicebus'
          if (ct.value === 'consumes-from') return c.type === 'kafka' || c.type === 'rabbitmq' || c.type === 'servicebus'
          if (ct.value === 'depends-on') return true
          return true
        })
        if (validTargets.length === 0) return null
        return (
          <button key={ct.value} onClick={() => startConnect(selectedComponent.id, ct.value)}
            title={`${ct.desc} (${validTargets.length} hedef)`}
            className={`text-xs px-2 py-1.5 rounded border transition-all ${
              connectMode?.sourceId === selectedComponent.id && connectMode?.type === ct.value
                ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: ct.color }} />
            {ct.label}
            <span className="text-gray-600 ml-1">({validTargets.length})</span>
          </button>
        )
      })}
  </div>
  {connectMode && (
    <button onClick={() => { setConnectMode(null); setMessage(null); setConnectCount(0) }}
      className="w-full mt-2 btn-secondary text-xs text-amber-400">
      Baglanti modunu kapat ({connectCount} eklendi)
    </button>
  )}
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
      )}

      {/* ═══ CENTER: Canvas ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-2 flex items-center gap-2 flex-wrap">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-300 mr-1">
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
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
{design.components.length > 0 && (
  <OpenInClaude
    contextData={buildArchContext()}
    contextType="architecture-design"
    clipboardPrompt={`Bu mimari tasarimi incele: ${design.solutionName}. Projeleri, baglantilari ve altyapiyi anla. Scaffold edilmisse projeye kodlama yapmaya hazirlan, DEVKIT_PATH marker'lari kullan.`}
  />
)}
<span className="text-gray-700">|</span>          <button onClick={handleValidate} disabled={busy} className="btn-secondary text-xs flex items-center gap-1">
            {loading === 'validate' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            1. Dogrula
          </button>
          <button onClick={handleToManifest} disabled={busy || !validated}
            className={`text-xs flex items-center gap-1 ${validated ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}>
            {loading === 'manifest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3" />}
            2. Manifest
          </button>
          <button onClick={handleToDocker} disabled={busy || !validated}
            className={`text-xs flex items-center gap-1 ${validated ? 'btn-secondary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}>
            {loading === 'docker' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Container className="w-3 h-3" />}
            3. Docker
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

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-950/10 border border-red-900/30 max-h-32 overflow-auto">
            {validationErrors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5 text-xs">
                <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-red-300">
                  {err.component && <span className="text-red-400 font-mono">[{err.component}] </span>}
                  {err.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Metadata Panel (collapsible) */}
        {showMetadata && (
          <div className="mx-4 mt-2 px-4 py-3 rounded-lg border border-gray-800 bg-gray-900/30">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Design Name</label>
                <input value={design.name} onChange={e => setDesign(p => ({ ...p, name: e.target.value }))}
                  placeholder="My Architecture" className="input-field text-xs" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Solution Name *</label>
                <div className="flex gap-1">
                  <input value={design.solutionName} onChange={e => setDesign(p => ({ ...p, solutionName: e.target.value }))}
                    placeholder="MyProject" className="input-field text-xs font-mono flex-1" />
                  <button onClick={() => {
                    if (!design.solutionName.trim()) return
                    const newName = design.solutionName
                    setDesign(prev => ({
                      ...prev, outputPath: '',
                      components: prev.components.map(c => {
                        if (c.category !== 'project') return c
                        const parts = c.name.split('.')
                        if (parts.length >= 2) { parts[0] = newName; return { ...c, name: parts.join('.') } }
                        return c
                      }),
                    }))
                    setSelectedComponent(null)
                    setMessage({ type: 'success', text: `Isimler "${newName}" ile guncellendi. Output Path yeniden girin.` })
                  }} className="btn-secondary text-xs px-2" title="Component isimlerini guncelle">↻</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Output Path *</label>
                <div className="flex gap-1">
                  <input value={design.outputPath} onChange={e => setDesign(p => ({ ...p, outputPath: e.target.value }))}
                    placeholder="C:\source\myproject" className="input-field text-xs font-mono flex-1" />
                  <button onClick={async () => {
                    try {
                      const res = await fetch('/api/system/browse-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
                      const data = await res.json() as { path?: string }
                      if (data.path) setDesign(p => ({ ...p, outputPath: data.path as string }))
                    } catch { /* fallback: manuel input */ }
                  }} className="btn-secondary text-xs px-2" title="Klasor sec">...</button>
                </div>
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
            <p className="text-xs text-gray-500 mt-2 px-1 italic">
              {{
                clean: 'Katmanli yapi: Domain → Application → Infrastructure → API. Bagimlilik ici disari.',
                hexagonal: 'Port & Adapter: Domain merkezde, disariya adapter\'lar ile baglanir.',
                ddd: 'Domain-Driven Design: Bounded Context, Aggregate, Value Object, Domain Event.',
                'modular-monolith': 'Tek deploy, modul bazli ayrim. Her modul kendi domain\'ini yonetir.',
                microservices: 'Bagimsiz deploy edilebilir servisler. Her servis kendi DB\'sine sahip.',
                simple: 'Tek proje, katmansiz. Kucuk projeler ve PoC icin.',
              }[design.architecture] || ''}
            </p>
          </div>
        )}
        {/* Canvas */}
        <div ref={canvasRef} className="flex-1 overflow-auto relative bg-gray-950/50 m-2 rounded-xl border border-gray-800"
          style={{ backgroundImage: 'radial-gradient(circle, #1f2937 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onClick={() => { if (!connectMode) setSelectedComponent(null) }}>

          {/* SVG Connections with Arrow Markers */}
<svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
<defs>
  {CONNECTION_TYPES.map(ct => (
    <marker key={ct.value} id={`arrow-${ct.value}`} viewBox="0 0 10 10" refX="10" refY="5"
      markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={ct.color} />
    </marker>
  ))}
</defs>
{design.connections.map(conn => {
  const source = design.components.find(c => c.id === conn.sourceId)
  const target = design.components.find(c => c.id === conn.targetId)
  if (!source || !target) return null
  const s = getComponentCenter(source)
  const t = getComponentCenter(target)
  const color = CONN_COLORS[conn.type] || '#6b7280'

  // Bezier control points
  const dx = t.x - s.x
  const dy = t.y - s.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.min(dist * 0.3, 80)
  const midX = (s.x + t.x) / 2
  const midY = (s.y + t.y) / 2
  // Perpendicular offset for curve
  const nx = -dy / (dist || 1) * curvature * 0.3
  const ny = dx / (dist || 1) * curvature * 0.3
  const cx1 = midX + nx
  const cy1 = midY + ny

  const pathD = dist < 50
    ? `M ${s.x} ${s.y} L ${t.x} ${t.y}`
    : `M ${s.x} ${s.y} Q ${cx1} ${cy1} ${t.x} ${t.y}`

  return (
    <g key={conn.id}>
      <path d={pathD} stroke={color} strokeWidth={2} fill="none"
        strokeDasharray={conn.type === 'depends-on' ? '6 3' : ''}
        markerEnd={`url(#arrow-${conn.type})`} />
      {conn.type !== 'uses' && (
        <text x={cx1 || midX} y={(cy1 || midY) - 8} textAnchor="middle" fill={color} fontSize={9} fontFamily="monospace">{conn.type}</text>
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
  const shape = TYPE_SHAPES[comp.type] || 'rounded-xl'
  const icon = TYPE_ICONS[comp.type] || '📄'
  const compW = comp.w || 180
  const compH = comp.h || 52

  return (
    <div key={comp.id}
      onMouseDown={e => { e.stopPropagation(); handleCanvasMouseDown(e, comp) }}
      onClick={e => e.stopPropagation()}
      className={`absolute border-2 px-3 py-2 cursor-move transition-shadow select-none ${shape} ${catColor.bg} ${
        isSelected ? 'ring-2 ring-brand-500 shadow-lg shadow-brand-500/20' :
        isConnectSource ? 'ring-2 ring-amber-500 shadow-lg shadow-amber-500/20' :
        isConnectTarget ? 'ring-2 ring-green-500 ring-dashed cursor-pointer' :
        ''} ${borderColor}`}
      style={{ left: comp.x, top: comp.y, width: compW, minHeight: compH, zIndex: isSelected ? 10 : 2 }}>
      <div className="flex items-center gap-2">
        <span className="text-base flex-shrink-0">{icon}</span>
        <span className="text-sm font-medium text-white truncate">{comp.name}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-500">{comp.type}</span>
        {comp.config.port && <span className="text-xs text-gray-600">:{comp.config.port}</span>}
        {comp.config.hosting === 'existing' && <span className="text-xs text-emerald-600">mevcut</span>}
      </div>
      {/* Resize handle */}
      {isSelected && (
        <div onMouseDown={e => handleResizeStart(e, comp)}
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-brand-500/60 rounded-tl-md"
          style={{ zIndex: 11 }} />
      )}
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
              {design.components.filter(c => c.category === 'project').length} proje &middot;{' '}
              {design.components.filter(c => c.category === 'infrastructure' || c.category === 'cloud').length} infra &middot;{' '}
              {design.connections.length} baglanti
              {validated && <span className="text-green-400 ml-2">✓ gecerli</span>}
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
        {showOutput === 'manifest' && (
          <button onClick={handleScaffold} disabled={busy}
            className="btn-primary text-xs flex items-center gap-1">
            {loading === 'scaffold' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
            Scaffold Et
          </button>
        )}
        {showOutput === 'docker' && (
          <button onClick={async () => {
            if (!design.outputPath) { setMessage({ type: 'error', text: 'Output path gerekli.' }); return }
            setLoading('save-docker')
            try {
              const el = document.getElementById('output-editor') as HTMLTextAreaElement
              const content = (el && el.value.trim()) ? el.value : generatedDocker
              const outputPath = design.outputPath.endsWith(design.solutionName)
                ? design.outputPath
                : `${design.outputPath}\\${design.solutionName}`
              const res = await fetch('/api/docker/save', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outputPath, content }),
              }).then(r => r.json()) as { success?: boolean; filePath?: string; error?: string }
              setMessage({ type: res.success ? 'success' : 'error', text: res.success ? `Kaydedildi: ${res.filePath}` : (res.error || 'Hata') })
            } catch { setMessage({ type: 'error', text: 'Docker kayit hatasi.' }) }
            finally { setLoading('') }
          }} disabled={busy} className="btn-primary text-xs flex items-center gap-1">
            {loading === 'save-docker' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Diske Kaydet
          </button>
        )}
        <button onClick={() => {
          const el = document.getElementById('output-editor') as HTMLTextAreaElement
          copyToClipboard(el ? el.value : (showOutput === 'manifest' ? generatedManifest : generatedDocker))
        }} className="btn-secondary text-xs flex items-center gap-1"><Copy className="w-3 h-3" /> Kopyala</button>
        <button onClick={() => setShowOutput(null)} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
      </div>
    </div>
<textarea id="output-editor"
key={`${showOutput}-${showOutput === 'manifest' ? generatedManifest.length : generatedDocker.length}`}
defaultValue={showOutput === 'manifest' ? generatedManifest : generatedDocker}
      className="w-full p-4 text-xs font-mono text-gray-300 bg-transparent border-none outline-none resize-none"
      style={{ minHeight: 220, maxHeight: 260 }}
      spellCheck={false} />
  </div>
)}
      </div>
    </div>
  )
}