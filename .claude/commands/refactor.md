Before performing this refactor, read:

- `docs/engineering/INDEX.md`
- `docs/engineering/standards/code-doctrine.md`
- `docs/engineering/standards/inquiry-critical-path-rules.md`
- `docs/engineering/standards/refactor-playbook.md`

Apply the RT Engineering Doctrine:

- prefer deletion over accommodation
- remove duplicate computation paths
- eliminate fallback logic where possible
- enforce single source of truth
- maintain deterministic runtime behavior

After reading, apply these rules to the refactoring task described below.

For every structural change, answer the refactor checklist from code-doctrine.md:
1. What duplicate logic was removed?
2. What fallback behavior was deleted?
3. What is now the single source of truth?
4. What UI surfaces became more accurate?
5. What became easier to test?

Follow the extraction order from refactor-playbook.md: types first, then pure helpers, then services, then rendering.

$ARGUMENTS
