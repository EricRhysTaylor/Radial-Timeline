<p align="center">
  <img src="https://raw.githubusercontent.com/EricRhysTaylor/radial-timeline/master/logo.png" alt="Radial Timeline Logo" width="10%">
</p>
<p align="center" style="font-family: sans-serif; font-weight: 100; font-size: 14px; margin-top: 12px; margin-bottom: 0; letter-spacing: 8px;">
  Radial Timeline™
</p>
<p align="center" style="font-family: sans-serif; font-size: 14px; margin-bottom: 10px;">
  by Eric Rhys Taylor
</p>


<p align="center">
    <a href="https://github.com/EricRhysTaylor/radial-timeline/stargazers" target="_blank" rel="noopener"><img src="https://img.shields.io/github/stars/EricRhysTaylor/radial-timeline?colorA=363a4f&colorB=e0ac00&style=for-the-badge" alt="GitHub star count"></a><!-- Enhancements --><a href="https://github.com/EricRhysTaylor/radial-timeline/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement" target="_blank" rel="noopener">
  <img src="https://img.shields.io/github/issues/EricRhysTaylor/radial-timeline/enhancement?colorA=363a4f&colorB=00bfa5&style=for-the-badge&label=enhancements" alt="Open enhancements on GitHub">
</a><a href="https://github.com/EricRhysTaylor/radial-timeline/issues?q=is%3Aclosed+label%3Aenhancement" target="_blank" rel="noopener">
  <img src="https://img.shields.io/github/issues-closed/EricRhysTaylor/radial-timeline/enhancement?colorA=363a4f&colorB=4a90e2&style=for-the-badge&label=closed%20enhancements" alt="Closed enhancements on GitHub">
</a>
<a href="https://github.com/EricRhysTaylor/radial-timeline/issues?q=is%3Aissue+is%3Aopen+label%3Abug" target="_blank" rel="noopener">
  <img src="https://img.shields.io/github/issues/EricRhysTaylor/radial-timeline/bug?colorA=363a4f&colorB=e93147&style=for-the-badge&label=bugs" alt="Open bugs on GitHub">
</a>
    <br/>
	<a href="https://obsidian.md/plugins?id=radial-timeline" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json&query=$.radial-timeline.downloads&label=Downloads&style=for-the-badge&colorA=363a4f&colorB=d53984" alt="Plugin Downloads"/></a>
	<a href="https://github.com/EricRhysTaylor/radial-timeline/blob/master/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=Non-Commercial&colorA=363a4f&colorB=b7bdf8" alt="Non-Commercial license"/></a>
</p>

---

## What It Does

<p>Radial Timeline™ arranges your scenes by act, subplot, narrative or chronological order in a striking radial layout—revealing the structure, rhythm, and scope of your story. Each ring represents a subplot; hover interactions surface important details like scene synopsis and AI story pulses. Scenes highlight across subplots to show interrelationships. Multiple view modes dissect your novel like an X-ray.</p>

<p>**Before**: Scrolling through line after line of spreadsheet tables and files, losing sight of how your B-plot interweaves with the main storyline.</p>

<p>**After**: One visual map showing every scene, every subplot, every beat color coded and connected to the big picture.</p>

<p>Radial Timeline™ captures and visualizes all 4 critical timelines, revealing the big picture as your manuscript evolves from the nucleus of an idea to the final polished novel.</p>

1. **Narrative time**: the sequence you reveal events to readers.
2. **Chronological time**: when events happen in your story's world. (Includes Planetary Time calculator for sci-fi/fantasy calendars).
3. **Author time**: your scene writing progress with target completion dates from Todo to Complete.
4. **Publishing time**: manuscript revision stages from Zero draft through Press-ready.

Narrative and Chronologue modes keep subplot colors front-and-center so you can compare structure without workflow noise. When you need to see Todo/Working/Overdue progress or publish stage colors, jump into Publication Mode (formerly Subplot Mode) where all scenes is replaced by Main Plot and scenes inherit the author-status and publish-stage palette.

---

## Docs (How-to & setup)

If you want the “how-to” details (setup, templates, YAML, reordering, advanced options), they live in the wiki:

