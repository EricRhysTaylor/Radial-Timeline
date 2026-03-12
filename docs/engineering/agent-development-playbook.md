# Agent Development Playbook

## Purpose
Radial Timeline is designed for agent-assisted development. This repository provides doctrine, standards, and commands that guide safe, consistent, and test-validated changes across Claude, Cursor, Codex, GPT, and future agents.

## Required Reading Order
Agents must read these files before structural work:

1. `docs/engineering/INDEX.md`
2. `docs/engineering/standards/code-doctrine.md`
3. `docs/engineering/standards/inquiry-critical-path-rules.md`
4. `docs/engineering/standards/refactor-playbook.md`

## Standard Workflow
1. Understand system architecture.
2. Produce a plan.
3. Perform minimal change.
4. Run targeted tests.
5. Summarize what changed.

## Refactor Workflow
When refactoring:

1. Identify duplicate logic.
2. Identify fallback logic.
3. Remove obsolete code.
4. Extract pure functions.
5. Extract services.
6. Verify tests.
7. Verify build.

## Testing Requirements
Every meaningful change must:

- run TypeScript validation
- run relevant tests
- confirm the build

Recommended order:

```bash
npx tsc --noEmit
npx vitest run <relevant-tests>
npm run build
```

Refactors should improve testability and reduce branching complexity.

## Commit Expectations
Agent output summaries must include:

- files changed
- lines removed vs added
- fallback logic removed
- tests updated or added

## Optional Claude Hooks
Projects using Claude Code may add hooks to enforce checks automatically.

Recommended hooks:

Type check:

```bash
npx tsc --noEmit
```

Targeted tests:

```bash
npx vitest run
```

Build validation:

```bash
npm run build
```

Hooks should run after agent edits but before commits.
