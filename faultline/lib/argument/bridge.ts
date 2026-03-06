import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ArgumentEvent } from './types';
import { runBaselines } from './baseline-bridge';
import { loadContract, getPersona, buildConsolidatedPrompt } from '@/lib/personas/loader';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const ARGORA_DIR = path.join(REPO_ROOT, 'argora');
const ARGORA_PERSONAS_DIR = path.join(REPO_ROOT, 'argora-personas');

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
  useCrux?: boolean;
  useFacets?: boolean;
}

export async function* runArgora(config: BridgeConfig): AsyncGenerator<ArgumentEvent> {
  const usePersonas = config.personaIds && config.personaIds.length > 0;
  const argoraDir = usePersonas ? ARGORA_PERSONAS_DIR : ARGORA_DIR;
  const pythonPath = getPythonPath(argoraDir);
  const bridgePath = path.join(argoraDir, 'bridge.py');

  // If persona mode, build consolidated prompts and frame topic
  let personasJsonPath: string | null = null;
  let framedTopic = config.topic;

  if (usePersonas && config.personaIds) {
    // Persona mode: skip position framing — personas argue from their own worldviews.
    // The Position A/B/C structure produces essay-style evaluations, not natural debate.
    yield { type: 'status' as ArgumentEvent['type'], data: { message: 'Loading personas...' } };

    // Build persona configs with consolidated prompts
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

    // Write persona configs to temp file for Python to read
    const tmpDir = os.tmpdir();
    personasJsonPath = path.join(tmpDir, `faultline-personas-${Date.now()}.json`);
    fs.writeFileSync(personasJsonPath, JSON.stringify(personaConfigs, null, 2), 'utf-8');
  }

  const args = [
    bridgePath,
    '--topic', framedTopic,
    '--num-experts', String(config.numExperts ?? 3),
    '--rounds', String(config.rounds ?? 1),
    '--model', config.model ?? 'claude-haiku-4-5-20251001',
    '--qsem-type', config.qsemType ?? 'DFQuADModel',
    ...(personasJsonPath ? ['--personas-json', personasJsonPath] : []),
  ];

  const proc = spawn(pythonPath, args, {
    cwd: argoraDir,
    env: { ...process.env, ARGORA_SKIP_EMBEDDINGS: '1', PYTHONUNBUFFERED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let stderrBuffer = '';
  let argoraFailed = false;

  // Collect stderr for error reporting
  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString();
  });

  // Create a promise-based line reader from stdout
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
    // Process any remaining buffer
    if (buffer.trim()) {
      lineQueue.push(buffer.trim());
    }
    processEnded = true;
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  // Yield ARGORA events as they arrive
  while (true) {
    if (lineQueue.length > 0) {
      const line = lineQueue.shift()!;
      try {
        const event = JSON.parse(line) as ArgumentEvent;
        yield event;
        if (event.type === 'error') {
          argoraFailed = true;
          break;
        }
        if (event.type === 'argument_complete') {
          break;
        }
      } catch {
        // Skip non-JSON lines (Python print statements, warnings, etc.)
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

  // Clean up temp persona file
  if (personasJsonPath) {
    try { fs.unlinkSync(personasJsonPath); } catch { /* ignore */ }
  }

  // If process ended with stderr output, emit error
  if (stderrBuffer.trim() && processEnded) {
    yield {
      type: 'error',
      data: { message: 'Process error', stderr: stderrBuffer.trim() },
    };
  }

  // Run baselines after ARGORA completes (unless skipped or ARGORA failed)
  // Use the same topic ARGORA received (framedTopic for persona mode, raw topic otherwise)
  if (!config.skipBaselines && !argoraFailed) {
    yield { type: 'baselines_started', data: { topic: framedTopic } };

    try {
      for await (const baselineEvent of runBaselines(framedTopic, config.model)) {
        // Map baseline bridge events to ArgumentEvent types
        if (baselineEvent.type === 'baseline_result') {
          yield { type: 'baseline_result', data: baselineEvent.data };
        } else if (baselineEvent.type === 'baselines_complete') {
          yield { type: 'baselines_complete', data: baselineEvent.data };
        } else if (baselineEvent.type === 'baseline_running') {
          yield { type: 'baseline_running', data: baselineEvent.data };
        } else if (baselineEvent.type === 'error') {
          yield { type: 'error', data: baselineEvent.data };
        }
      }
    } catch (err) {
      yield {
        type: 'error',
        data: {
          message: `Baseline comparison failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  }
}
