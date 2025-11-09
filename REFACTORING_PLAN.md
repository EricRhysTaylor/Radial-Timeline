# Radial Timeline - Comprehensive Refactoring Plan

## Executive Summary

The codebase has grown organically and now contains:
- **Massive monolithic files** (main.ts: 2,934 lines, TimelineRenderer.ts: 2,172 lines)
- **Dual hover systems** causing bugs (legacy + mode-specific)
- **Scene title expansion** logic trapped in a 400-line closure
- **Duplicated interaction patterns** across mode files
- **God object anti-pattern** (RadialTimelinePlugin does too much)

## Critical Issues Found

### 1. **The Scene Title Auto-Expansion Bug** (CURRENT ISSUE)
**Problem:** `redistributeActScenes()` is a 150-line function buried in a 400-line closure in TimeLineView.ts. It can't be reused by mode-specific handlers, causing the need for dual systems and double-handler bugs.

**Current State:**
- Location: `TimeLineView.ts` lines ~958-1140 (inside `setupDelegatedSceneHover` closure)
- Can't be unit tested
- Can't be called from mode-specific files
- Duplicates are forbidden, but extraction is impossible due to closure dependencies

### 2. **Monolithic Files**

#### **main.ts** (2,934 lines)
Contains:
- Plugin lifecycle
- Settings management  
- Scene data loading
- Gossamer functionality
- Beat placement
- Search functionality
- File tracking
- Synopsis management
- 50+ methods

#### **TimelineRenderer.ts** (2,172 lines)
Contains:
- All rendering logic
- SVG generation
- Layout calculations
- Multiple mode rendering
- Component rendering
- Path calculations
- Single 1,800-line function!

#### **TimeLineView.ts** (1,297 lines)
Contains:
- View lifecycle
- Hover interactions (400-line closure!)
- Mode management
- Search controls
- Scene expansion logic
- Synopsis positioning
- File tracking

### 3. **Mode System Inconsistency**

We have TWO competing systems:
1. **Legacy system** in `TimeLineView.ts` (lines 765-1183) - includes `redistributeActScenes`
2. **Mode-specific system** in `src/view/modes/*.ts` - can't use `redistributeActScenes`

This is why we have the conditional `if (!view.interactionController)` - a band-aid, not a fix.

## Refactoring Plan

### Phase 1: Extract Scene Interaction Logic (HIGH PRIORITY)
**Fixes the current bug permanently**

#### 1.1 Create `SceneInteractionManager`
```
src/view/interactions/SceneInteractionManager.ts
```

**Responsibilities:**
- Scene hover state management
- Synopsis positioning
- Scene selection/highlighting
- Title auto-expansion (EXTRACTED from closure)

**Interface:**
```typescript
class SceneInteractionManager {
    constructor(view: RadialTimelineView, svg: SVGSVGElement)
    
    // Public API
    enableTitleExpansion(enable: boolean): void
    onSceneHover(group: Element, sceneId: string): void
    onSceneLeave(): void
    cleanup(): void
    
    // Internal
    private redistributeActScenes(hoveredGroup: Element): void
    private resetAngularRedistribution(): void
    private storeOriginalAngles(): void
}
```

#### 1.2 Extract Title Expansion Logic
```
src/view/interactions/SceneTitleExpansion.ts
```

Pure functions for scene title calculations:
```typescript
// No dependencies on DOM or view - pure logic
export function calculateExpansionNeeded(
    titleWidth: number,
    arcLength: number,
    expandFactor: number
): number

export function redistributeAngles(
    elements: SceneElement[],
    hoveredIndex: number,
    expansionAngle: number
): SceneElement[]

export function buildArcPath(
    innerR: number,
    outerR: number, 
    startAngle: number,
    endAngle: number
): string
```

#### 1.3 Update Mode Files
All mode files (`AllScenesMode.ts`, `ChronologueMode.ts`, etc.) use the same `SceneInteractionManager`:

