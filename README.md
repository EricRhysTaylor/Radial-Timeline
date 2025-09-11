<p align="center">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Manuscript-Timeline/master/logo.png" alt="Manuscript Timeline Logo" width="10%">
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-weight: 100; font-size: 14px; margin-top: 12px; margin-bottom: 0; letter-spacing: 8px;">
  RADIAL MANUSCRIPT TIMELINE
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-size: 14px; margin-top: 4px;">
  by Eric Rhys Taylor
</p>


<p align="center">
    <a href="https://github.com/EricRhysTaylor/Radial-Manuscript-Timeline/stargazers"><img src="https://img.shields.io/github/stars/EricRhysTaylor/Radial-Manuscript-Timeline?colorA=363a4f&colorB=e0ac00&style=for-the-badge" alt="GitHub star count"></a>
    <a href="https://github.com/EricRhysTaylor/Radial-Manuscript-Timeline/issues"><img src="https://img.shields.io/github/issues/EricRhysTaylor/Radial-Manuscript-Timeline?colorA=363a4f&colorB=e93147&style=for-the-badge" alt="Open issues on GitHub"></a>
    <br/>
	<a href="https://obsidian.md/plugins?id=manuscript-timeline"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&query=$.manuscript-timeline.downloads&label=Downloads&style=for-the-badge&colorA=363a4f&colorB=d53984" alt="Plugin Downloads"/></a>
	<a href="https://github.com/EricRhysTaylor/Radial-Manuscript-Timeline/blob/master/LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&colorA=363a4f&colorB=b7bdf8" alt="MIT license"/></a>
</p>
<hr style="margin-bottom: 20px;">

A manuscript timeline for creative fiction writing projects that displays scenes organized by act, subplot, and chronological order in a radial format for a comprehensive view of project.

This timeline is meant to provide a contrast to a text-heavy spreadsheet layout of the story outline and timeline. Instead, it offers a colorful, comprehensive visual snapshot of the entire story, using rings to represent subplots and cells, wrapping in chronological order, to depict each scene. Various cues and interactions are available through a search feature and hover and click functionality. Hopefully, this will provide another method for tracking the progress of your manuscript and make it easier to stay on schedule and focused.

## Features

- Quick setup. Click on Timeline Tool then click button to create a note pre-populated with required metadata (yaml). Duplicate that scene or use other plugins like Templater and Metadata Menu to automate the process.
- Creates an interactive radial timeline visualization of scenes
- Organizes scenes by act, subplot, and chronological order
- Rotates counterclockwise so act 2 can align under act 1 for readability
- Supports Save the Cat beats via `Class: Plot` notes that render as slices
- Shows scene details on hover: title, date, synopsis, subplots, characters, overdue and revisions lines
- Color-codes scenes by status (Complete, Working, Todo, etc.)
- Displays plot notes with graduated shading and narrow width
- Supports light and dark themes
- Opens a scene on click
- Highlights currently open scene tabs in the radial timeline
- Estimates completion date based on remaining Todo/Working scenes and recent progress rate (excludes plot notes)
- Shows a visual arc and marker for the estimated completion timeframe
- Labels subplot rings with descriptive titles
- Fully integrated into Obsidian's interface (no external plugins required)

## Commands

* Open: open the timeline view
* Search timeline: filter by title, character, subplot, or date
* Clear search: reset all search filters
* Update flagged beats (manuscript order): process `BeatsUpdate: Yes` notes in manuscript order
* Update flagged beats (subplot order): process `BeatsUpdate: Yes` notes in subplot order
* Clear beats cache: clear saved beat results to force a full reprocess

<a href="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Manuscript-Timeline/master/screenshot.jpeg" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Manuscript-Timeline/master/screenshot.jpeg" alt="Example Timeline Screenshot" style="max-width: 100%; border-radius: 8px;" />
</a>

<a href="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Manuscript-Timeline/master/screenshot2.jpeg" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Manuscript-Timeline/master/screenshot2.jpeg" alt="Example Timeline Screenshot Synopsis" style="max-width: 100%; border-radius: 8px;" />
</a>

<div style="text-align: center; font-size: 0.8em; margin-top: 5px; color: #888;">
  Click image to view full size in browser
</div>  


## Settings

The plugin offers several settings to customize its behavior and enable AI features:

* Source path: set the root folder for scene files (for example, "Book 1/Scenes"). Leave blank to scan the entire vault.
* Target completion date: optional target date (YYYY-MM-DD). A marker appears on the outer ring.
* Outer ring shows all scenes: when on, the outer ring combines all subplot scenes and shows beat slices there only. When off, the outer ring shows Main Plot only and no beat slices are drawn.
* AI settings for beats analysis: configure OpenAI or Anthropic for automated beat generation via commands.
    * Default AI provider: choose OpenAI or Anthropic
    * OpenAI settings: API key and model
    * Anthropic settings: API key and model
    * Log AI interactions to file: creates notes in an "AI" folder with request/response details
