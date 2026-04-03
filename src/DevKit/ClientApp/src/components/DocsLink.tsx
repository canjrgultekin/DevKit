import { BookOpen } from 'lucide-react'

// UI sayfa yolu → docs.html sayfa ID eslesmesi
const PAGE_DOCS_MAP: Record<string, string> = {
  '/': 'welcome',
  '/architect': 'feat-architect',
  '/scaffold': 'feat-scaffold',
  '/import': 'feat-import',
  '/scan': 'feat-scanner',
  '/git': 'feat-git',
  '/docker': 'feat-docker',
  '/schema': 'feat-schema',
  '/apitest': 'feat-apitest',
  '/audit': 'feat-audit',
  '/envcompare': 'feat-env',
  '/logs': 'feat-logs',
  '/migrations': 'feat-migration',
  '/crypto': 'feat-crypto',
  '/azure': 'feat-azure',
  '/profile': 'feat-profiles',
}

interface DocsLinkProps {
  page?: string        // docs.html sayfa ID (orn: 'feat-git')
  className?: string
  label?: string
  iconOnly?: boolean
}

export default function DocsLink({ page, className, label, iconOnly }: DocsLinkProps) {
  // page verilmemisse pathname'den otomatik bul
  const docsPage = page || PAGE_DOCS_MAP[window.location.pathname] || 'welcome'
  const href = `/docs.html#${docsPage}`

  if (iconOnly) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title="Dokumantasyon"
        className={`text-gray-500 hover:text-brand-400 transition-colors ${className || ''}`}>
        <BookOpen className="w-4 h-4" />
      </a>
    )
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-400 transition-colors ${className || ''}`}>
      <BookOpen className="w-3.5 h-3.5" />
      {label || 'Dokumantasyon'}
    </a>
  )
}

export { PAGE_DOCS_MAP }