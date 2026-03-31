/**
 * Task Backend Management
 *
 * Provides abstraction layer for different task management backends:
 * - markdown: Traditional plan file with checkbox tasks
 * - beads: Beads distributed issue tracker integration
 */

import { execSync } from 'node:child_process';
import { createLogger, type ILogger } from './logger.js';

const defaultLogger = createLogger('TaskBackend');

export type TaskBackend = 'markdown' | 'beads';

export interface TaskBackendConfig {
  backend: TaskBackend;
  isAvailable: boolean;
  errorMessage?: string;
}

/**
 * Task backend detection and management utility
 */
export class TaskBackendManager {
  /**
   * Detect and validate the requested task backend
   *
   * When TASK_BACKEND is not set:
   * - Auto-detects if beads (bd) command is available
   * - Uses beads if bd command exists, markdown otherwise
   *
   * When TASK_BACKEND is explicitly set:
   * - Uses the specified backend (markdown or beads)
   * - For beads, validates availability and provides setup instructions if not available
   *
   */
  static detectTaskBackend(logger: ILogger = defaultLogger): TaskBackendConfig {
    const envBackend = process.env['TASK_BACKEND']?.toLowerCase().trim();

    // Handle invalid values by treating as not set
    if (envBackend && !['markdown', 'beads'].includes(envBackend)) {
      logger.debug('Invalid TASK_BACKEND value, treating as not set', {
        envBackend,
      });
    }

    // Auto-detect backend when not explicitly configured
    if (!envBackend || !['markdown', 'beads'].includes(envBackend)) {
      const beadsAvailable = TaskBackendManager.checkBeadsAvailability(logger);
      if (beadsAvailable.isAvailable) {
        logger.debug('Auto-detected beads backend (bd command available)', {
          reason: 'TASK_BACKEND not set, bd command found',
        });
        return {
          backend: 'beads',
          isAvailable: true,
        };
      }
      logger.debug('Using markdown backend (bd command not available)', {
        reason: 'TASK_BACKEND not set, bd command not found',
      });
      return {
        backend: 'markdown',
        isAvailable: true,
      };
    }

    const backend = envBackend as TaskBackend;

    if (backend === 'markdown') {
      logger.debug('Using explicitly configured markdown backend');
      return {
        backend: 'markdown',
        isAvailable: true,
      };
    }

    // backend === 'beads' is the only remaining case (explicitly configured)
    const beadsAvailable = TaskBackendManager.checkBeadsAvailability(logger);
    if (beadsAvailable.isAvailable) {
      logger.debug('Using explicitly configured beads backend');
      return {
        backend: 'beads',
        isAvailable: true,
      };
    }
    return {
      backend: 'beads',
      isAvailable: false,
      errorMessage:
        beadsAvailable.errorMessage || 'Beads backend not available',
    };
  }

  /**
   * Check if beads command is available and functional
   */
  static checkBeadsAvailability(logger: ILogger = defaultLogger): {
    isAvailable: boolean;
    errorMessage?: string;
  } {
    try {
      // Check if bd command exists and is functional
      const output = execSync('bd --version', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });

      logger.debug('Beads command available', { version: output.trim() });
      return { isAvailable: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Provide helpful error message based on error type
      if (
        errorMessage.includes('command not found') ||
        errorMessage.includes('not recognized')
      ) {
        return {
          isAvailable: false,
          errorMessage:
            'Beads command (bd) not found. Please install beads from: https://github.com/beads-data/beads',
        };
      }

      if (errorMessage.includes('timeout')) {
        return {
          isAvailable: false,
          errorMessage:
            'Beads command (bd) timed out. Check if beads is properly installed and configured.',
        };
      }

      logger.warn('Beads availability check failed', { errorMessage });
      return {
        isAvailable: false,
        errorMessage: `Beads command (bd) check failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Get setup instructions for beads backend
   */
  static getBeadsSetupInstructions(): string {
    return `## Beads Setup Required

To use beads as your task backend, you need to install beads:

### Installation
1. Clone the beads repository:
   \`\`\`bash
   git clone https://github.com/beads-data/beads.git ~/beads
   cd ~/beads
   \`\`\`

2. Build and install beads:
   \`\`\`bash
   make install
   \`\`\`

3. Verify installation:
   \`\`\`bash
   bd --version
   \`\`\`

### Auto-Detection
The system automatically detects the task backend:
- If the \`bd\` command is available, beads backend is used automatically
- If the \`bd\` command is not found, markdown backend is used

### Explicit Configuration (Optional)
You can explicitly set the backend via environment variable:
\`\`\`bash
export TASK_BACKEND=beads     # Force beads backend
export TASK_BACKEND=markdown  # Force markdown backend
\`\`\`

### Alternative: Use Markdown Backend
If you prefer to continue with traditional plan file task management,
simply ensure the \`bd\` command is not installed, or set:
\`\`\`bash
export TASK_BACKEND=markdown
\`\`\``;
  }

  /**
   * Validate task backend configuration and throw error if invalid
   *
   */
  static validateTaskBackend(
    logger: ILogger = defaultLogger
  ): TaskBackendConfig {
    const config = this.detectTaskBackend(logger);

    if (!config.isAvailable) {
      const setupInstructions =
        config.backend === 'beads'
          ? this.getBeadsSetupInstructions()
          : 'Task backend validation failed';

      throw new Error(
        `Task backend '${config.backend}' is not available.\n\n${config.errorMessage || ''}\n\n${setupInstructions}`
      );
    }

    logger.info('Task backend validated successfully', {
      backend: config.backend,
      available: config.isAvailable,
    });

    return config;
  }
}
