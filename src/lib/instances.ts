import fs from 'fs'
import path from 'path'
import type { OpenClawInstance, InstanceRegistry } from '@/types'

const REGISTRY_PATH = path.join(process.cwd(), 'data', 'instances.json')

// Default registry — replace with your actual instances via the UI or data/instances.json
const DEFAULT_REGISTRY: InstanceRegistry = {
  instances: [
    {
      id: 'my-agent',
      name: 'My Agent',
      role: 'command',
      gatewayUrl: 'http://localhost:4000',
      token: '',
      sshHost: '10.0.0.1',
      sshUser: 'openclaw',
      sshKeyPath: '~/.ssh/id_ed25519',
      workspacePath: '/home/openclaw/.openclaw',
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
