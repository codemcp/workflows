/**
 * Capability Generator
 *
 * CLI wizard that, for each `--model-<capability>` flag, writes a user-side
 * per-target agent file (e.g. `.opencode/agents/<capability>.md` for OpenCode)
 * and merges the matching `capability_models` entry into `.vibe/config.yaml`.
 *
 * The architecture follows the per-target registry pattern used by
 * `ConfigGenerator` and `SkillGenerator`: a {@link CapabilityGenerator} abstract
 * base class declares `getOutputPath` + `renderCapabilityFile`; concrete
 * subclasses implement them for each target. A static
 * {@link CapabilityGeneratorRegistry} keeps the inventory and dispatches by
 * name. Only `opencode` is currently fully implemented; the other registered
 * targets (`kiro`, `claude`, `gemini`, `vscode`, `github-copilot`) are stubs
 * that throw a clear "not yet supported" error when invoked. They show up
 * in `setup capabilities --help` so users can see the wizard is extensible.
 *
 * For OpenCode, the per-capability agent files are produced from templates
 * shipped under `resources/templates/opencode-agents/<capability>.md.tmpl`
 * (simple `.md` files with `${capability}` / `${model}` placeholders). At
 * runtime the templates are resolved via multi-path lookup, mirroring
 * `skill-generator.ts` so the same code works under `vitest` (source tree)
 * and the bundled `dist/` artifact.
 *
 * This module is a pure, side-effectful helper — it does not parse CLI
 * arguments itself. The CLI layer (`packages/cli/src/cli.ts`) collects the
 * flags and hands them to {@link generateCapabilities} via
 * {@link CapabilityGeneratorOptions}.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { ConfigManager, type ProjectConfig } from '@codemcp/workflows-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Set of capabilities the generator can scaffold. Adding a new capability is
 * a two-step change: (1) ship a new template under
 * `resources/templates/opencode-agents/<capability>.md.tmpl`, (2) extend
 * the options interface and the loop in the base {@link CapabilityGenerator.generate}.
 */
export const SUPPORTED_CAPABILITIES = [
  'thinking',
  'coding',
  'research',
] as const;
export type SupportedCapability = (typeof SUPPORTED_CAPABILITIES)[number];

export interface CapabilityGeneratorOptions {
  /** Absolute path to the user's project (the directory that contains `.vibe/` and the target-specific dir, e.g. `.opencode/`). */
  projectPath: string;
  /** Mapping of capability → model identifier. Only provided capabilities are processed. */
  models: Partial<Record<SupportedCapability, string>>;
  /** When `true`, overwrite existing per-target agent files. Default: skip with a warning. */
  force?: boolean;
}

export interface CapabilityGeneratorResult {
  /** Absolute paths of agent files successfully written. */
  generatedFiles: string[];
  /** Absolute paths of agent files that were left untouched (existed + `!force`). */
  skippedFiles: string[];
  /** Whether `.vibe/config.yaml` was (re)written. */
  configUpdated: boolean;
  /** Absolute path to `.vibe/config.yaml`. */
  configPath: string;
}

/**
 * Abstract base class for capability generators.
 *
 * Subclasses must declare {@link name}, {@link description}, and implement
 * {@link getOutputPath} + {@link renderCapabilityFile}. The base class
 * orchestrates the per-capability file generation and the
 * `.vibe/config.yaml` merge — both are target-agnostic and live here.
 */
export abstract class CapabilityGenerator {
  /** Primary identifier (lower-case, matches the registry key). */
  abstract readonly name: string;
  /** Human-readable one-liner shown in `setup capabilities --help`. */
  abstract readonly description: string;

  /**
   * Compute the absolute path of the per-capability agent file inside
   * `projectPath`. Subclass-owned (each target has its own directory layout,
   * file extension, and naming convention).
   */
  abstract getOutputPath(
    capability: SupportedCapability,
    projectPath: string
  ): string;

  /**
   * Render the per-capability file content for the given model. Subclass-owned
   * (template resolution, frontmatter shape, prompt body). Async because
   * loading the source template is an I/O call.
   */
  abstract renderCapabilityFile(
    capability: SupportedCapability,
    model: string
  ): Promise<string>;

  /**
   * Concrete orchestration: for each provided capability, resolve the output
   * path, render the file, then write (or skip if it exists and `!force`).
   * Finally, merge the matching `capability_models` entries into
   * `.vibe/config.yaml` (target-agnostic; lives in the base).
   */
  async generate(
    opts: CapabilityGeneratorOptions
  ): Promise<CapabilityGeneratorResult> {
    const { projectPath, models, force = false } = opts;

    const generatedFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const capability of SUPPORTED_CAPABILITIES) {
      const model = models[capability];
      if (!model) {
        continue;
      }

      const targetPath = this.getOutputPath(capability, projectPath);
      // `renderCapabilityFile` is called before any I/O so stub generators
      // throw the "not yet supported" error before touching the disk.
      const content = await this.renderCapabilityFile(capability, model);

      if (existsSync(targetPath) && !force) {
        skippedFiles.push(targetPath);
        continue;
      }

      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, content, 'utf-8');
      generatedFiles.push(targetPath);
    }

    const configPath = join(projectPath, '.vibe', 'config.yaml');
    const configUpdated = await mergeCapabilityModels(configPath, models);

    return { generatedFiles, skippedFiles, configUpdated, configPath };
  }
}

