# Obsidian Timeline Radial

A beautiful interactive radial timeline visualization plugin for Obsidian.md that displays scenes from your writing project in a circular timeline.

## Features

- Creates an interactive radial timeline visualization of your scenes
- Organizes scenes by act, subplot, and chronological order
- Shows scene details on hover including title, date, synopsis, subplots, and characters
- Color-codes scenes by status (Complete, Working, Todo, etc.)
- Automatically updates when files change
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

4. Run the "Create Interactive Timeline" command to generate the visualization
5. The timeline will be created in the "Outline" folder as an HTML file

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

## Installation

- Download the latest release
- Extract the files to your vault's `.obsidian/plugins/Timeline` folder
- Enable the plugin in Obsidian's Community Plugins settings

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
