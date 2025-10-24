# Timeline Mode Architecture Analysis

## Current State Assessment

### The Problem
The current mode system is confusing and difficult to extend because it uses **two separate tracking mechanisms** that don't align well:

1. **`outerRingAllScenes`** (boolean setting) - Controls rendering behavior
2. **`interactionMode`** ('allscenes' | 'mainplot' | 'gossamer') - Controls interaction behavior

This creates several issues:
- Main Plot mode can exist in two different ways (setting-based vs interaction-based)
- Gossamer mode must force `outerRingAllScenes = true` then overlay its features
- Adding new modes requires juggling both systems
- Mode transitions are complex and error-prone
- The name "outerRingAllScenes" is misleading because it affects the entire rendering, not just the outer ring

### Current Mode Inventory

#### **All Scenes Mode** (Default)
**Rendering:**
- Outer ring: All scenes from all subplots in manuscript order
- Scene colors: Subplot-specific colors
- Beats: Gray slices with labels in outer ring
- Inner rings: Subplot-specific scenes
- Number squares: Full display

**Interactions:**
- Full hover effects with synopsis display
- Click to open scenes
- Zero Draft Mode integration
- Related scene highlighting

**Files involved:**
- `TimelineRenderer.ts` (lines 582, 872-1060)
- `AllScenesMode.ts` (hover and click handlers)
- `TimeLineView.ts` (orchestration)

---

#### **Main Plot Mode**
**Rendering:**
- Outer ring: ONLY Main Plot scenes
- Scene colors: Publish stage colors throughout timeline
- Beats: REMOVED from timeline entirely (not shown anywhere)
- Inner rings: Subplot-specific scenes
- Number squares: Full display

**Interactions:**
- Hover on scene items shows synopsis
- Click to open scenes

**Files involved:**
- `TimelineRenderer.ts` (lines 1064-1230 for subplot-specific rendering)
- `MainPlotMode.ts` (emphasis and muting logic)
- `ModeToggleController.ts` (toggle between All Scenes ↔ Main Plot)

---

#### **Gossamer Mode** (Overlay Mode)
**Rendering:**
- Base: Uses All Scenes rendering (forces `outerRingAllScenes = true`)
- Overlay: Adds gossamer-specific elements:
  - Dots on radial spokes (current scores)
  - Historical dots (Gossamer2-30)
  - Center dots for each beat
  - Spoke lines connecting to center
  - Beat outline highlights
  - Min/max confidence band
  - error checking for missing yaml Gossamer1 score is red and set to 0
- Visual muting: scene elements use `rt-non-selected` class
- Number squares: scene elements use `rt-non-selected` class

**Interactions:**
- Custom bidirectional hover: dots ↔ slices ↔ spokes
- Hover shows synopsis
- Click to open scenes
- Click background to exit Gossamer mode
- Disables normal All Scenes hover behavior

**Files involved:**
- `GossamerCommands.ts` (mode entry/exit, state management)
- `GossamerMode.ts` (interaction handlers)
- `gossamerLayer.ts` (rendering of dots, spokes, outlines)
- `RendererService.ts` (dynamic layer updates)
- `TimelineRenderer.ts` (layer integration)

---

### Common Features Across All Modes

**Rendering Components:**
- Basic scene arcs and paths
- Synopsis popups
- Progress ring (rainbow year progress)
- Month labels and spokes
- Act divisions and labels
- Grid lines
- Void cells for empty space
- Scene titles on text paths

**Interaction Components:**
- Rotation toggle control
- Mode toggle button (All Scenes ↔ Main Plot only)
- Search functionality with highlighting
- File tracking (open files highlighted)
- hover resize to fit width of title text in cell

**Utility Systems:**
- Scene number squares positioning
- Plot label adjustment
- Scene ordering and positioning
- Color computation (status, publish stage, subplot)
- Date parsing and angular positioning

---

## Architecture Problems

### 1. **Naming Confusion**
- `outerRingAllScenes` implies it only affects the outer ring, but it actually controls the **entire timeline rendering strategy**
- Doesn't clearly indicate it's a mode selector

### 2. **Dual Mode Tracking**
```typescript
// Setting-based mode (rendering)
plugin.settings.outerRingAllScenes: boolean

// Property-based mode (interactions)
view.interactionMode: 'allscenes' | 'mainplot' | 'gossamer'
```

These can get out of sync, causing confusion:
- `outerRingAllScenes = false` + `interactionMode = 'allscenes'` ← Main Plot visuals with All Scenes interactions
- Gossamer must force `outerRingAllScenes = true` and remember previous state

