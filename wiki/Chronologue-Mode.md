**Constructing Your Story Timeline**

[![Chronologue Mode Walkthrough](https://img.youtube.com/vi/XKWq32LB0d0/0.jpg)](https://www.youtube.com/watch?v=XKWq32LB0d0)
> *Watch the full walkthrough on [YouTube](https://www.youtube.com/watch?v=XKWq32LB0d0)*

Chronologue mode is essential for constructing and visualizing the chronological backbone of your story—particularly valuable for non-linear narratives, mysteries, thrillers, or any story where **when events happen** differs from **when you reveal them**. The palette matches Narrative mode (subplot colors only) so the timing comparisons stay clean while Subplot Mode retains the Todo/Working/Overdue and publish-stage overlays.

### Core Workflow
1.  **Add chronological metadata**: As you create scenes, fill in the `When` field (YYYY-MM-DD HH:MM) and `Duration` field (e.g., "2 hours", "3 days", "1 week").
2.  **Switch to Chronologue mode** (keyboard **3** or top-right navigation): Scenes rearrange to show story-world event order across the full 360° circle.
3.  **Activate Shift mode** (keyboard **Shift** or click shift button or use caps lock): See the bones of your story's temporal structure for all scenes and subplots.
4.  **Compare elapsed time**: In shift mode, click two scenes to see the elapsed story-time between them with the duration arc. Keep clicking more scenes as needed.
5.  **Analyze time gaps**: Also in shift mode, discontinuities (large time jumps) appear with ∞ symbol—identify gaps that might need bridging scenes.

> **Minimum metadata**: Chronologue only needs a year in the `When` field to place a scene. Year-only (`When: 2045`), year+month (`When: 2045-07`), or textual month+year (`When: July 2045`) all work—missing pieces default to the 1st of that month at noon. Month-only, day-only, or time-only values are ignored and treated as "no When" until you add at least the year.

> **Drafting calmly**: Red "Missing When" number squares only appear once a scene's `Status` is `Working` or `Complete`, so Todo scenes can stay quiet while you're still sketching. When a date is missing, the hover synopsis displays the dates of the immediately preceding and following scenes (in narrative order) to help you pinpoint the correct timing.

### Why this matters
Some authors choose to organize scenes in manuscript/narrative order, but Chronologue mode lets you construct and verify the underlying chronological scaffolding without the constraints of the 3 acts or title ordering. You can spot:
*   Pacing issues (too much/too little story time between events)
*   Flashback positioning opportunities
*   Timeline consistency problems
*   Missing transition scenes

**Modes**: Chronologue mode (key **3**), Shift mode (key **Shift**)
**Settings**: Duration arc cap, Discontinuity gap threshold (Chronologue section)

<div style="text-align: center; margin: 20px 0;">
  <img src="images/discontinuity.png" alt="Discontinuity infinity symbols in Chronologue Mode" style="width: 380; max-width: 100%;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Discontinuity infinity symbols in Chronologue Mode</div>
</div>

<div style="text-align: center; margin: 20px 0;">
  <img src="images/duration.png" alt="Duration Marks in Chronologue Mode (red, orange and normal)" style="width: 380; max-width: 100%;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Duration Marks in Chronologue Mode (red, orange and normal)</div>
</div>


---

### Backdrop Notes
Backdrop notes allow you to visualize contextual events—historical wars, planetary alignments, or seasonal changes—that drive your plot but aren't specific scenes.

*   **Create**: Use the command **Create backdrop note** to generate a file with start/end times.
*   **Visualize**: These appear as a dedicated ring in Chronologue mode, grounding your scenes in their temporal context.
*   **Overlaps**: Two backdrops may overlap partially via visual plaid pattern

### Planetary Time (Experimental)

For sci-fi and fantasy authors, Chronologue mode includes an experimental **Planetary Time** system. While Radial Timeline requires Earth time (Gregorian calendar) for its internal logic and physics, you can create custom "Local Time" profiles to translate these dates into your world's calendar.

**Features:**
*   **Settings**: Define custom planetary profiles with specific astronomical facts:
    *   **Hours per day** (e.g., 26 hours on Bajor)
    *   **Days per week** (e.g., 5-day week)
    *   **Days per year** (e.g., 400 days)
    *   **Epoch Offset**: Shift the start date of your calendar relative to Earth's Unix Epoch (1970-01-01).
    *   **Custom Labels**: Define custom names for months and days of the week.
*   **Synopsis Hover**: In Chronologue Mode, hover over a scene to see its date converted to your active planetary profile.
*   **Calculator**: Use the command palette (`Cmd/Ctrl + P`) and search for **"Radial Timeline: Planetary time converter"** to open a calculator. Enter any Earth date/time to see the corresponding planetary date/time.
*   **Coming Soon**: A special Alt+Shift wireframe view for deep planetary analysis.

> **Note**: You must still plan and enter metadata using standard Earth format (`When: 2045-05-20`). This feature provides a "translation layer" to help you write scene content (e.g., "The sun set at 19:00 local time") without breaking the timeline's chronological structure.