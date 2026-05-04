## Radial Timeline 6.0.4

This is a focused publishing release.

### Improvements

- Rebuilt Publish settings around clearer Core and Pro tiers.
- Core now includes bundled PDF layouts, while Signature Pro unlocks the expanded designed publishing layouts.
- Improved all bundled Pandoc templates, including Standard Manuscript, Modern Classic, Contemporary Literary, and Signature Literary.
- Added stronger Book Details and Book Pages handling for title pages, copyright, dedication, epigraphs, acknowledgments, author notes, and other manuscript matter.
- Updated the inline LaTeX front matter and back matter examples for the new Book Pages system.
- Book Pages can now be generated from Book Details without requiring separate matter note templates.
- Updated Contemporary Literary PDF output to use contemporary serif body typography instead of a sans-serif body.
- Added bundled Source Serif 4 support for Contemporary Literary PDFs, alongside the other bundled PDF layout fonts.
- PDF publishing now treats the selected layout font as an exact requirement and surfaces install guidance when a required font asset is missing.
- Added export preview and warning cards so template readiness and layout risks are easier to catch before generating a PDF.
- Added layout pictograms and template feature summaries to make PDF style selection clearer.
- Added first-pass multi-book narrative timeline support.
- Added narrative timeline part/chapter markers that can reflect the active PDF layout, including outer-ring P/C notation for layouts with parts and chapters.
- Remembered the active book's selected novel PDF layout so timeline markers and export layout previews stay aligned.
- Added Timeline title-bar quick actions for Radial Timeline modals and export workflows.
- Polished Publish and Manuscript Export layout styling for cleaner controls, previews, and saved presets.

### Documentation

- Refreshed Publish documentation for the Core/Pro split, bundled layouts, Book Details, Book Pages, and Pandoc setup.

### Bug Fixes

- Fixed PDF export failures caused by missing or stale bundled Pandoc template files.
- Fixed template access fallback so Core users are guided back to supported layouts instead of blocked by Pro-only selections.
- Fixed template compatibility checks for layouts whose variables or capabilities do not match manuscript export.
- Fixed front matter and back matter ordering so saved Book Pages order is respected without mixing front matter and back matter.
- Fixed BookMeta validation so missing title, author, or rights metadata is reported before export.
- Fixed the Manuscript Export front/back matter toggle so BookMeta-only title and copyright pages are not included when matter is turned off.
- Fixed Auto configure publishing so exact retired starter examples are refreshed while edited matter files are preserved.
- Fixed inline LaTeX matter notes so YAML metadata is stripped before export and hard-wrapped prose lines render as line breaks instead of being collapsed by LaTeX.
- Fixed Markdown and PDF output buttons so their active state matches the Manuscript/Outline toggle styling.
- Fixed missing-When scene markers so hover handling does not leave red number squares in the wrong interaction state.
- Fixed PDF manuscript cleanup so Pandoc receives cleaner Markdown without unsafe scene ID formatting.
- Fixed chapter and scene-heading output across bundled PDF layouts.
- Fixed stage target completion date changes not refreshing timeline progress and target markers.
