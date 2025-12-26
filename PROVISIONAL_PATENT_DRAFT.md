## Provisional Patent Draft — Radial Timeline™ (Working Copy)

Inventor: Eric Rhys Taylor  
Assignee: None (individual filing)  
Date: 2025-12-26  

> Note: This is a technical drafting aid, not legal advice. A patent attorney/agent should review before filing.

---

### Title
Single-screen radial visualization system for long-form content with multi-thread ring mapping and multi-timeline modes

---

### Technical Field
The disclosure relates to computer-implemented user interfaces and visualization systems for planning, organizing, and managing long-form content, including narrative works and other structured content sets.

---

### Background
Creators of long-form works often rely on lists, folders, and spreadsheets to track segments (e.g., scenes/sections), threads (e.g., subplot/storyline/topic), and timing (e.g., reader order, in-world chronology). Conventional tools fragment this information across multiple views and screens, which can make it difficult to perceive structure and continuity at scale, and to stay on schedule as a work evolves.

---

### Summary (High Level)
Disclosed is a computer-implemented system that renders an entire long-form work on a single screen as a radial map. Content segments are arranged around a circle and mapped into concentric rings representing threads/subplots. A mode controller renders the same underlying dataset in four coordinated modes that implement four timelines: narrative time, chronological time, author progress time, and publishing stage time. The interface surfaces dense segment metadata (e.g., synopsis, duration, status, stage) without requiring navigation away from the one-screen map and supports direct manipulation for reordering and exploration.

---

### Brief Description of the Drawings (Example Figure Set)
The following figures are exemplary and may be replaced or supplemented by additional screenshots:

- **FIG. 1**: Narrative mode radial map showing all segments and thread rings, with beat-system markers/labels on the perimeter and thread-based color coding. (`wiki/images/narrative.jpeg`)
- **FIG. 2**: Hover synopsis view showing information-dense segment metadata and analysis context while the radial map remains visible. (`wiki/images/synopsis.jpeg`)
- **FIG. 3**: Thread-isolated mode emphasizing author status and publish stage indicators for schedule adherence. (`wiki/images/subplot.jpeg`)
- **FIG. 4**: Chronological mode ordering segments by time metadata with adaptive time labeling and duration/overlap visualization. (`wiki/images/chronologue.jpeg`)
- **FIG. 5**: Chronological shift sub-mode showing elapsed-time comparison between selected segments and discontinuity/gap visualization. (`wiki/images/shift.jpeg`)
- **FIG. 6**: Momentum mode showing beat-level momentum values and trajectory visualization. (`wiki/images/gossamer.jpeg`)

---

### Detailed Description

#### A. Data model (content segments + metadata)
In one embodiment, a "content segment" is a discrete unit of a long-form work stored as a file. Content segments can include narrative scenes and structural beats/plot points. Each segment may include, or be associated with, metadata fields including:

