<p align="center">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/logo.png" alt="Radial Timeline Logo" width="10%">
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-weight: 100; font-size: 14px; margin-top: 12px; margin-bottom: 0; letter-spacing: 8px;">
  Radial timeline
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-size: 14px; margin-top: 4px;">
  by Eric Rhys Taylor
</p>


<p align="center">
    <a href="https://github.com/EricRhysTaylor/radial-timeline/stargazers" target="_blank" rel="noopener"><img src="https://img.shields.io/github/stars/EricRhysTaylor/radial-timeline?colorA=363a4f&colorB=e0ac00&style=for-the-badge" alt="GitHub star count"></a>
    <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener"><img src="https://img.shields.io/github/issues/EricRhysTaylor/radial-timeline?colorA=363a4f&colorB=e93147&style=for-the-badge" alt="Open issues on GitHub"></a>
    <br/>
	<a href="https://obsidian.md/plugins?id=radial-timeline" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&query=$.radial-timeline.downloads&label=Downloads&style=for-the-badge&colorA=363a4f&colorB=d53984" alt="Plugin Downloads"/></a>
	<a href="https://github.com/EricRhysTaylor/radial-timeline/blob/master/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&colorA=363a4f&colorB=b7bdf8" alt="MIT license"/></a>
</p>
<hr style="margin-bottom: 20px;">

A manuscript timeline for creative fiction writing projects that displays scenes organized by act, subplot, and numeric order in a radial format for a comprehensive view of project.

This timeline is meant to provide a contrast to a text-heavy spreadsheet layout of the story outline and timeline. Instead, it offers a colorful, comprehensive visual snapshot of the entire story, using rings to represent subplots and cells, wrapping in numeric order, to depict each scene. Various cues and interactions are available through a search feature and hover and click functionality. Hopefully, this will provide another method for tracking the progress of your manuscript and make it easier to stay on schedule and focused.


<a href="https://youtu.be/DctCvSzzZ5M?si=YbZrBo8ulw0wrPZt" target="_blank" rel="noopener">
  <p align="center">
    <img src="https://i.ytimg.com/vi/DctCvSzzZ5M/maxresdefault.jpg" alt="Plot Your Novel with Radial Timeline in Obsidian | Complete Author Walkthrough & Setup Guide" style="max-width: 80%; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  </p>
  <p align="center" style="font-family: 'Lato', sans-serif; font-weight: bold; font-size: 16px; margin-top: 10px;">
    Plot Your Novel with Radial Timeline in Obsidian<br>
    Complete Author Walkthrough & Setup Guide
  </p>
</a>


## Features

- Quick setup. Click on Timeline Tool then click button to create a note pre-populated with required metadata (yaml). Duplicate that scene or use other plugins like Templater and Metadata Menu to automate the process.
- Creates an interactive radial timeline visualization of scenes
- Organizes scenes by act, subplot, and numeric order
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

* Open timeline: open the timeline view
* Search timeline: filter by title, character, subplot, or date
* Clear search: reset all search filters
* Update beats (manuscript order): process `BeatsUpdate: Yes` notes in manuscript order
* Update beats (subplot): pick a subplot and process `BeatsUpdate: Yes` notes within that arc (uses contiguous prev/next within the chosen subplot)
* Clear beats cache: clear saved beat results to force a full reprocess

<a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/screenshot.jpeg" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/screenshot.jpeg" alt="Example Timeline Screenshot" style="max-width: 100%; border-radius: 8px;" />
</a>

<a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/screenshot2.jpeg" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/screenshot2.jpeg" alt="Example Timeline Screenshot Synopsis" style="max-width: 100%; border-radius: 8px;" />
</a>

<div style="text-align: center; font-size: 0.8em; margin-top: 5px; color: #888;">
  Click image to view full size in browser
</div>  


## Scene and plot metadata

The plugin uses YAML frontmatter to identify and organize your scenes and plot points. Here are the key examples, from basic to advanced.

**Required scene metadata**

Scene files are identified by having `Class: Scene` in their frontmatter. The following fields are used by the timeline:

```yaml
---
Class: Scene
Act: 1
When: 2000-01-31
Synopsis: The protagonist discovers a mysterious artifact.
Subplot:
  - Main Plot
  - Plot 2
Characters:
  - "[[Protagonist A]]"
  - "[[Mentor B]]"
Status: Todo
Publish Stage: Zero
Revision:
Due: 2025-01-31
Pending Edits:
BeatsUpdate:
Book: Book 1 A New Beginning
---
```

<hr>

**Plot beat slices (Save the Cat beats)**

The plugin supports plot structuring with `Class: Plot` notes. These appear as narrow slices on the outermost ring when the “outer ring shows all scenes” setting is enabled. Hover a slice to view its description.

Create a note titled "01 Opening Image" with this frontmatter:

```yaml
---
Class: Plot
Act: 1
Description: The first impression of your story. It should capture the essence of your story and establish the "before" snapshot of your protagonist's world.
---
```

<hr>

**AI beats analysis**

When AI beats are enabled in settings, the plugin can generate a triplet of beats for each scene: `1beats` (previous scene), `2beats` (current scene, includes a grade), and `3beats` (next scene). These are stored in the scene’s YAML and rendered under the synopsis in the timeline. You can run the commands “Update beats (manuscript order)” or “Update beats (subplot)” to populate or refresh them. To control wrapping in the Timeline hover display, insert `[br]` anywhere within a beat line to force a manual line break at that point. Note: If you have run this scene before, then be sure to Clear beats cache. (prevents unnecessary duplicate API calls).

