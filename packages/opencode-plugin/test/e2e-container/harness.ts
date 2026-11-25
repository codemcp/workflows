/**
 * Container harness: runs the BUILT plugin inside the pinned OpenCode 2.x
 * image against a scripted mock LLM. Runtime is auto-detected: Apple
 * `container` (macOS) or `docker` (Linux/CI).
 */
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OPENCODE_IMAGE =
  process.env.E2E_OPENCODE_IMAGE ?? 'ghcr.io/anomalyco/opencode:2.1.2';

const pluginDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export type Runtime = 'container' | 'docker';

export function detectRuntime(): Runtime | null {
  const forced = process.env.E2E_CONTAINER_RUNTIME;
  if (forced === 'container' || forced === 'docker') return forced;
  for (const candidate of ['container', 'docker'] as const) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

/** Address under which the container reaches the mock server on the host. */
function hostAddress(runtime: Runtime): string {
  if (process.env.E2E_HOST_ADDR) return process.env.E2E_HOST_ADDR;
  // Apple container: gateway of the default 192.168.64.0/24 network
  return runtime === 'container' ? '192.168.64.1' : 'host.docker.internal';
}

export interface Project {
  dir: string;
  cleanup(): void;
}

/**
 * Throwaway git project with the built plugin staged under
 * `.opencode/plugins/workflows` (auto-loaded by OpenCode 2).
 */
export function createProject(mockPort: number, runtime: Runtime): Project {
  const dist = path.join(pluginDir, 'dist', 'index.js');
  if (!fs.existsSync(dist)) {
    throw new Error('dist/index.js missing: run `pnpm build` first');
  }

  // realpath: macOS tmp dirs are symlinks, which confuses bind mounts
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'oc2-e2e-'))
  );
  const run = (args: string[]) =>
    spawnSync('git', args, { cwd: dir, stdio: 'ignore' });
  run(['init', '-q', '-b', 'feat/e2e']);
  run(['config', 'user.email', 'e2e@example.com']);
  run(['config', 'user.name', 'e2e']);

  const staged = path.join(dir, '.opencode', 'plugins', 'workflows');
  fs.mkdirSync(path.join(staged, 'node_modules'), { recursive: true });
  fs.cpSync(path.join(pluginDir, 'dist'), path.join(staged, 'dist'), {
    recursive: true,
  });
  fs.cpSync(path.join(pluginDir, 'resources'), path.join(staged, 'resources'), {
    recursive: true,
  });
  fs.cpSync(
    fs.realpathSync(path.join(pluginDir, 'node_modules', 'zod')),
    path.join(staged, 'node_modules', 'zod'),
    { recursive: true }
  );
  // OpenCode 2 loads plugin directories that have an index.js/index.ts
  fs.writeFileSync(
    path.join(staged, 'index.js'),
    "export { default } from './dist/index.js';\n"
  );
  fs.writeFileSync(
    path.join(staged, 'package.json'),
    JSON.stringify({ name: 'workflows-staged', type: 'module' })
  );

  fs.writeFileSync(
    path.join(dir, 'opencode.json'),
    JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        model: 'mock/mock',
        providers: {
          mock: {
            name: 'Mock',
            package: '@opencode/ai/providers/openai-compatible',
            settings: {
              baseURL: `http://${hostAddress(runtime)}:${mockPort}/v1`,
            },
            models: { mock: { name: 'Mock' } },
          },
        },
      },
      null,
      2
    )
  );
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'init']);

  return {
    dir,
    cleanup: () => {
      if (process.env.E2E_KEEP) {
        console.log(`E2E_KEEP: project kept at ${dir}`);
        return;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface RunResult {
  exitCode: number | null;
  output: string;
}

export async function runOpenCode(
  runtime: Runtime,
  project: Project,
  prompt: string,
  options: {
    env?: Record<string, string>;
    auto?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<RunResult> {
  const { env = {}, auto = true, timeoutMs = 120_000 } = options;
  const name = `oc2-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const args = ['run', '--rm', '--name', name];
  if (runtime === 'docker') {
    args.push('--add-host', 'host.docker.internal:host-gateway');
  }
  // Plugin log goes to <project>/wf.log (handy with E2E_KEEP=1)
  for (const [key, value] of Object.entries({
    WORKFLOW_LOG_FILE: '/work/wf.log',
    ...env,
  })) {
    args.push('-e', `${key}=${value}`);
  }
  args.push(
    '-v',
    `${project.dir}:/work`,
    '-w',
    '/work',
    OPENCODE_IMAGE,
    'run',
    '--standalone',
    ...(auto ? ['--auto'] : []),
    ...(process.env.E2E_DEBUG ? ['--print-logs', '--log-level', 'info'] : []),
    prompt
  );

  return new Promise(resolve => {
    const child = spawn(runtime, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => (output += d));
    child.stderr.on('data', d => (output += d));
    const timer = setTimeout(() => {
      spawnSync(runtime, ['kill', name], { stdio: 'ignore' });
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, output });
    });
  });
}

/** Read the single workflow state file the plugin wrote into the project. */
export function readWorkflowState(project: Project): {
  currentPhase: string;
  workflowName: string;
  sessionMetadata?: { referenceId: string };
} | null {
  const root = path.join(project.dir, '.vibe', 'conversations');
  if (!fs.existsSync(root)) return null;
  const [first] = fs.readdirSync(root);
  if (!first) return null;
  return JSON.parse(
    fs.readFileSync(path.join(root, first, 'state.json'), 'utf8')
  );
}
