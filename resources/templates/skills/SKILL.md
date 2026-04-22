---
name: responsible-vibe
description: >
  Structured development workflows for AI-assisted coding. Use when starting 
  new features, fixing bugs, following TDD, refactoring code, or any development 
  task that benefits from planning and structure. Activate it when 
  users mention to build, enhance or fix code.
license: MIT
metadata:
  version: '${VERSION}'
  repository: https://github.com/codemcp/workflows
  author: mrsimpson
requires-mcp-servers:
  - name: workflows
    package: '@codemcp/workflows-server'
    description: 'Structured development workflows for AI-assisted coding'
    command: npx
    args: ['-y', '@codemcp/workflows-server']
---
