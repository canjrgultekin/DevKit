import type {
  DevKitConfig,
  DevKitProfile,
  ScaffoldResponse,
  ProjectManifest,
  FileImportResult,
  FilePreview,
  AzureCommandResult,
} from './types'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data as T
}

// Profile
export const profileApi = {
  getAll: () => request<DevKitConfig>('/profile'),
  getActive: () => request<{ activeProfile: string | null; profile: DevKitProfile | null }>('/profile/active'),
  get: (key: string) => request<DevKitProfile>(`/profile/${key}`),
  save: (key: string, profile: DevKitProfile) =>
    request<{ success: boolean }>(`/profile/${key}`, { method: 'POST', body: JSON.stringify(profile) }),
  setActive: (key: string) =>
    request<{ success: boolean }>(`/profile/active/${key}`, { method: 'PUT' }),
  delete: (key: string) =>
    request<{ success: boolean }>(`/profile/${key}`, { method: 'DELETE' }),
}

// Scaffolding
export const scaffoldApi = {
  scaffold: (manifest: ProjectManifest) =>
    request<ScaffoldResponse>('/scaffolding', { method: 'POST', body: JSON.stringify({ manifest }) }),
  getFrameworks: () => request<{ frameworks: string[] }>('/scaffolding/frameworks'),
  validate: (manifest: ProjectManifest) =>
    request<{ valid: boolean; errors?: string[] }>('/scaffolding/validate', {
      method: 'POST',
      body: JSON.stringify(manifest),
    }),
}

// File Import
export const fileImportApi = {
  importFiles: async (files: File[], projectRoot?: string): Promise<FileImportResult> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    if (projectRoot) formData.append('projectRoot', projectRoot)

    const res = await fetch(`${BASE}/fileimport/import`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Import failed')
    return data as FileImportResult
  },

  preview: async (files: File[]): Promise<{ files: FilePreview[] }> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))

    const res = await fetch(`${BASE}/fileimport/preview`, { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Preview failed')
    return data as { files: FilePreview[] }
  },
}

// Azure
export const azureApi = {
  login: (profileKey?: string) =>
    request<AzureCommandResult>('/azure/login', {
      method: 'POST',
      body: JSON.stringify({ profileKey }),
    }),
  verifyLogin: (profileKey?: string) =>
    request<AzureCommandResult>('/azure/verify-login', {
      method: 'POST',
      body: JSON.stringify({ profileKey }),
    }),
  deploy: (resourceName: string, publishPath?: string, profileKey?: string) =>
    request<AzureCommandResult>(`/azure/deploy/${resourceName}`, {
      method: 'POST',
      body: JSON.stringify({ publishPath: publishPath || '', profileKey }),
    }),
  setEnv: (resourceName: string, variables: Record<string, string>, profileKey?: string) =>
    request<AzureCommandResult>(`/azure/env/${resourceName}`, {
      method: 'POST',
      body: JSON.stringify({ variables, profileKey }),
    }),
  getEnv: (resourceName: string, profileKey?: string) =>
    request<AzureCommandResult>(`/azure/env/${resourceName}?profileKey=${profileKey || ''}`),
  restart: (resourceName: string, profileKey?: string) =>
    request<AzureCommandResult>(`/azure/restart/${resourceName}?profileKey=${profileKey || ''}`, { method: 'POST' }),
  getLogs: (resourceName: string, lines = 100, profileKey?: string) =>
    request<AzureCommandResult>(`/azure/logs/${resourceName}?profileKey=${profileKey || ''}&lines=${lines}`),
  getResources: (profileKey?: string) =>
    request<{ resourceGroup: string; subscriptionId: string; resources: AzureResource[] }>(
      `/azure/resources?profileKey=${profileKey || ''}`
    ),
  executeCommand: (command: string, args?: string) =>
    request<AzureCommandResult>('/azure/command', {
      method: 'POST',
      body: JSON.stringify({ command, arguments: args }),
    }),
}

interface AzureResource {
  name: string
  type: string
  slot: string
  projectPath: string
  envVarCount: number
}