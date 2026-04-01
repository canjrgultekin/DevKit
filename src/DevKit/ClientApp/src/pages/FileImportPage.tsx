import { useState, useCallback, useEffect, useRef } from 'react'
import {
  FileUp, Upload, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Trash2, Eye,
} from 'lucide-react'
import PathPicker from '../components/PathPicker'
import { fileImportApi, profileApi } from '../api'
import type { FileImportResult, FilePreview } from '../types'

export default function FileImportPage() {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [projectRoot, setProjectRoot] = useState('')
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [result, setResult] = useState<FileImportResult | null>(null)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    profileApi.getActive().then((data) => {
      if (data.profile?.workspace) {
        setProjectRoot(data.profile.workspace)
      }
    }).catch(() => {})
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const processFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    setFiles((prev) => [...prev, ...fileArray])
    setPreviews([])
    setResult(null)
    setError('')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files)
    }
  }, [processFiles])

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews([])
    setResult(null)
  }

  const clearAll = () => {
    setFiles([])
    setPreviews([])
    setResult(null)
    setError('')
  }

  const handlePreview = async () => {
    if (files.length === 0) return
    setPreviewing(true)
    setError('')
    try {
      const data = await fileImportApi.preview(files)
      setPreviews(data.files)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  const handleImport = async () => {
    if (files.length === 0) return
    if (!projectRoot.trim()) {
      setError('Project root path is required.')
      return
    }

    setImporting(true)
    setError('')
    try {
      const res = await fileImportApi.importFiles(files, projectRoot)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'imported': return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'overwritten': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />
      default: return <AlertTriangle className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <FileUp className="w-6 h-6 text-violet-400" />
          AI File Import
        </h1>
        <p className="text-gray-400 mt-1">
          Drag & drop files from Claude. DEVKIT_PATH markers route them to the correct location.
        </p>
      </div>

      {/* Project Root */}
      <div className="card mb-6">
        <PathPicker
          value={projectRoot}
          onChange={setProjectRoot}
          label="Project Root Path"
          placeholder="C:\source\myproject"
          hint="Files will be placed relative to this directory based on DEVKIT_PATH markers"
        />
      </div>

      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card mb-6 cursor-pointer transition-all border-2 border-dashed ${
          dragActive
            ? 'border-brand-500 bg-brand-600/10'
            : 'border-gray-700 hover:border-gray-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center py-12">
          <Upload className={`w-12 h-12 mb-4 ${dragActive ? 'text-brand-400' : 'text-gray-600'}`} />
          <p className="text-lg font-medium text-gray-300">
            {dragActive ? 'Drop files here' : 'Drag & drop files or click to browse'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Supports .cs, .ts, .tsx, .js, .jsx, .json, .py, .html, .css, .md and more
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">
              {files.length} file{files.length > 1 ? 's' : ''} queued
            </h3>
            <div className="flex gap-2">
              <button onClick={handlePreview} disabled={previewing} className="btn-secondary text-xs flex items-center gap-1.5">
                {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Preview
              </button>
              <button onClick={clearAll} className="btn-secondary text-xs flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-auto">
            {files.map((f, i) => {
              const preview = previews[i]
              return (
                <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-gray-300 truncate">{f.name}</p>
                    {preview && (
                      <p className="text-xs mt-0.5 font-mono">
                        {preview.hasMarker ? (
                          <span className="text-green-400">→ {preview.detectedPath}</span>
                        ) : (
                          <span className="text-yellow-400">No DEVKIT_PATH marker found</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-400 transition-colors">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800">
            <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {importing ? 'Importing...' : `Import ${files.length} file${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-800 bg-red-950/30 mb-6">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Import Result */}
      {result && (
        <div className={`card ${result.success ? 'border-green-800 bg-green-950/20' : 'border-yellow-800 bg-yellow-950/20'}`}>
          <div className="flex items-center gap-2 mb-4">
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            )}
            <span className="font-semibold text-white">Import Complete</span>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{result.totalFiles}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{result.importedFiles}</p>
              <p className="text-xs text-gray-500">Imported</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{result.overwrittenFiles}</p>
              <p className="text-xs text-gray-500">Overwritten</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{result.failedFiles}</p>
              <p className="text-xs text-gray-500">Failed</p>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-auto">
            {result.details.map((d, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-950/50 rounded-lg px-3 py-2 text-sm">
                {statusIcon(d.status)}
                <span className="font-mono text-gray-400 truncate flex-1">{d.detectedPath || d.fileName}</span>
                <span className={`text-xs ${
                  d.status === 'imported' ? 'text-green-400' :
                  d.status === 'overwritten' ? 'text-yellow-400' :
                  d.status === 'failed' ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}