- [Wiki Home](https://github.com/EricRhysTaylor/Radial-Timeline/wiki)
- [How-to](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/How-to)
- [Settings](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/Settings)
- [Commands](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/Commands)
- [YAML Frontmatter](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/YAML-Frontmatter)

<br>
<a href="https://youtu.be/7noTSFaj8Eo" target="_blank" rel="noopener">
  <p align="center">
    <img src="https://i.ytimg.com/vi/7noTSFaj8Eo/maxresdefault.jpg" alt="Plan your novel with radial timeline in obsidian | complete author walkthrough & setup guide" style="max-width: 80%; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  </p>
  <p align="center" style="font-family: sans-serif; font-size: 16px; margin-top: 10px;">
    Plan your novel with radial timeline in obsidian<br>
    Complete author walkthrough & setup guide
  </p>
</a>


---

## Installation

**From Obsidian**
1.  Open settings → community plugins.
2.  Click browse and search for "radial timeline".
3.  Click install and then enable.

**Manual installation**
1.  Download the latest main.js, styles.css, and manifest.json from the <a href="https://github.com/EricRhysTaylor/radial-timeline/releases" target="_blank" rel="noopener">releases</a> page.
2.  Extract the files to your vault's .obsidian/plugins/radial-timeline (may be hidden by file system)

---

## Known Conflicts

*   **Plugin Conflicts**: If you experience visual glitches or strange behavior (such as the timeline overlapping with other UI elements), it may be due to a conflict with another plugin. Try disabling other plugins to isolate the issue. Please see [known plugin conflicts](https://github.com/EricRhysTaylor/Radial-Timeline/issues?q=label%3A%22Plugin+Conflict%22).


---

## Technical Notes

### Screen Resolution
The radial timeline is designed for high pixel density displays (around 200 ppi or higher) for optimal visual quality.
*   All Apple Retina displays — 2x pixel density.
*   Recommend Windows systems with 4k displays or higher. (Tested down to 1440p 2560x1440)
*   Tablets.

If you're experiencing visual quality issues on Windows, please check your display scaling settings.

---

## Acknowledgments

*   [d3.js](https://d3js.org) — powerful data-driven, SVG-based visualization patterns that present complex statistical data in a visually appealing and approachable format.
*   [Save the Cat! Writes a Novel](https://www.jessicabrody.com/books/non-fiction/save-cat-writes-novel/about/) (2018), Jessica Brody — a practical articulation of the Save the Cat beats.
*   [The Story Grid](https://storygrid.com), Shawn Coyne — a rigorous methodology for analyzing scenes and beat flow.
*   [Obsidian](https://obsidian.md) — for a thriving plugin ecosystem and thoughtful feature development.
*   [W3C SVG specification](https://www.w3.org/Graphics/SVG/) — for making vector graphics on the web dependable.
*   **04 Font** by Yuji Oshimoto — a beautiful Japanese freeware font. © 1998–2003 Yuji Oshimoto. [04.jp.org](http://www.04.jp.org/) このフォントはフリーウェアです。非営利目的での配布、譲渡、転載は自由ですが、作者の許可なく販売したり、営利目的の製品に添付する事は固く禁じさせて頂きます。なお、このフォントを使用していかなる損害についても作者は責任を負わないものとします。御意見、御感想などよろしければメールください。

---

## Feedback and support

Check out the Discussions group at <a href="https://github.com/EricRhysTaylor/Radial-Timeline/discussions" target="_blank" rel="noopener">Discussions</a>. If you encounter issues or have feature requests, please file an issue on the <a href="https://github.com/EricRhysTaylor/radial-timeline/issues" target="_blank" rel="noopener">Github Repository Issues page</a>.

---

## Author

Created by Eric Rhys Taylor

Reviewed and approved for the Obsidian Community Plugins directory. Developed with best practices in mind.

---

## License & Intellectual Property

Radial Timeline™ © 2025 Eric Rhys Taylor  
Released under a **Source-Available, Non-Commercial License**.  

- You may view, install, and use this plugin for personal or educational purposes.
- Commercial use, redistribution, or creation of derivative works using this source code is prohibited without written permission.
- The "Radial Timeline" name is a trademark of Eric Rhys Taylor.  

See the [License](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/License) and [Notice](https://github.com/EricRhysTaylor/Radial-Timeline/wiki/Notice) pages for full details.

---

## Disclaimer & Limitation of Liability

This software is provided "as is" without warranty of any kind, express or implied.
The author makes no guarantees regarding performance, reliability, or compatibility with third-party plugins, APIs, or services.