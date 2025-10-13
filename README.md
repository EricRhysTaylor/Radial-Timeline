<p align="center">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/logo.png" alt="Radial Timeline Logo" width="10%">
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-weight: 100; font-size: 14px; margin-top: 12px; margin-bottom: 0; letter-spacing: 8px;">
  Radial Timeline™
</p>
<p align="center" style="font-family: 'Lato', sans-serif; font-size: 14px; margin-top: 4px;">
  by Eric Rhys Taylor
</p>


<p align="center">
    <a href="https://github.com/EricRhysTaylor/radial-timeline/stargazers" target="_blank" rel="noopener"><img src="https://img.shields.io/github/stars/EricRhysTaylor/radial-timeline?colorA=363a4f&colorB=e0ac00&style=for-the-badge" alt="GitHub star count"></a>
    <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener"><img src="https://img.shields.io/github/issues/EricRhysTaylor/radial-timeline?colorA=363a4f&colorB=e93147&style=for-the-badge" alt="Open issues on GitHub"></a>
    <br/>
	<a href="https://obsidian.md/plugins?id=radial-timeline" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&query=$.radial-timeline.downloads&label=Downloads&style=for-the-badge&colorA=363a4f&colorB=d53984" alt="Plugin Downloads"/></a>
	<a href="https://github.com/EricRhysTaylor/radial-timeline/blob/master/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=Non-Commercial&colorA=363a4f&colorB=b7bdf8" alt="Non-Commercial license"/></a>
</p>
<hr style="margin-bottom: 20px;">

Radial Timeline™ — manuscript visualization plugin for Obsidian.

A comprehensive radial timeline for long-form writing that displays scenes organized by act, subplot, and numeric order in a radial format for a comprehensive view of the project.

This timeline is meant to provide a contrast to a text-heavy spreadsheet layout of the story scenes comprising the manuscript. Instead, it offers a colorful, comprehensive visual snapshot of the entire story, using rings to represent subplots. Various cues and interactions are available through a search feature and hover and click functionality. This will provide another method for tracking the progress of your manuscript and make it easier to stay on schedule and focused.


<a href="https://youtu.be/7noTSFaj8Eo" target="_blank" rel="noopener">
  <p align="center">
    <img src="https://i.ytimg.com/vi/7noTSFaj8Eo/maxresdefault.jpg" alt="Plot your novel with radial timeline in obsidian | complete author walkthrough & setup guide" style="max-width: 80%; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  </p>
  <p align="center" style="font-family: 'Lato', sans-serif; font-size: 16px; margin-top: 10px;">
    Plot your novel with radial timeline in obsidian<br>
    Complete author walkthrough & setup guide
  </p>
</a>


## Features

