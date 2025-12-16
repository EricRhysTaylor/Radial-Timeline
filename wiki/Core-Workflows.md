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
*   **Capture actual completion dates**: When you mark a scene as `Complete`, update its `Due` date to the day you finished. Those timestamps power the completion estimate calculations, so keeping them current improves the forecast.
*   **Publishing Stages**: Track manuscript through Zero → Author → House → Press.
*   **Subplot Mode**: Switch to subplot mode (navigation top right via page icon or keyboard 2) for a per-subplot view (no combined outer ring) that emphasizes publication progress and Todo/Working/Overdue status patterns.

**Modes**: Narrative (key 1) or Subplot (key 2)
**Settings**: Publishing stage colors

### Zero Draft Mode
Prevents edits to completed zero-draft scenes. Click completed scene → modal for pending edits → save ideas for later revision. Keeps you progress to new scenes instead of endlessly revising. See the **[Zero Draft Mode](Zero-Draft-Mode)** guide for full details.

**Settings**: → Radial Timeline → Zero draft mode

### Manage Subplots in Bulk
Need to rename or delete a subplot across dozens of scenes? Use the **`Subplot Manager`** command (command palette → “Radial Timeline: Open Subplot Manager”). The modal lets you:

* Rename a subplot and automatically update the frontmatter of every scene using it.
* Delete a subplot and strip the tag from all scenes in one action.

This is especially helpful after reorganizing your B/C plots—you no longer have to hunt through every note manually.

### Reordering Scenes

Scenes in Radial Timeline can be reordered in two ways: **by renaming the scene title** or **by dragging scenes in Narrative Mode** (newer versions).

---

#### Method 1: Reorder by Scene Title (All Versions)

Radial Timeline uses the **leading number in the scene title** to determine order.

Example:

    1 Tom rides a bike

- `1` = scene order  
- `Tom rides a bike` = scene title  

To move the scene, change the leading number:

    3 Tom rides a bike

The scene is now treated as Scene 3.  
Only the number controls ordering—the text after it is the title.

---

#### Acts and Scene Order

Scene order is **act-specific**.

If you change the scene number but do **not** update the Act, the scene will move to the new position **within its current act**.

Example YAML:

    Act: 1

If you rename a scene to the highest number in the manuscript but leave `Act: 1`, it will become the **last scene of Act 1**, not the last scene overall.

To move a scene to a different act, update the YAML:

    Act: 3

Always update both:
- the **scene number in the title**
- the **Act field in YAML**, if changing acts

---

#### Method 2: Drag & Drop (Narrative Mode Only)

In recent versions of Radial Timeline:

- Switch to **Narrative Mode**
- Drag the **numbered scene squares** on the outer ring
- Drop the scene into its new position
- Confirm the change when prompted

This method automatically updates ordering for you.

---

#### Summary

- Scene order is controlled by the **number at the start of the title**
- Scene order is **scoped to the Act**
- Changing acts requires updating the **YAML `Act:` field**
- Narrative Mode supports **drag-and-drop reordering**

