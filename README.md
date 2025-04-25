<p align="center">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/master/logo.png" alt="Manuscript Timeline Logo" width="10%">
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-weight: 100; font-size: 14px; margin-top: 12px; margin-bottom: 0; letter-spacing: 8px;">
  MANUSCRIPT TIMELINE
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-size: 14px; margin-top: 4px;">
  by Eric Rhys Taylor
</p>


<p align="center">
    <a href="https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/stargazers"><img src="https://img.shields.io/github/stars/EricRhysTaylor/Obsidian-Manuscript-Timeline?colorA=363a4f&colorB=e0ac00&style=for-the-badge" alt="GitHub star count"></a>
    <a href="https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/issues"><img src="https://img.shields.io/github/issues/EricRhysTaylor/Obsidian-Manuscript-Timeline?colorA=363a4f&colorB=e93147&style=for-the-badge" alt="Open issues on GitHub"></a>
    <br/>
	<a href="https://obsidian.md/plugins?id=manuscript-timeline"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&query=$.manuscript-timeline.downloads&label=Downloads&style=for-the-badge&colorA=363a4f&colorB=d53984" alt="Plugin Downloads"/></a>
    <a href="https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/blob/master/LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&colorA=363a4f&colorB=b7bdf8" alt="MIT license"/></a>
</p>
<hr style="margin-bottom: 20px;">

A manuscript timeline for creative fiction writing projects that displays scenes organized by act, subplot, and chronological order in a radial format for a comprehensive view of project.

This timeline is meant to provide a contrast to a text-heavy spreadsheet layout of the story outline and timeline. Instead, it offers a colorful, comprehensive visual snapshot of the entire story, using rings to represent subplots and cells, wrapping in chronological order, to depict each scene. Various cues and interactions are available through a search feature that highlights the search term throughout and mouse-over functionality, revealing summary information in a colorful style. Hopefully, this will provide another method for tracking the progress of your manuscript and making it easier to stay on schedule and focused.

## Features

- Creates an interactive radial timeline visualization of your scenes
- Organizes scenes by act, subplot, and chronological order
- Shows scene details on hover including title, date, synopsis, subplots, and characters
- Color-codes scenes by status (Complete, Working, Todo, etc.)
- Supports both light and dark themes
- Allows clicking on scenes to open the corresponding file
- Visually highlights currently open scene tabs in the radial timeline with special styling
- Displays estimated completion date based on remaining Todo/Working scenes and your recent progress rate
- Shows a visual arc and marker indicating the estimated completion timeframe
- Labels subplot rings with descriptive titles for easy identification
- Fully integrated into Obsidian's interface - no external plugins required

## Commands

* Open Manuscript Timeline: Opens the timeline view in the center area
* Search Timeline: Opens a modal to search scenes by title, synopsis, character, subplot, location, or POV
* Clear Timeline Search: Clears the current search results

<a href="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot.png" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot.png" alt="Example Timeline Screenshot" style="max-width: 100%; border-radius: 8px;" />
</a>

<a href="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot2.png" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot2.png" alt="Example Timeline Screenshot Synopsis" style="max-width: 100%; border-radius: 8px;" />
</a>

<div style="text-align: center; font-size: 0.8em; margin-top: 5px; color: #888;">
  Click image to view full size in browser
</div>
  
## How to Use

1. Install the plugin in your Obsidian vault
2. Configure the source path in the plugin settings to point to your scenes folder
3. Ensure your scene files have the required frontmatter metadata (see below)
4. Click the manuscript timeline ribbon icon or run the "Show Manuscript Timeline" command from the Command Palette
5. The timeline will open in a new tab in the main editor area
6. Interact with the timeline by hovering over scenes to see details and clicking to open the corresponding file
7. Use the zoom controls in the top left corner to zoom in/out and reset the view
8. The timeline automatically updates when you modify, create, or delete scene files

## Settings

The plugin offers several settings to customize its behavior:

- Source Path: Set the folder containing your scene files (e.g., "Book 1" or "Scenes")
- Publishing Stage Colors: Customize colors for different publishing stages (Zero, Author, House, Press)
- Reset to Default Colors: Restore all color settings to their original values if you've made changes
- Debug Mode: Enable detailed logging in the console (useful for troubleshooting)

These settings can be accessed from Settings → Community Plugins → Manuscript Timeline → Settings.

## Required Scene Metadata

