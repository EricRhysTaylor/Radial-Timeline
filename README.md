## Obsidian Manuscript Timeline

A manuscript timeline for creative fiction writing projects that displays scenes organized by act, subplot, and chronological order in a radial format for a comprehensive view of project.

This timeline is meant to provide a contrast to a text-heavy spreadsheet layout of the story outline and timeline. Instead, it offers a colorful, comprehensive visual snapshot of the entire story, using rings to represent subplots and cells, wrapping in chronological order to depict each scene. Various cues and interactions are available through a search feature that highlights the search term throughout and mouse-over functionality, revealing summary information in a colorful style. Hopefully, this will provide another method for tracking the progress of your manuscript and making it easier to stay on schedule and focused on what is truly a monumental task.

<div style="border: 1px solid #444; border-radius: 8px; padding: 15px; margin: 15px 0;">
## Sister Plugin

Looking for a more compact way to track scene progress and key dates?
Check out the complementary [Manuscript Calendar](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Calendar) plugin!
It provides a compact calendar view in the sidebar, showing revision status and key dates.

You can find it on GitHub or by searching for "Manuscript Calendar" in the Obsidian Community Plugins browser.
</div>

## Features

- Creates an interactive radial timeline visualization of your scenes
- Organizes scenes by act, subplot, and chronological order
- Shows scene details on hover including title, date, synopsis, subplots, and characters
- Color-codes scenes by status (Complete, Working, Todo, etc.)
- Supports both light and dark themes
- Allows clicking on scenes to open the corresponding file
- Visually highlights currently open scene tabs in the radial timeline with special styling
- Fully integrated into Obsidian's interface - no external plugins required

## Commands

* **Open Manuscript Timeline**: Opens the timeline view in the center area
* **Search Timeline**: Opens a modal to search scenes by title, synopsis, character, subplot, location, or POV
* **Clear Timeline Search**: Clears the current search results

## Development

This project follows strict code quality guidelines to ensure security and maintainability. If you're interested in contributing, please review our [Code Quality Guidelines](CODE_QUALITY.md) which includes information about pre-commit hooks and safe alternatives to innerHTML/outerHTML.

<a href="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot.png" target="_blank" rel="noopener" style="display: inline-block; cursor: pointer;">
  <img src="https://raw.githubusercontent.com/ericrhystaylor/obsidian-manuscript-timeline/master/screenshot.png" alt="Example Timeline Screenshot" style="max-width: 100%; border-radius: 8px; border: 1px solid #444;" />
</a>
<div style="text-align: center; font-size: 0.8em; margin-top: 5px; color: #888;">
  Click image to view full size in browser
</div>

### How to Use

1. Install the plugin in your Obsidian vault
2. Configure the source path in the plugin settings to point to your scenes folder
3. Ensure your scene files have the required frontmatter metadata (see below)
4. Click the manuscript timeline ribbon icon or run the "Show Manuscript Timeline" command from the Command Palette
5. The timeline will open in a new tab in the main editor area
6. Interact with the timeline by hovering over scenes to see details and clicking to open the corresponding file
7. Use the zoom controls in the top left corner to zoom in/out and reset the view
8. The timeline automatically updates when you modify, create, or delete scene files

### Settings

The plugin offers several settings to customize its behavior:

- **Source Path**: Set the folder containing your scene files (e.g., "Book 1" or "Scenes")
- **Publishing Stage Colors**: Customize colors for different publishing stages (Zero, Author, House, Press)
- **Reset to Default Colors**: Restore all color settings to their original values if you've made changes
- **Debug Mode**: Enable detailed logging in the console (useful for troubleshooting)

These settings can be accessed from Settings → Community Plugins → Manuscript Timeline → Settings.

### Required Scene Metadata

Scene files must have the following frontmatter:
- Class: Scene - Identifies the file as a scene and part of the manuscript
- Synopsis - Brief description of the scene
- Subplot - Subplot(s) the scene belongs to (default if empty is Main Plot)
- Act - Act number (1-3) (if empty then 1)
- When - Date of the scene (required)
- Character - Characters in the scene
- Publish Stage - (Zero, Author, House, Press)
- Status - Scene status (Todo, Working, Complete)
- Due - Due date for the scene of Completion Date
- Pending Edits - Optional future editing notes


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
Pending Edits:
---
```

### Timeline Visualization Elements

The timeline displays:
- Scenes arranged in a circular pattern
- Acts divided into sections
- Subplots organized in concentric rings
- Scene numbers in small boxes
- Color-coded scenes based on status
- Month markers around the perimeter
- Progress ring showing year progress

Hover over a scene to see its details and click to open the corresponding file.

### Scene Ordering and Numbering

- Scenes are ordered chronologically based on the When date in the frontmatter metadata
- The plugin parses scene numbers from the Title prefix (e.g., "1.2" in "1.2 The Discovery")
- These numbers are displayed in small boxes on the timeline
- Using numbered prefixes in your scene titles helps Obsidian order scenes correctly in the file explorer
- If scenes have the same When date, they are sub-ordered by their scene number

### Technical Implementation

The Manuscript Timeline visualization was inspired by and draws on principles from [D3.js](https://d3js.org), a powerful JavaScript library for producing dynamic, interactive data visualizations. While the plugin doesn't directly use the D3 library to reduce dependencies, it implements several D3-style approaches:

- SVG-based visualization techniques
- Data-driven document manipulation
- Interactive elements with hover and click behaviors
- Radial layouts and polar coordinates
- Scale transformations and data mapping
- Dynamic color manipulation and pattern generation

The visualizations are built using pure SVG and JavaScript, offering a lightweight solution that maintains the elegance and interactivity of D3-style visualizations while being fully compatible with Obsidian's rendering capabilities.

### Installation

- Download the latest release
- Extract the files to your vault's `.obsidian/plugins/manuscript-timeline` folder
- Enable the plugin in Obsidian's Community Plugins settings

## Feedback and Support

Found a bug or have a suggestion? Please open an issue on the [GitHub issues page](https://github.com/EricRhysTaylor/Obsidian-Manuscript-Timeline/issues).

Your feedback helps improve the plugin for everyone!

If you find the Manuscript Timeline plugin useful and would like to support continued development, or simply want to say thanks for the many hours of work that went into creating this visualization tool for writers, please consider buying me a coffee. Your support is greatly appreciated and helps motivate future improvements!

<a href="https://www.buymeacoffee.com/ericrhystaylor" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 150px;" >
</a>

