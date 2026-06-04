import fs from 'fs'
import path from 'path'
import type { OpenClawInstance, InstanceRegistry } from '@/types'

const REGISTRY_PATH = path.join(process.cwd(), 'data', 'instances.json')

const DEFAULT_REGISTRY: InstanceRegistry = {
  instances: [
    {
      id: 'vm-openclaw',
      name: 'Command',
      role: 'command',
      gatewayUrl: 'http://localhost:4000',
      token: '',
      sshHost: '10.0.0.10',
      sshUser: 'openclaw',
      sshKeyPath: '/root/.ssh/id_ed25519',
      workspacePath: '/mnt/openclaw-command',
      status: 'unknown',
    },
    {
      id: 'vm-tasks',
      name: 'Supply',
      role: 'supply',
      gatewayUrl: 'http://localhost:4001',
      token: '',
      sshHost: '10.0.0.11',
      sshUser: 'openclaw',
      sshKeyPath: '/root/.ssh/id_ed25519',
      workspacePath: '/mnt/openclaw-supply',
      status: 'unknown',
    },
    {
      id: 'vm-voice',
      name: 'Voice',
      role: 'voice',
      gatewayUrl: 'http://localhost:4002',
      token: '',
      sshHost: '10.0.0.12',
      sshUser: 'openclaw',
      sshKeyPath: '/root/.ssh/id_ed25519',
      workspacePath: '/mnt/openclaw-voice',
      status: 'unknown',
    },
  ],
}

function ensureRegistry(): InstanceRegistry {
  if (!fs.existsSync(path.dirname(REGISTRY_PATH))) {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true })
  }
  if (!fs.existsSync(REGISTRY_PATH)) {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2))
    return DEFAULT_REGISTRY
  }
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
}

export function getRegistry(): InstanceRegistry {
  return ensureRegistry()
}

export function getInstance(id: string): OpenClawInstance | undefined {
  return getRegistry().instances.find(i => i.id === id)
}

export function saveRegistry(registry: InstanceRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2))
}

export function upsertInstance(instance: OpenClawInstance): void {
  const registry = getRegistry()
  const idx = registry.instances.findIndex(i => i.id === instance.id)
  if (idx >= 0) registry.instances[idx] = instance
  else registry.instances.push(instance)
  saveRegistry(registry)
}

export function deleteInstance(id: string): void {
  const registry = getRegistry()
  registry.instances = registry.instances.filter(i => i.id !== id)
  saveRegistry(registry)
}