```typescript
// AllScenesMode.ts
import { SceneInteractionManager } from '../interactions/SceneInteractionManager';

export function setupAllScenesDelegatedHover(view, container, scenes) {
    const svg = container.querySelector('.radial-timeline-svg');
    const manager = new SceneInteractionManager(view, svg);
    
    // Enable/disable title expansion based on settings
    manager.enableTitleExpansion(view.plugin.settings.enableSceneTitleAutoExpand);
    
    // Use manager for all hover interactions
    view.registerDomEvent(svg, 'pointerover', (e) => {
        const group = e.target.closest('.rt-scene-group');
        if (group) {
            manager.onSceneHover(group, getSceneId(group));
        }
    });
}
```

#### 1.4 Remove Legacy System
Delete the 400-line `setupDelegatedSceneHover` closure entirely from `TimeLineView.ts`.

### Phase 2: Break Up main.ts (2,934 lines → ~500 lines)

#### 2.1 Extract Commands
```
src/commands/
    GossamerCommands.ts       (already exists - move to commands/)
    BeatPlacementCommands.ts  (already exists - move to commands/)
    SearchCommands.ts         (new - extract search logic)
    ManuscriptCommands.ts     (new - extract manuscript assembly)
    SceneAnalysisCommands.ts  (already exists - move to commands/)
```

#### 2.2 Extract Scene Data Management
```
src/services/SceneDataService.ts
```

Move from main.ts:
- `getSceneData()` (lines 1615-2395)
- `filterScenesByManuscriptFolder()` 
- Scene caching logic
- Scene filtering logic

#### 2.3 Extract Gossamer Logic
```
src/services/GossamerService.ts
```

Move from main.ts:
- `saveGossamerScores()` (lines 2812-2879)
- Gossamer history shifting
- Beat-related functionality

#### 2.4 Create PluginFacade
```
src/core/PluginFacade.ts
```

Slim down main.ts to be ONLY:
- Plugin lifecycle (onload/onunload)
- Settings load/save
- View registration
- Command registration (delegate to command files)
- Service initialization

Target: main.ts should be ~500 lines max.

### Phase 3: Break Up TimelineRenderer.ts (2,172 lines → ~300 lines)

#### 3.1 Extract Component Renderers
Already started in `src/renderer/components/`, but need to extract MORE:

```
src/renderer/components/
    Acts.ts              ✅ (exists)
    Scenes.ts            ✅ (exists)
    Plots.ts             ✅ (exists)
    ActLabels.ts         ✅ (exists)
    SubplotLabels.ts     ✅ (exists)
    Synopses.ts          ✅ (exists)
    Months.ts            ✅ (exists)
    MonthSpokes.ts       ✅ (exists)
    Grid.ts              ✅ (exists)
    NumberSquares.ts     ✅ (exists)
    Progress.ts          ✅ (exists)
    ProgressRing.ts      ✅ (exists)
    ProgressTicks.ts     ✅ (exists)
    Defs.ts              ✅ (exists)
    ChronologueTimeline.ts ✅ (exists)
    
    // NEW - extract from TimelineRenderer.ts
    SceneLayout.ts       (scene positioning logic)
    PathBuilder.ts       (arc path calculations)
    ColorManager.ts      (color assignment logic)
    LayoutCalculator.ts  (ring sizing, angles, etc.)
```

#### 3.2 Create Render Pipeline
```
src/renderer/RenderPipeline.ts
```

Orchestrate rendering in stages:
```typescript
class RenderPipeline {
    constructor(config: RenderConfig)
    
    async render(): Promise<string> {
        const layout = this.calculateLayout();
        const defs = this.renderDefs(layout);
        const grid = this.renderGrid(layout);
        const scenes = this.renderScenes(layout);
        const acts = this.renderActs(layout);
        // ... etc
        
        return this.assembleSVG([defs, grid, scenes, acts, ...]);
    }
}
```

#### 3.3 Extract Layout Logic
```
src/renderer/layout/
    RingLayout.ts        (ring sizing and positioning)
    AngleCalculator.ts   (scene angle distribution)
    SpacingCalculator.ts (scene spacing logic)
```

### Phase 4: Standardize Mode System

#### 4.1 Enforce Mode Interface
All modes must implement the same interface:

