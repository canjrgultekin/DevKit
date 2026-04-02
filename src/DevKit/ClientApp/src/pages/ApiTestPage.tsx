import { useState } from 'react'
import {
  Zap, Download, Send, Loader2, CheckCircle2, XCircle,
  Clock, Copy, Filter,
} from 'lucide-react'

const API = '/api/apitest'

async function apiTestApi<T = Record<string, unknown>>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await res.json() as T
}

interface ParameterInfo { name: string; in: string; required: boolean; type: string; description: string; example: string | null }
interface RequestBodyInfo { contentType: string; schema: string; example: string | null; required: boolean }
interface EndpointInfo { path: string; method: string; summary: string; operationId: string; tags: string[]; parameters: ParameterInfo[]; requestBody: RequestBodyInfo | null; responses: Record<string, { description: string }> }
interface SwaggerSpec { title: string; version: string; baseUrl: string; endpoints: EndpointInfo[] }
interface ApiResponse { statusCode: number; statusText: string; headers: Record<string, string>; body: string; contentType: string; durationMs: number; success: boolean; sizeBytes: number }

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-900/30 text-green-400 border-green-800',
  POST: 'bg-blue-900/30 text-blue-400 border-blue-800',
  PUT: 'bg-amber-900/30 text-amber-400 border-amber-800',
  DELETE: 'bg-red-900/30 text-red-400 border-red-800',
  PATCH: 'bg-violet-900/30 text-violet-400 border-violet-800',
}

const STATUS_COLORS: Record<string, string> = {
  '2': 'text-green-400', '3': 'text-blue-400', '4': 'text-amber-400', '5': 'text-red-400',
}