```yaml
---
# Excerpt of AI beats triplet stored in scene frontmatter. [br] forces line break (discretionary)
1beats:
  - 12 Inciting clue + / Raises stakes for the protagonist. Secondary suspicion grows
2beats:
  - 13 A / Excellent pacing in the confrontation [br] Cut repetition in second paragraph
  - Follow-up + / Ally reveals motive
3beats:
  - 14 Setback ? / Plan fails at the last moment New approach needed
BeatsUpdate: Yes
---
```
<hr>

**Advanced scene example**

While the plugin only requires a few specific metadata fields to function, your scene notes can contain any other frontmatter you need for your personal writing process. The Radial Timeline plugin will safely ignore any fields it doesn't use.

Here is an example of a more detailed scene note that includes both plugin-specific fields and custom fields for personal organization.

```yaml
---
# All required Radial Plugin fields come first, followed by Story Grid, Optional, and AI Beats.

Class: Scene     # Always "Scene" for this fileclass
Act: 1     # Story Act number 1-3
When: 2000-01-31     # In-world date for the scene
Duration: 0     # How much story time passes (minutes, hours, days)

Synopsis: Explain concisely what happens in this scene.

Subplots:     # Link to one or more arcs this scene belongs to
  - Main Plot
  - Plot 2

Characters:     # Characters on stage; link to Character notes
  - "[[Protagonist A]]"
  - "[[Mentor B]]"

Place:     # Location tags; link to class Place notes
  - "[[Earth]]"

Status: Todo     # Workflow status: Todo / Working / Complete
Publish Stage: Zero     # Zero = draft, Author = ready for revision, House = reviewed and edited, Press = ready for publication
Revision:     # Leave blank until Stage > Zero; increment as revisions occur
Due: 2026-01-31     # Deadline for this scene
Pending Edits:     # Concrete revisions to address (e.g., "Change venue to a Moon of Jupiter.")

# --- Story Grid Analysis ---
Type:     # Scene type: Revelation / Turning Point / Confrontation / Decision / Setup / Payoff / Inciting Incident / Deepening
Shift:     # Polarity change: + / - (or +/- if it flips both ways)
Questions:     # Prompt: What is the reader wondering?
Reader Emotion:     # e.g., Curious / Shocked / Uneasy / Hopeful / Betrayed / Triumphant
Internal:     # How do the characters change? (e.g., from trusting → suspicious)

# --- Optional Fields ---
Total Time: 0.0     # Writing/production time spent (hours in decimal)
Words: 0     # scene wordcount
Book: Book 1 A New Beginning     # Book project label
Support Files:     # Attachments, references, research notes

# --- AI-Generated Beats (triplets) ---
beats3:     # Generated by AI: Scene 3
beats2:     # Generated by AI: middle flagged scene
beats1:     # Generated by AI: Scene 1 
BeatsUpdate:     # Type "Yes" to flag for update. Reminder: erase timestamp and clear cache
---
```

<hr>

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

### Zero draft mode

Zero draft mode helps you focus on capturing edits before reopening finished scenes.

- When enabled in Settings → Zero draft mode, clicking a scene where `Publish Stage` is `Zero` and `Status` is `Complete` shows a small dialog instead of opening the note.
- The dialog displays a large input field populated from the scene’s `Pending Edits` frontmatter (if any). You can type additional edits and click OK to save.
- Buttons:
  - OK: Overwrites `Pending Edits` with the current input (uses Obsidian’s standard `processFrontMatter`). If you cleared previously non‑empty text, you’ll be asked to confirm deleting it (the key remains with an empty value).
  - Cancel: If there are unsaved changes, you’ll be asked to discard them; otherwise the dialog closes. No write.
  - Override: Opens the note without saving. If there are unsaved changes, you’ll be asked to discard them first.
- Matching is case‑insensitive on keys and values. Defaults: `Publish Stage` defaults to `Zero` if missing; `Status` defaults to `Todo` if missing. Interception occurs only when Stage = Zero AND Status = Complete.
- Turn this off any time in Settings if you prefer to open scenes directly.

## Installation

**From Obsidian**

1.  Open Settings > Community plugins.
2.  Turn off Safe mode if it's on.
3.  Click Browse and search for "Radial Timeline".
4.  Click Install and then Enable.

<hr>

**Manual installation**

1.  Download the latest `main.js`, `styles.css`, and `manifest.json` from the <a href="https://github.com/EricRhysTaylor/radial-timeline/releases" target="_blank" rel="noopener">releases</a> page.
2.  Extract the files to your vault's .obsidian/plugins/radial-timeline

## Screen resolution suggestions

The Radial Timeline is designed for high pixel density displays (around 200 PPI or higher) for an optimal visual quality. This means:

- All Apple Retina displays or 2x pixel density (MacBooks, iMacs, etc.)
- Windows systems with 4K displays or higher (may require adjusted scaling) will work well
- Tablets and Mobile Phones all support High DPI

If you're experiencing visual quality issues on Windows, please check your display scaling settings in Windows Settings > System > Display > Scale and layout.

## Technical implementation

The Radial Timeline visualization was inspired by and draws on principles from <a href="https://d3js.org" target="_blank" rel="noopener">D3.js</a>, a powerful JavaScript library for producing dynamic, interactive data visualizations. While the plugin doesn't directly use the D3 library to reduce dependencies, it implements several D3-style approaches:

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

If you encounter issues or have feature requests, please file an issue on the <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener">GitHub repository issues page</a>. If you find the Radial Timeline plugin useful and would like to support continued development, please consider buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhysTaylor" target="_blank" rel="noopener">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 150px;" >
</a>

## License

This project is licensed under the MIT License - see the LICENSE file for details.