/**
 * Merge the provided `capability_models` entries into the existing
 * `.vibe/config.yaml`, preserving every other top-level key.
 *
 * - If the file does not exist, a fresh one is written containing only the
 *   new `capability_models` block.
 * - If it exists, the existing `ProjectConfig` is round-tripped through
 *   `js-yaml`; for each provided capability, `capability_models[<capability>]`
 *   is overwritten with `{ model, agent: <capability> }`. Other keys are
 *   untouched.
 *
 * Returns `true` when the on-disk file changed (or didn't exist before).
 */
async function mergeCapabilityModels(
  configPath: string,
  models: Partial<Record<SupportedCapability, string>>
): Promise<boolean> {
  const newEntries: Record<string, { model: string; agent: string }> = {};
  for (const capability of SUPPORTED_CAPABILITIES) {
    const model = models[capability];
    if (model) {
      newEntries[capability] = { model, agent: capability };
    }
  }

  // Nothing to merge ⇒ no I/O, no change. (Caller still gets `configUpdated = false`.)
  if (Object.keys(newEntries).length === 0) {
    return false;
  }

  let existingConfig: ProjectConfig = {};
  let configExisted = false;
  if (existsSync(configPath)) {
    configExisted = true;
    // `loadProjectConfig` expects the project root (the directory that
    // contains `.vibe/`), not the `.vibe/` dir itself. `configPath` lives at
    // `<projectPath>/.vibe/config.yaml`, so the project root is two levels up.
    const projectRoot = dirname(dirname(configPath));
    const loaded = ConfigManager.loadProjectConfig(projectRoot);
    if (loaded !== null) {
      existingConfig = loaded;
    } else {
      // Defensive: file existed but loadProjectConfig returned null (e.g. an
      // empty file). Fall back to parsing the raw YAML so we still merge
      // without clobbering comments / formatting beyond what js-yaml
      // round-trips.
      const existingRaw = await readFile(configPath, 'utf-8');
      const parsed = yaml.load(existingRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfig = parsed as ProjectConfig;
      }
    }
  }

  const mergedConfig: ProjectConfig = {
    ...existingConfig,
    capability_models: {
      ...existingConfig.capability_models,
      ...newEntries,
    },
  };

  // Detect "no real change" cheaply via YAML serialization — avoids spurious
  // writes when the file already has identical entries. We compare against
  // the pre-merge value when the file existed, otherwise any write counts
  // as an update.
  const serialized = yaml.dump(mergedConfig, { noRefs: true, sortKeys: false });
  if (configExisted) {
    const existingSerialized = yaml.dump(existingConfig, {
      noRefs: true,
      sortKeys: false,
    });
    if (existingSerialized === serialized) {
      return false;
    }
  }

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, serialized, 'utf-8');
  return true;
}

/**
 * Locate the OpenCode capability template by searching the candidate paths
 * in order. The order mirrors `skill-generator.ts`:
 *   1. CLI package `resources/templates/...` (production layout after `pnpm build`).
 *   2. Bundled `dist/../resources/templates/...` (alt production layout).
 *   3. CLI package direct `resources/...` (dev layout via `pnpm copy-resources`).
 *   4. Root `resources/templates/...` (canonical source of truth).
 *   5. Core package `resources/templates/...` (post `pnpm build` of core).
 *
 * Throws when no candidate exists so the caller can surface a clear error.
 */