Scene files must have the following frontmatter:
- Class: Scene - Identifies the file as a scene and part of the manuscript
- Synopsis - Brief description of the scene
- Subplot - Subplot(s) the scene belongs to (default if empty is Main Plot)
- Act - Act number (1-3) (if empty then 1)
- When - Date of the scene (required)
- Character - Characters in the scene
- Publish Stage - (Zero, Author, House, Press)
- Status - Scene status (Todo, Working, Complete)
- Due - Due date for the scene
- Pending Edits - Optional future editing notes
- 1beats - First Scene beats linking to actively edited scene 2
- 2beats - Second Scene beats, the active scene
- 3beats - Third Scene beats linking to scene 2
- BeatsUpdate: Yes
---

## Beats Metadata (1beats, 2beats, 3beats):

API using ChatGPT is implemented under the Plugin Settings. Automates generation of beats continuuity between select or all vault scenes using Obsidian Command Console 


```yaml
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
  - 40.5 Initial discovery + / Leads Naturally to scene 45
  - Realizes artifact is active ? / Interesting idea
2beats:
  - 45 Artifact causes minor chaos - / Needs tighter tie-in to alpha subplot for stronger bridge
  - Attempts to hide it + / Great twist
3beats:
  - 48 Antagonist senses artifact's activation - / The subtext could be stronger
  - Plans to investigate + / Serves as the hub for Scene 2's strategy session
BeatsUpdate: Yes
```

## Timeline Visualization Elements

The timeline displays:
- Scenes arranged in a circular pattern
- Acts divided into sections
- Subplots organized in concentric rings with descriptive titles at the top
- Scene numbers in small boxes
- Color-coded scenes based on status
- Month markers around the perimeter showing calendar months of the year
- Rainbow progress ring showing elapsed portion of the current calendar year (not related to story timeline)
- Estimated completion date arc (dark purple) showing projected completion timeline with Red Tick Mark
- Central legend showing counts for each status and publish stage

Hover over a scene to see its details and click to open the corresponding file.

## Scene Ordering and Numbering

- Scenes are ordered chronologically based on the When date in the frontmatter metadata
- The plugin parses scene numbers from the Title prefix (e.g., "1.2" in "1.2 The Discovery")
- These numbers are displayed in small boxes on the timeline
- Using numbered prefixes in your scene titles helps Obsidian order scenes correctly in the file explorer
- If scenes have the same When date, they are sub-ordered by their scene number

## Technical Implementation

The Manuscript Timeline visualization was inspired by and draws on principles from [D3.js](https://d3js.org), a powerful JavaScript library for producing dynamic, interactive data visualizations. While the plugin doesn't directly use the D3 library to reduce dependencies, it implements several D3-style approaches:

- SVG-based visualization techniques
- Data-driven document manipulation
- Interactive elements with hover and click behaviors
- Radial layouts and polar coordinates
- Scale transformations and data mapping
- Dynamic color manipulation and pattern generation

The visualizations are built using pure SVG and JavaScript, offering a lightweight solution that maintains the elegance and interactivity of D3-style visualizations while being fully compatible with Obsidian's rendering capabilities.

## Installation

## From Obsidian

1.  Open Settings > Community plugins.
2.  Turn off Safe mode if it's on.
3.  Click Browse and search for "Manuscript Calendar".
4.  Click Install and then Enable.

## Manual Installation

1.  Download the latest `main.js`, `styles.css`, `manifest.json` from the [Releases](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/releases) page of the GitHub repository.
2.  Extract the files to your vault's `.obsidian/plugins/manuscript-timeline`

## Screen Resolution Requirements

The Manuscript Timeline is designed for high pixel density displays (around 200 PPI or higher) for optimal visual quality. This means:

- All Apple Retina displays (MacBooks, iMacs, etc.) will work perfectly
- Windows systems with 4K displays (when properly scaled) will work well
- Lower resolution displays or Windows systems not properly configured for 4K scaling may show some visual artifacts or less crisp rendering

If you're experiencing visual quality issues on Windows, please check your display scaling settings in Windows Settings > System > Display > Scale and layout.

## Author

Created by Eric Rhys Taylor

This plugin adheres to Obsidian.md development best practices, including secure DOM manipulation and API compliance.

## Feedback and Support

If you encounter any issues or have feature requests, please file an issue on the [GitHub repository issues page](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/issues). If you find the Manuscript Calendar plugin useful and would like to support continued development, please consider buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhystaylor" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 150px;" >
</a>

## License

This project is licensed under the MIT License - see the `LICENSE` file for details.
