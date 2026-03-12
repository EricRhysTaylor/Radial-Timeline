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
