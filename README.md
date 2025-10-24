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


The manuscript visualization plugin for Obsidian

Radial Timeline™ transforms your manuscript into a living visual map. Scenes are arranged by act, subplot, and narrative order in a striking radial layout—revealing the structure, rhythm, and scope of your story at a glance.

Instead of scrolling through text-heavy spreadsheets, you can explore your project as a dynamic, colorful visualization. Each ring represents a subplot; hover and click interactions surface details, relationships, and momentum between scenes.

Radial Timeline™ visualizes both story time and author time — tracking how your narrative unfolds and how your manuscript progresses through drafting, revision, and publication.
It’s a timeline for your story and your writing journey.


<a href="https://youtu.be/7noTSFaj8Eo" target="_blank" rel="noopener">
  <p align="center">
    <img src="https://i.ytimg.com/vi/7noTSFaj8Eo/maxresdefault.jpg" alt="Plot your novel with radial timeline in obsidian | complete author walkthrough & setup guide" style="max-width: 80%; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  </p>
  <p align="center" style="font-family: 'Lato', sans-serif; font-size: 16px; margin-top: 10px;">
    Plot your novel with radial timeline in obsidian<br>
    Complete author walkthrough & setup guide
  </p>
</a>

## Interface features

- Quick setup. Create a note pre-populated with required metadata (yaml). Duplicate that scene or use other plugins like templater and metadata menu to automate the process.
- Shows scene details on hover: title, date, synopsis, subplot, character, overdue and revisions lines
- Color-codes scenes by status (todo, working, overdue, complete)
- Opens scene note or beat note on click
- Supports any story beat system (Save The Cat, Hero's Journey) via the yaml `class: beat`. Beat notes appear as fixed-width slices
- Estimates manuscript completion date based on remaining todo/working scenes and recent progress rate
- Headline font used for subplot ring labels in top left quadrant
- Rotate counterclockwise so act 2 can align under act 1 for readability
- Gossamer view for charting narrative momentum

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
      <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/RadialTimeline_Screenshot4.jpeg" alt="Gossamer View" style="width: 350px; max-width: 100%; border-radius: 8px;" />
    </a>
    <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Gossamer View</div>
  </div>
</div>

<div style="text-align: center; font-size: 0.8em; margin-top: 10px; color: #888;">
  Click image to view full size in browser
</div>  

## Settings (under plugins in the Obsidian settings area)

The plugin offers several settings to customize its behavior and enable ai features:

* Source path: set the root folder for scene files (for example, "book 1/scenes"). leave blank to scan the entire vault.
* Target completion date: optional target date (yyyy-mm-dd). a marker appears on the outer ring.
* Show all scenes and beats: when on, the outer ring combines all subplot scenes and shows beat slices. when off, the outer ring shows main plot only and no beat cells are drawn.
* Zero draft mode: prevents edits to scenes marked complete and stage zero, instead providing a modal to enter any ideas that can be saved for later revision stages.
* Story beat system: Set story beat system and generate beat notes.
* Select gossamer beat system templates or create your own then generate notes in source folder.
* Create entire set of story system beat notes using save the cat, hero's journey or storygrid.
* AI LLM Beats Analysis
* Publishing stage colors: customize colors for publish stage values (zero, author, house, press). each has a reset button.
* Ring Colors: customize up to 16 rings (after which the colors repeat)

<hr>

## Command palette (Command P on Mac or Control P on PC)

* Radial Timeline: Search timeline. Keyword search across select metadata. Title, Date, Synopsis, AI Beats, Character & Subplot
* Clear search to reset all search filters
* Gossamer view toggle to show beat momentum visualization overlay
* Gossamer enter momentum scores opens modal for all-in-one momentum score entry
* Generate manuscript to assemble clean manuscript for Gossamer AI analysis
* AI Beats update (manuscript order) to update AI beat analysis for all scenes in manuscript order
* AI Beats update (subplot order) to update AI beat analysis for scenes in a selected subplot
* Create template note to create a basic scene as defined by `class=scene` with frontmatter
* Open timeline view (or interface button in the command ribbon)

<hr>

## All scenes & main plot mode 

Toggle in settings to display either all scenes mode or main plot mode. For all scenes mode, the timeline will show all scenes from all subplots ordered in the outer ring with story beats and subplot color coding. All scenes mode provides a full picture with all of the details including story beats.

Main plot mode removes the story beats, shows only main plot scenes in the outer ring and uses publish stage coloring rather than subplot ring coloring, emphasizing progress towards getting the book ready for publication in a simplified view.

<hr>

## Zero draft mode

Zero draft mode encourages good writing hygiene so you can finish the zero draft and not get caught in a revision loop that never ends.

When enabled in settings zero draft mode toggle, clicking a scene where publish stage is zero and status is complete shows a small dialog instead of opening the note. The dialog displays a large input field populated from the scene's pending edits frontmatter. You can add, amend or delete and click ok to save.

<hr>

## Story beats system

The plugin supports beat structuring using yaml `class: beat`. These appear as narrow slices on the outermost ring when all scenes mode is enabled. Scene number squares adjust their color to reflect the flagged/current scene grade. Hover to view beat details and click to open the beat note. Supports Save The Cat (15 beats), Hero's Journey (12 beats), Story Grid (15 beats), or custom beat system. Beats are required for Gossamer view.

<hr>

## Gossamer momentum view

Using your story beats system, this view grays the timeline and displays the momentum values tied to each story beat to show how well the manuscript is building tension and excitement. Works with any beat structure - whether you use Save the Cat (15 beats), Hero's Journey (12 beats), Story Grid (15 beats), or your own custom beat system. Simply create Plot notes with `Class: Plot` and enter the `Gossamer1=34` values in yaml to chart the values across these beats.

Workflow using Command Palette functions:
- Radial Timeline: Generate manuscript to prepare the text for your favorite LLM.
- Gossamer Enter Scores to open modal that will present multiple options and a convenient way to enter scores for all beats.
- Copy Template for AI: use this button to generate scores template for AI. 
- Paste from clipboard inputs the score name value pairs en mass.
- Delete all scores (with confirmation)
- Save Scores

Features:
- Historical tracking: Supports up to 30 historical runs (Gossamer1-30) with automatic history shifting (#1 is always the current and 30 the oldest run)
- Min/Max band visualization: Shows range between historical scores
- Score entry modal: Complete interface for adding or deleting scores with validation
- Clipboard integration: Copy/paste functionality for AI-generated scores
- Template generation: Copy Prompt Template for AI LLM
- Plot system filtering: Works with any beat system or custom structures (only filters if you explicitly set a beat system in settings)
- Score validation: 0-100 range validation with error highlighting (red dot for missing value, defaults to 0)

<hr>

### AI Beats Analysis

The plugin can automatically generate scene analysis using AI LLM to evaluate the pacing for individual flagged scenes as triples (in groups of 3), entire suplots or the manuscript:

* Triplet Analysis: AI analyzes 3 scenes at a time (previous, current, next) from the perspective of the middle scene
* Beat Evaluation: Each scene gets a grade and specific feedback on pacing, tension, and story progression
* Metadata Integration: Results are stored in scene frontmatter as 1beats, 2beats, and 3beats fields
* Manual Line Breaks: Use [br] anywhere in beat text to force line breaks in timeline hover display

Configuration:
- AI Provider: Choose between Anthropic, Gemini, or OpenAI
- Contextual Prompt: Customize the analysis prompt for your specific needs
- API Logging: Track all AI interactions in the "AI" folder

Commands:
- Beats update (manuscript order): Process all scenes in manuscript order
- Beats update (subplot order): Process scenes within a selected subplot only

Workflow:
1. Ensure scenes have Beats Update: Yes in frontmatter to flag for processing
2. Run "Beats update" commands subplot order or all scenes order to generate triplet analysis
3. View results via timeline number square text colors based on flagged/current scene grade where A = green, B = orange, C= red. And hover synopsis beats lines with similar color codinb based on each beating receiving a + = green, - = red or ? = black.

Manual Alternative: You may manually enter beat fields in YAML or use web clients to generate similar results, avoiding API use.

<hr>

## Frontmatter examples and usage

YAML Examples for use inside each scene or beat note. This frontmatter must be placed at the front of the note before any other text. 

## Scene

```yaml
---
Class: Scene
Act: 1
When: 2000-01-31    #Date when the scene takes place in the fictional calendar
Synopsis: The protagonist discovers a mysterious artifact.
Subplot:
  - Main Plot       #Should be only key scenes that advance the overall plot. Try not to overlap scenes across multiple suplots except where truly appropriate
  - Plot 2         
Character:
  - "[[Protagonist A]]"
  - "[[Mentor B]]"
Status: Todo
Publish Stage: Zero
Revision:           #Track how many times you've rewritten the scene
Due: 2025-01-31     #When you want to finish writing the scene
Pending Edits:      #For when you need to jot a few revision ideas down
Beats Update:       #Flag used to perform AI beats triplet analysis
Book: Book 1 A New Beginning
---
```

## Plot note using Save The Cat titled "1 opening image":

```yaml
---
Class: Beat  #formerly plot - backward compatible
Act: 1
Description: The first impression of your story. A snapshot of the protagonist's life before the journey begins. This 'before' picture sets up the world and establishes what will change by the end. Show the protagonist in their everyday life, revealing the flaw or gap that will be addressed.
Beat Model: Save The Cat
Gossamer1: 12 #always the most recent score
Gossamer2: 8 #each successive score will form a second line and range for historical comparison
Gossamer3: 4 #older scores for trend analysis
Gossamer4: 15 #even older scores
Gossamer5: 6 #oldest scores capped at 30
---
```

## AI beats analysis

In settings, use your preferred AI model to generate an evaluation of 3 scenes from the perspective of the middle scene (a triplet). In the front matter, the yaml fields appear as 1beats (previous scene), 2beats (current scene, includes a grade), and 3beats (next scene). These are shown when hovering over a scene in the timeline. You can run the commands "Beats update (manuscript order)" or "Beats update (subplot order)" to populate or refresh them. To control wrapping in the timeline hover display, insert [br] anywhere within a beat line to force a manual line break at that point.

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
Beats Update: Yes
---
```

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
Beats Update:     # Type "yes" to flag for AI Beats update
---
```

<hr>

## Installation

From Obsidian

1.  Open settings > community plugins.
2.  Click browse and search for "radial timeline".
3.  Click install and then enable.

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

Please see the Github Wiki for documentation at <a href="https://github.com/EricRhysTaylor/Radial-Timeline/wiki"  target="_blank" rel="noopener">Github Radial Timeline Wiki</a>. Also check out the Discussions group at <a href="https://github.com/EricRhysTaylor/Radial-Timeline/discussions" target="_blank" rel="noopener">Discussions</a>. If you encounter issues or have feature requests, please file an issue on the <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener">Github Repository Issues page</a>. If you find the radial timeline plugin useful and would like to support continued development, please consider joining my <a href="https://www.patreon.com/c/EricRhysTaylor" target="_blank" rel="noopener">Patreon</a> or just buying me a coffee:

<a href="https://www.buymeacoffee.com/ericrhysTaylor" target="_blank" rel="noopener">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="buy me a coffee" style="width: 150px;" >
</a>

<hr>

## Author

Created by Eric Rhys Taylor

Reviewed and approved for the Obsidian Community Plugins directory. Developed with best practices and secure API use in mind.

## License & Intellectual Property

Radial Timeline™ © 2025 Eric Rhys Taylor  
Released under a **Source-Available, Non-Commercial License**.  

- You may view, install, and use this plugin for personal or educational purposes.
- Commercial use, redistribution, or creation of derivative works using this source code is prohibited without written permission.
- The “Radial Timeline” name is a trademark of Eric Rhys Taylor.  

See the [LICENSE](./LICENSE) and [NOTICE](./NOTICE) files for full details.

## Disclaimer & Limitation of Liability

This software is provided “as is” without warranty of any kind, express or implied.
The author makes no guarantees regarding performance, reliability, or compatibility with third-party plugins, APIs, or services.