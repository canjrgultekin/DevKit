import { useState } from 'react'
import { FolderTree, Play, CheckCircle2, XCircle, Loader2, Copy, ClipboardPaste, SkipForward } from 'lucide-react'
import PathPicker from '../components/PathPicker'
import type { ProjectManifest } from '../types'

interface ScaffoldResult {
  success: boolean
  mode: string
  outputPath: string
  createdFiles: string[]
  createdFolders: string[]
  skippedFiles: string[]
  errors: string[]
}

const SAMPLE_MANIFEST: ProjectManifest = {
  solution: 'MyApp',
  framework: 'dotnet',
  outputPath: '',
  projects: [
    {
      name: 'MyApp.Domain',
      path: 'src/MyApp.Domain',
      type: 'classlib',
      targetFramework: 'net9.0',
      folders: ['Entities', 'ValueObjects', 'Interfaces'],
      files: [
        { path: 'Entities/User.cs' },
        { path: 'Interfaces/IUserRepository.cs' },
      ],
      dependencies: [],
      projectReferences: [],
      scripts: {},
      npmDependencies: {},
      npmDevDependencies: {},
    },
    {
      name: 'MyApp.Application',
      path: 'src/MyApp.Application',
      type: 'classlib',
      targetFramework: 'net9.0',
      folders: ['Commands', 'Queries', 'Handlers'],
      files: [],
      dependencies: [{ package: 'MediatR', version: '12.4.1' }],
      projectReferences: ['MyApp.Domain'],
      scripts: {},
      npmDependencies: {},
      npmDevDependencies: {},
    },
  ],
  globalFiles: [],
}

export default function ScaffoldPage() {
  const [manifestJson, setManifestJson] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [mode, setMode] = useState<'create' | 'update'>('create')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScaffoldResult | null>(null)
  const [error, setError] = useState('')

  const loadSample = () => {
    setManifestJson(JSON.stringify(SAMPLE_MANIFEST, null, 2))
  }

  const handleScaffold = async () => {
    setError('')
    setResult(null)

    if (!manifestJson.trim()) {
      setError('Manifest JSON is required.')
      return
    }

    if (!outputPath.trim()) {
      setError('Output path is required.')
      return
    }

    let manifest: ProjectManifest
    try {
      manifest = JSON.parse(manifestJson)
    } catch {
      setError('Invalid JSON format.')
      return
    }

    manifest.outputPath = outputPath

    setLoading(true)
    try {
      const res = await fetch('/api/scaffolding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scaffold failed')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scaffold failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setManifestJson(text)
    } catch { /* clipboard not available */ }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FolderTree className="w-6 h-6 text-emerald-400" />
            Project Scaffolding
          </h1>
          <p className="text-gray-400 mt-1">Create or update project structure from Claude manifest</p>
        </div>
      </div>

      {/* Output Path + Mode */}
      <div className="card mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <PathPicker
              value={outputPath}
              onChange={setOutputPath}
              label="Output Path"
              placeholder="C:\source\projects"
              hint={outputPath ? `Project will be at: ${outputPath}\\[solution_name]` : 'Select output directory...'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('create')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'create'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Create
              </button>
              <button
                onClick={() => setMode('update')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'update'
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                Update
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {mode === 'create'
                ? 'Creates everything from scratch'
                : 'Adds new items, skips existing files'}
            </p>
          </div>
        </div>
      </div>

      {/* Manifest Editor */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-300">Manifest JSON</label>
          <div className="flex gap-2">
            <button onClick={handlePaste} className="btn-secondary text-xs flex items-center gap-1.5">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste
            </button>
            <button onClick={loadSample} className="btn-secondary text-xs flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5" />
              Load Sample
            </button>
          </div>
        </div>
        <textarea
          value={manifestJson}
          onChange={(e) => setManifestJson(e.target.value)}
          placeholder='Paste the project manifest JSON from Claude here...'
          className="input-field font-mono text-sm h-96 resize-y"
          spellCheck={false}
        />
      </div>

      {/* Action */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={handleScaffold} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? 'Working...' : mode === 'create' ? 'Scaffold Project' : 'Update Project'}
        </button>
        {mode === 'update' && (
          <span className="text-xs text-amber-400">Existing files will not be overwritten</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-800 bg-red-950/30 mb-6">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`card ${result.success ? 'border-green-800 bg-green-950/20' : 'border-red-800 bg-red-950/20'} mb-6`}>
          <div className="flex items-center gap-2 mb-4">
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className={`font-semibold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
              {result.success
                ? result.mode === 'update' ? 'Project updated successfully!' : 'Project scaffolded successfully!'
                : 'Scaffolding failed'}
            </span>
          </div>

          <div className="text-sm text-gray-400 mb-3">
            Output: <span className="font-mono text-gray-300">{result.outputPath}</span>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-red-400 mb-2">Errors:</h4>
              {result.errors.map((err, i) => (
                <p key={i} className="text-sm text-red-300 font-mono">{err}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center bg-gray-800/50 rounded-lg p-3">
              <p className="text-xl font-bold text-green-400">{result.createdFiles.length}</p>
              <p className="text-xs text-gray-500">Created</p>
            </div>
            <div className="text-center bg-gray-800/50 rounded-lg p-3">
              <p className="text-xl font-bold text-amber-400">{result.skippedFiles?.length || 0}</p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
            <div className="text-center bg-gray-800/50 rounded-lg p-3">
              <p className="text-xl font-bold text-blue-400">{result.createdFolders.length}</p>
              <p className="text-xs text-gray-500">Folders</p>
            </div>
          </div>

          {result.createdFiles.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Created ({result.createdFiles.length})
              </h4>
              <div className="max-h-40 overflow-auto bg-gray-950 rounded-lg p-3">
                {result.createdFiles.map((f, i) => (
                  <p key={i} className="text-xs font-mono text-green-400/70 py-0.5">{f}</p>
                ))}
              </div>
            </div>
          )}

          {result.skippedFiles && result.skippedFiles.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-1.5">
                <SkipForward className="w-3.5 h-3.5" />
                Skipped ({result.skippedFiles.length})
              </h4>
              <div className="max-h-40 overflow-auto bg-gray-950 rounded-lg p-3">
                {result.skippedFiles.map((f, i) => (
                  <p key={i} className="text-xs font-mono text-amber-400/70 py-0.5">{f}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}