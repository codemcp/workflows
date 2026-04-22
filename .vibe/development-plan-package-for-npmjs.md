# Development Plan: responsible-vibe (package-for-npmjs branch)

*Generated on 2025-06-27 by Vibe Feature MCP*
*Workflow: epcc*

## Goal
Set up professional publishing workflow for the responsible-vibe MCP server to npm with GitHub Actions, maintaining semantic versioning consistency between package.json version and git tags.

## Explore
### Tasks
- [x] Research npm publishing best practices for MCP servers
- [x] Investigate semantic versioning automation tools
- [x] Analyze current package.json structure and dependencies
- [x] Research GitHub Actions workflows for npm publishing
- [x] Check MCP server registry requirements
- [x] Explore automated changelog generation options

### Completed
- [x] Created development plan file
- [x] Analyzed current project structure
- [x] Confirmed git repository setup (https://github.com/codemcp/workflows.git)
- [x] Verified no existing GitHub Actions workflows
- [x] Confirmed no existing git tags (clean slate for versioning)
- [x] Analyzed package.json structure and dependencies
- [x] Confirmed test commands and CI strategy

## Plan
### Phase Entrance Criteria:
- [x] Publishing requirements and constraints are clearly defined
- [x] Semantic versioning strategy is decided
- [x] GitHub Actions workflow approach is chosen
- [x] npm registry publishing strategy is confirmed
- [x] All technical dependencies and tools are identified

### Tasks
- [x] Design PR workflow structure (.github/workflows/pr.yml)
- [x] Design main branch workflow structure (.github/workflows/release.yml)
- [x] Plan package.json modifications for scoped package
- [x] Design workflow for version bumping with conventional commits
- [x] Plan npm publishing configuration and authentication
- [x] Design changelog generation strategy
- [x] Plan git tagging consistency approach
- [x] Design error handling and rollback strategies
- [x] Plan workflow permissions and security considerations
- [x] Design testing strategy integration (full test suite)
- [x] Plan workflow triggers and conditions
- [x] Design workflow status reporting and notifications

### Implementation Strategy

#### 1. PR Workflow (.github/workflows/pr.yml)
- **Purpose**: Validate code quality on pull requests
- **Triggers**: Pull request to main branch
- **Node Matrix**: 18, 20, latest
- **Jobs**: Test + Build validation
- **Commands**: `npm ci`, `npm run build`, `npm run test:run`

#### 2. Release Workflow (.github/workflows/release.yml)
- **Purpose**: Test, version bump, publish, tag
- **Triggers**: Push to main branch
- **Tool**: `mathieudutour/github-tag-action@v6.1`
- **Flow**: Test → Version Bump → npm Publish → Git Tag

#### 3. Package.json Modifications
- **Name**: Change to `"@mrsimpson/responsible-vibe-mcp"`
- **Add**: `"files"` field, `"engines"` (Node 18+), `"repository"`
- **Ensure**: `"main"` points to dist files

#### 4. Version Bumping Strategy
- **Conventional Commits**: feat=minor, fix=patch, BREAKING=major
- **Format**: Git tags as v1.2.3
- **Automation**: Package.json + git tag created atomically

#### 5. npm Publishing Configuration
- **Auth**: GitHub secret `NPM_TOKEN`
- **Access**: `--access public` for scoped package
- **Condition**: Only publish if version changed

#### 6. Changelog Generation
- **Tool**: Built-in with mathieudutour/github-tag-action
- **Output**: CHANGELOG.md + GitHub release notes
- **Source**: Conventional commit parsing

#### 7. Security & Permissions
- **Permissions**: `contents: write`, `packages: write`
- **Isolation**: No secrets in PR workflows
- **Scope**: Main branch and PRs only

#### 8. Testing Integration
- **Command**: `npm run test:run` with `INCLUDE_NOISY_TESTS=true`
- **Coverage**: Full test suite including MCP contract tests
- **Caching**: node_modules cached for performance

#### 9. Error Handling & Workflow Status
- **Fail Fast**: Stop on test failures
- **Conditional Logic**: Only publish if version changed
- **Status Reporting**: Clear error messages, workflow badges
- **No Auto-Rollback**: Manual intervention required for issues

### Completed
- [x] All planning tasks completed
- [x] Detailed implementation strategy documented
- [x] Technical approach fully defined

## Code
### Phase Entrance Criteria:
- [x] Detailed implementation plan is complete
- [x] GitHub Actions workflow structure is designed
- [x] Package.json modifications are planned
- [x] Versioning automation approach is defined
- [x] Testing strategy for CI/CD is established

### Tasks
- [x] Create .github/workflows directory structure
- [x] Implement PR workflow (.github/workflows/pr.yml)
- [x] Implement release workflow (.github/workflows/release.yml)
- [x] Update package.json with scoped name and publishing config
- [x] Test workflows locally (if possible)
- [x] Verify all file permissions and structure

### Completed
- [x] All implementation tasks completed
- [x] GitHub Actions workflows created and validated
- [x] Package.json updated with scoped name and publishing config
- [x] Build process tested successfully
- [x] YAML and JSON syntax validated

## Commit
### Phase Entrance Criteria:
- [ ] All GitHub Actions workflows are implemented and tested
- [ ] Package.json is properly configured for publishing
- [ ] Semantic versioning automation is working
- [ ] CI/CD pipeline successfully builds and tests
- [ ] Documentation is updated for publishing process

### Tasks
- [x] Create documentation for npm publishing setup
- [x] Add GitHub Actions status badges to README
- [x] Create setup instructions for npm token
- [x] Run final test suite to ensure no regressions
- [x] Review and clean up any temporary files
- [x] Commit all changes with conventional commit message
- [x] Prepare summary of what was implemented

### Implementation Summary

**✅ Complete npm Publishing Setup Implemented:**

1. **GitHub Actions Workflows:**
   - PR workflow: Tests on Node 18/20/latest, build verification
   - Release workflow: Test → Version bump → npm publish → Git tag → Release

2. **Package Configuration:**
   - Updated to scoped package: `@mrsimpson/responsible-vibe-mcp`
   - Added Node 18+ requirement, proper files config
   - Repository and publishing metadata configured

3. **Automation Features:**
   - Conventional commits → Semantic versioning
   - Automatic changelog generation
   - GitHub releases with release notes
   - npm publishing with public access

4. **Documentation:**
   - Complete PUBLISHING.md guide
   - GitHub Actions status badges in README
   - Setup instructions for npm token

5. **Quality Assurance:**
   - All 96 tests passing
   - YAML/JSON syntax validated
   - Build process verified

**Next Steps for User:**
1. Set up NPM_TOKEN secret in GitHub repository
2. Merge this branch to main to activate workflows
3. Use conventional commits for automatic versioning

### Completed
*None yet*

## Key Decisions
- **Repository**: Using existing GitHub repo (https://github.com/codemcp/workflows.git)
- **Current State**: No existing tags or GitHub Actions (clean slate)
- **Package Name**: @mrsimpson/responsible-vibe-mcp (scoped npm package)
- **Versioning**: Conventional commits with automatic semantic versioning
- **Release Strategy**: Automated releases from main branch pipeline
- **CI Strategy**: Tests on PR + main, version bump + publish on main
- **Automation Tool**: GitHub Actions with conventional commits action
- **Node Version**: 18+ requirement
- **Version Bump Tool**: mathieudutour/github-tag-action (full-featured with changelog)
- **Test Strategy**: Full test suite including MCP contract tests
- **Automation Tool**: GitHub Actions native approach (no external tools like semantic-release)

## Notes
### Current Project Analysis:
- **Package.json**: Version 1.0.0, well-structured with proper dependencies
- **Build System**: TypeScript with dist/ output, comprehensive test suite
- **Documentation**: Extensive README, SYSTEM_PROMPT.md, LOGGING.md, etc.
- **Testing**: Vitest with 79+ tests, includes MCP contract testing
- **Git Status**: On package-for-npmjs branch, clean working directory

### Key Requirements Identified:
1. **Semantic Versioning**: Automated version bumping with conventional commits
2. **GitHub Actions**: CI/CD pipeline for testing, building, and publishing
3. **npm Publishing**: Automated publishing to npm registry
4. **Tag Consistency**: Git tags must match package.json version
5. **Quality Gates**: Tests must pass before publishing
6. **Documentation**: Publishing process documentation

### npm Setup Instructions:
1. **Generate npm Access Token:**
   - Go to https://www.npmjs.com/settings/tokens
   - Click "Generate New Token" → "Automation" (for CI/CD)
   - Copy the token (starts with `npm_`)

2. **Add GitHub Secret:**
   - Go to your repo: https://github.com/codemcp/workflows/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm token

3. **Verify npm Package Name:**
   - Check if `@mrsimpson/responsible-vibe-mcp` is available on npm
   - May need to create npm organization if @mrsimpson doesn't exist

---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*
