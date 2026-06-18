**Keyboard Shortcut**: `1`

Progress Mode isolates each subplot into its own radial pass, removing the combined outer ring. This mode focuses on **Author time** (your writing status) and **Progress stages** (revision stages), making it ideal for tracking workflow at a glance.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/mode-progress.png" alt="Progress Mode" style="width: 300px; max-width: 100%; border-radius: 8px;" />
</div>

## Key Features

*   **Single Thread Focus**: View one subplot at a time to analyze its specific arc and continuity.
*   **Act Structure**: Like Narrative Mode, scenes are distributed across your configured act count (default 3). Each act spans an equal segment of the 360° circle.
*   **Cleaner View**: Removes story beats to reduce visual noise while you focus on workflow.

<a name="inner-status-and-stage-grid"></a>
## Inner Status & Stage Grid

Unlike Narrative Mode, this mode replaces subplot colors with your workflow status:

1.  **Author Status**:
    *   **Todo**: Plaid pattern.
    *   **Working**: Pink.
    *   **Overdue**: Red.
    *   **Complete**: Inherits the color of the scene Progress Stage.

2.  **Progress Stage Colors**:
    *   Once a scene is "Complete", it displays the color of its current stage (Zero Draft, Author's Draft, House Edit, Press Ready).
    *   These colors can be customized in [Progress stage colors](Settings-Core#progress-stage-colors).

Together, inner status and the stage grid answer two questions:

*   **Inner status**: what is happening with this scene right now?
*   **Stage grid**: which draft or editing stage has this scene reached?

Together they turn the radial view into a project-management dashboard, highlighting what needs to be written, what is overdue, and what is ready for the next stage of editing.

<a name="zero-draft-mode"></a>
## Zero Draft Mode

**Zero Draft Mode** is a guardrail against never-ending revision while you finish a first draft. When it is enabled, clicking a scene that has reached **Progress Stage = Zero** and **Status = Complete** opens a **Pending Edits** panel instead of the scene file, so you can jot down what to revise later without dropping back into the prose. Enable it in [Settings](Settings-Core), and capture revision ideas in the scene's `Pending Edits` field.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/panel-zero-draft.png" alt="Zero Draft Mode panel" style="width: 480px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Zero Draft Mode — capture revision notes without reopening the scene</div>
</div>
