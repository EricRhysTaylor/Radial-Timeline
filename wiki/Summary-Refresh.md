# Summary refresh

`Summary refresh` regenerates scene summaries with AI.

Use it when you want to refresh the `Summary` field used by Inquiry and deep export workflows, rather than the shorter pulse analysis shown in scene hover metadata.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/Summary refresh.png" alt="Summary refresh modal" style="width: 560px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Summary refresh — regenerate longer scene summaries and optionally update Synopsis</div>
</div>

## What It Updates

Summary refresh writes:

*   **Summary**: the longer corpus-oriented summary
*   **Synopsis**: optional, if you enable `Also update Synopsis`

## Run Modes

The modal supports several run modes:

*   flagged scenes
*   missing summaries only
*   missing, weak, or stale summaries
*   regenerate all summaries

You can also set:

*   target summary length
*   weak-summary threshold
*   optional Synopsis update length

## Notes

This command is separate from scene pulse analysis.

*   **Pulse** writes short structured scene-by-scene editorial feedback
*   **Summary refresh** writes longer summary text for corpus-level use

## Related Docs

*   [AI Pulse Triplet Analysis](AI-Pulse-Analysis)
*   [Inquiry View](Inquiry-View)