export default function ApiTestPage() {
  const [swaggerUrl, setSwaggerUrl] = useState('')
  const [spec, setSpec] = useState<SwaggerSpec | null>(null)
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointInfo | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({})
  const [newHeaderKey, setNewHeaderKey] = useState('')
  const [newHeaderValue, setNewHeaderValue] = useState('')
  const [bodyContent, setBodyContent] = useState('')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [tagFilter, setTagFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)
  const [history, setHistory] = useState<Array<{ method: string; path: string; status: number; durationMs: number }>>([])

  const handleLoadSwagger = async () => {
    if (!swaggerUrl) return
    setLoading('load'); setMessage(null)
    try {
      const res = await apiTestApi<{ success: boolean; spec: SwaggerSpec; error?: string }>('load-swagger', { url: swaggerUrl })
      if (!res.success) throw new Error(res.error)
      setSpec(res.spec)
      setBaseUrl(res.spec.baseUrl || swaggerUrl.replace(/\/swagger.*$/i, ''))
      setMessage({ type: 'success', text: `${res.spec.title} v${res.spec.version} - ${res.spec.endpoints.length} endpoint` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Yukleme hatasi' }) }
    finally { setLoading('') }
  }

  const selectEndpoint = (ep: EndpointInfo) => {
    setSelectedEndpoint(ep)
    setResponse(null)
    setParamValues({})
    setBodyContent(ep.requestBody?.example || '')
    setHeaderValues({ 'Content-Type': 'application/json' })
  }

  const handleSend = async () => {
    if (!selectedEndpoint) return
    setLoading('send'); setMessage(null)

    let path = selectedEndpoint.path
    const queryParams: Record<string, string> = {}

    for (const param of selectedEndpoint.parameters) {
      const val = paramValues[param.name] || ''
      if (!val) continue
      if (param.in === 'path') path = path.replace(`{${param.name}}`, encodeURIComponent(val))
      else if (param.in === 'query') queryParams[param.name] = val
    }

    const fullUrl = `${baseUrl}${path}`

    try {
      const res = await apiTestApi<{ success: boolean; response: ApiResponse; error?: string }>('send', {
        url: fullUrl, method: selectedEndpoint.method,
        headers: headerValues, queryParams,
        body: bodyContent || undefined,
        contentType: headerValues['Content-Type'] || 'application/json',
        timeoutSeconds: 30,
      })
      if (!res.success) throw new Error(res.error)
      setResponse(res.response)
      setHistory(prev => [{ method: selectedEndpoint.method, path: selectedEndpoint.path, status: res.response.statusCode, durationMs: res.response.durationMs }, ...prev.slice(0, 19)])
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Request hatasi' }) }
    finally { setLoading('') }
  }

  const addHeader = () => {
    if (!newHeaderKey) return
    setHeaderValues(prev => ({ ...prev, [newHeaderKey]: newHeaderValue }))
    setNewHeaderKey(''); setNewHeaderValue('')
  }

  const removeHeader = (key: string) => {
    setHeaderValues(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  const copyResponse = () => { if (response?.body) navigator.clipboard.writeText(response.body) }

  const allTags = [...new Set(spec?.endpoints.flatMap(e => e.tags) || [])]
  const filteredEndpoints = spec?.endpoints.filter(e => {
    if (tagFilter && !e.tags.includes(tagFilter)) return false
    if (methodFilter && e.method !== methodFilter) return false
    return true
  }) || []

  const busy = loading !== ''
  const statusColor = response ? STATUS_COLORS[String(response.statusCode)[0]] || 'text-gray-400' : ''

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Zap className="w-6 h-6 text-amber-400" /> API Test Runner
        </h1>
        <p className="text-gray-400 mt-1">Swagger/OpenAPI yukle, endpoint sec, request at, response gor</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* Swagger URL */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <Download className="w-4 h-4 text-gray-400" /> Swagger / OpenAPI
        </h3>
        <div className="flex gap-2 mb-3">
          <input value={swaggerUrl} onChange={e => setSwaggerUrl(e.target.value)}
            placeholder="https://localhost:5001/swagger/v1/swagger.json"
            className="input-field text-sm font-mono flex-1"
            onKeyDown={e => e.key === 'Enter' && handleLoadSwagger()} />
          <button onClick={handleLoadSwagger} disabled={busy || !swaggerUrl} className="btn-primary text-sm flex items-center gap-1.5">
            {loading === 'load' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Yukle
          </button>
        </div>
        {spec && (
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-400">Base URL:</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="input-field text-sm font-mono flex-1" />
          </div>
        )}
      </div>

      {spec && (
        <div className="flex gap-4">
          {/* Left: Endpoint List */}
          <div className="w-96 flex-shrink-0">
            <div className="card">
              <div className="flex gap-2 mb-3">
                {allTags.length > 0 && (
                  <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="input-field text-xs flex-1">
                    <option value="">Tum tag'ler</option>
                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="input-field text-xs w-24">
                  <option value="">Tumu</option>
                  {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <p className="text-xs text-gray-500 mb-2">{filteredEndpoints.length} endpoint</p>

              <div className="space-y-1 max-h-[calc(100vh-400px)] overflow-auto">
                {filteredEndpoints.map((ep, i) => {
                  const isActive = selectedEndpoint === ep
                  return (
                    <button key={`${ep.method}-${ep.path}-${i}`} onClick={() => selectEndpoint(ep)}
                      className={`w-full text-left rounded-lg px-3 py-2 transition-all ${
                        isActive ? 'bg-brand-600/20 border border-brand-600' : 'hover:bg-gray-800/50 border border-transparent'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${METHOD_COLORS[ep.method] || 'text-gray-400'}`}>
                          {ep.method}
                        </span>
                        <span className="text-xs font-mono text-gray-300 truncate">{ep.path}</span>
                      </div>
                      {ep.summary && <p className="text-xs text-gray-500 mt-1 ml-14 truncate">{ep.summary}</p>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="card mt-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Son Istekler
                </h3>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className={`font-bold ${METHOD_COLORS[h.method]?.includes('green') ? 'text-green-400' : METHOD_COLORS[h.method]?.includes('blue') ? 'text-blue-400' : 'text-gray-400'}`}>{h.method}</span>
                      <span className="text-gray-500 truncate flex-1">{h.path}</span>
                      <span className={STATUS_COLORS[String(h.status)[0]] || 'text-gray-400'}>{h.status}</span>
                      <span className="text-gray-600">{h.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Request Builder + Response */}
          <div className="flex-1">
            {selectedEndpoint ? (
              <div className="space-y-4">
                {/* Endpoint Header */}
                <div className="card">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-sm font-bold px-2 py-1 rounded border ${METHOD_COLORS[selectedEndpoint.method] || ''}`}>
                      {selectedEndpoint.method}
                    </span>
                    <span className="text-sm font-mono text-gray-200">{baseUrl}{selectedEndpoint.path}</span>
                  </div>
                  {selectedEndpoint.summary && <p className="text-xs text-gray-500">{selectedEndpoint.summary}</p>}
                </div>

                {/* Parameters */}
                {selectedEndpoint.parameters.length > 0 && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                      <Filter className="w-4 h-4 text-blue-400" /> Parametreler
                    </h3>
                    <div className="space-y-2">
                      {selectedEndpoint.parameters.map(p => (
                        <div key={p.name} className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${p.in === 'path' ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-800 text-gray-400'}`}>{p.in}</span>
                          <label className="text-sm text-gray-300 w-32 truncate">
                            {p.name}{p.required && <span className="text-red-400">*</span>}
                          </label>
                          <input
                            value={paramValues[p.name] || ''}
                            onChange={e => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                            placeholder={p.example || p.type}
                            className="input-field text-sm font-mono flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Headers */}
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-200 mb-3">Headers</h3>
                  <div className="space-y-1.5 mb-2">
                    {Object.entries(headerValues).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400 w-40 truncate">{key}</span>
                        <input value={val} onChange={e => setHeaderValues(prev => ({ ...prev, [key]: e.target.value }))}
                          className="input-field text-xs font-mono flex-1" />
                        <button onClick={() => removeHeader(key)} className="text-gray-600 hover:text-red-400 text-xs">x</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newHeaderKey} onChange={e => setNewHeaderKey(e.target.value)} placeholder="Header key" className="input-field text-xs font-mono w-40" />
                    <input value={newHeaderValue} onChange={e => setNewHeaderValue(e.target.value)} placeholder="Value" className="input-field text-xs font-mono flex-1"
                      onKeyDown={e => e.key === 'Enter' && addHeader()} />
                    <button onClick={addHeader} className="btn-secondary text-xs">Ekle</button>
                  </div>
                </div>

                {/* Request Body */}
                {selectedEndpoint.method !== 'GET' && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-200 mb-3">Request Body</h3>
                    <textarea
                      value={bodyContent} onChange={e => setBodyContent(e.target.value)}
                      rows={8} placeholder='{"key": "value"}'
                      className="input-field text-sm font-mono w-full resize-y"
                    />
                  </div>
                )}

                {/* Send Button */}
                <button onClick={handleSend} disabled={busy} className="btn-primary flex items-center gap-2 w-full justify-center py-2.5">
                  {loading === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Request
                </button>

                {/* Response */}
                {response && (
                  <div className={`card ${response.success ? 'border-green-800' : 'border-red-800'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${statusColor}`}>{response.statusCode}</span>
                        <span className="text-sm text-gray-400">{response.statusText}</span>
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {response.durationMs}ms
                        </span>
                        <span className="text-xs text-gray-600">
                          {response.sizeBytes > 1024 ? `${(response.sizeBytes / 1024).toFixed(1)} KB` : `${response.sizeBytes} B`}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowResponseHeaders(!showResponseHeaders)} className="btn-secondary text-xs">
                          Headers {showResponseHeaders ? '▲' : '▼'}
                        </button>
                        <button onClick={copyResponse} className="btn-secondary text-xs flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Kopyala
                        </button>
                      </div>
                    </div>

                    {showResponseHeaders && (
                      <div className="bg-gray-950 rounded-lg p-3 mb-3 space-y-0.5">
                        {Object.entries(response.headers).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <span className="text-blue-400 font-mono">{k}:</span>
                            <span className="text-gray-400 font-mono truncate">{v}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <pre className="bg-gray-950 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-auto max-h-96 whitespace-pre-wrap">
                      {response.body || 'Empty response'}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="card text-center py-16">
                <Zap className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">Sol taraftan bir endpoint secin</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}