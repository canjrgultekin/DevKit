import { useState } from 'react'
import {
  Database, Search, Table2, Key, Link2, Hash, Shield,
  Loader2, CheckCircle2, XCircle,
  Copy, Eye, EyeOff, Columns3, GitFork,
} from 'lucide-react'

const API = '/api/schema'

async function schemaApi<T = Record<string, unknown>>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await res.json() as T
}

interface ColumnInfo {
  name: string; dataType: string; maxLength: number | null; isNullable: boolean
  isPrimaryKey: boolean; isForeignKey: boolean; isUnique: boolean
  defaultValue: string | null; description: string | null; ordinalPosition: number
}
interface TableInfo { name: string; schema: string; rowEstimate: number; sizeKb: number; columnCount: number; indexCount: number; hasPrimaryKey: boolean; columns: ColumnInfo[] }
interface Relationship { sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string; constraintName: string }
interface IndexInfo { name: string; columns: string[]; isUnique: boolean; isPrimaryKey: boolean; type: string; sizeKb: number }
interface ForeignKeyInfo { name: string; sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string; onDelete: string; onUpdate: string }
interface ConstraintInfo { name: string; type: string; definition: string }
interface TriggerInfo { name: string; event: string; timing: string; definition: string }
interface TableDetail extends TableInfo {
  indexes: IndexInfo[]; foreignKeys: ForeignKeyInfo[]; referencedBy: ForeignKeyInfo[]
  constraints: ConstraintInfo[]; triggers: TriggerInfo[]; createScript: string
}
interface ScanResult { tables: TableInfo[]; relationships: Relationship[]; schema: string; tableCount: number; totalColumns: number; totalRelationships: number }

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-900/30 text-blue-400 border-blue-800', green: 'bg-green-900/30 text-green-400 border-green-800',
    amber: 'bg-amber-900/30 text-amber-400 border-amber-800', red: 'bg-red-900/30 text-red-400 border-red-800',
    violet: 'bg-violet-900/30 text-violet-400 border-violet-800', gray: 'bg-gray-800/30 text-gray-400 border-gray-700',
  }
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${colors[color] || colors.gray}`}>{children}</span>
}

export default function SchemaPage() {
  const [connStr, setConnStr] = useState('')
  const [schema, setSchema] = useState('public')
  const [schemas, setSchemas] = useState<string[]>([])
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [selectedTable, setSelectedTable] = useState<TableDetail | null>(null)
  const [loading, setLoading] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [showConnStr, setShowConnStr] = useState(false)

  const handleConnect = async () => {
    if (!connStr) return
    setLoading('connect'); setMessage(null)
    try {
      const res = await schemaApi<{ success: boolean; schemas: string[]; error?: string }>('schemas', { connectionString: connStr })
      if (!res.success) throw new Error(res.error)
      setSchemas(res.schemas)
      setMessage({ type: 'success', text: `Baglanti basarili. ${res.schemas.length} schema bulundu.` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Baglanti hatasi' }) }
    finally { setLoading('') }
  }

  const handleScan = async () => {
    if (!connStr) return
    setLoading('scan'); setMessage(null); setSelectedTable(null)
    try {
      const res = await schemaApi<{ success: boolean; scan: ScanResult; error?: string }>('scan', { connectionString: connStr, schema })
      if (!res.success) throw new Error(res.error)
      setScanResult(res.scan)
      setMessage({ type: 'success', text: `${res.scan.tableCount} tablo, ${res.scan.totalColumns} kolon, ${res.scan.totalRelationships} iliski bulundu.` })
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Tarama hatasi' }) }
    finally { setLoading('') }
  }

  const handleTableClick = async (tableName: string) => {
    setLoading(`table-${tableName}`)
    try {
      const res = await schemaApi<{ success: boolean; table: TableDetail; error?: string }>('table', { connectionString: connStr, tableName, schema })
      if (!res.success) throw new Error(res.error)
      setSelectedTable(res.table)
    } catch (e) { setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Tablo detay hatasi' }) }
    finally { setLoading('') }
  }

  const copyScript = () => {
    if (selectedTable?.createScript) navigator.clipboard.writeText(selectedTable.createScript)
  }

  const filteredTables = scanResult?.tables.filter(t =>
    t.name.toLowerCase().includes(searchFilter.toLowerCase())
  ) || []

  const getRelationsForTable = (tableName: string) =>
    scanResult?.relationships.filter(r => r.sourceTable === tableName || r.targetTable === tableName) || []

  const busy = loading !== ''

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Database className="w-6 h-6 text-emerald-400" /> Database Schema Visualizer
        </h1>
        <p className="text-gray-400 mt-1">Veritabani yapisini gorsellestirir: tablolar, kolonlar, iliskiler, indexler, constraint'ler</p>
      </div>

      {message && (
        <div className={`card mb-4 ${message.type === 'success' ? 'border-green-800 bg-green-950/10' : 'border-red-800 bg-red-950/10'}`}>
          <div className="flex items-center gap-2 text-sm">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</span>
          </div>
        </div>
      )}

      {/* Connection */}
      <div className="card mb-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-400" /> Veritabani Baglantisi
        </h3>
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              type={showConnStr ? 'text' : 'password'} value={connStr}
              onChange={e => setConnStr(e.target.value)}
              placeholder="Host=localhost;Port=5432;Database=mydb;Username=postgres;Password=postgres"
              className="input-field text-sm font-mono pr-10"
            />
            <button onClick={() => setShowConnStr(!showConnStr)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showConnStr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={handleConnect} disabled={busy || !connStr} className="btn-secondary text-sm">
            {loading === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Baglan'}
          </button>
        </div>

        {schemas.length > 0 && (
          <div className="flex gap-2 items-center">
            <select value={schema} onChange={e => setSchema(e.target.value)} className="input-field text-sm w-48">
              {schemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={handleScan} disabled={busy} className="btn-primary text-sm flex items-center gap-1.5">
              {loading === 'scan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Schema Tara
            </button>
          </div>
        )}
      </div>

      {/* Schema Overview */}
      {scanResult && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card text-center py-3">
              <p className="text-2xl font-bold text-white">{scanResult.tableCount}</p>
              <p className="text-xs text-gray-500">Tablo</p>
            </div>
            <div className="card text-center py-3">
              <p className="text-2xl font-bold text-white">{scanResult.totalColumns}</p>
              <p className="text-xs text-gray-500">Kolon</p>
            </div>
            <div className="card text-center py-3">
              <p className="text-2xl font-bold text-white">{scanResult.totalRelationships}</p>
              <p className="text-xs text-gray-500">Iliski (FK)</p>
            </div>
          </div>

          {/* Search + Table List */}
          <div className="flex gap-4">
            {/* Left: Table List */}
            <div className="w-80 flex-shrink-0">
              <div className="card">
                <input value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Tablo ara..." className="input-field text-sm mb-3" />

                <div className="space-y-1 max-h-[calc(100vh-400px)] overflow-auto">
                  {filteredTables.map(t => {
                    const rels = getRelationsForTable(t.name)
                    const isActive = selectedTable?.name === t.name
                    return (
                      <button key={t.name} onClick={() => handleTableClick(t.name)}
                        className={`w-full text-left rounded-lg px-3 py-2 transition-all ${
                          isActive ? 'bg-brand-600/20 border border-brand-600' : 'hover:bg-gray-800/50 border border-transparent'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Table2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span className="text-sm font-mono text-gray-200 truncate">{t.name}</span>
                          </div>
                          {loading === `table-${t.name}` && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
                        </div>
                        <div className="flex gap-2 mt-1 ml-5.5">
                          <span className="text-xs text-gray-600">{t.columnCount} col</span>
                          <span className="text-xs text-gray-600">{t.rowEstimate.toLocaleString()} rows</span>
                          {rels.length > 0 && <span className="text-xs text-blue-500">{rels.length} FK</span>}
                          {!t.hasPrimaryKey && <span className="text-xs text-red-500">no PK</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right: Table Detail */}
            <div className="flex-1">
              {selectedTable ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Table2 className="w-5 h-5 text-emerald-400" /> {selectedTable.name}
                      </h2>
                      <div className="flex gap-2">
                        <Badge color="green">{selectedTable.rowEstimate.toLocaleString()} rows</Badge>
                        <Badge color="blue">{(selectedTable.sizeKb / 1024).toFixed(1)} MB</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Columns */}
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                      <Columns3 className="w-4 h-4 text-blue-400" /> Kolonlar ({selectedTable.columns.length})
                    </h3>
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="text-left text-xs text-gray-500 pb-2 pr-3">Kolon</th>
                            <th className="text-left text-xs text-gray-500 pb-2 pr-3">Tip</th>
                            <th className="text-left text-xs text-gray-500 pb-2 pr-3">Nullable</th>
                            <th className="text-left text-xs text-gray-500 pb-2 pr-3">Ozellik</th>
                            <th className="text-left text-xs text-gray-500 pb-2">Default</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTable.columns.map(col => (
                            <tr key={col.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                              <td className="py-1.5 pr-3 font-mono text-gray-200 flex items-center gap-1.5">
                                {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                                {col.isForeignKey && <GitFork className="w-3 h-3 text-blue-400" />}
                                {!col.isPrimaryKey && !col.isForeignKey && <Hash className="w-3 h-3 text-gray-600" />}
                                {col.name}
                              </td>
                              <td className="py-1.5 pr-3 font-mono text-emerald-400 text-xs">
                                {col.dataType}{col.maxLength ? `(${col.maxLength})` : ''}
                              </td>
                              <td className="py-1.5 pr-3">
                                {col.isNullable ? <span className="text-gray-500 text-xs">NULL</span> : <span className="text-amber-400 text-xs">NOT NULL</span>}
                              </td>
                              <td className="py-1.5 pr-3 flex gap-1">
                                {col.isPrimaryKey && <Badge color="amber">PK</Badge>}
                                {col.isForeignKey && <Badge color="blue">FK</Badge>}
                                {col.isUnique && <Badge color="violet">UNIQUE</Badge>}
                              </td>
                              <td className="py-1.5 font-mono text-xs text-gray-500 truncate max-w-40">{col.defaultValue || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Indexes */}
                  {selectedTable.indexes.length > 0 && (
                    <div className="card">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                        <Search className="w-4 h-4 text-violet-400" /> Indexler ({selectedTable.indexes.length})
                      </h3>
                      {selectedTable.indexes.map(idx => (
                        <div key={idx.name} className="flex items-center gap-2 py-1.5 border-b border-gray-800/50 last:border-0">
                          <span className="font-mono text-xs text-gray-300">{idx.name}</span>
                          <Badge color={idx.isPrimaryKey ? 'amber' : idx.isUnique ? 'violet' : 'gray'}>
                            {idx.isPrimaryKey ? 'PK' : idx.isUnique ? 'UNIQUE' : idx.type}
                          </Badge>
                          <span className="text-xs text-gray-500">({idx.columns.join(', ')})</span>
                          <span className="text-xs text-gray-600 ml-auto">{idx.sizeKb} KB</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Foreign Keys */}
                  {(selectedTable.foreignKeys.length > 0 || selectedTable.referencedBy.length > 0) && (
                    <div className="card">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                        <GitFork className="w-4 h-4 text-blue-400" /> Iliskiler
                      </h3>
                      {selectedTable.foreignKeys.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-500 mb-1">Bu tablodan cikan:</p>
                          {selectedTable.foreignKeys.map(fk => (
                            <div key={fk.name} className="flex items-center gap-2 py-1 text-xs">
                              <span className="font-mono text-gray-300">{fk.sourceColumn}</span>
                              <span className="text-gray-600">→</span>
                              <button onClick={() => handleTableClick(fk.targetTable)}
                                className="font-mono text-blue-400 hover:underline">{fk.targetTable}.{fk.targetColumn}</button>
                              <span className="text-gray-600 ml-auto">ON DELETE {fk.onDelete}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedTable.referencedBy.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Bu tabloya referans veren:</p>
                          {selectedTable.referencedBy.map(fk => (
                            <div key={fk.name} className="flex items-center gap-2 py-1 text-xs">
                              <button onClick={() => handleTableClick(fk.sourceTable)}
                                className="font-mono text-blue-400 hover:underline">{fk.sourceTable}.{fk.sourceColumn}</button>
                              <span className="text-gray-600">→</span>
                              <span className="font-mono text-gray-300">{fk.targetColumn}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Constraints */}
                  {selectedTable.constraints.length > 0 && (
                    <div className="card">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-400" /> Constraint'ler ({selectedTable.constraints.length})
                      </h3>
                      {selectedTable.constraints.map(c => (
                        <div key={c.name} className="py-1.5 border-b border-gray-800/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <Badge color={c.type === 'PRIMARY KEY' ? 'amber' : c.type === 'FOREIGN KEY' ? 'blue' : c.type === 'CHECK' ? 'green' : 'gray'}>{c.type}</Badge>
                            <span className="font-mono text-xs text-gray-300">{c.name}</span>
                          </div>
                          <p className="text-xs text-gray-500 font-mono mt-0.5 ml-14">{c.definition}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Triggers */}
                  {selectedTable.triggers.length > 0 && (
                    <div className="card">
                      <h3 className="text-sm font-semibold text-gray-200 mb-3">Trigger'lar ({selectedTable.triggers.length})</h3>
                      {selectedTable.triggers.map(t => (
                        <div key={t.name} className="py-1.5 border-b border-gray-800/50 last:border-0">
                          <span className="font-mono text-xs text-gray-300">{t.name}</span>
                          <Badge color="gray">{t.timing} {t.event}</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CREATE Script */}
                  {selectedTable.createScript && (
                    <div className="card">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-200">CREATE Script</h3>
                        <button onClick={copyScript} className="btn-secondary text-xs flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Kopyala
                        </button>
                      </div>
                      <pre className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-300 overflow-auto max-h-60 whitespace-pre">
                        {selectedTable.createScript}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card text-center py-16">
                  <Database className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500">Detay gormek icin sol taraftan bir tablo secin</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}