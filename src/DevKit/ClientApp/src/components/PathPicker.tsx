import { useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'

interface PathPickerProps {
  value: string
  onChange: (path: string) => void
  placeholder?: string
  label?: string
  hint?: string
  mode?: 'folder' | 'file'
  fileFilter?: string
  disabled?: boolean
}

export default function PathPicker({
  value,
  onChange,
  placeholder = 'Select path...',
  label,
  hint,
  mode = 'folder',
  fileFilter,
  disabled = false,
}: PathPickerProps) {
  const [browsing, setBrowsing] = useState(false)

  const handleBrowse = async () => {
    setBrowsing(true)
    try {
      const endpoint = mode === 'folder' ? '/api/system/browse-folder' : '/api/system/browse-file'
      const body = mode === 'folder'
        ? { initialPath: value || undefined }
        : { initialPath: value || undefined, filter: fileFilter }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.selected && data.path) {
        onChange(data.path)
      }
    } catch {
      // Dialog iptal edildi veya hata oluştu
    } finally {
      setBrowsing(false)
    }
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field font-mono flex-1"
          disabled={disabled}
        />
        <button
          onClick={handleBrowse}
          disabled={browsing || disabled}
          className="btn-secondary flex items-center gap-1.5 px-3 whitespace-nowrap"
          title={mode === 'folder' ? 'Browse folder' : 'Browse file'}
        >
          {browsing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderOpen className="w-4 h-4" />
          )}
          Browse
        </button>
      </div>
      {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
    </div>
  )
}