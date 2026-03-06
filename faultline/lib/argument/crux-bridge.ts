import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ArgumentEvent } from './types';
import { loadContract, getPersona, buildConsolidatedPrompt } from '@/lib/personas/loader';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const CRUX_PERSONAS_DIR = path.join(REPO_ROOT, 'crux-personas');

function getPythonPath(dir: string): string {
  if (process.platform === 'win32') {
    return path.join(dir, '.venv', 'Scripts', 'python.exe');
  }
  return path.join(dir, '.venv', 'bin', 'python');
}

export interface BridgeConfig {
  topic: string;
  numExperts?: number;
  rounds?: number;
  model?: string;
  qsemType?: string;
  skipBaselines?: boolean;
  personaIds?: string[];
  useFacets?: boolean;
}

export async function* runArgoraCrux(config: BridgeConfig): AsyncGenerator<ArgumentEvent> {
  const pythonPath = getPythonPath(CRUX_PERSONAS_DIR);
  const bridgePath = path.join(CRUX_PERSONAS_DIR, 'bridge.py');

  let personasJsonPath: string | null = null;

  if (config.personaIds && config.personaIds.length > 0) {
    const personaConfigs: Array<{ name: string; system_prompt: string }> = [];
    for (const personaId of config.personaIds) {
      const [contract, persona] = await Promise.all([
        loadContract(personaId),
        getPersona(personaId),
      ]);
      if (!contract || !persona) {
        yield { type: 'error', data: { message: `Persona not found: ${personaId}` } };
        return;
      }
      const systemPrompt = buildConsolidatedPrompt(contract, persona);
      personaConfigs.push({ name: persona.name, system_prompt: systemPrompt });
    }

    const tmpDir = os.tmpdir();
    personasJsonPath = path.join(tmpDir, `faultline-crux-personas-${Date.now()}.json`);
    fs.writeFileSync(personasJsonPath, JSON.stringify(personaConfigs, null, 2), 'utf-8');
  }

  const args = [
    bridgePath,
    '--topic', config.topic,
    '--num-experts', String(config.numExperts ?? 3),
    '--rounds', String(config.rounds ?? 1),
    '--model', config.model ?? 'claude-haiku-4-5-20251001',
    '--qsem-type', config.qsemType ?? 'DFQuADModel',
    ...(personasJsonPath ? ['--personas-json', personasJsonPath] : []),
    ...(config.useFacets ? ['--use-facets'] : []),
  ];

  const proc = spawn(pythonPath, args, {
    cwd: CRUX_PERSONAS_DIR,
    env: { ...process.env, ARGORA_SKIP_EMBEDDINGS: '1', PYTHONUNBUFFERED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let stderrBuffer = '';

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString();
  });

  const lineQueue: string[] = [];
  let resolveWait: (() => void) | null = null;
  let processEnded = false;

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        lineQueue.push(trimmed);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    }
  });

  proc.on('close', () => {
    if (buffer.trim()) {
      lineQueue.push(buffer.trim());
    }
    processEnded = true;
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  while (true) {
    if (lineQueue.length > 0) {
      const line = lineQueue.shift()!;
      try {
        const event = JSON.parse(line) as ArgumentEvent;
        yield event;
        if (event.type === 'error') {
          break;
        }
        if (event.type === 'argument_complete') {
          break;
        }
      } catch {
        continue;
      }
    } else if (processEnded) {
      break;
    } else {
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
  }

  if (personasJsonPath) {
    try { fs.unlinkSync(personasJsonPath); } catch { /* ignore */ }
  }

  if (stderrBuffer.trim() && processEnded) {
    yield {
      type: 'error',
      data: { message: 'Process error', stderr: stderrBuffer.trim() },
    };
  }
}
