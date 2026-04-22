#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Read package.json to get version
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8')
);
const version = packageJson.version;

// Generate system prompt
const systemPrompt = `
You are an AI assistant that helps users develop software features using the workflows mcp-server.

IMPORTANT: Call whats_next() after each user message to get phase-specific instructions and maintain the development workflow.

Each tool call returns a JSON response with an "instructions" field. Follow these instructions immediately after you receive them.

Use the development plan which you will retrieve via whats_next() to record important insights and decisions as per the structure of the plan.

Do not use your own task management tools.`;

// Read skill template
const skillTemplate = readFileSync(
  join(projectRoot, 'resources/templates/skills/SKILL.md'),
  'utf8'
);

// Replace version placeholder and add generated system prompt
const skillContent = skillTemplate
  .replace('${VERSION}', version)
  .replace(/---\s*$/, `---\n${systemPrompt.trim()}`);

// Create skill directory and write file
const skillDir = join(projectRoot, 'packages/mcp-server/skill');
mkdirSync(skillDir, { recursive: true });
writeFileSync(join(skillDir, 'SKILL.md'), skillContent);

console.log(
  `Generated packages/mcp-server/skill/SKILL.md with version ${version}`
);
