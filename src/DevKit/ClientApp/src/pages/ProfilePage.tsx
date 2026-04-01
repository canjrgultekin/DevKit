import { useEffect, useState } from 'react'
import {
  Settings, Plus, Trash2, CheckCircle2, Edit3,
  Save, X, Loader2, Star,
} from 'lucide-react'
import { profileApi } from '../api'
import type { DevKitProfile, AzureResource } from '../types'
import PathPicker from '../components/PathPicker'

const EMPTY_PROFILE: DevKitProfile = {
  name: '',
  workspace: '',
  framework: 'dotnet',
  azure: {
    tenantId: '',
    subscriptionId: '',
    resourceGroup: '',
    resources: [],
  },
}

const EMPTY_RESOURCE: AzureResource = {
  name: '',
  type: 'appservice',
  slot: 'production',
  projectPath: '',
  deployMode: 'appservice',
  webJobName: '',
  webJobHostApp: '',
  deployScript: '',
  deployOutputPath: '',
  deployClean: false,
  environmentVariables: {},
}

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<Record<string, DevKitProfile>>({})
  const [activeKey, setActiveKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DevKitProfile>(EMPTY_PROFILE)
  const [newKey, setNewKey] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadProfiles = async () => {
    setLoading(true)
    try {
      const data = await profileApi.getAll()
      setProfiles(data.profiles || {})
      setActiveKey(data.activeProfile || '')
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadProfiles() }, [])

  const startEdit = (key: string) => {
    setEditing(key)
    setNewKey(key)
    setEditForm(JSON.parse(JSON.stringify(profiles[key])))
    setIsNew(false)
  }

  const startNew = () => {
    setEditing('__new__')
    setNewKey('')
    setEditForm(JSON.parse(JSON.stringify(EMPTY_PROFILE)))
    setIsNew(true)
  }

  const cancelEdit = () => { setEditing(null); setIsNew(false) }

  const saveProfile = async () => {
    if (!newKey.trim() || !editForm.name.trim()) return
    setSaving(true)
    try {
      await profileApi.save(newKey, editForm)
      await loadProfiles()
      setEditing(null); setIsNew(false)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const deleteProfile = async (key: string) => {
    if (!confirm(`Delete profile "${key}"?`)) return
    await profileApi.delete(key)
    await loadProfiles()
    if (editing === key) cancelEdit()
  }

  const setActive = async (key: string) => {
    await profileApi.setActive(key)
    setActiveKey(key)
  }

  const addResource = () => {
    if (!editForm.azure) return
    setEditForm({
      ...editForm,
      azure: { ...editForm.azure, resources: [...editForm.azure.resources, { ...EMPTY_RESOURCE }] },
    })
  }

  const updateResource = (index: number, field: string, value: string | boolean) => {
    if (!editForm.azure) return
    const resources = [...editForm.azure.resources]
    resources[index] = { ...resources[index], [field]: value }
    setEditForm({ ...editForm, azure: { ...editForm.azure, resources } })
  }

  const removeResource = (index: number) => {
    if (!editForm.azure) return
    setEditForm({
      ...editForm,
      azure: { ...editForm.azure, resources: editForm.azure.resources.filter((_, i) => i !== index) },
    })
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-amber-400" />Profiles
          </h1>
          <p className="text-gray-400 mt-1">Manage project configurations and Azure settings</p>
        </div>
        <button onClick={startNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />New Profile
        </button>
      </div>

      {Object.keys(profiles).length === 0 && !isNew && (
        <div className="card text-center py-12">
          <Settings className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No profiles configured</p>
          <button onClick={startNew} className="btn-primary mt-2">Create First Profile</button>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(profiles).map(([key, profile]) => (
          <div key={key} className={`card ${activeKey === key ? 'border-brand-600' : ''}`}>
            {editing === key ? (
              <ProfileForm form={editForm} setForm={setEditForm} profileKey={newKey} setProfileKey={setNewKey}
                isNew={false} onSave={saveProfile} onCancel={cancelEdit} saving={saving}
                onAddResource={addResource} onUpdateResource={updateResource} onRemoveResource={removeResource} />
            ) : (
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {activeKey === key && <Star className="w-4 h-4 text-brand-400 fill-brand-400" />}
                    <h3 className="font-semibold text-white">{profile.name}</h3>
                    <span className="badge-info">{profile.framework}</span>
                  </div>
                  <p className="text-sm text-gray-500 font-mono">{profile.workspace || 'No workspace set'}</p>
                  {profile.azure && (
                    <p className="text-xs text-gray-600 mt-1">
                      Azure: {profile.azure.resourceGroup} ({profile.azure.resources?.length || 0} resources)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeKey !== key && (
                    <button onClick={() => setActive(key)} className="btn-secondary text-xs"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => startEdit(key)} className="btn-secondary text-xs"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteProfile(key)} className="btn-danger text-xs"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {isNew && (
          <div className="card border-brand-600">
            <ProfileForm form={editForm} setForm={setEditForm} profileKey={newKey} setProfileKey={setNewKey}
              isNew={true} onSave={saveProfile} onCancel={cancelEdit} saving={saving}
              onAddResource={addResource} onUpdateResource={updateResource} onRemoveResource={removeResource} />
          </div>
        )}
      </div>
    </div>
  )
}

interface ProfileFormProps {
  form: DevKitProfile
  setForm: (p: DevKitProfile) => void
  profileKey: string
  setProfileKey: (k: string) => void
  isNew: boolean
  onSave: () => void
  onCancel: () => void
  saving: boolean
  onAddResource: () => void
  onUpdateResource: (i: number, f: string, v: string | boolean) => void
  onRemoveResource: (i: number) => void
}

function ProfileForm({
  form, setForm, profileKey, setProfileKey, isNew,
  onSave, onCancel, saving,
  onAddResource, onUpdateResource, onRemoveResource,
}: ProfileFormProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-white">{isNew ? 'New Profile' : 'Edit Profile'}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Profile Key</label>
          <input value={profileKey} onChange={(e) => setProfileKey(e.target.value)}
            placeholder="my-backend" className="input-field text-sm" disabled={!isNew} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="My Project Backend" className="input-field text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Workspace Path</label>
          <PathPicker
            value={form.workspace}
            onChange={(v) => setForm({ ...form, workspace: v })}
            placeholder="C:\source\myproject"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Framework</label>
          <select value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })} className="input-field text-sm">
            <option value="dotnet">.NET</option>
            <option value="nextjs">Next.js</option>
            <option value="nodejs">Node.js</option>
            <option value="python">Python</option>
          </select>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Azure Configuration</h4>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tenant ID</label>
            <input value={form.azure?.tenantId || ''}
              onChange={(e) => setForm({ ...form, azure: { ...(form.azure || { tenantId: '', subscriptionId: '', resourceGroup: '', resources: [] }), tenantId: e.target.value } })}
              className="input-field text-sm font-mono" placeholder="optional" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Subscription ID</label>
            <input value={form.azure?.subscriptionId || ''}
              onChange={(e) => setForm({ ...form, azure: { ...(form.azure || { tenantId: '', subscriptionId: '', resourceGroup: '', resources: [] }), subscriptionId: e.target.value } })}
              className="input-field text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Resource Group</label>
            <input value={form.azure?.resourceGroup || ''}
              onChange={(e) => setForm({ ...form, azure: { ...(form.azure || { tenantId: '', subscriptionId: '', resourceGroup: '', resources: [] }), resourceGroup: e.target.value } })}
              className="input-field text-sm font-mono" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Resources ({form.azure?.resources?.length || 0})</span>
            <button onClick={onAddResource} className="btn-secondary text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Add Resource</button>
          </div>

          {form.azure?.resources?.map((res, i) => {
            const isWebJob = res.deployMode?.startsWith('webjob')
            const isCustom = res.deployMode === 'custom-script'
            return (
              <div key={i} className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name</label>
                    <input value={res.name} onChange={(e) => onUpdateResource(i, 'name', e.target.value)}
                      placeholder="app-myproject-api" className="input-field text-xs font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Type</label>
                    <select value={res.type} onChange={(e) => onUpdateResource(i, 'type', e.target.value)} className="input-field text-xs">
                      <option value="appservice">App Service</option>
                      <option value="functionapp">Function App</option>
                      <option value="containerapp">Container App</option>
                      <option value="staticwebapp">Static Web App</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Project Path</label>
                    <input value={res.projectPath} onChange={(e) => onUpdateResource(i, 'projectPath', e.target.value)}
                      placeholder="src/MyApp.Api" className="input-field text-xs font-mono" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => onRemoveResource(i)} className="btn-danger text-xs w-full"><Trash2 className="w-3 h-3 mx-auto" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Deploy Mode</label>
                    <select value={res.deployMode || 'appservice'}
                      onChange={(e) => onUpdateResource(i, 'deployMode', e.target.value)} className="input-field text-xs">
                      <option value="appservice">App Service (auto build)</option>
                      <option value="custom-script">Custom Script</option>
                      <option value="webjob-continuous">WebJob (continuous)</option>
                      <option value="webjob-triggered">WebJob (triggered)</option>
                    </select>
                  </div>

                  {isWebJob && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">WebJob Name</label>
                        <input value={res.webJobName || ''} onChange={(e) => onUpdateResource(i, 'webJobName', e.target.value)}
                          placeholder="my-worker" className="input-field text-xs font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Host App Service</label>
                        <input value={res.webJobHostApp || ''} onChange={(e) => onUpdateResource(i, 'webJobHostApp', e.target.value)}
                          placeholder="app-myproject-api" className="input-field text-xs font-mono" />
                      </div>
                    </>
                  )}

                  {isCustom && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Deploy Script</label>
                        <input value={res.deployScript || ''} onChange={(e) => onUpdateResource(i, 'deployScript', e.target.value)}
                          placeholder="deploy.ps1" className="input-field text-xs font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Output Path</label>
                        <input value={res.deployOutputPath || ''} onChange={(e) => onUpdateResource(i, 'deployOutputPath', e.target.value)}
                          placeholder=".next/standalone" className="input-field text-xs font-mono" />
                      </div>
                    </>
                  )}

                  {(isCustom || isWebJob) && (
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs text-gray-400 pb-2 cursor-pointer">
                        <input type="checkbox" checked={res.deployClean || false}
                          onChange={(e) => onUpdateResource(i, 'deployClean', e.target.checked)}
                          className="rounded border-gray-600" />
                        Clean deploy
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onSave} disabled={saving || !profileKey.trim()} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
        </button>
        <button onClick={onCancel} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" />Cancel</button>
      </div>
    </div>
  )
}