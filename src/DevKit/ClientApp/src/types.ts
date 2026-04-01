export interface DevKitConfig {
  activeProfile: string
  profiles: Record<string, DevKitProfile>
}

export interface DevKitProfile {
  name: string
  workspace: string
  framework: string
  azure?: AzureConfig
}

export interface AzureConfig {
  tenantId: string
  subscriptionId: string
  resourceGroup: string
  resources: AzureResource[]
}

export interface AzureResource {
  name: string
  type: string
  slot: string
  projectPath: string
  deployMode: string
  webJobName: string
  webJobHostApp: string
  deployScript: string
  deployOutputPath: string
  deployClean: boolean
  environmentVariables: Record<string, string>
}

export interface ProjectManifest {
  solution: string
  framework: string
  outputPath: string
  projects: ProjectDefinition[]
  globalFiles: GlobalFileDefinition[]
}

export interface ProjectDefinition {
  name: string
  path: string
  type: string
  targetFramework: string
  folders: string[]
  files: FileDefinition[]
  dependencies: DependencyDefinition[]
  projectReferences: string[]
  scripts: Record<string, string>
  npmDependencies: Record<string, string>
  npmDevDependencies: Record<string, string>
}

export interface FileDefinition {
  path: string
  content?: string
}

export interface DependencyDefinition {
  package: string
  version: string
}

export interface GlobalFileDefinition {
  path: string
  content: string
}

export interface ScaffoldResponse {
  success: boolean
  outputPath: string
  createdFiles: string[]
  createdFolders: string[]
  errors: string[]
}

export interface FileImportResult {
  success: boolean
  totalFiles: number
  importedFiles: number
  overwrittenFiles: number
  failedFiles: number
  details: FileImportDetail[]
}

export interface FileImportDetail {
  fileName: string
  detectedPath: string
  targetFullPath: string
  status: string
  error?: string
}

export interface FilePreview {
  fileName: string
  hasMarker: boolean
  detectedPath: string
  commentStyle: string
  contentPreview: string
}

export interface AzureCommandResult {
  success: boolean
  output: string
  error: string
  exitCode: number
  command: string
  steps?: DeployStep[]
}

export interface DeployStep {
  name: string
  success: boolean
  output: string
  duration: string
}