### 3. **Tight Coupling in Renderer**
TimelineRenderer.ts has mode-checking logic scattered throughout:
```typescript
if (plugin.settings.outerRingAllScenes) {
    // All scenes rendering logic
} else {
    // Main plot rendering logic
}
```

This makes it hard to:
- Add new modes without modifying the monolithic renderer
- Test modes in isolation
- Reuse rendering components across modes

### 4. **Mode Transition Complexity**
Entering/exiting Gossamer mode requires:
1. Store previous `outerRingAllScenes` value
2. Force `outerRingAllScenes = true`
3. Set `interactionMode = 'gossamer'`
4. Clean up event handlers
5. On exit: restore previous value, reset interaction mode, refresh
6. Guard against double-execution with flags

### 5. **Limited Extensibility**
Adding a 4th mode (Chronology) would require:
- Converting `outerRingAllScenes` boolean to a mode enum
- Refactoring all the if/else checks in TimelineRenderer
- Adding new interaction mode value
- Creating new mode file
- Updating mode toggle UI (currently binary toggle)
- Risk breaking existing modes

---

## Recommended Architecture: Modular Mode System

### Core Concept: Composition over Configuration

Instead of modes being baked into the renderer with if/else statements, modes should be **composable feature sets** that plug into a unified rendering and interaction framework.

### Proposed Structure

```typescript
// 1. Single source of truth for mode state
enum TimelineMode {
    ALL_SCENES = 'all-scenes',
    MAIN_PLOT = 'main-plot',
    GOSSAMER = 'gossamer',
    CHRONOLOGY = 'chronology' // Future mode
}

interface ModeDefinition {
    id: TimelineMode;
    name: string;
    description: string;
    
    // Rendering configuration
    rendering: {
        outerRingContent: 'all-scenes' | 'main-plot-only' | 'chronological';
        innerRingContent: 'subplot-scenes' | 'chronological' | 'hidden';
        beatDisplay: 'outer-ring-slices' | 'empty-rings' | 'none';
        sceneColoring: 'subplot' | 'publish-stage' | 'chronological';
        numberSquares: 'full' | 'minimized' | 'hidden';
        overlayLayers: Array<'gossamer-dots' | 'gossamer-spokes' | 'confidence-band' | 'timeline-ruler'>;
        visualMuting: Array<'non-plot' | 'non-main-plot' | 'future-scenes'>;
    };
    
    // Interaction configuration
    interactions: {
        hoverBehavior: ModeHoverBehavior;
        clickBehavior: ModeClickBehavior;
        enableZeroDraftMode: boolean;
        exitBehavior?: 'click-background' | 'toggle-button' | 'none';
        customHandlers?: ModeEventHandlers;
    };
    
    // Mode lifecycle hooks
    onEnter?: (view: RadialTimelineView) => void | Promise<void>;
    onExit?: (view: RadialTimelineView) => void | Promise<void>;
    
    // UI configuration
    ui: {
        toggleIcon?: string;
        toggleTooltip?: string;
        showInToggleButton: boolean;
        order: number; // For cycling through modes
    };
}
```

### Benefits of This Architecture

#### 1. **Single Source of Truth**
- One property: `view.currentMode: TimelineMode`
- No confusion between setting-based and property-based modes
- Clear mode state at all times

#### 2. **Declarative Mode Definition**
Each mode is defined by what it **needs**, not how it's implemented:

```typescript
const ALL_SCENES_MODE: ModeDefinition = {
    id: TimelineMode.ALL_SCENES,
    name: 'All Scenes',
    description: 'View all scenes across all subplots in manuscript order',
    rendering: {
        outerRingContent: 'all-scenes',
        innerRingContent: 'subplot-scenes',
        beatDisplay: 'outer-ring-slices',
        sceneColoring: 'subplot',
        numberSquares: 'full',
        overlayLayers: [],
        visualMuting: []
    },
    interactions: {
        hoverBehavior: 'standard-scene-hover',
        clickBehavior: 'open-scene-file',
        enableZeroDraftMode: true
    },
    ui: {
        showInToggleButton: true,
        order: 1
    }
};
```

#### 3. **Modular Rendering**
Break down TimelineRenderer into feature modules:

