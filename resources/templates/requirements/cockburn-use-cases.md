<!--
Cockburn Fully Dressed Use Cases
Use this format for complex interactions with multiple actors, significant
failure modes, or regulatory/security requirements.
For simple happy paths, Fowler casual style or user stories suffice.

Goal levels: ++ cloud | + kite | ! sea (user session) | - fish | -- clam
-->

# Use-Case Specification: [System / Bounded Context Name]

---

## 1. Persona Use Cases

<!-- One section per user-goal-level (sea !) use case. -->

### UC-P01 [!] [Imperative Verb Phrase] (Primary Actor: [Role])

| Field                        | Value                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| **Scope**                    | [System under discussion]                                                              |
| **Primary Actor**            | [Who initiates and has the goal]                                                       |
| **Stakeholders & Interests** | [Every affected party and what they want — list all, even if absent from the scenario] |

**Preconditions** — what must be true before the use case starts

- [State of system + actor]

**Trigger** — the observable event that initiates this use case

- [Actor intention, not a UI control]

**Minimal Guarantee** — holds even on every failure path

- [System invariant that is never violated, even on cancellation or error]

**Success Guarantee** — additionally true on full success

- [Observable outcome when the use case completes successfully]

---

**Main Success Scenario**

1. [Actor action]
2. [System response]
3. [Actor action]
4. [System produces main outcome]

---

**Extensions** — branch from the step number they occur at (e.g. 3a, 3b)

**3a.** [Condition at step 3]:

1. [System or actor response]

- Resume at step N | Use case ends (failure) | Use case ends (success)

---

**Business Rules**

- [BR-01: Rule reference or inline statement]

---

**Gherkin Acceptance Criteria** _(optional)_

```gherkin
Scenario: [Happy path]
  Given [precondition]
  When  [trigger]
  Then  [success outcome]

Scenario: [Extension 3a]
  Given [precondition]
  When  [condition]
  Then  [expected behaviour]
```

---

### UC-P02 [!] [Title] (Primary Actor: [Role])

<!-- Copy UC-P01 block above -->

---

## 2. System Use Cases

<!-- One section per technical interface: API endpoint, CLI command, event, file format. -->

### UC-S01 [Interface Identifier — e.g. POST /orders]

| Field                  | Value                                 |
| ---------------------- | ------------------------------------- |
| **Caller / Publisher** | [Who invokes this interface]          |
| **Protocol / Format**  | [REST/JSON, gRPC, CloudEvent, CSV, …] |

**Input & Validation**

| Parameter | Type     | Required | Constraint        |
| --------- | -------- | -------- | ----------------- |
| `[param]` | `[type]` | Yes/No   | [verifiable rule] |

**Processing**

1. [What the system does with valid input]

**Output / Response**

| Condition | Status            | Payload              |
| --------- | ----------------- | -------------------- |
| Success   | `200 OK`          | [schema or example]  |
| [Error]   | `400 Bad Request` | `{ "error": "..." }` |

---

### UC-S02 [Interface Identifier]

<!-- Copy UC-S01 block above -->

---

## 3. Supplementary Specifications

### 3.1 Entity Model

| Entity     | Key Attributes | Relationships      |
| ---------- | -------------- | ------------------ |
| `[Entity]` | `id`, `[attr]` | has-many `[Other]` |

### 3.2 State Machines

**[Entity] lifecycle:**

| From      | Event     | To        | Guard      |
| --------- | --------- | --------- | ---------- |
| `[State]` | `[event]` | `[State]` | [optional] |

### 3.3 Cross-Cutting Contracts

- **[Contract]**: [Applies to which use cases and what it mandates]

### 3.4 Business Rules

| ID      | Description | Authority                      |
| ------- | ----------- | ------------------------------ |
| `BR-01` | [Rule]      | [Law / policy / domain expert] |