- Identifier (e.g., filename prefix number)
- Thread assignment (one or more threads/subplots; a segment may belong to multiple threads)
- Narrative ordering attribute (e.g., numeric prefix in title/filename)
- Chronological time attribute (e.g., "When" date/time) and optionally duration
- Summary/synopsis text
- Character(s), Location, Point-of-view perspective
- Author progress status (e.g., Todo/Working/Overdue/Complete) and optionally due date
- Publishing stage (e.g., Zero/Author/House/Press)
- Beat system annotation (e.g., Save the Cat, Hero's Journey, Story Grid, custom)
- Momentum/analysis scores (e.g., AI-generated narrative drive scores)

The metadata can be stored as structured frontmatter (e.g., YAML) within the file and/or in an associated cache, and can be read by the system during rendering.

#### B. Single-screen radial map (ring/thread model with equispacing and density allocation)
The system renders a circular map with:

- Angular positions corresponding to a chosen ordering (e.g., narrative order or chronological order)
- Concentric rings corresponding to distinct threads/subplots (each ring visually representing one thread)
- Segment indicators (e.g., number squares or labeled arc slices) placed on rings to represent segments

**Equispacing optimization**: Each content segment occupies substantially equal angular space within its ring, independent of duration metadata. This ensures that all segment indicators remain clickable and can display identifying text (e.g., title), avoiding "tiny sliver" problems that would result from proportional sizing by duration.

**Ring density allocation**: Threads are ordered radially such that threads having more content segments are positioned at larger radii (outer rings) where more circumferential space is available, and threads having fewer content segments are positioned at smaller radii (inner rings) where less space is available. This optimizes the radial layout for balanced information density.

**Three-act angular structure**: The radial layout may be divided into angular sectors (e.g., three 120° sectors) representing structural divisions (e.g., acts), with visual dividers and optionally labeled with act identifiers. The system may support customizable sector counts (e.g., five-act structure).

This mapping enables an entire manuscript (or comparable long-form work) to be visualized at once on a single screen as an information-dense "visual puzzle" that the author assembles and refines.

#### C. Modes implementing four timelines
The system includes a mode controller configured to render four modes that implement four timelines:

1. **Narrative mode** (Narrative time): segments shown in reader order; thread colors dominant; may show beat-system markers/labels for pacing reference.
2. **Thread-isolated mode** (Author time + Publishing time): one thread shown at a time; visual encoding emphasizes author status (Todo/Working/Overdue/Complete) and publish stage colors; includes a central legend/grid key for rapid schedule assessment.
3. **Chronological mode** (Chronological time): segments positioned by chronological time metadata; may show duration arcs and overlaps; time labeling adapts to the span of the story timeline.
4. **Momentum mode** (Momentum timeline over structure): beat notes and momentum values displayed across the work’s structure; may show trajectories, ranges, and historical values.

The four modes allow the author to switch between timelines without leaving the one-screen radial representation.

#### D. Information-dense interaction on a single screen
The interface can include interactions such as:

- Hover/selection to display a synopsis panel containing dense metadata (title, date, synopsis, thread labels, and other fields)
- Visual cues to identify a dominant thread when a segment belongs to multiple threads (e.g., folded-corner cue)
- Direct manipulation to reorder segments in narrative order (e.g., dragging a segment indicator)

#### E. Chronological shift (elapsed-time + discontinuity visualization)
In an embodiment, the chronological mode includes a shift sub-mode in which selecting two segments generates an elapsed-time visualization (e.g., an arc) representing time between the selected segments. The system may identify large time gaps (discontinuities) and display gap indicators (e.g., an infinity symbol) to highlight potential continuity issues.

---

### Abstract (150–250 words; Working Draft)
A computer-implemented system provides a single-screen, information-dense visualization of an entire long-form work as a radial map. The work is decomposed into content segments, each having associated metadata including at least one thread assignment and at least one timeline attribute. The system generates a circular layout in which concentric rings represent distinct threads and angular position represents ordering. A selectable mode controller renders the same underlying dataset in four coordinated modes that implement four author-facing timelines: (i) a narrative mode presenting content segments in reader order with thread coloring and optionally beat-system markers; (ii) a thread-isolated mode presenting one thread at a time while emphasizing author schedule status and publishing stage; (iii) a chronological mode positioning content segments by time metadata and enabling gap and elapsed-time inspection; and (iv) a momentum mode presenting beat-level momentum values across the structure of the work. User interactions surface dense metadata without leaving the screen, including hover-based synopsis display and direct manipulation to reorder segments. The result is a unified one-screen interface that allows an author to assemble, verify, and maintain structural coherence across many segments while simultaneously tracking progress and publication stage.

---

### Claims (Optional for provisional; included for later non-provisional drafting)

1. **A computer-implemented method** for visualizing a long-form work on a single display, the method comprising:  
   receiving, by one or more processors, a plurality of content segments stored as files, each content segment having (i) an identifier, (ii) a narrative-order attribute, (iii) a thread attribute associating the content segment with at least one thread, and (iv) at least one metadata field selected from the group consisting of synopsis, character, location, point-of-view, duration, status, due, and publish stage;  
   generating a radial layout in which (a) a plurality of concentric rings represent respective threads and (b) angular position represents ordering of the plurality of content segments;  
   rendering, on a single screen, the radial layout in a selectable plurality of modes comprising a narrative mode, a thread-isolated mode, a chronological mode, and a momentum mode, each mode implementing a different author timeline selected from narrative time, chronological time, author progress time, and publishing stage time;  
   in the narrative mode, presenting content segments in narrative order with visual thread indicators;  
   in the thread-isolated mode, presenting content segments associated with a selected thread while visually emphasizing author progress status and publish stage;  
   in the chronological mode, positioning content segments according to a chronological time field and displaying time gaps between non-adjacent chronological positions;  
   in the momentum mode, presenting momentum values associated with structural beats of the long-form work; and  
   providing one or more interactive controls that, without leaving the single screen, (i) display metadata for a selected content segment and (ii) modify ordering of the content segments.

2. **A system** for single-screen visualization of a long-form work, comprising:  
   one or more processors;  
   a memory storing instructions that, when executed by the one or more processors, cause the system to:  
   ingest a plurality of content segments each associated with metadata including thread assignment and at least one timeline attribute;  
   compute a radial layout having concentric rings corresponding to threads and angular positions corresponding to ordering;  
   render the radial layout on a display in a plurality of selectable modes comprising a narrative mode, a thread-isolated mode, a chronological mode, and a momentum mode, wherein the modes implement respective timelines of narrative time, chronological time, author progress time, and publishing stage time; and  
   implement an interaction controller configured to present metadata for selected segments and to reorder segments via direct manipulation.

3. The method of claim 1, wherein the thread attribute is derived from a structured frontmatter field and wherein a content segment is associateable with multiple threads.

4. The method of claim 1, wherein the thread-isolated mode replaces thread coloring with a workflow palette representing status values including at least Todo, Working, Overdue, and Complete.

5. The method of claim 1, wherein the thread-isolated mode, for a content segment marked Complete, encodes the content segment according to a publish stage value.

6. The method of claim 1, wherein the interactive controls include hover interaction that displays a synopsis panel including at least a title and one or more metadata fields.

7. The method of claim 1, wherein the interactive controls include drag-and-drop reordering by selecting a segment indicator and dropping the segment indicator at a new position, further comprising persisting the new order by updating at least one ordering attribute stored in a file name or metadata.

8. The method of claim 1, wherein the chronological mode includes parsing partial time values including year-only and year-and-month values and defaulting missing components to first of month and time of noon.

9. The method of claim 1, wherein the chronological mode includes a shift sub-mode that, upon selection of two content segments, displays an elapsed-time comparison between the selected segments.

10. The method of claim 9, wherein the shift sub-mode identifies and visually marks discontinuities when an elapsed time between adjacent chronological content segments exceeds a threshold.

11. The method of claim 1, further comprising receiving and rendering backdrop events as a dedicated ring separate from the content segments, each backdrop event including a start time and an end time.

12. The method of claim 1, wherein the momentum mode associates momentum values with beat notes and renders the momentum values over the beat notes around the radial layout.