```typescript
// Rendering pipeline becomes:
class TimelineRenderer {
    render(scenes: Scene[], mode: ModeDefinition): string {
        let svg = this.renderBase(scenes);
        
        // Outer ring
        svg += this.renderOuterRing(
            scenes, 
            mode.rendering.outerRingContent,
            mode.rendering.beatDisplay,
            mode.rendering.sceneColoring
        );
        
        // Inner rings
        svg += this.renderInnerRings(
            scenes,
            mode.rendering.innerRingContent
        );
        
        // Overlay layers
        for (const layer of mode.rendering.overlayLayers) {
            svg += this.renderLayer(layer, scenes);
        }
        
        // Apply visual muting
        this.applyMuting(mode.rendering.visualMuting);
        
        return svg;
    }
    
    private renderOuterRing(
        scenes: Scene[], 
        content: 'all-scenes' | 'main-plot-only' | 'chronological',
        plotDisplay: '...',
        coloring: '...'
    ): string {
        // Single implementation that branches on content type
        switch (content) {
            case 'all-scenes':
                return this.renderAllScenesOuterRing(scenes, plotDisplay, coloring);
            case 'main-plot-only':
                return this.renderMainPlotOuterRing(scenes, coloring);
            case 'chronological':
                return this.renderChronologicalOuterRing(scenes, coloring);
        }
    }
}
```

#### 4. **Pluggable Interactions**
Interaction handlers register based on mode configuration:

```typescript
class ModeInteractionController {
    setupMode(view: RadialTimelineView, mode: ModeDefinition) {
        // Clean up previous mode handlers
        this.cleanup();
        
        // Register standard handlers based on mode config
        this.registerHoverHandlers(mode.interactions.hoverBehavior);
        this.registerClickHandlers(mode.interactions.clickBehavior);
        
        // Register custom handlers if provided
        if (mode.interactions.customHandlers) {
            this.registerCustomHandlers(mode.interactions.customHandlers);
        }
        
        // Setup exit behavior
        if (mode.interactions.exitBehavior === 'click-background') {
            this.registerBackgroundClickExit(view, mode);
        }
    }
    
    cleanup() {
        // Remove all registered event handlers
        this.handlers.forEach(h => h.remove());
        this.handlers.clear();
    }
}
```

#### 5. **Easy Mode Addition**
Adding Chronology mode becomes simple:

```typescript
const CHRONOLOGY_MODE: ModeDefinition = {
    id: TimelineMode.CHRONOLOGY,
    name: 'Chronology',
    description: 'View scenes in chronological story order, not manuscript order',
    rendering: {
        outerRingContent: 'chronological', // New option
        innerRingContent: 'chronological',
        beatDisplay: 'none', // Hide beats
        sceneColoring: 'publish-stage',
        numberSquares: 'hidden', // Don't show manuscript numbers
        overlayLayers: ['timeline-ruler'], // New overlay for story timeline
        visualMuting: ['future-scenes'] // Mute scenes that haven't happened yet in story
    },
    interactions: {
        hoverBehavior: 'chronological-hover', // Custom hover showing story time
        clickBehavior: 'open-scene-file',
        enableZeroDraftMode: true
    },
    ui: {
        showInToggleButton: true,
        order: 4
    }
};
```

No need to modify existing TimelineRenderer if/else logic. Just:
1. Define the mode
2. Implement the chronological rendering functions
3. Implement the custom hover behavior
4. Register the mode

#### 6. **Clean Mode Transitions**

```typescript
class ModeManager {
    async switchMode(view: RadialTimelineView, newMode: TimelineMode) {
        const currentMode = this.getModeDefinition(view.currentMode);
        const nextMode = this.getModeDefinition(newMode);
        
        // Exit current mode
        if (currentMode.onExit) {
            await currentMode.onExit(view);
        }
        
        // Update state
        view.currentMode = newMode;
        await view.plugin.saveSettings();
        
        // Enter new mode
        if (nextMode.onEnter) {
            await nextMode.onEnter(view);
        }
        
        // Refresh rendering and interactions
        await this.interactionController.setupMode(view, nextMode);
        await view.refreshTimeline();
    }
}
```

---

## Implementation Plan

### Phase 1: Foundation (No Breaking Changes)
1. Add `currentMode: TimelineMode` enum property to RadialTimelineView
2. Create `ModeDefinition` interface and mode definition files
3. Add migration logic: 
   - `outerRingAllScenes === true` → `TimelineMode.ALL_SCENES`
   - `outerRingAllScenes === false` → `TimelineMode.MAIN_PLOT`
   - `interactionMode === 'gossamer'` → `TimelineMode.GOSSAMER`
4. Keep `outerRingAllScenes` for backward compatibility (derive from `currentMode`)
5. Keep `interactionMode` but deprecate it (derive from `currentMode`)

