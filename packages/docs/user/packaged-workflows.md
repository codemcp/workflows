# Packaged Workflows

Responsible Vibe includes more and more workflows for different purposes.

In order to now consume more and more space in your agent's context (their descriptions are always exposed, so that the agent knows which one to pick), not all of them are loaded by default.

Instead, they are organized into multiple domains and you can decide which ones you'd like to use.

**By default, only the `code` workflows are loaded**

### Workflow Domains

- **`code`**: Software development workflows
- **`architecture`**: System design and architecture workflows
- **`office`**: Business process and documentation workflows

**Control which domains are loaded:**

When running the MCP-server (or configuring your agent how to run it), pass an environment variable to define the domains you'd like to use.

```bash
export WORKFLOW_DOMAINS="code,architecture"
# Only loads workflows from code and architecture domains
```

If the included workflows don't match your needs, feel free to [define custom workflows](./custom-workflows.md)!
