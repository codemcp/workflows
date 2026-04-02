---
description: Enable or disable workflows for this session
---

Toggle workflows for the current session:

- `/workflow on` - Enable workflows
- `/workflow off` - Disable workflows
- `/wf on` - Enable workflows (shorthand)
- `/wf off` - Disable workflows (shorthand)

When workflows are disabled, the plugin will not inject development instructions or enforce file edit restrictions.

You can also set the initial state via environment variable:

```bash
WORKFLOW=off opencode
```