### Phase 2: Extract Rendering Modules
1. Break down TimelineRenderer.ts into focused modules:
   - `OuterRingRenderer.ts` (all-scenes, main-plot, chronological variants)
   - `InnerRingRenderer.ts` (subplot-specific, chronological variants)
   - `PlotBeatRenderer.ts` (outer ring slices, empty ring placement)
   - `OverlayRenderer.ts` (gossamer dots, spokes, confidence bands)
   - `BaseRenderer.ts` (months, acts, progress, grid)
2. Update `createTimelineSVG` to use mode-driven composition

### Phase 3: Create Mode Manager
1. Implement `ModeManager` class
2. Implement `ModeInteractionController` class
3. Refactor existing mode files to use new interaction system
4. Update mode toggle UI to support multiple modes (dropdown or cycle button)

### Phase 4: Add Chronology Mode
1. Define `CHRONOLOGY_MODE` configuration
2. Implement chronological rendering functions
3. Implement chronological interaction handlers
4. Add chronological sorting utilities
5. Test with existing modes

### Phase 5: Cleanup (Breaking Changes)
1. Remove deprecated `outerRingAllScenes` setting (convert to computed property)
2. Remove deprecated `interactionMode` property
3. Remove mode-specific if/else branches from original TimelineRenderer
4. Update documentation

---

## File Structure After Refactor

```
src/
├── modes/
│   ├── ModeDefinition.ts          # Interface and types
│   ├── ModeManager.ts             # Mode switching logic
│   ├── ModeInteractionController.ts
│   ├── definitions/
│   │   ├── AllScenesMode.ts       # Mode definition + custom handlers
│   │   ├── MainPlotMode.ts        # Mode definition + custom handlers
│   │   ├── GossamerMode.ts        # Mode definition + custom handlers
│   │   └── ChronologyMode.ts      # Future mode
│   └── interactions/
│       ├── StandardHover.ts       # Reusable hover behaviors
│       ├── StandardClick.ts       # Reusable click behaviors
│       └── GossamerInteractions.ts # Gossamer-specific interactions
├── renderer/
│   ├── TimelineRenderer.ts        # Main orchestrator (much smaller)
│   ├── modules/
│   │   ├── BaseRenderer.ts        # Common elements (months, acts, progress)
│   │   ├── OuterRingRenderer.ts   # Outer ring variants
│   │   ├── InnerRingRenderer.ts   # Inner ring variants
│   │   ├── PlotBeatRenderer.ts    # Plot beat placement variants
│   │   └── OverlayRenderer.ts     # Overlay layers (gossamer, rulers, etc.)
│   └── layout/                    # Existing layout utilities
└── view/
    └── TimeLineView.ts            # Now uses ModeManager
```

---

## Benefits Summary

### Current Problems → Solutions

| Problem | Solution |
|---------|----------|
| Confusing dual tracking (setting + property) | Single `currentMode` enum |
| Misleading name (`outerRingAllScenes`) | Descriptive mode names (`ALL_SCENES`, `MAIN_PLOT`) |
| Tight coupling in renderer | Modular rendering with feature composition |
| Complex mode transitions | Declarative mode lifecycle hooks |
| Hard to add new modes | Pluggable mode definitions |
| Scattered logic | Centralized mode management |
| Testing difficulties | Isolated, testable mode modules |

### Developer Experience Improvements

**Before (adding Chronology mode):**
- Modify TimelineRenderer.ts (add if/else for chronology)
- Update interactionMode type
- Create ChronologyMode.ts file
- Update GossamerCommands.ts to handle new mode
- Update ModeToggleController.ts for new toggle state
- Fix broken mode transitions
- Test all existing modes to ensure no regression

**After (adding Chronology mode):**
- Create mode definition in `modes/definitions/ChronologyMode.ts`
- Implement chronological rendering functions (if needed)
- Implement custom interaction handlers (if needed)
- Register the mode
- Done. Existing modes unaffected.

---

## Conclusion

The current `outerRingAllScenes` boolean is no longer sufficient for managing multiple timeline modes. As you prepare to add a 4th mode (Chronology), this is the perfect time to refactor to a **modular, composable mode architecture** that will:

1. **Reduce confusion** by having a single, clear mode state
2. **Improve maintainability** through separation of concerns
3. **Enable extensibility** by making modes pluggable
4. **Simplify testing** with isolated, focused modules
5. **Future-proof** the codebase for additional modes beyond Chronology

The recommended approach uses **composition over configuration**, treating modes as feature sets that declare what they need rather than embedding mode-specific logic throughout the codebase.

