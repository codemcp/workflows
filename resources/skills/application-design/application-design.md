---
name: application-design
description: General conventions when creating an application design
---

practices

# Application Design Conventions

**Organization:**

- Apply the Single Responsibility Principle
- Use packages with defined interfaces to apply open-close principle for components

**APIs:**

- Use RESTful conventions
- Handle 404s gracefully

**Validation:**

- Validate on client and server
- Provide immediate feedback
- Handle edge cases and malicious input

**Configurability**

- Only provide configurability if explicitly requested
- If needed, use the registry pattern
