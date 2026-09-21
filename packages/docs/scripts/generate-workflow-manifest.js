#!/usr/bin/env node

import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateWorkflowManifest() {
  try {
    const workflowsDir = join(__dirname, '../public/workflows');
    const files = await readdir(workflowsDir);

    const workflows = files
      .filter(file => file.endsWith('.yaml'))
      .map(file => file.replace('.yaml', ''));

    // Ensure the .vitepress directory exists
    const vitepressDir = join(__dirname, '../.vitepress');
    await mkdir(vitepressDir, { recursive: true });

    const manifestContent = `// Auto-generated workflow manifest
export const AVAILABLE_WORKFLOWS = ${JSON.stringify(workflows, null, 2)};
`;

    const manifestPath = join(__dirname, '../.vitepress/workflow-manifest.js');
    await writeFile(manifestPath, manifestContent);

    console.log(
      `Generated workflow manifest with ${workflows.length} workflows:`,
      workflows
    );
  } catch (error) {
    console.error('Failed to generate workflow manifest:', error);
    process.exit(1);
  }
}

await generateWorkflowManifest();
