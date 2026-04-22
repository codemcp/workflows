# Publishing Guide

This document describes the automated publishing setup for the responsible-vibe MCP server.

## Overview

The project uses GitHub Actions to automatically:

- Run tests on pull requests
- Version bump using conventional commits
- Publish to npm registry
- Create git tags and GitHub releases
- Generate changelogs

## Setup Instructions

### 1. npm Token Setup

1. **Generate npm Access Token:**
   - Go to https://www.npmjs.com/settings/tokens
   - Click "Generate New Token" → "Automation" (for CI/CD)
   - Copy the token (starts with `npm_`)

2. **Add GitHub Secret:**
   - Go to your repo: https://github.com/codemcp/workflows/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm token

### 2. Package Information

- **Package Name**: `@codemcp/workflows`
- **Registry**: npm (https://registry.npmjs.org)
- **Access**: Public (scoped package)

## Workflows

### PR Workflow (`.github/workflows/pr.yml`)

**Triggers**: Pull requests to main branch
**Actions**:

- Tests on Node.js 18, 20, and latest
- Build verification
- Full test suite including MCP contract tests

### Release Workflow (`.github/workflows/release.yml`)

**Triggers**: Push to main branch
**Actions**:

1. Run full test suite
2. Analyze conventional commits for version bump
3. Update package.json version
4. Create git tag (v1.2.3 format)
5. Generate changelog
6. Publish to npm
7. Create GitHub release

## Conventional Commits

The versioning follows conventional commit standards:

- `feat:` → Minor version bump (1.0.0 → 1.1.0)
- `fix:` → Patch version bump (1.0.0 → 1.0.1)
- `BREAKING CHANGE:` → Major version bump (1.0.0 → 2.0.0)

### Examples:

```bash
git commit -m "feat: add new authentication method"
git commit -m "fix: resolve memory leak in state management"
git commit -m "feat!: redesign API structure

BREAKING CHANGE: API endpoints have changed"
```

## Publishing Process

1. **Development**: Work on feature branches
2. **Pull Request**: Create PR to main branch (triggers tests)
3. **Review & Merge**: After approval, merge to main
4. **Automatic Release**: GitHub Actions handles the rest:
   - Tests pass → Version bump → npm publish → Git tag → Release notes

## Manual Override

If needed, you can manually trigger releases:

1. Go to Actions tab in GitHub
2. Select "Release and Publish" workflow
3. Click "Run workflow" on main branch

## Troubleshooting

### Common Issues:

1. **npm publish fails**: Check NPM_TOKEN secret is set correctly
2. **No version bump**: Ensure commits follow conventional format
3. **Tests fail**: Fix tests before merging to main
4. **Permission denied**: Verify GitHub Actions permissions

### Checking Status:

- **npm package**: https://www.npmjs.com/package/@codemcp/workflows
- **GitHub releases**: https://github.com/codemcp/workflows/releases
- **Actions logs**: https://github.com/codemcp/workflows/actions

## Version History

Versions and changelogs are automatically maintained in:

- GitHub Releases
- CHANGELOG.md (auto-generated)
- Git tags (v1.2.3 format)
