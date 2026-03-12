# Radial Timeline Engineering Index

This directory contains the core engineering doctrine and architecture
guidance for the Radial Timeline codebase.

These documents define how the system must evolve and how refactors
must be performed.

All AI agents performing refactors must read the doctrine documents
listed below before modifying runtime code.

---

## Core Doctrine

Location: `docs/engineering/standards/`

- **[code-doctrine.md](standards/code-doctrine.md)**
  Core engineering philosophy for the RT codebase.

- **[inquiry-critical-path-rules.md](standards/inquiry-critical-path-rules.md)**
  Rules governing Inquiry, Gossamer, AI Strategy, and AI execution paths.

- **[refactor-playbook.md](standards/refactor-playbook.md)**
  Step-by-step rules for performing structural refactors safely.

- **[code-standards.md](standards/code-standards.md)**
  General coding standards.

- **[css-guidelines.md](standards/css-guidelines.md)**
  Styling and CSS architecture rules.

- **[modal-styling.md](standards/modal-styling.md)**
  Modal layout standards used across RT.

---

## Architecture Plans

Location: `docs/engineering/plans/`

Contains architecture proposals and historical planning documents.
These describe design direction but are not always authoritative rules.

---

## Engineering Audits

Location: `docs/engineering/audits/`

Historical audits and investigations.

---

## Refactor Protocol

Before performing any architectural refactor:

1. Read:
   - `docs/engineering/standards/code-doctrine.md`
   - `docs/engineering/standards/inquiry-critical-path-rules.md`
   - `docs/engineering/standards/refactor-playbook.md`

2. Prefer deletion over accommodation.
3. Remove duplicate logic and fallback paths.
4. Maintain deterministic behavior.
5. Ensure the refactor reduces complexity.

---

Engineering doctrine lives in: `docs/engineering/standards/`
Architecture discussions live in: `docs/engineering/plans/`
Audits live in: `docs/engineering/audits/`
