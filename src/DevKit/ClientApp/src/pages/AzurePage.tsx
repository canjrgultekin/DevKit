import { useEffect, useState } from 'react'
import {
  Cloud, LogIn, Rocket, RefreshCw, ScrollText, Settings2,
  Loader2, CheckCircle2, XCircle, Terminal, ShieldCheck,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { azureApi, profileApi } from '../api'
import type { AzureCommandResult } from '../types'

interface ResourceInfo {
  name: string
  type: string
  slot: string
  projectPath: string
  envVarCount: number
}

interface DeployStep {
  name: string
  success: boolean
  output: string
  duration: string
}

interface DeployResult extends AzureCommandResult {
  steps?: DeployStep[]
}

export default function AzurePage() {
  const [resources, setResources] = useState<ResourceInfo[]>([])
  const [resourceGroup, setResourceGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<DeployResult | null>(null)
  const [selectedResource, setSelectedResource] = useState<string>('')
  const [showManualDeploy, setShowManualDeploy] = useState(false)
  const [manualZipPath, setManualZipPath] = useState('')
  const [envKey, setEnvKey] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [hasProfile, setHasProfile] = useState(false)

  useEffect(() => {
    loadResources()
  }, [])

  const loadResources = async () => {
    setLoading(true)
    try {
      const activeData = await profileApi.getActive()
      if (!activeData.profile?.azure) {
        setHasProfile(false)
        setLoading(false)
        return
      }
      setHasProfile(true)

      const data = await azureApi.getResources()
      setResources(data.resources || [])
      setResourceGroup(data.resourceGroup || '')
      if (data.resources?.length > 0) {
        setSelectedResource(data.resources[0].name)
      }
    } catch {
      setHasProfile(false)
    } finally {
      setLoading(false)
    }
  }

  const runAction = async (action: string, fn: () => Promise<DeployResult>) => {
    setActionLoading(action)
    setLastResult(null)
    try {
      const result = await fn()
      setLastResult(result)
    } catch (e) {
      setLastResult({
        success: false,
        output: '',
        error: e instanceof Error ? e.message : 'Action failed',
        exitCode: -1,
        command: action,
      })
    } finally {
      setActionLoading(null)
    }
  }

  const handleLogin = () => runAction('login', () => azureApi.login())
  const handleVerifyLogin = () => runAction('verify', () => azureApi.verifyLogin())

  const handleDeploy = () => {
    if (!selectedResource) return
    runAction('deploy', () =>
      azureApi.deploy(selectedResource, showManualDeploy ? manualZipPath : '', undefined)
    )
  }

  const handleRestart = () => {
    if (!selectedResource) return
    runAction('restart', () => azureApi.restart(selectedResource))
  }
  const handleGetLogs = () => {
    if (!selectedResource) return
    runAction('logs', () => azureApi.getLogs(selectedResource, 100))
  }
  const handleGetEnv = () => {
    if (!selectedResource) return
    runAction('getEnv', () => azureApi.getEnv(selectedResource))
  }
  const handleSetEnv = () => {
    if (!selectedResource || !envKey) return
    runAction('setEnv', () => azureApi.setEnv(selectedResource, { [envKey]: envValue }))
  }
  const handleCustomCommand = () => {
    if (!customCommand) return
    const parts = customCommand.split(' ')
    const cmd = parts[0]
    const args = parts.slice(1).join(' ')
    runAction('command', () => azureApi.executeCommand(cmd, args))
  }

  const selectedRes = resources.find(r => r.name === selectedResource)

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    )
  }

  if (!hasProfile) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3 mb-6">
          <Cloud className="w-6 h-6 text-sky-400" />
          Azure Management
        </h1>
        <div className="card text-center py-12">
          <Cloud className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No Azure configuration found</p>
          <p className="text-sm text-gray-500">Configure Azure settings in your profile first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Cloud className="w-6 h-6 text-sky-400" />
            Azure Management
          </h1>
          <p className="text-gray-400 mt-1">
            Resource Group: <span className="font-mono text-gray-300">{resourceGroup}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleLogin} disabled={actionLoading !== null} className="btn-primary flex items-center gap-2">
            {actionLoading === 'login' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Azure Login
          </button>
          <button onClick={handleVerifyLogin} disabled={actionLoading !== null} className="btn-secondary flex items-center gap-2">
            {actionLoading === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Verify Login
          </button>
        </div>
      </div>

      {resources.length > 0 && (
        <div className="card mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Target Resource</label>
          <select
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            className="input-field"
          >
            {resources.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name} ({r.type}) {r.slot !== 'production' ? `[${r.slot}]` : ''}
              </option>
            ))}
          </select>
          {selectedRes && (
            <p className="text-xs text-gray-500 mt-2">
              Project: <span className="font-mono text-gray-400">{selectedRes.projectPath}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
            <Rocket className="w-4 h-4 text-emerald-400" />
            Deploy
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Build, publish, zip and deploy automatically
          </p>
          <button
            onClick={handleDeploy}
            disabled={actionLoading !== null}
            className="btn-primary text-sm w-full mb-2"
          >
            {actionLoading === 'deploy' ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Deploying...
              </span>
            ) : (
              `Deploy ${selectedResource || ''}`
            )}
          </button>
          <button
            onClick={() => setShowManualDeploy(!showManualDeploy)}
            className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors"
          >
            {showManualDeploy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Manual zip deploy
          </button>
          {showManualDeploy && (
            <input
              type="text"
              value={manualZipPath}
              onChange={(e) => setManualZipPath(e.target.value)}
              placeholder="Optional: path to existing .zip"
              className="input-field text-xs font-mono mt-2"
            />
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            Restart
          </h3>
          <p className="text-xs text-gray-500 mb-3">Restart the selected Azure resource</p>
          <button onClick={handleRestart} disabled={actionLoading !== null} className="btn-secondary text-sm w-full">
            {actionLoading === 'restart' ? 'Restarting...' : 'Restart Service'}
          </button>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
            <Settings2 className="w-4 h-4 text-violet-400" />
            Environment Variables
          </h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={envKey}
              onChange={(e) => setEnvKey(e.target.value)}
              placeholder="Key"
              className="input-field text-sm flex-1"
            />
            <input
              type="text"
              value={envValue}
              onChange={(e) => setEnvValue(e.target.value)}
              placeholder="Value"
              className="input-field text-sm flex-1"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSetEnv} disabled={actionLoading !== null || !envKey} className="btn-primary text-sm flex-1">
              Set
            </button>
            <button onClick={handleGetEnv} disabled={actionLoading !== null} className="btn-secondary text-sm flex-1">
              List All
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
            <ScrollText className="w-4 h-4 text-sky-400" />
            Logs
          </h3>
          <p className="text-xs text-gray-500 mb-3">View recent logs from the resource</p>
          <button onClick={handleGetLogs} disabled={actionLoading !== null} className="btn-secondary text-sm w-full">
            {actionLoading === 'logs' ? 'Fetching...' : 'View Logs'}
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          Custom Command
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomCommand()}
            placeholder="az webapp list --resource-group rg-myproject"
            className="input-field text-sm font-mono flex-1"
          />
          <button onClick={handleCustomCommand} disabled={actionLoading !== null || !customCommand} className="btn-primary text-sm">
            Run
          </button>
        </div>
      </div>

      {lastResult && (
        <div className={`card ${lastResult.success ? 'border-green-800' : 'border-red-800'}`}>
          <div className="flex items-center gap-2 mb-3">
            {lastResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs font-mono text-gray-500">{lastResult.command}</span>
            <span className={`text-xs ${lastResult.success ? 'text-green-400' : 'text-red-400'}`}>
              exit: {lastResult.exitCode}
            </span>
          </div>

          {lastResult.steps && lastResult.steps.length > 0 && (
            <div className="mb-3 space-y-2">
              {lastResult.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {step.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  )}
                  <span className="text-gray-300">{step.name}</span>
                  <span className="text-gray-600 text-xs">{step.duration}</span>
                  {!step.success && step.output && (
                    <span className="text-red-400 text-xs truncate">{step.output}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <pre className="bg-gray-950 rounded-lg p-4 text-xs font-mono text-gray-300 overflow-auto max-h-80 whitespace-pre-wrap">
            {lastResult.output || lastResult.error || 'No output'}
          </pre>
        </div>
      )}
    </div>
  )
}