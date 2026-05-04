**Keyboard Shortcut**: `2`

Narrative Mode is your primary manuscript-order workspace. It displays all scenes from all subplots on the outer ring, organized by **act divisions** (default 3 acts, configurable in **Settings → Acts**). Each act spans an equal segment of the 360° circle. This view emphasizes **Narrative time** (the order readers will experience the story).

<div style="text-align: center; margin: 20px 0;">
  <img src="images/narrative.jpeg" alt="Narrative Mode Timeline" style="width: 300px; max-width: 100%; border-radius: 8px;" />
</div>

## Key Features

*   **Structure**: Scenes are distributed across Act 1..Act N (based on your **Settings → Acts → Act count**).
*   **Book or Saga scope**: Switch between one active book and a combined Saga view.
*   **Subplot Colors**: The outer ring segments are colored by their subplot. This lets you quickly visualize which plot threads are dominant in each section of the book.
*   **Publishing markers**: Optional outer-ring placards can show chapter starts and part boundaries from your active novel PDF layout.
*   **Story Beats**: Displays story beats (like Save the Cat) along the timeline, helping you pace your narrative structure.
*   **Interactive Reordering**: You can drag scenes on the outer ring to reorder them. See [Reorder Scenes](How-to#reorder-scenes) for details.
*   **Recent moves overlay**: Narrative Mode can show a top-left list of recent committed scene and beat moves. Toggle it in [Settings → Advanced → Configuration](Settings-Advanced#configuration).

## Book and Saga Scope

The title-bar book selector controls which manuscript the timeline shows.

*   Choose a book to inspect one Book Manager profile.
*   Choose **Saga** to combine all configured books into one multi-book Narrative timeline.
*   Saga scope is available when more than one Book Manager profile is configured.
*   Saga scope stays in Narrative Mode, because multi-book scene order is a narrative-structure view rather than a chronology or progress view.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/rt-saga.png" alt="Narrative Mode saga view across multiple books" style="width: 560px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Saga view in Narrative Mode — multiple books combined into one manuscript-order timeline</div>
</div>

## Chapter and Part Placards

Narrative Mode can show publishing-aware placards on the outside of the scene ring:

*   **C** — a `Chapter:` field starts a chapter at that scene.
*   **P** — the selected PDF layout prints a Part opener at that act boundary.
*   **P/C** — a Part and Chapter begin at the same boundary.

These placards reflect the novel PDF layout selected in the Manuscript Export panel. For example, a layout that prints chapter openers can show **C** markers, while Modern Classic can also show **P** markers for Parts. Changing the selected export layout updates the timeline markers after the layout is saved.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/parts-chapters.png" alt="Narrative Mode chapter and part markers around the perimeter" style="width: 560px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Publishing markers on the perimeter — chapter starts, part boundaries, and combined Part/Chapter breaks</div>
</div>

## Dominant Subplots

When a scene belongs to multiple subplots, the outer All Scenes ring must choose one color. You control which subplot wins:

*   **Click a scene**: Sets its dominant subplot. That subplot's color is used for the scene on the outer ring, taking precedence over all others.
*   **Folded corner indicator**: Each subplot ring shows a small folded corner motif at its start. The corner has three states:
    *   **Missing** — the subplot is not assigned to this scene.
    *   **Gray** — the subplot is assigned but is not dominant.
    *   **Darker hue** of the subplot ring color — this subplot is dominant and expressed on the outer ring above all others.
*   **Reset**: Use **Settings → Core → Configuration → Reset subplot color precedence** to clear all manually assigned dominance.

This mode hides status and progress stage overlays to keep the focus on story structure and the weaving of subplots.
