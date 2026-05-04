`Inquiry omnibus pass` runs all enabled Inquiry questions in one batch.

> [!NOTE]
> `Inquiry omnibus pass` is currently undergoing beta testing. It is not part of the public release build yet and remains available only in development/testing paths for now.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/Inquiry omnibus.png" alt="Inquiry omnibus command panel" style="width: 560px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Inquiry omnibus pass — run the full enabled Inquiry set across the current scope</div>
</div>

## What It Does

The omnibus pass executes enabled questions across the Inquiry zones and returns a combined set of findings for the current corpus.

It works with the active Inquiry scope, such as:

*   Book
*   Saga

Depending on provider and engine path, the run may execute as a combined omnibus flow or as sequential provider calls behind the scenes.

## Related Docs

*   [Inquiry](Inquiry#running-an-inquiry)
*   [Inquiry View](Inquiry-View)