* Debug mode: enables developer console logging for troubleshooting
* Publishing stage colors: customize colors for `Publish Stage` values (Zero, Author, House, Press). Each has a reset button.

## Required scene metadata

Scene files use YAML frontmatter. Keys commonly used by the timeline are:
- `Class`: must be `Scene` to include in the timeline
- `Synopsis` (required): brief description of the scene
- `Subplot` (optional): one or more subplot names; defaults to Main Plot when empty
- `Act` (optional): 1–3; defaults to 1 when empty
- `When` (required): the scene date (YYYY-MM-DD)
- `Character` (optional): one or more characters
- `Publish Stage` (optional): Zero, Author, House, Press
- `Status` (optional): Todo, Working, Complete
- `Due` (required): due date (YYYY-MM-DD)
- `Pending Edits` (optional): future edit notes
- `1beats`, `2beats`, `3beats` (optional): beat lists
- `BeatsUpdate` (optional): set to `Yes` to include in beat update commands
- `Book` (optional): book identifier

## Beats metadata (1beats, 2beats, 3beats)

Beats can be generated via the plugin’s AI settings (OpenAI or Anthropic). Use the command palette to run beat update commands for the current selection or the whole vault. This helps maintain beat continuity across scenes.


```yaml
---
Class: Scene
Synopsis: The protagonist discovers a mysterious artifact.
Subplot:
  - The Great War
  - Jinnis Pickle
Act: 1
When: 2023-02-15
Character:
  - John Mars
  - Celon Tim
Publish Stage: Zero
Status: Complete
Due: 2025-05-15
Pending Edits: Optional notes here
1beats:
  - 40.5 Initial discovery + / Leads naturally to scene 45
  - Realizes artifact is active? / Interesting idea
2beats:
  - 45 Artifact causes minor chaos — needs tighter tie-in to alpha subplot for a stronger bridge
  - Attempts to hide it + / Great twist
3beats:
  - 48 Antagonist senses artifact activation — the subtext could be stronger
  - Plans to investigate + / Serves as the hub for Scene 2's strategy session
BeatsUpdate: Yes
Book: Book 1 A New Beginning
---
```

## Plot beat slices (Save the Cat beats)

The plugin supports plot structuring with `Class: Plot` notes. These appear as narrow slices on the outermost ring when the “outer ring shows all scenes” setting is enabled. Hover a slice to view its description.

## Example plot note

Create a note titled "01 Opening Image" with this frontmatter:

```yaml
---
Class: Plot
Act: 1
Description: The first impression of your story. It should capture the essence of your story and establish the "before" snapshot of your protagonist's world.
---
```

## Installation

## From Obsidian

1.  Open Settings > Community plugins.
2.  Turn off Safe mode if it's on.
3.  Click Browse and search for "Manuscript Timeline".
4.  Click Install and then Enable.

## Manual installation

1.  Download the latest `main.js`, `styles.css`, and `manifest.json` from the [releases](https://github.com/EricRhysTaylor/Radial-Manuscript-Timeline/releases) page.
2.  Extract the files to your vault's .obsidian/plugins/manuscript-timeline

## Screen resolution suggestions

The Manuscript Timeline is designed for high pixel density displays (around 200 PPI or higher) for optimal visual quality. This means:

- All Apple Retina displays or 2x pixel density (MacBooks, iMacs, etc.)
- Windows systems with 4K displays or higher (may require adjusted scaling) will work well
- Tablets and Mobile Phones all support High DPI

If you're experiencing visual quality issues on Windows, please check your display scaling settings in Windows Settings > System > Display > Scale and layout.

## Technical implementation

The Manuscript Timeline visualization was inspired by and draws on principles from [D3.js](https://d3js.org), a powerful JavaScript library for producing dynamic, interactive data visualizations. While the plugin doesn't directly use the D3 library to reduce dependencies, it implements several D3-style approaches:

- SVG-based visualization techniques
- Data-driven document manipulation
- Interactive elements with hover and click behaviors
- Radial layouts and polar coordinates
- Scale transformations and data mapping
- Dynamic color manipulation and pattern generation

The visualizations are built using pure SVG and JavaScript, offering a lightweight solution that maintains the elegance and interactivity of D3-style visualizations while being fully compatible with Obsidian's rendering capabilities.

## Author

Created by Eric Rhys Taylor

This plugin adheres to Obsidian.md development best practices, including secure DOM manipulation and API compliance.

## Feedback and support

If you encounter issues or have feature requests, please file an issue on the [GitHub repository issues page](https://github.com/EricRhysTaylor/Radial-Manuscript-Timeline/issues). If you find the Manuscript Timeline plugin useful and would like to support continued development, please consider buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhystaylor" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 150px;" >
</a>

## License

This project is licensed under the MIT License - see the LICENSE file for details.
