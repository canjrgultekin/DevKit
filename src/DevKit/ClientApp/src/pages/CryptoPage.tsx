import { useState } from 'react'
import {
  KeyRound, Database, Table2, Eye, EyeOff, RefreshCw,
  Loader2, CheckCircle2, XCircle, FileJson, Cloud,
  Lock, Unlock, ArrowRightLeft, AlertTriangle, Search, Shield,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'

const API = '/api/crypto'

async function cryptoApi<T = Record<string, unknown>>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await res.json() as T
}

interface ColumnInfo {
  name: string
  dataType: string
  isNullable: boolean
  maxLength: number | null
}

function Section({ title, icon, desc, step, children }: {
  title: string; icon: React.ReactNode; desc?: string; step: number; children: React.ReactNode
}) {
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">{step}</span>
        {icon}
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {desc && <p className="text-xs text-gray-500 mb-3 ml-8">{desc}</p>}
      {!desc && <div className="mb-3" />}
      <div className="ml-8">{children}</div>
    </div>
  )
}

export default function CryptoPage() {
  // Step 1: Config source
  const [configSource, setConfigSource] = useState<'file' | 'azure'>('file')
  const [filePath, setFilePath] = useState('')
  const [azureRg, setAzureRg] = useState('')
  const [azureApp, setAzureApp] = useState('')
  const [azureSub, setAzureSub] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [configLoaded, setConfigLoaded] = useState(false)

  // Step 2: Keys
  const [masterKey, setMasterKey] = useState('')
  const [connectionString, setConnectionString] = useState('')
  const [masterKeyVisible, setMasterKeyVisible] = useState(false)

  // Step 3: Tables
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [tablesLoaded, setTablesLoaded] = useState(false)

  // Step 4: Column mapping
  const [pkColumn, setPkColumn] = useState('id')
  const [ciphertextColumn, setCiphertextColumn] = useState('')
  const [algorithmColumn, setAlgorithmColumn] = useState('')
  const [keyIdColumn, setKeyIdColumn] = useState('')
  const [displayColumns, setDisplayColumns] = useState<string[]>([])

  // Step 5: Decrypted data
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [decrypted, setDecrypted] = useState(false)
  const [showDecrypted, setShowDecrypted] = useState(false)

  // Step 6: ReKey
  const [newMasterKey, setNewMasterKey] = useState('')
  const [newKeyId, setNewKeyId] = useState('local-masterkey-v2')
  const [reKeyResult, setReKeyResult] = useState<{ totalRows: number; updatedRows: number; failedRows: number; errors: string[] } | null>(null)

  // General
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  // ===== STEP 1: Read Config =====
  const handleReadConfig = async () => {
    setLoading('config'); setError('')
    try {
      const body = configSource === 'file'
        ? { source: 'file', filePath }
        : { source: 'azure', resourceGroup: azureRg, appName: azureApp, subscriptionId: azureSub || undefined }

      const res = await cryptoApi<{ success: boolean; config?: Record<string, string>; error?: string }>('read-config', body)
      if (!res.success) throw new Error(res.error || 'Failed')

      setConfig(res.config || {})
      setConfigLoaded(true)

      // Auto-detect keys
      const cfg = res.config || {}
      const mk = cfg['Crypto:MasterKey'] || cfg['App:Crypto:MasterKey'] || ''
      const cs = cfg['ConnectionStrings:DefaultConnection'] || cfg['ConnectionStrings:Database'] ||
        Object.entries(cfg).find(([k]) => k.toLowerCase().includes('connectionstring'))?.[1] || ''
      setMasterKey(mk)
      setConnectionString(cs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setLoading('') }
  }

  // ===== STEP 3: Load Tables =====
  const handleLoadTables = async () => {
    setLoading('tables'); setError('')
    try {
      const res = await cryptoApi<{ success: boolean; tables?: string[]; error?: string }>('tables', { connectionString })
      if (!res.success) throw new Error(res.error || 'DB connection failed')
      setTables(res.tables || [])
      setTablesLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setLoading('') }
  }

  // ===== Load Columns =====
  const handleSelectTable = async (table: string) => {
    setSelectedTable(table)
    setColumns([])
    setCiphertextColumn('')
    setAlgorithmColumn('')
    setKeyIdColumn('')
    setDisplayColumns([])
    setRows([])
    setDecrypted(false)

    setLoading('columns')
    try {
      const res = await cryptoApi<{ success: boolean; columns?: ColumnInfo[]; error?: string }>('columns', { connectionString, tableName: table })
      if (!res.success) throw new Error(res.error)
      const cols = res.columns || []
      setColumns(cols)

      // Auto-detect: ciphertext, algorithm, key_id kolonları
      const ct = cols.find(c => c.name.includes('ciphertext'))?.name || ''
      const algo = cols.find(c => c.name.includes('algorithm'))?.name || ''
      const kid = cols.find(c => c.name.includes('key_id'))?.name || ''
      const pk = cols.find(c => c.name === 'id')?.name || cols[0]?.name || 'id'
      setCiphertextColumn(ct)
      setAlgorithmColumn(algo)
      setKeyIdColumn(kid)
      setPkColumn(pk)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setLoading('') }
  }

  // ===== STEP 5: Decrypt =====
  const handleDecrypt = async () => {
    setLoading('decrypt'); setError('')
    try {
      const res = await cryptoApi<{ success: boolean; rows?: Record<string, unknown>[]; error?: string; errors?: string[] }>('decrypt', {
        connectionString, tableName: selectedTable, masterKey,
        ciphertextColumn, algorithmColumn: algorithmColumn || undefined,
        keyIdColumn: keyIdColumn || undefined, pkColumn,
        displayColumns: displayColumns.length > 0 ? displayColumns : undefined,
        limit: 200,
      })
      if (!res.success) throw new Error(res.error)
      setRows(res.rows || [])
      setDecrypted(true)
      setShowDecrypted(true)
      if (res.errors && res.errors.length > 0) setError(`${res.errors.length} satir decrypt edilemedi`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decrypt failed')
    } finally { setLoading('') }
  }

  // ===== STEP 6: ReKey =====
  const handleReKey = async () => {
    if (!confirm('DIKKAT: Bu islem tum encrypted verileri yeni key ile yeniden sifreleyecek.\nDevam etmek istiyor musun?')) return
    setLoading('rekey'); setError(''); setReKeyResult(null)
    try {
      const res = await cryptoApi<{ success: boolean; result?: typeof reKeyResult; error?: string }>('rekey', {
        connectionString, tableName: selectedTable,
        oldMasterKey: masterKey, newMasterKey,
        ciphertextColumn, algorithmColumn: algorithmColumn || 'value_algorithm',
        keyIdColumn: keyIdColumn || 'value_key_id', pkColumn,
        newKeyId,
      })
      if (!res.success && !res.result) throw new Error(res.error)
      setReKeyResult(res.result || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ReKey failed')
    } finally { setLoading('') }
  }

  const handleUpdateConfig = async () => {
    if (!confirm('Config dosyasindaki/Azure\'daki MasterKey yeni key ile guncellenecek. Devam?')) return
    setLoading('update-config'); setError('')
    try {
      const updates: Record<string, string> = { 'Crypto:MasterKey': newMasterKey }
      const body = configSource === 'file'
        ? { source: 'file', filePath, updates }
        : { source: 'azure', resourceGroup: azureRg, appName: azureApp, subscriptionId: azureSub || undefined, updates }

      const res = await cryptoApi<{ success: boolean; error?: string }>('update-config', body)
      if (!res.success) throw new Error(res.error)
      setMasterKey(newMasterKey)
      setNewMasterKey('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Config update failed')
    } finally { setLoading('') }
  }

  const toggleDisplay = (col: string) => {
    setDisplayColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
  }

  const isL = (a: string) => loading === a

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shield className="w-6 h-6 text-cyan-400" />
          Crypto & Credential Manager
        </h1>
        <p className="text-gray-400 mt-1">Encrypted verileri goruntule, decrypt et ve key rotation yap</p>
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-800 bg-red-950/20 mb-4">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="w-4 h-4" /> {error}
          </div>
        </div>
      )}

      {/* ===== STEP 1: CONFIG SOURCE ===== */}
      <Section step={1} title="Config Kaynagi" icon={<FileJson className="w-4 h-4 text-blue-400" />}
        desc="Keylerin ve connection string'in bulundugu kaynak">

        <div className="flex gap-1 bg-gray-800/40 rounded-md p-0.5 mb-4 max-w-md">
          <button onClick={() => setConfigSource('file')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              configSource === 'file' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            <FileJson className="w-3.5 h-3.5" /> appsettings.json
          </button>
          <button onClick={() => setConfigSource('azure')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              configSource === 'azure' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            <Cloud className="w-3.5 h-3.5" /> Azure App Service
          </button>
        </div>

        {configSource === 'file' ? (
          <PathPicker value={filePath} onChange={setFilePath}
            placeholder="C:\source\myproject\appsettings.json"
            hint="appsettings.json veya appsettings.Local.json dosyasi sec"
            mode="file" fileFilter="JSON files (*.json)|*.json" />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Resource Group</label>
              <input value={azureRg} onChange={e => setAzureRg(e.target.value)} placeholder="rg-myproject" className="input-field text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">App Service</label>
              <input value={azureApp} onChange={e => setAzureApp(e.target.value)} placeholder="app-myproject-api" className="input-field text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Subscription (opsiyonel)</label>
              <input value={azureSub} onChange={e => setAzureSub(e.target.value)} className="input-field text-sm font-mono" />
            </div>
          </div>
        )}

        <button onClick={handleReadConfig} disabled={loading !== '' || (configSource === 'file' ? !filePath : !azureRg || !azureApp)}
          className="btn-primary text-sm flex items-center gap-1.5 mt-3">
          {isL('config') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Config Oku
        </button>

        {configLoaded && (
          <div className="mt-3 bg-green-950/20 border border-green-800/30 rounded-lg px-3 py-2">
            <p className="text-xs text-green-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {Object.keys(config).length} config degeri okundu
            </p>
          </div>
        )}
      </Section>

      {/* ===== STEP 2: KEYS ===== */}
      {configLoaded && (
        <Section step={2} title="Key'ler ve Baglanti" icon={<KeyRound className="w-4 h-4 text-amber-400" />}
          desc="Config'den okunan veya elle girilen MasterKey ve DB connection string">

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">MasterKey (AES-256-GCM icin)</label>
              <div className="flex gap-2">
                <input type={masterKeyVisible ? 'text' : 'password'} value={masterKey}
                  onChange={e => setMasterKey(e.target.value)}
                  className="input-field text-sm font-mono flex-1" />
                <button onClick={() => setMasterKeyVisible(!masterKeyVisible)} className="btn-secondary text-sm">
                  {masterKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">PostgreSQL Connection String</label>
              <input type="text" value={connectionString} onChange={e => setConnectionString(e.target.value)}
                placeholder="Host=...;Database=...;Username=...;Password=..."
                className="input-field text-sm font-mono" />
            </div>

            <button onClick={handleLoadTables} disabled={loading !== '' || !connectionString}
              className="btn-primary text-sm flex items-center gap-1.5">
              {isL('tables') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Veritabanina Baglan
            </button>

            {tablesLoaded && (
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {tables.length} tablo bulundu
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ===== STEP 3: TABLE & COLUMN SELECT ===== */}
      {tablesLoaded && (
        <Section step={3} title="Tablo ve Kolon Secimi" icon={<Table2 className="w-4 h-4 text-violet-400" />}
          desc="Encrypted veri iceren tabloyu ve ilgili kolonlari sec">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tablo</label>
              <select value={selectedTable} onChange={e => handleSelectTable(e.target.value)} className="input-field text-sm font-mono">
                <option value="">Tablo sec...</option>
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {columns.length > 0 && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PK Kolonu</label>
                  <select value={pkColumn} onChange={e => setPkColumn(e.target.value)} className="input-field text-sm font-mono">
                    {columns.map(c => <option key={c.name} value={c.name}>{c.name} ({c.dataType})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Sifrelenmis Veri Kolonu (ciphertext)</label>
                  <select value={ciphertextColumn} onChange={e => setCiphertextColumn(e.target.value)} className="input-field text-sm font-mono">
                    <option value="">Sec...</option>
                    {columns.filter(c => c.dataType === 'text' || c.dataType.includes('character')).map(c =>
                      <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Algoritma Kolonu (opsiyonel)</label>
                  <select value={algorithmColumn} onChange={e => setAlgorithmColumn(e.target.value)} className="input-field text-sm font-mono">
                    <option value="">Yok</option>
                    {columns.filter(c => c.dataType === 'text' || c.dataType.includes('character')).map(c =>
                      <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Key ID Kolonu (opsiyonel)</label>
                  <select value={keyIdColumn} onChange={e => setKeyIdColumn(e.target.value)} className="input-field text-sm font-mono">
                    <option value="">Yok</option>
                    {columns.filter(c => c.dataType === 'text' || c.dataType.includes('character')).map(c =>
                      <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Ek Goruntulenecek Kolonlar</label>
                  <div className="flex flex-wrap gap-1.5">
                    {columns.filter(c => c.name !== pkColumn && c.name !== ciphertextColumn && c.name !== algorithmColumn && c.name !== keyIdColumn).map(c => (
                      <button key={c.name} onClick={() => toggleDisplay(c.name)}
                        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                          displayColumns.includes(c.name) ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {ciphertextColumn && (
            <button onClick={handleDecrypt} disabled={loading !== '' || !masterKey}
              className="btn-primary text-sm flex items-center gap-1.5 mt-4">
              {isL('decrypt') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              Decrypt Et & Goster
            </button>
          )}
        </Section>
      )}

      {/* ===== STEP 4: DECRYPTED DATA ===== */}
      {decrypted && rows.length > 0 && (
        <Section step={4} title="Decrypted Veriler" icon={<Unlock className="w-4 h-4 text-green-400" />}
          desc={`${rows.length} satir. Gizle/goster butonuyla kontrol et`}>

          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setShowDecrypted(!showDecrypted)}
              className="btn-secondary text-xs flex items-center gap-1.5">
              {showDecrypted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showDecrypted ? 'Gizle' : 'Goster'}
            </button>
            <span className="text-xs text-gray-500">{rows.length} kayit</span>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">{pkColumn}</th>
                  {displayColumns.map(c => (
                    <th key={c} className="text-left py-2 px-2 text-gray-400 font-medium">{c}</th>
                  ))}
                  <th className="text-left py-2 px-2 text-gray-400 font-medium">Encrypted</th>
                  <th className="text-left py-2 px-2 text-green-400 font-medium">Decrypted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-900 hover:bg-gray-800/30">
                    <td className="py-1.5 px-2 font-mono text-gray-400 max-w-[120px] truncate">
                      {String(row[pkColumn] ?? '').substring(0, 12)}...
                    </td>
                    {displayColumns.map(c => (
                      <td key={c} className="py-1.5 px-2 font-mono text-gray-500 max-w-[150px] truncate">
                        {String(row[c] ?? '')}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 font-mono text-gray-600 max-w-[200px] truncate">
                      {String(row[ciphertextColumn] ?? '').substring(0, 30)}...
                    </td>
                    <td className="py-1.5 px-2 font-mono max-w-[250px]">
                      {showDecrypted ? (
                        <span className={`${String(row._decrypted ?? '').startsWith('[HATA') ? 'text-red-400' : 'text-green-400'}`}>
                          {String(row._decrypted ?? '-')}
                        </span>
                      ) : (
                        <span className="text-gray-600">••••••••</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ===== STEP 5: RE-KEY ===== */}
      {decrypted && rows.length > 0 && (
        <Section step={5} title="Key Degistir (Re-Key)" icon={<ArrowRightLeft className="w-4 h-4 text-red-400" />}
          desc="Tum encrypted verileri yeni key ile yeniden sifrele. DIKKATLI KULLAN!">

          <div className="bg-amber-900/10 border border-amber-800/20 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Bu islem tum satirlari eski key ile decrypt edip yeni key ile re-encrypt eder.
              Islem sonrasi eski key ile decrypt yapilamaz. Config dosyasini/Azure'u da guncellemeyi unutma.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Mevcut Key (otomatik dolu)</label>
                <input type="password" value={masterKey} disabled className="input-field text-sm font-mono bg-gray-900" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Yeni MasterKey</label>
                <input value={newMasterKey} onChange={e => setNewMasterKey(e.target.value)}
                  placeholder="Yeni key gir..." className="input-field text-sm font-mono" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Yeni Key ID</label>
              <input value={newKeyId} onChange={e => setNewKeyId(e.target.value)}
                className="input-field text-sm font-mono max-w-xs" />
            </div>

            <div className="flex gap-2">
              <button onClick={handleReKey} disabled={loading !== '' || !newMasterKey}
                className="btn-danger text-sm flex items-center gap-1.5">
                {isL('rekey') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                DB Verilerini Re-Key Yap
              </button>

              {reKeyResult && reKeyResult.failedRows === 0 && (
                <button onClick={handleUpdateConfig} disabled={loading !== ''}
                  className="btn-primary text-sm flex items-center gap-1.5">
                  {isL('update-config') ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Config'i de Guncelle
                </button>
              )}
            </div>
          </div>

          {reKeyResult && (
            <div className={`mt-3 rounded-lg px-3 py-2 ${reKeyResult.failedRows === 0 ? 'bg-green-950/20 border border-green-800/30' : 'bg-red-950/20 border border-red-800/30'}`}>
              <div className="grid grid-cols-3 gap-4 text-center mb-2">
                <div>
                  <p className="text-lg font-bold text-white">{reKeyResult.totalRows}</p>
                  <p className="text-xs text-gray-500">Toplam</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-400">{reKeyResult.updatedRows}</p>
                  <p className="text-xs text-gray-500">Guncellendi</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{reKeyResult.failedRows}</p>
                  <p className="text-xs text-gray-500">Basarisiz</p>
                </div>
              </div>
              {reKeyResult.errors.length > 0 && (
                <div className="mt-2">
                  {reKeyResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-400 font-mono">{e}</p>
                  ))}
                </div>
              )}
              {reKeyResult.failedRows === 0 && (
                <p className="text-xs text-green-400 mt-1">Tum satirlar basariyla re-key yapildi. Simdi config dosyasini/Azure'u da guncelle.</p>
              )}
            </div>
          )}
        </Section>
      )}
    </div>
  )
}