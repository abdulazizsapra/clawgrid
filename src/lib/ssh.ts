import { Client } from 'ssh2'
import fs from 'fs'
import type { OpenClawInstance } from '@/types'

export interface SshResult {
  stdout: string
  stderr: string
  code: number
}

export function runSshCommand(instance: OpenClawInstance, command: string): Promise<SshResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let stdout = ''
    let stderr = ''

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); return reject(err) }
        stream.on('close', (code: number) => {
          conn.end()
          resolve({ stdout, stderr, code })
        })
        stream.on('data', (d: Buffer) => { stdout += d.toString() })
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      })
    })
    conn.on('error', reject)
    conn.connect({
      host: instance.sshHost,
      port: 22,
      username: instance.sshUser,
      privateKey: fs.readFileSync(instance.sshKeyPath),
    })
  })
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
    `tail -n ${lines} ~/gateway.log 2>/dev/null || journalctl -u openclaw -n ${lines} --no-pager 2>/dev/null || echo "no logs found"`
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