```typescript
// src/modes/ModeInterface.ts
interface TimelineMode {
    id: string;
    name: string;
    
    // Lifecycle
    onEnter(view: RadialTimelineView, svg: SVGSVGElement): void;
    onExit(view: RadialTimelineView, svg: SVGSVGElement): void;
    
    // Interactions
    setupInteractions(manager: SceneInteractionManager): void;
    
    // Rendering (optional overrides)
    filterScenes?(scenes: Scene[]): Scene[];
    applyVisualMuting?(svg: SVGSVGElement): void;
}
```

#### 4.2 Remove Dual Systems
- Delete legacy hover system entirely
- All modes use `SceneInteractionManager`
- No more `if (!view.interactionController)` conditionals

### Phase 5: Improve TimeLineView.ts (1,297 lines → ~400 lines)

#### 5.1 Extract Synopsis Management
```
src/view/SynopsisController.ts
```

Move:
- Synopsis positioning logic
- Synopsis visibility management
- Mouse tracking for synopsis

#### 5.2 Extract Search UI
```
src/view/SearchController.ts
```

Move:
- Search UI rendering
- Highlight management
- Search state management

#### 5.3 Slim Down View
TimeLineView.ts should ONLY:
- Implement Obsidian's ItemView interface
- Delegate to controllers
- Manage view lifecycle
- Coordinate services

## Implementation Order

### Week 1: Fix the Immediate Bug
1. ✅ Create `SceneInteractionManager` 
2. ✅ Extract `redistributeActScenes` logic
3. ✅ Update `AllScenesMode.ts` to use manager
4. ✅ Update `ChronologueMode.ts` to use manager
5. ✅ Delete legacy hover system from `TimeLineView.ts`
6. ✅ Test extensively

### Week 2: Break Up main.ts
1. Create `SceneDataService`
2. Create `GossamerService`
3. Move commands to `src/commands/`
4. Create `PluginFacade`
5. Reduce main.ts to ~500 lines

### Week 3: Break Up TimelineRenderer.ts
1. Extract path building logic
2. Extract layout calculations
3. Create `RenderPipeline`
4. Move remaining logic to component files
5. Reduce TimelineRenderer.ts to ~300 lines

### Week 4: Polish & Test
1. Standardize mode interfaces
2. Extract SynopsisController
3. Extract SearchController
4. Update documentation
5. Full regression testing

## Success Metrics

### Before
- main.ts: 2,934 lines
- TimelineRenderer.ts: 2,172 lines
- TimeLineView.ts: 1,297 lines
- Dual hover systems
- 400-line closure with un-extractable logic
- **Total: 6,403 lines in 3 files**

### After
- main.ts: ~500 lines (5x smaller)
- TimelineRenderer.ts: ~300 lines (7x smaller)
- TimeLineView.ts: ~400 lines (3x smaller)
- Single interaction system
- Testable, reusable components
- **Total: ~1,200 lines in 3 core files + ~20 focused modules**

### Quality Improvements
- ✅ Unit testable scene expansion logic
- ✅ No more double-handler bugs
- ✅ Reusable interaction patterns
- ✅ Clear separation of concerns
- ✅ Easier to understand and maintain
- ✅ New features easier to add

## Testing Strategy

### During Refactoring
1. Keep all tests passing at each step
2. No feature changes - only restructuring
3. Use feature flags for new system during transition
4. Comprehensive manual testing of hover behavior

### New Tests Needed
```
tests/
    scene-expansion.test.ts      (NEW - unit tests for pure functions)
    interaction-manager.test.ts  (NEW - test manager behavior)
    render-pipeline.test.ts      (NEW - test render orchestration)
```

## Risk Mitigation

### High Risk Areas
1. **Scene title expansion** - Most complex logic to extract
2. **Mode transitions** - Changing from dual to single system
3. **Rendering pipeline** - Large, complex refactor

### Mitigation Strategy
1. Feature flags for new systems
2. Parallel systems during transition
3. Extensive manual testing
4. Rollback plan for each phase
5. User testing before finalizing

## Next Steps

**IMMEDIATE** (to fix current bug):
1. Create `src/view/interactions/SceneInteractionManager.ts`
2. Extract `redistributeActScenes` and helper functions
3. Update mode files to use the manager
4. Remove conditional and legacy system
5. Test thoroughly

**Do you want me to start with Phase 1 (SceneInteractionManager extraction)?**

