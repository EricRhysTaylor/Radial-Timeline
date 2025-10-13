# Gossamer API Version Archive

This folder contains the original automated API-based Gossamer implementation that was replaced with a simpler manual score entry system.

## What was archived (October 2025)

### Files:
- `manuscript.ts` - Full manuscript assembly utilities (strip YAML, concatenate scenes)
- `GossamerAssemblyModal.ts` - Modal with progress tracking for manuscript assembly
- `runGossamerAnalysisAPI-snapshot.ts` - Snapshot of the complex AI analysis function

### Why it was replaced:

1. **Token limits**: 190k+ word manuscripts exceeded Claude's 200k token context window
2. **Cost**: Full manuscript analysis was very expensive per run
3. **Complexity**: Trying to automate what authors should do themselves
4. **Output**: AI produced detailed analysis too rich for simple YAML storage

### The new approach:

Authors now:
1. Run manuscript through Claude web interface (unlimited context, cheaper)
2. Get detailed beat analysis with momentum scores
3. Manually enter scores via simple modal
4. Gossamer focuses on visualization, not analysis

This archive preserves the work in case we want to revisit API-based analysis in the future (perhaps with chunking or synopsis-based approaches).

