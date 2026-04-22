/**
 * Test setup file for Vitest
 * Configures global test environment and utilities
 */

// Configure logging for tests FIRST - only show errors by default
// This must be set before any modules are imported that use the logger
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'ERROR';
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Global test configuration
const TEST_DB_DIR = join(tmpdir(), 'codemcp-workflows-test');

// Export test utilities
export const TEST_CONFIG = {
  DB_DIR: TEST_DB_DIR,
  DB_PATH: join(TEST_DB_DIR, 'test.sqlite'),
  PROJECT_PATH: '/test/project',
  GIT_BRANCH: 'main',
};
