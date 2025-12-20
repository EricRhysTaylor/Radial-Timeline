### Reorder Scenes

Scenes in Radial Timeline can be reordered in two ways: **by renaming the scene title** or **by dragging scenes in Narrative Mode**.

---

#### Method 1: Reorder by Scene Title (All Versions)

Radial Timeline uses the **leading scene number in the scene title** to determine order.

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
- Drag the **numbered scene squares** on the outer ring (cursor becomes double arrow)

![Drag scene start](images/drag.png)

- Drop the scene into its new position on the **numbered scene square**

![Drag scene destination](images/drag-arc.png)

- Confirm the change when prompted

This method automatically updates ordering for you.

**Note:** You can only drag a scene to another act if that act already contains at least one scene. To move a scene to an empty act, either create a new scene in that act first or manually update the `Act` field in the scene's YAML frontmatter.

---

#### Summary

- Scene order is controlled by the **number at the start of the title**
- Scene order is **scoped to the Act**
- Changing acts requires updating the **YAML `Act:` field**
- Narrative Mode supports **drag-and-drop reordering**

### Manage Subplots in Bulk

Need to rename or delete a subplot across dozens of scenes? Use the **`Subplot Manager`** command (command palette → “Radial Timeline: Open Subplot Manager”). The modal lets you:

* Rename a subplot and automatically update the frontmatter of every scene using it.
* Delete a subplot and strip the tag from all scenes in one action.

This is especially helpful after reorganizing your B/C plots—you no longer have to hunt through every note manually.

### Search
You can filter scenes by searching for text content across multiple fields.

*   **Trigger**: Use the command palette (`Cmd/Ctrl + P`) → **Radial Timeline: Search timeline**.
*   **Matches**: Searches case-insensitive text in:
    *   Title
    *   Date (`When`) and Times (e.g., "9am", "April")
    *   Synopsis
    *   Pulse analysis
    *   Subplot
    *   Characters
*   **Visuals**:
    *   **Scene Numbers**: Highlighted in yellow on the outer ring.
    *   **Text**: Matching text within the synopsis or metadata hover is outlined in yellow.
*   **Clear**: Use the command **Radial Timeline: Clear search** or click the clear button in the search bar.

### Other Key Workflows

*   **Zero Draft Mode**: Prevent edits to completed scenes to focus on forward momentum. See [[Zero Draft Mode]].
*   **AI Analysis**: Analyze your scenes for pacing and consistency. See [[AI Analysis]].