- Quick setup. Create a note pre-populated with required metadata (yaml). Duplicate that scene or use other plugins like templater and metadata menu to automate the process.
- Shows scene details on hover: title, date, synopsis, subplot, character, overdue and revisions lines
- Color-codes scenes by status (todo, working, overdue, complete)
- Opens scene note or plot note on click
- Supports any plot system (Save The Cat, Hero's Journey) via the yaml class: plot. Plot notes appear as fixed-width slices
- Estimates completion date based on remaining todo/working scenes and recent progress rate
- Headline font used for subplot ring labels in top left quadrant
- Rotate counterclockwise so act 2 can align under act 1 for readability


## Commands

* Search timeline: keyword search across select metadata. Title, Date, Synopsis, AI Beats, Character & Subplot
* Clear search: reset all search filters
* Gossamer view toggle: toggle the Gossamer plot momentum visualization overlay
* Gossamer enter momentum values
* Beats update (manuscript order): update AI beat analysis for all scenes in manuscript order
* Beats update (subplot): update AI beat analysis for scenes in a selected subplot
* Beats clear cache: clear saved beat results to force a full reprocess (for scenes with BeatsUpdate = yes)
* Create template note: create a basic template file with frontmatter
* Open: open the timeline view (or interface button in the command ribbon)

<div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
  <div style="text-align: center;">
    <a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot1.jpeg" target="_blank" rel="noopener" style="cursor: pointer;">
      <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot1.jpeg" alt="All Scenes Timeline" style="width: 350px; max-width: 100%; border-radius: 8px;" />
    </a>
    <div style="font-size: 0.85em; margin-top: 8px; color: #666;">All Scenes Timeline</div>
  </div>
  <div style="text-align: center;">
    <a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot2.jpeg" target="_blank" rel="noopener" style="cursor: pointer;">
      <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot2.jpeg" alt="Timeline Hover Synopsis" style="width: 350px; max-width: 100%; border-radius: 8px;" />
    </a>
    <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Timeline Hover Synopsis</div>
  </div>
</div>

<div style="text-align: center; font-size: 0.8em; margin-top: 10px; color: #888;">
  Click image to view full size in browser
</div>  

<div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 20px;">
  <div style="text-align: center;">
    <a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot3.jpeg" target="_blank" rel="noopener" style="cursor: pointer;">
      <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot3.jpeg" alt="Main Plot Mode" style="width: 350px; max-width: 100%; border-radius: 8px;" />
    </a>
    <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Main Plot Mode</div>
  </div>
  <div style="text-align: center;">
    <a href="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot4.jpeg" target="_blank" rel="noopener" style="cursor: pointer;">
      <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot4.jpeg" alt="Search Results" style="width: 350px; max-width: 100%; border-radius: 8px;" />
    </a>
    <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Search Results</div>
  </div>
</div>

<div style="text-align: center; font-size: 0.8em; margin-top: 10px; color: #888;">
  Click image to view full size in browser
</div>  

## All scenes & main plot mode 

Toggle in settings to display either all scenes mode or main plot mode. For all scenes mode, the timeline will show all scenes from all subplots ordered in the outer ring with plot beats and subplot color coding. All scenes mode provides a full picture with all of the details including plot beats.

Main plot mode removes the subplot beats, shows only main plot scenes in the outer ring and uses publish stage coloring rather than subplot ring coloring, emphasizing progress towards getting the book ready for publication in a simplified view.

<hr>

## Zero draft mode

Zero draft mode encourages good writing hygiene so you can finish the zero draft and not get caught in a revision loop that never ends.

- When enabled in settings → zero draft mode, clicking a scene where publish stage is zero and status is complete shows a small dialog instead of opening the note.
- The dialog displays a large input field populated from the scene's pending edits frontmatter. You can type additional edits and click ok to save.
- Buttons:
  - ok: overwrites pending edits with the current input. If you cleared previously non‑empty text, you'll be asked to confirm deleting it.
  - cancel: if there are unsaved changes, you'll be asked to discard them; otherwise the dialog closes.
  - override: opens the note without saving. If there are unsaved changes, you'll be asked to discard them first.

<hr>

## Scene and plot metadata

The plugin uses yaml frontmatter to identify and organize your scenes and plot points. Here are the key examples, from basic to advanced.

Required scene metadata

Scene files are identified by having class: scene in their frontmatter. The following fields are used by the timeline:

```yaml
---
Class: Scene
Act: 1
When: 2000-01-31
Synopsis: The protagonist discovers a mysterious artifact.
Subplot:
  - Main Plot
  - Plot 2
Character:
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

## Plot beats (save the cat beats)

The plugin supports plot structuring using yaml class: plot. These appear as narrow slices on the outermost ring when the "outer ring shows all scenes" setting is enabled. Hover to view beat details and click to open the plot note.

## Gossamer momentum view

This view dims the timeline and displays the momentum values to show how well the manuscript is building tension and excitement. Here, save the cat has 15 beats, offering a good number of points to assess the plot's strength. Use gossamer command generate manuscript, then give it to your AI of choice and ask for a rating between 0 and 100 for each save the cat beat. When I used this in Claude Sonnet 4.5, it provided a detailed analysis with the ratings. You can ask the LLM for a concise list of each rating and copy and paste using the Enter Momentum Scores command.


Create a svc beat note titled "1 opening image" and paste this frontmatter:

```yaml
---
Class: Plot
Act: 1
Description: The first impression of your story. It should capture the essence of your story and establish the "before" snapshot of your protagonist's world.
Beat Model: SaveTheCat
Gossamer1: 12 #always the most recent score
Gossamer2: 8 #each successive score will form a second line and range for historical comparison
Gossamer3: 4
---
```

<hr>

## AI beats analysis

In settings, use your preferred AI model to generate an evaluation of 3 scenes from the perspective of the middle scene (a triplet). In the front matter, the yaml fields appear as 1beats (previous scene), 2beats (current scene, includes a grade), and 3beats (next scene). These are shown when hovering over a scene in the timeline. You can run the commands "Beats update (manuscript order)" or "Beats update (subplot)" to populate or refresh them. To control wrapping in the timeline hover display, insert [br] anywhere within a beat line to force a manual line break at that point. Note: if you have run this scene before, be sure to use "Beats clear cache" to process again (prevents unnecessary duplicate API calls).

Note: you can always manually enter these fields and achieve the same effect and avoid using the LLM API. You can also use a web client and produce similar results you can paste into the yaml. It is recommended that you place a spending cap on the API account for your LLM.

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

## Advanced scene example

While the plugin only requires a few specific metadata fields to function, your scene notes can contain any other frontmatter you need for your personal writing process. The radial timeline plugin will safely ignore any fields it doesn't use.

Here is an example of a more detailed scene note that includes both plugin-specific fields and custom fields for personal organization.

```yaml
---
# All required radial plugin fields come first, followed by story grid, optional, and AI beats.

Class: Scene     # Always "scene" for this fileclass
Act: 1     # Story act number 1-3
When: 2000-01-31     # In-world date for the scene
Duration: 0     # How much story time passes (minutes, hours, days)

Synopsis: Explain concisely what happens in this scene.

Subplot:     # Reference one or more arcs this scene belongs to. Default = Main Plot
  - Main Plot
  - Plot 2

Character:     # Character on stage; link to character notes
  - "[[protagonist a]]"
  - "[[mentor b]]"

Place:     # Location tags; link to class place notes
  - "[[earth]]"

Status: Todo     # Workflow status: todo / working / complete
Publish Stage: Zero     # Zero = draft, author = ready for revision, house = reviewed and edited, press = ready for publication
Revision:     # Leave blank until stage > zero; increment as revisions occur
Due: 2026-01-31     # Deadline for this scene
Pending Edits:     # Concrete revisions to address (e.g., "change venue to a moon of jupiter.")

# --- Story Grid Analysis ---
Type:     # Scene type: revelation / turning point / confrontation / decision / setup / payoff / inciting incident / deepening
Shift:     # Polarity change: + / - (or +/- if it flips both ways)
Questions:     # Prompt: what is the reader wondering?
Reader Emotion:     # e.g., curious / shocked / uneasy / hopeful / betrayed / triumphant
Internal:     # How do the character change? (e.g., from trusting → suspicious)

# --- Optional Fields ---
Total Time: 0.0     # Writing/production time spent (hours in decimal)
Words: 0     # scene wordcount
Book: Book 1 A New Beginning     # Book project label
Support Files:     # Attachments, references, research notes

# --- AI-Generated Beats (triplets) ---
beats3:     # Generated by AI: scene 3
beats2:     # Generated by AI: middle flagged scene
beats1:     # Generated by AI: scene 1 
BeatsUpdate:     # Type "yes" to flag for update. reminder: erase timestamp and clear cache
---
```

<hr>

## Settings

The plugin offers several settings to customize its behavior and enable ai features:

* Source path: set the root folder for scene files (for example, "book 1/scenes"). leave blank to scan the entire vault.
* Target completion date: optional target date (yyyy-mm-dd). a marker appears on the outer ring.
* Outer ring shows all scenes: when on, the outer ring combines all subplot scenes and shows beat slices there only. when off, the outer ring shows main plot only and no beat slices are drawn.
* AI LLM settings for beats analysis: configure model for automated beat generation via commands.
    * Default ai provider: choose LLM model
    * Anthropic settings: api key
    * Gemini settings: api key
    * Openai settings: api key
    * Log ai interactions to file: creates notes in an "AI" folder with prompt/request/response details
* Publishing stage colors: customize colors for publish stage values (zero, author, house, press). each has a reset button.
* Ring Colors: customize up to 16 rings (after which the colors repeat)

<hr>

## Installation

From Obsidian

1.  Open settings > community plugins.
2.  Turn off safe mode if it's on.
3.  Click browse and search for "radial timeline".
4.  Click install and then enable.

Manual installation

1. Install BRAT community plugin then paste in the Radial Timeline GitHub URL and click install. 

-OR-

1.  Download the latest main.js, styles.css, and manifest.json from the <a href="https://github.com/EricRhysTaylor/radial-timeline/releases" target="_blank" rel="noopener">releases</a> page.
2.  Extract the files to your vault's .obsidian/plugins/radial-timeline

<hr>

## Screen resolution suggestions

The radial timeline is designed for high pixel density displays (around 200 ppi or higher) for optimal visual quality. This means:

- All Apple Retina displays or 2x pixel density (macbooks, imacs, etc.)
- Windows systems with 4k displays or higher (may require adjusted scaling) will work well
- Tablets and mobile phones all support high dpi

If you're experiencing visual quality issues on Windows, please check your display scaling settings in Windows settings > system > display > scale and layout.

<hr>

## Technical implementation

The radial timeline visualization was inspired by and draws on principles from <a href="https://d3js.org" target="_blank" rel="noopener">d3.js</a>, a powerful javascript library for producing dynamic, interactive data visualizations. While the plugin doesn't directly use the d3 library to reduce dependencies, it implements several d3-style approaches:

- SVG-based visualization techniques
- Data-driven document manipulation
- Interactive elements with hover and click behaviors
- Radial layouts and polar coordinates
- Scale transformations and data mapping
- Dynamic color manipulation and pattern generation

The visualizations are built using pure SVG and javascript, offering a lightweight solution that maintains the elegance and interactivity of d3-style visualizations while being fully compatible with Obsidian's rendering capabilities.

<hr>

## Acknowledgements

This project stands on the shoulders of many generous teachers, tools, and storytellers:

- d3.js at [d3js.org](https://d3js.org) for pioneering data-driven, SVG-based visualization patterns that informed the radial layout, scales, and interaction patterns used here, even though the plugin implements them in plain SVG and javascript within the DOM of Obsidian.
- Save the Cat! Writes a Novel (2018), Jessica Brody — a practical articulation of the Save the Cat beats used by many authors. [Save the Cat](https://www.jessicabrody.com/books/non-fiction/save-cat-writes-novel/about/).
- The Story Grid, Shawn Coyne — a rigorous methodology for analyzing scenes and beat flow; helpful for systematically evaluating arcs across scenes. [storygrid.com](https://storygrid.com).
- The Obsidian community for a thriving plugin ecosystem and thoughtful feature development and implementation. [obsidian.md](https://obsidian.md).
- The W3C SVG specification and countless browser engineers for making vector graphics on the web dependable. [w3.org/Graphics/SVG](https://www.w3.org/Graphics/SVG/).

<hr>

## Feedback and support

Please see the Github Wiki for documentation at <a href="https://github.com/EricRhysTaylor/Radial-Timeline/wiki"  target="_blank" rel="noopener">Github Radial Timeline Wiki</a>. Also check out the Discussions group at <a href="https://github.com/EricRhysTaylor/Radial-Timeline/discussions" target="_blank" rel="noopener">Discussions</a>. If you encounter issues or have feature requests, please file an issue on the <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener">Github Repository Issues page</a>. If you find the radial timeline plugin useful and would like to support continued development, please consider buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhysTaylor" target="_blank" rel="noopener">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="buy me a coffee" style="width: 150px;" >
</a>

<hr>

## Author

Created by Eric Rhys Taylor

This plugin adheres to Obsidian.md development best practices, including secure DOM use and API compliance.

## License & Intellectual Property

Radial Timeline™ © 2025 Eric Rhys Taylor  
Released under a **Source-Available, Non-Commercial License**.  

- You may view, install, and use this plugin for personal or educational purposes.
- Commercial use, redistribution, or creation of derivative works using this source code is prohibited without written permission.
- The “Radial Timeline” name is a trademark of Eric Rhys Taylor.  

See the [LICENSE](./LICENSE) and [NOTICE](./NOTICE) files for full details.