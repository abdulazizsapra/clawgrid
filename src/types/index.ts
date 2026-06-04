export type InstanceStatus = 'online' | 'offline' | 'degraded' | 'unknown'

export interface OpenClawInstance {
  id: string
  name: string
  role: string
  gatewayUrl: string
  token: string
  sshHost: string
  sshPort?: number
  sshJumpHost?: string
  sshUser: string
  sshKeyPath: string
  workspacePath: string
  status: InstanceStatus
  version?: string
  lastSeen?: string
}

export interface InstanceRegistry {
  instances: OpenClawInstance[]
}

export interface GatewayHealth {
  instanceId: string
  status: InstanceStatus
  version?: string
  uptime?: number
  memoryMb?: number
  activeChats?: number
  error?: string
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  lastRun?: string
  nextRun?: string
  status: 'active' | 'paused' | 'error'
  lastError?: string
}

export interface AgentNode {
  id: string
  name: string
  role: string
  parentId?: string
  soulPath?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}
