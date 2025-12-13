### Planning Your Novel
*   **Story Beats**: Use any story beat system (Save the Cat, Hero's Journey, Story Grid, or Custom) to lay out the story momentum scaffolding.
*   **Act Structure**: Create and distribute scenes by act (1-3) to see your three-act structure take shape as scene ideas come to you.
*   **Subplot Tracking**: Each ring represents a different subplot—see how plot threads interweave.
*   **Beat Templates**: Generate complete story beat sets like Save the Cat using Settings → Story beat system.

**Command**: `Create template scene note`
**Settings**: `Story beat system`

### Tracking Progress
*   **Status Colors**: In **Subplot Mode**, scenes are color-coded by status (Todo = plaid, Working = pink, Overdue = red, Complete = publish stage color customizable in settings). In Narrative and Chronologue modes, scenes display their subplot color.
*   **Completion Estimates**: Plugin calculates target completion date based on your recent writing pace.
*   **Publishing Stages**: Track manuscript through Zero → Author → House → Press.
*   **Subplot Mode**: Switch to subplot mode (navigation top right via page icon or keyboard 2) for simplified view emphasizing publication progress as well as individual subplots.

**Modes**: Narrative (key 1) or Subplot (key 2)
**Settings**: Publishing stage colors

### Zero Draft Mode
Prevents edits to completed zero-draft scenes. Click completed scene → modal for pending edits → save ideas for later revision. Keeps you progress to new scenes instead of endlessly revising.

**Settings**: → Radial Timeline → Zero draft mode

### Manage Subplots in Bulk
Need to rename or delete a subplot across dozens of scenes? Use the **`Subplot Manager`** command (command palette → “Radial Timeline: Open Subplot Manager”). The modal lets you:

* Rename a subplot and automatically update the frontmatter of every scene using it.
* Delete a subplot and strip the tag from all scenes in one action.

This is especially helpful after reorganizing your B/C plots—you no longer have to hunt through every note manually.

### Moving Scenes
You can reorder scenes directly on the timeline using drag-and-drop. This feature is exclusive to **Narrative Mode**.

1.  Switch to **Narrative Mode** (keyboard 1).
2.  Hover over the **scene number square** on the outer ring. The cursor will change to a double-arrow.
3.  **Click and drag** to the target position (another scene number square). A tick mark tracks your progress around the timeline.
4.  Release to drop. A confirmation dialog will appear with details of the move.
5.  Confirm to reorder.

**Note**: If you move a scene to a different Act, the feature will automatically evaluate the target scene's act and amend the YAML frontmatter to match.
