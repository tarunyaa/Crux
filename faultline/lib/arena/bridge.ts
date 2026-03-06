import { spawn } from 'child_process'
import path from 'path'
import type { ArenaRunEvent } from './types'

const REPO_ROOT = path.resolve(process.cwd(), '..')
const ARGORA_DIR = path.join(REPO_ROOT, 'argora')

function getPythonPath(): string {
  if (process.platform === 'win32') {
    return path.join(ARGORA_DIR, '.venv', 'Scripts', 'python.exe')
  }
  return path.join(ARGORA_DIR, '.venv', 'bin', 'python')
}

export interface ArenaBridgeConfig {
  topic: string
  model?: string
  cotModel?: string
  methods?: string[]
}

export async function* runArenaBaselines(config: ArenaBridgeConfig): AsyncGenerator<ArenaRunEvent> {
  const pythonPath = getPythonPath()
  const bridgePath = path.join(ARGORA_DIR, 'bridge_crux_arena.py')

  const methods = config.methods ?? ['direct_crux', 'cot_crux', 'multiagent_crux']

  const args = [
    bridgePath,
    '--topic', config.topic,
    '--model', config.model ?? 'gpt-4o-mini',
    '--cot-model', config.cotModel ?? 'o3',
    '--methods', methods.join(','),
  ]

  const proc = spawn(pythonPath, args, {
    cwd: ARGORA_DIR,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let buffer = ''
  let stderrBuffer = ''
  const lineQueue: string[] = []
  let resolveWait: (() => void) | null = null
  let processEnded = false

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString()
  })

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        lineQueue.push(trimmed)
        if (resolveWait) {
          resolveWait()
          resolveWait = null
        }
      }
    }
  })

  proc.on('close', () => {
    if (buffer.trim()) lineQueue.push(buffer.trim())
    processEnded = true
    if (resolveWait) {
      resolveWait()
      resolveWait = null
    }
  })

  while (true) {
    if (lineQueue.length > 0) {
      const line = lineQueue.shift()!
      try {
        const event = JSON.parse(line) as ArenaRunEvent
        yield event
        if (event.type === 'run_complete' || event.type === 'error') break
      } catch {
        // skip non-JSON output
      }
    } else if (processEnded) {
      break
    } else {
      await new Promise<void>(resolve => {
        resolveWait = resolve
      })
    }
  }

  if (stderrBuffer.trim() && processEnded) {
    yield {
      type: 'error',
      data: { message: 'Arena bridge process error', stderr: stderrBuffer.trim() },
    }
  }
}
