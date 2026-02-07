# Claude Code Instructions

## Working Directory

Always work directly in the main repository at:
`/Users/ericrhystaylor/Documents/Code Projects/radial-timeline`

Do NOT use git worktrees. Do NOT work from `~/.claude-worktrees/`. If you find yourself in a worktree path, switch to the main repo path above before making any changes.

The primary branch is `master`.

## Build

- `npm run build` to build (outputs to Obsidian vault plugin folders + `release/`)
- TypeScript check: `npx tsc --noEmit`
- Build must pass before considering work complete

## Code Style

- This is an Obsidian plugin (TypeScript)
- CSS classes use `ert-` prefix (ERT design system)
- Modal sizing uses inline styles (Obsidian pattern), marked with `// SAFE:` comments
- Event listeners in Modal classes use direct `.addEventListener()` (Modal lifecycle manages cleanup)
