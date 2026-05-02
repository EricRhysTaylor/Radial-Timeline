# Latin Modern Roman 10pt (bundled)

Project: Latin Modern (GUST e-foundry)
License: GUST Font License (a free-software font license; see `LICENSE.txt`)
Source: http://www.gust.org.pl/projects/e-foundry/latin-modern

## Why bundled

`fontspec`'s name-based lookup (`\setmainfont{Latin Modern Roman}`) and even filename-based lookup via `kpsewhich` are unreliable across MacTeX/TeXLive installs — depending on how `fc-cache` and TeX's font tree were configured at install time, XeLaTeX may fail with "font cannot be found" even though the OTFs are physically present somewhere on disk. Bundling the four faces we need eliminates that whole class of failure: fontspec uses an explicit `Path=` directive pointing at this directory.

## Required files

Drop the following files in this directory. Filenames must match exactly — the LaTeX generator references them by name.

- `lmroman10-regular.otf`
- `lmroman10-italic.otf`
- `lmroman10-bold.otf`
- `lmroman10-bolditalic.otf`

These are the four faces needed for body, italic emphasis, bold, and bold-italic emphasis at the standard 10pt optical size (which renders cleanly at 11pt body in 6×9 trade paperback layouts).

## Where to get them

- **From GUST (canonical)**: http://www.gust.org.pl/projects/e-foundry/latin-modern/download — download the OTF distribution, unzip, and pull the four files listed above out of the `lm/` directory.
- **From an existing TeX install**: MacTeX/TeXLive ships them at `<TEXLIVE>/texmf-dist/fonts/opentype/public/lm/`. Same filenames.

## License compliance

The `LICENSE.txt` file (the GUST Font License) must remain in this directory and travel with the bundled fonts when the plugin is distributed. Do not modify the OTF files themselves.
