# Radial Timeline AI Agent Rules

These rules apply to all AI agents working on the RT codebase.

Examples: Claude, Cursor, Codex, GPT, and future agents.

---

Before performing any structural refactor or architectural change,
agents must read the following documents:

- `docs/engineering/INDEX.md`
- `docs/engineering/standards/code-doctrine.md`
- `docs/engineering/standards/inquiry-critical-path-rules.md`
- `docs/engineering/standards/refactor-playbook.md`

Refactors must follow the RT Engineering Doctrine.

---

Key requirements:

- Prefer deletion over accommodation
- Remove fallback logic where possible
- Maintain a single canonical computation path
- Avoid duplicated logic across modules
- Avoid defensive branch explosions
- UI numbers must never diverge from system truth
- Provider execution logic must remain deterministic

Refactors that increase complexity without removing existing logic
should be rejected.

---

## Testing Discipline

Agents must run the following before reporting completion of any code change:

1. Type check

```bash
npx tsc --noEmit
```

2. Targeted tests

```bash
npx vitest run <tests related to changed files>
```

3. Full build

```bash
npm run build
```

If any step fails, the agent must fix the issue before declaring the task complete.

Agents must prefer targeted test runs over full test runs unless structural changes were made.