function resolveOpencodeTemplatePath(capability: SupportedCapability): string {
  const filename = `${capability}.md.tmpl`;
  const possiblePaths = [
    // From src/ in dev (vitest): <cli>/resources/templates/opencode-agents/<file>
    join(
      __dirname,
      '..',
      'resources',
      'templates',
      'opencode-agents',
      filename
    ),
    // From dist/ at runtime: <cli>/resources/templates/opencode-agents/<file>
    join(
      __dirname,
      '..',
      '..',
      'resources',
      'templates',
      'opencode-agents',
      filename
    ),
    // From dist/cli/ at runtime (alt bundled layout)
    join(
      __dirname,
      '..',
      '..',
      '..',
      'resources',
      'templates',
      'opencode-agents',
      filename
    ),
    // Root canonical source of truth
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'resources',
      'templates',
      'opencode-agents',
      filename
    ),
    // From core package resources
    join(
      __dirname,
      '..',
      '..',
      'core',
      'resources',
      'templates',
      'opencode-agents',
      filename
    ),
  ];

  for (const candidate of possiblePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Capability template not found: ${filename}. Searched: ${possiblePaths.join(', ')}`
  );
}

/**
 * Render an OpenCode capability template by substituting `${capability}` and
 * `${model}`. Uses simple string replacement — the templates do not embed
 * `${...}` sequences in any other context, and the values are always safe
 * (no regex metacharacters under any of the documented model identifiers).
 */
function renderOpencodeTemplate(
  content: string,
  capability: string,
  model: string
): string {
  return content
    .replace(/\$\{capability\}/g, capability)
    .replace(/\$\{model\}/g, model);
}

/**
 * Concrete OpenCode generator: writes `.opencode/agents/<capability>.md`
 * (mode: subagent, model pinned) and merges the matching
 * `capability_models[<capability>] = { model, agent: <capability> }` into
 * `.vibe/config.yaml`.
 */
export class OpencodeCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'opencode';
  readonly description =
    'Generate .opencode/agents/<capability>.md (mode: subagent, model pinned)';

  getOutputPath(capability: SupportedCapability, projectPath: string): string {
    return join(projectPath, '.opencode', 'agents', `${capability}.md`);
  }

  async renderCapabilityFile(
    capability: SupportedCapability,
    model: string
  ): Promise<string> {
    const templatePath = resolveOpencodeTemplatePath(capability);
    const templateContent = await readFile(templatePath, 'utf-8');
    return renderOpencodeTemplate(templateContent, capability, model);
  }
}

function buildNotYetSupportedError(target: string): Error {
  return new Error(
    `Capability generation for ${target} is not yet supported — see \`setup capabilities --help\``
  );
}

/**
 * Stub generator for Kiro. Throws "not yet supported" from
 * {@link renderCapabilityFile} (called first in `generate`) so the error
 * surfaces before any I/O. The description is shown in
 * `setup capabilities --help` so users know the wizard is extensible.
 */
export class KiroCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'kiro';
  readonly description =
    'Not yet supported for kiro — see `setup capabilities --help`';

  getOutputPath(): string {
    throw buildNotYetSupportedError(this.name);
  }

  renderCapabilityFile(): Promise<string> {
    return Promise.reject(buildNotYetSupportedError(this.name));
  }
}

/**
 * Stub generator for Claude. See {@link KiroCapabilityGenerator} for the
 * stub pattern. `setup capabilities --help` lists the target with a ⏳
 * status; invoking it throws.
 */
export class ClaudeCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'claude';
  readonly description =
    'Not yet supported for claude — see `setup capabilities --help`';

  getOutputPath(): string {
    throw buildNotYetSupportedError(this.name);
  }

  renderCapabilityFile(): Promise<string> {
    return Promise.reject(buildNotYetSupportedError(this.name));
  }
}

/**
 * Stub generator for Gemini. See {@link KiroCapabilityGenerator} for the
 * stub pattern.
 */
export class GeminiCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'gemini';
  readonly description =
    'Not yet supported for gemini — see `setup capabilities --help`';

  getOutputPath(): string {
    throw buildNotYetSupportedError(this.name);
  }

  renderCapabilityFile(): Promise<string> {
    return Promise.reject(buildNotYetSupportedError(this.name));
  }
}

/**
 * Stub generator for VS Code. See {@link KiroCapabilityGenerator} for the
 * stub pattern.
 */
export class VSCodeCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'vscode';
  readonly description =
    'Not yet supported for vscode — see `setup capabilities --help`';

  getOutputPath(): string {
    throw buildNotYetSupportedError(this.name);
  }

  renderCapabilityFile(): Promise<string> {
    return Promise.reject(buildNotYetSupportedError(this.name));
  }
}

/**
 * Stub generator for GitHub Copilot. See {@link KiroCapabilityGenerator}
 * for the stub pattern.
 */
export class GithubCopilotCapabilityGenerator extends CapabilityGenerator {
  readonly name = 'github-copilot';
  readonly description =
    'Not yet supported for github-copilot — see `setup capabilities --help`';

  getOutputPath(): string {
    throw buildNotYetSupportedError(this.name);
  }

  renderCapabilityFile(): Promise<string> {
    return Promise.reject(buildNotYetSupportedError(this.name));
  }
}

/**
 * Metadata for a capability generator.
 */
export interface CapabilityGeneratorMetadata {
  /** Primary identifier for the generator. */
  name: string;
  /** Human-readable description shown in `setup capabilities --help`. */
  description: string;
  /** The generator class constructor. */
  generatorClass: new () => CapabilityGenerator;
  /** When `true`, the generator is fully implemented and ready to invoke. */
  supported: boolean;
}

