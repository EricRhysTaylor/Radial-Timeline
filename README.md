# Obsidian Timeline Radial

A beautiful interactive radial timeline visualization plugin for Obsidian.md that displays scenes from your writing project in a circular timeline.

## Features

- Creates an interactive radial timeline visualization of your scenes
- Organizes scenes by act, subplot, and chronological order
- Shows scene details on hover including title, date, synopsis, subplots, and characters
- Color-codes scenes by status (Complete, Working, Todo, etc.)
- Supports both light and dark themes
- Allows clicking on scenes to open the corresponding file

## How to Use

1. Install the plugin in your Obsidian vault
2. Configure the source path in the plugin settings to point to your scenes folder
3. Ensure your scene files have the required frontmatter metadata:
   - `Class: Scene` - Identifies the file as a scene
   - `When` - Date of the scene (required)
   - `Title` - Scene title
   - `Subplot` - Subplot(s) the scene belongs to
   - `Act` - Act number (1-3)
   - `Status` - Scene status (Complete, Working, Todo, etc.)
   - `Synopsis` - Brief description of the scene
   - `Character` - Characters in the scene
   - `Due` - Optional due date for the scene
   - `Edits` - Optional editing notes (scenes with Edits will display with purple number boxes)

4. Run the "Create Interactive Timeline" command using the Command Palette (Cmd/Ctrl+P) to generate the visualization
5. The timeline will be created in the "Outline" folder as an HTML file
6. Open the HTML file in Obsidian using the HTML Reader plugin to view and interact with your timeline
7. To update the timeline after making changes to your scene files, run the "Create Interactive Timeline" command again

## Scene Metadata Example

```yaml
---
Class: Scene
Title: 1.2 The Discovery
When: 2023-05-15
Subplot: Main Plot
Act: 1
Status: Complete
Synopsis: The protagonist discovers a mysterious artifact.
Character: [John, Sarah]
Edits: Changes for the next revision
---
```

## Timeline Visualization

The timeline displays:
- Scenes arranged in a circular pattern
- Acts divided into sections
- Subplots organized in concentric rings
- Scene numbers in small boxes
- Color-coded scenes based on status
- Month markers around the perimeter
- Progress ring showing year progress

Hover over a scene to see its details and click to open the corresponding file.

![Timeline Radial Screenshot](https://raw.githubusercontent.com/EricRhysTaylor/obsidian-timeline-radial/main/screenshot.png)

## Scene Ordering and Numbering

- Scenes are ordered chronologically based on the `When` date in the frontmatter metadata
- The plugin parses scene numbers from the Title prefix (e.g., "1.2" in "1.2 The Discovery")
- These numbers are displayed in small boxes on the timeline
- Using numbered prefixes in your scene titles (like "1.2 The Discovery") helps Obsidian order scenes correctly in the file explorer
- If scenes have the same `When` date, they are sub-ordered by their scene number

## Installation

- Download the latest release
- Extract the files to your vault's `.obsidian/plugins/Timeline` folder
- Enable the plugin in Obsidian's Community Plugins settings

## Required Plugins

This plugin creates HTML files that can be viewed in Obsidian. For the best experience, you should have:

- **Core Plugins**: Make sure the "Outgoing Links" core plugin is enabled
- **Community Plugins**: The [HTML Reader](https://github.com/nuthrash/obsidian-html-plugin) plugin is recommended for viewing the generated timeline HTML files

No other plugins are required for basic functionality. The plugin uses Obsidian's native API to read frontmatter metadata from your Markdown files - Dataview is NOT required. The plugin then generates an interactive HTML timeline visualization based on this metadata.

## Development

- Clone this repository
- Run `npm i` to install dependencies
- Run `npm run dev` to start compilation in watch mode
- Copy the `main.js`, `styles.css`, and `manifest.json` files to your vault's plugins folder

## License

MIT

## Author

Created by Eric Rhys Taylor

For questions, issues, or feature requests, please contact via GitHub.