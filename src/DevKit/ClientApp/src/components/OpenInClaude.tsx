import { useState } from 'react'
import { ExternalLink, Copy, Loader2, CheckCircle2 } from 'lucide-react'

interface OpenInClaudeProps {
  contextData: string
  contextType: string
  clipboardPrompt?: string
  label?: string
  className?: string
}

const CLAUDE_DESKTOP_URL = 'claude://'

async function saveContext(content: string, type: string): Promise<boolean> {
  try {
    const res = await fetch('/api/system/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type }),
    })
    const data = await res.json()
    return data.success === true
  } catch { return false }
}

function openClaudeDesktop() {
  window.open(CLAUDE_DESKTOP_URL, '_blank')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { return false }
}

export default function OpenInClaude({ contextData, contextType, clipboardPrompt, label, className }: OpenInClaudeProps) {
  const [mode, setMode] = useState<'idle' | 'choosing' | 'loading' | 'done'>('idle')
  const [message, setMessage] = useState('')

  const sizeKb = (contextData.length / 1024).toFixed(1)
  const isLarge = contextData.length > 8000

  const defaultPrompt = clipboardPrompt ||
    `DevKit context'ini yukle ve incele. Tip: ${contextType}`

  const handleBridge = async () => {
    setMode('loading')
    const saved = await saveContext(contextData, contextType)
    if (!saved) {
      setMessage('Context kaydedilemedi. DevKit backend calisiyor mu?')
      setMode('idle')
      return
    }

    await copyToClipboard(`DevKit'ten gelen ${contextType} context'ini yukle ve incele.`)
    setMessage('Context kaydedildi, prompt kopyalandi. Claude Desktop\'ta Ctrl+V yapip Enter\'a basin.')
    setMode('done')
    openClaudeDesktop()
    setTimeout(() => { setMode('idle'); setMessage('') }, 5000)
  }

  const handleClipboard = async () => {
    setMode('loading')
    const fullText = `${defaultPrompt}\n\n${contextData}`
    const copied = await copyToClipboard(fullText)
    if (!copied) {
      setMessage('Clipboard\'a kopyalanamadi.')
      setMode('idle')
      return
    }
    setMessage('Tum veri clipboard\'a kopyalandi. Claude Desktop\'ta Ctrl+V yapin.')
    setMode('done')
    openClaudeDesktop()
    setTimeout(() => { setMode('idle'); setMessage('') }, 5000)
  }

  if (mode === 'idle') {
    return (
      <div className={`relative inline-block ${className || ''}`}>
        <button onClick={() => setMode('choosing')}
          className="btn-secondary flex items-center gap-2 text-sm">
          <ExternalLink className="w-4 h-4" />
          {label || "Claude'da Ac"}
        </button>
      </div>
    )
  }

  if (mode === 'choosing') {
    return (
      <div className={`inline-flex flex-col gap-2 ${className || ''}`}>
        <div className="flex items-center gap-2">
          <button onClick={handleBridge}
            className="btn-primary flex items-center gap-2 text-xs">
            <ExternalLink className="w-3.5 h-3.5" />
            MCP Bridge ({sizeKb}KB)
          </button>
          {!isLarge && (
            <button onClick={handleClipboard}
              className="btn-secondary flex items-center gap-2 text-xs">
              <Copy className="w-3.5 h-3.5" />
              Clipboard
            </button>
          )}
          <button onClick={() => setMode('idle')}
            className="text-gray-500 hover:text-gray-300 text-xs px-2">
            Vazgec
          </button>
        </div>
        {isLarge && (
          <p className="text-xs text-amber-400">Veri buyuk ({sizeKb}KB), MCP Bridge onerilir.</p>
        )}
      </div>
    )
  }

  if (mode === 'loading') {
    return (
      <div className={`inline-flex items-center gap-2 text-sm text-gray-400 ${className || ''}`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Hazirlaniyor...
      </div>
    )
  }

  // done
  return (
    <div className={`inline-flex items-center gap-2 text-sm text-green-400 ${className || ''}`}>
      <CheckCircle2 className="w-4 h-4" /> {message}
    </div>
  )
}