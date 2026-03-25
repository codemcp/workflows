---
name: coding
description: General practices to consider when writing code
---

# Coding conventions

**Code Quality:**

- Write self-documenting code with clear names. Prefer verbose names over comments
- Comment the intend (why), do not describe the code (how)
- KISS
- DRY
- Prefer simplicity (understandability over elegance)

**Error Handling:**

- Handle errors explicitly
- Use explicit error types
- Provide context in messages
- Use structured logging and debugger over console.log

**Performance:**

- Avoid premature optimization
- Use appropriate data structures
- Consider memory usage
- Profile before optimizing

**Security:**

- Follow OWASP security guidelines and dependency scanning
- Validate and sanitize inputs
- Use parameterized queries
- Never hardcode secrets
