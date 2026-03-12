Before starting any refactoring work, read and internalize the following engineering guidelines:

1. Read `docs/engineering/standards/code-doctrine.md` — the core coding philosophy (single source of truth, fail clearly, prefer deletion, no defensive branching)
2. Read `docs/engineering/standards/refactor-playbook.md` — the refactoring methodology (subtract first, extract pure logic, one boundary at a time, reduce code)
3. If the refactor touches Inquiry, Gossamer, AI Strategy, or AI execution: also read `docs/engineering/standards/inquiry-critical-path-rules.md` — the critical path constraints (two counting systems, snapshot authority, no fabricated capabilities)

After reading, apply these rules to the refactoring task described below.

For every structural change, answer the refactor checklist from code-doctrine.md:
1. What duplicate logic was removed?
2. What fallback behavior was deleted?
3. What is now the single source of truth?
4. What UI surfaces became more accurate?
5. What became easier to test?

Follow the extraction order from refactor-playbook.md: types first, then pure helpers, then services, then rendering.

$ARGUMENTS