/**
 * Static registry for capability generators. Mirrors `GeneratorRegistry`
 * (config-generator) and `SkillGeneratorRegistry` (skill-generator): callers
 * look up a generator by name, get back an instance, and invoke `generate`.
 * For stub (unsupported) targets, `createGenerator` throws the canonical
 * "not yet supported" error before any I/O happens.
 */
export class CapabilityGeneratorRegistry {
  private static generators = new Map<string, CapabilityGeneratorMetadata>();

  /**
   * Register a generator with its metadata.
   */
  static register(metadata: CapabilityGeneratorMetadata): void {
    this.generators.set(metadata.name.toLowerCase(), metadata);
  }

  /**
   * Create a generator instance by name.
   *
   * - Throws `Unknown capability target: ...` when the name is not
   *   registered at all.
   * - Throws `Capability generation for <target> is not yet supported` when
   *   the name is registered but `supported: false`.
   * - Otherwise returns a fresh `CapabilityGenerator` instance.
   */
  static createGenerator(name: string): CapabilityGenerator {
    const metadata = this.generators.get(name.toLowerCase());
    if (!metadata) {
      const supported = this.getSupportedNames();
      throw new Error(
        `Unknown capability target: ${name}. Supported: ${supported.join(', ')}`
      );
    }
    if (!metadata.supported) {
      throw new Error(
        `Capability generation for ${metadata.name} is not yet supported — see \`setup capabilities --help\``
      );
    }
    return new metadata.generatorClass();
  }

  /**
   * Get all registered generators (including unsupported stubs).
   */
  static getAllGenerators(): CapabilityGeneratorMetadata[] {
    return Array.from(this.generators.values());
  }

  /**
   * Get the names of fully-supported generators (excludes stubs).
   */
  static getSupportedNames(): string[] {
    return this.getAllGenerators()
      .filter(g => g.supported)
      .map(g => g.name);
  }

  /**
   * Get formatted help text for all registered generators, with a status
   * indicator (✅ supported / ⏳ not yet supported) and a padded name column
   * so the descriptions line up as the list grows.
   */
  static getHelpText(): string {
    const generators = this.getAllGenerators();
    if (generators.length === 0) {
      return '';
    }
    const maxNameLength = Math.max(...generators.map(g => g.name.length));
    return generators
      .map(g => {
        const icon = g.supported ? '✅' : '⏳';
        const paddedName = g.name.padEnd(maxNameLength + 2, ' ');
        return `${icon} ${paddedName}${g.description}`;
      })
      .join('\n');
  }

  /**
   * Check if a generator is registered by name.
   */
  static exists(name: string): boolean {
    return this.generators.has(name.toLowerCase());
  }
}

// Module-init: register all known targets. `opencode` is the only fully
// implemented generator today; the others are stubs that throw "not yet
// supported" from the registry itself. Adding a new target is a single-class
// change plus one `register` call here.
CapabilityGeneratorRegistry.register({
  name: 'opencode',
  description:
    'Generate .opencode/agents/<capability>.md (mode: subagent, model pinned)',
  generatorClass: OpencodeCapabilityGenerator,
  supported: true,
});

CapabilityGeneratorRegistry.register({
  name: 'kiro',
  description: 'Not yet supported for kiro — see `setup capabilities --help`',
  generatorClass: KiroCapabilityGenerator,
  supported: false,
});

CapabilityGeneratorRegistry.register({
  name: 'claude',
  description: 'Not yet supported for claude — see `setup capabilities --help`',
  generatorClass: ClaudeCapabilityGenerator,
  supported: false,
});

CapabilityGeneratorRegistry.register({
  name: 'gemini',
  description: 'Not yet supported for gemini — see `setup capabilities --help`',
  generatorClass: GeminiCapabilityGenerator,
  supported: false,
});

CapabilityGeneratorRegistry.register({
  name: 'vscode',
  description: 'Not yet supported for vscode — see `setup capabilities --help`',
  generatorClass: VSCodeCapabilityGenerator,
  supported: false,
});

CapabilityGeneratorRegistry.register({
  name: 'github-copilot',
  description:
    'Not yet supported for github-copilot — see `setup capabilities --help`',
  generatorClass: GithubCopilotCapabilityGenerator,
  supported: false,
});

/**
 * Top-level dispatch: look up `target` in {@link CapabilityGeneratorRegistry}
 * and invoke its `generate` method. Throws when the target is unknown or not
 * yet implemented; otherwise returns the unified {@link CapabilityGeneratorResult}.
 */
export function generateCapabilities(
  target: string,
  opts: CapabilityGeneratorOptions
): Promise<CapabilityGeneratorResult> {
  return CapabilityGeneratorRegistry.createGenerator(target).generate(opts);
}
