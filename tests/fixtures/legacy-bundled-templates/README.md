# Legacy Bundled Templates — Reference Fixtures

These four `.tex` files capture the **hand-authored** bundled fiction template
content as it shipped immediately before the spec-driven cutover.

- `classic-manuscript.tex`     — Standard Manuscript (Core)
- `contemporary-literary.tex`  — Contemporary Literary (Core)
- `signature-literary.tex`     — Signature Literary (Pro)
- `modern-classic.tex`         — Modern Classic (Pro)

## Status

**Reference-only.** They are not loaded by the plugin at runtime, not validated
in CI, and never installed into a vault. Their sole purpose is to make it easy
to diff the spec-generated output against the legacy hand-authored output when
investigating a regression — open the matching file in
`src/publishing/bundledStyleSpecs.ts`, regenerate via
`generateDesignedStyleTex(spec)`, and compare.

## Rollback marker

The authoritative pre-cutover state is the git tag **`pre-spec-export-stable`**
(commit `8504e382`). To roll back the spec-driven changes:

```sh
git checkout pre-spec-export-stable -- \
  src/publishing/designedStyle.ts \
  src/publishing/designedStyleFragments.ts \
  src/publishing/layoutVisuals.ts \
  src/utils/pandocBundledLayouts.ts \
  src/types/settings.ts
```

These fixtures should be deleted along with the legacy normalizers in
`pandocBundledLayouts.ts` once one release cycle has passed since the
spec-driven cutover ships.
