import { Client } from 'ssh2'
import fs from 'fs'
import net from 'net'
import type { OpenClawInstance } from '@/types'

export interface SshResult {
  stdout: string
  stderr: string
  code: number
}

function readKey(keyPath: string): Buffer {
  return fs.readFileSync(keyPath)
}

function execOnClient(conn: Client, command: string): Promise<SshResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    conn.exec(command, (err, stream) => {
      if (err) return reject(err)
      stream.on('close', (code: number) => resolve({ stdout, stderr, code }))
      stream.on('data', (d: Buffer) => { stdout += d.toString() })
      stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    })
  })
}

// Direct SSH (no jump host)
function directExec(instance: OpenClawInstance, command: string): Promise<SshResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    conn.on('ready', async () => {
      try { resolve(await execOnClient(conn, command)) }
      catch (e) { reject(e) }
      finally { conn.end() }
    })
    conn.on('error', reject)
    conn.connect({
      host: instance.sshHost,
      port: instance.sshPort ?? 22,
      username: instance.sshUser,
      privateKey: readKey(instance.sshKeyPath),
      readyTimeout: 12000,
    })
  })
}

// Two-hop SSH: Mac → jumpHost → target VM
function jumpExec(instance: OpenClawInstance, command: string): Promise<SshResult> {
  const jumpHost = instance.sshJumpHost! // "user@host" or "user@host:port"
  const [jumpUserHost, jumpPortStr] = jumpHost.includes(':')
    ? jumpHost.split(':') : [jumpHost, '22']
  const jumpPort = parseInt(jumpPortStr, 10)
  const [jumpUser, jumpHostname] = jumpUserHost.split('@')
  const keyData = readKey(instance.sshKeyPath)

  return new Promise((resolve, reject) => {
    const jump = new Client()

    jump.on('ready', () => {
      // Open a channel through the jump host to the target
      jump.forwardOut(
        '127.0.0.1', 0,
        instance.sshHost, instance.sshPort ?? 22,
        (err, stream) => {
          if (err) { jump.end(); return reject(err) }

          const target = new Client()
          target.on('ready', async () => {
            try { resolve(await execOnClient(target, command)) }
            catch (e) { reject(e) }
            finally { target.end(); jump.end() }
          })
          target.on('error', (e) => { jump.end(); reject(e) })
          target.connect({
            sock: stream,
            username: instance.sshUser,
            privateKey: keyData,
            readyTimeout: 12000,
          })
        }
      )
    })
    jump.on('error', reject)
    jump.connect({
      host: jumpHostname,
      port: jumpPort,
      username: jumpUser,
      privateKey: keyData,
      readyTimeout: 12000,
    })
  })
}

export function runSshCommand(instance: OpenClawInstance, command: string): Promise<SshResult> {
  if (instance.sshJumpHost) return jumpExec(instance, command)
  return directExec(instance, command)
}

export async function restartGateway(instance: OpenClawInstance): Promise<SshResult> {
  return runSshCommand(
    instance,
    'sudo systemctl restart openclaw 2>/dev/null || (pkill -f "openclaw.*gateway" ; sleep 2 ; nohup openclaw gateway --port 18789 >> ~/gateway.log 2>&1 &)'
  )
}

export async function getGatewayLogs(instance: OpenClawInstance, lines = 100): Promise<string> {
  const result = await runSshCommand(
    instance,
    `tail -n ${lines} "${instance.workspacePath}/gateway.log" 2>/dev/null || tail -n ${lines} ~/gateway.log 2>/dev/null || journalctl -u openclaw -n ${lines} --no-pager 2>/dev/null || echo "no logs found"`
  )
  return result.stdout
}

export async function getSystemStats(instance: OpenClawInstance): Promise<string> {
  const result = await runSshCommand(
    instance,
    'uptime && echo "---" && free -m && echo "---" && df -h / && echo "---" && ps aux --sort=-%cpu | head -10'
  )
  return result.stdout
}
