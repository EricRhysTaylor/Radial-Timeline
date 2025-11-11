#!/usr/bin/env python3
"""
Surgical refactoring script to rename Scene interface to TimelineItem.
Processes files in batches with verification between each batch.

Usage:
    python refactor-scene-to-timelineitem.py --batch <batch_number>
    python refactor-scene-to-timelineitem.py --preview  # Show what will be renamed
    python refactor-scene-to-timelineitem.py --status   # Show progress
"""

import re
import sys
import os
import argparse
from pathlib import Path
from typing import List, Dict, Set, Tuple

# Files to process (27 files total, split into 6 batches)
FILE_BATCHES = [
    # Batch 1: Core types and main entry point (5 files)
    [
        "src/main.ts",
        "src/services/SceneDataService.ts",
        "src/renderer/TimelineRenderer.ts",
        "src/view/TimeLineView.ts",
        "src/renderer/ChangeDetection.ts",
    ],
    # Batch 2: Renderers and utilities (5 files)
    [
        "src/renderer/gossamerLayer.ts",
        "src/services/RendererService.ts",
        "src/renderer/RenderCache.ts",
        "src/utils/sceneHelpers.ts",
        "src/utils/date.ts",
    ],
    # Batch 3: View modes (4 files)
    [
        "src/view/modes/AllScenesMode.ts",
        "src/view/modes/ChronologueMode.ts",
        "src/view/interactions/SceneInteractionManager.ts",
        "src/view/interactions/ChronologueShiftController.ts",
    ],
    # Batch 4: More interactions (4 files)
    [
        "src/view/interactions/DominantSubplotHandler.ts",
        "src/view/interactions/SceneTitleExpansion.ts",
        "src/renderer/dom/SynopsisDOMUpdater.ts",
        "src/renderer/dom/SceneDOMUpdater.ts",
    ],
    # Batch 5: Components and managers (5 files)
    [
        "src/renderer/dom/NumberSquareDOMUpdater.ts",
        "src/renderer/components/NumberSquares.ts",
        "src/renderer/components/ChronologueTimeline.ts",
        "src/SynopsisManager.ts",
        "src/synopsis/SynopsisData.ts",
    ],
    # Batch 6: Remaining files (4 files)
    [
        "src/modals/GossamerScoreModal.ts",
        "src/SceneAnalysisCommands.ts",
        "src/utils/colour.ts",
        "src/settings/sections/AdvancedSection.ts",
    ],
]

# Patterns to replace (in order of specificity - most specific first)
REPLACEMENTS = [
    # Type definitions and exports
    (r'\bexport interface Scene\b', 'export interface TimelineItem'),
    
    # Import statements
    (r'\bimport \{ Scene \}', 'import { TimelineItem }'),
    (r'\bimport \{ Scene,', 'import { TimelineItem,'),
    (r', Scene \}', ', TimelineItem }'),
    (r'\bimport type \{ Scene \}', 'import type { TimelineItem }'),
    
    # Type annotations (most common patterns)
    (r': Scene\[\]', ': TimelineItem[]'),
    (r': Scene\b(?!\w)', ': TimelineItem'),
    (r'<Scene\[\]>', '<TimelineItem[]>'),
    (r'<Scene>', '<TimelineItem>'),
    (r'\(Scene\[\]\)', '(TimelineItem[])'),
    (r'Promise<Scene\[\]>', 'Promise<TimelineItem[]>'),
    
    # Function parameters
    (r'\(scene: Scene\)', '(scene: TimelineItem)'),
    (r'\(scenes: Scene\[\]', '(scenes: TimelineItem[]'),
    (r', Scene\[\]', ', TimelineItem[]'),
    
    # Generic type parameters
    (r'Array<Scene>', 'Array<TimelineItem>'),
    (r'Map<string, Scene>', 'Map<string, TimelineItem>'),
    (r'Set<Scene>', 'Set<TimelineItem>'),
]

# Patterns to EXCLUDE (these should NOT be renamed)
EXCLUSIONS = [
    r'\bitemType.*Scene',  # itemType: "Scene" should stay
    r'Class.*Scene',       # Class: Scene in YAML examples
    r'SceneState',         # Different interface
    r'SceneContent',       # Different interface
    r'SceneNumberInfo',    # Different interface
    r'SceneTitleParts',    # Different interface
    r'SceneAngleData',     # Different interface
    r'SceneData',          # Method/variable names
    r'sceneData',          # Variable names
    r'getSceneData',       # Method names
    r'allScenes',          # Variable names
]


def is_excluded(line: str) -> bool:
    """Check if a line matches any exclusion pattern."""
    return any(re.search(pattern, line) for pattern in EXCLUSIONS)


def preview_replacements(files: List[str], base_dir: Path) -> Dict[str, List[Tuple[int, str, str]]]:
    """Preview what will be changed in each file."""
    changes = {}
    
    for rel_path in files:
        file_path = base_dir / rel_path
        if not file_path.exists():
            print(f"⚠️  File not found: {rel_path}")
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        file_changes = []
        for i, line in enumerate(lines, 1):
            if is_excluded(line):
                continue
                
            new_line = line
            for pattern, replacement in REPLACEMENTS:
                new_line = re.sub(pattern, replacement, new_line)
            
            if new_line != line:
                file_changes.append((i, line.rstrip(), new_line.rstrip()))
        
        if file_changes:
            changes[rel_path] = file_changes
    
    return changes


def apply_replacements(files: List[str], base_dir: Path) -> Dict[str, int]:
    """Apply replacements to files."""
    stats = {}
    
    for rel_path in files:
        file_path = base_dir / rel_path
        if not file_path.exists():
            print(f"⚠️  File not found: {rel_path}")
            continue
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.split('\n')
        
        modified_lines = []
        changes_count = 0
        
        for line in lines:
            if is_excluded(line):
                modified_lines.append(line)
                continue
            
            new_line = line
            for pattern, replacement in REPLACEMENTS:
                new_line = re.sub(pattern, replacement, new_line)
            
            if new_line != line:
                changes_count += 1
            
            modified_lines.append(new_line)
        
        if changes_count > 0:
            new_content = '\n'.join(modified_lines)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            stats[rel_path] = changes_count
            print(f"✓ {rel_path}: {changes_count} lines changed")
        else:
            print(f"  {rel_path}: No changes needed")
    
    return stats


def show_preview(batch_num: int, base_dir: Path):
    """Show preview of changes for a batch."""
    if batch_num < 1 or batch_num > len(FILE_BATCHES):
        print(f"❌ Invalid batch number. Must be 1-{len(FILE_BATCHES)}")
        return
    
    files = FILE_BATCHES[batch_num - 1]
    changes = preview_replacements(files, base_dir)
    
    print(f"\n📋 BATCH {batch_num} PREVIEW ({len(files)} files)")
    print("=" * 80)
    
    if not changes:
        print("No changes needed in this batch.")
        return
    
    for file_path, file_changes in changes.items():
        print(f"\n📄 {file_path} ({len(file_changes)} changes):")
        for line_num, old, new in file_changes[:5]:  # Show first 5 changes
            print(f"  Line {line_num}:")
            print(f"    - {old}")
            print(f"    + {new}")
        
        if len(file_changes) > 5:
            print(f"  ... and {len(file_changes) - 5} more changes")
    
    print("\n" + "=" * 80)
    print(f"Total: {sum(len(c) for c in changes.values())} lines will be changed")


def apply_batch(batch_num: int, base_dir: Path):
    """Apply changes to a batch."""
    if batch_num < 1 or batch_num > len(FILE_BATCHES):
        print(f"❌ Invalid batch number. Must be 1-{len(FILE_BATCHES)}")
        return
    
    files = FILE_BATCHES[batch_num - 1]
    
    print(f"\n🔧 APPLYING BATCH {batch_num} ({len(files)} files)")
    print("=" * 80)
    
    stats = apply_replacements(files, base_dir)
    
    print("\n" + "=" * 80)
    if stats:
        total = sum(stats.values())
        print(f"✅ Batch {batch_num} complete: {total} lines changed across {len(stats)} files")
    else:
        print(f"✅ Batch {batch_num} complete: No changes needed")


def show_status(base_dir: Path):
    """Show overall refactoring status."""
    print("\n📊 REFACTORING STATUS")
    print("=" * 80)
    
    for i, files in enumerate(FILE_BATCHES, 1):
        print(f"\nBatch {i} ({len(files)} files):")
        for file_path in files:
            full_path = base_dir / file_path
            status = "✓" if full_path.exists() else "✗"
            print(f"  {status} {file_path}")
    
    print(f"\n📦 Total: {sum(len(b) for b in FILE_BATCHES)} files in {len(FILE_BATCHES)} batches")


def main():
    parser = argparse.ArgumentParser(
        description='Refactor Scene interface to TimelineItem in batches'
    )
    parser.add_argument(
        '--batch',
        type=int,
        help=f'Apply changes to batch number (1-{len(FILE_BATCHES)})'
    )
    parser.add_argument(
        '--preview',
        type=int,
        help=f'Preview changes for batch number (1-{len(FILE_BATCHES)})'
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Show refactoring progress status'
    )
    
    args = parser.parse_args()
    
    # Find project root (where this script is located)
    base_dir = Path(__file__).parent
    
    if args.status:
        show_status(base_dir)
    elif args.preview:
        show_preview(args.preview, base_dir)
    elif args.batch:
        show_preview(args.batch, base_dir)
        print("\n⚠️  Review the changes above carefully!")
        response = input("\nProceed with applying these changes? (yes/no): ")
        if response.lower() == 'yes':
            apply_batch(args.batch, base_dir)
            print("\n💡 Next steps:")
            print("   1. Run: npm run build")
            print("   2. Check for TypeScript errors")
            print("   3. If successful, proceed to next batch")
        else:
            print("❌ Cancelled")
    else:
        parser.print_help()
        print("\n💡 Suggested workflow:")
        print("   1. python refactor-scene-to-timelineitem.py --status")
        print("   2. python refactor-scene-to-timelineitem.py --preview 1")
        print("   3. python refactor-scene-to-timelineitem.py --batch 1")
        print("   4. npm run build (verify no errors)")
        print("   5. Repeat for batches 2-6")


if __name__ == '__main__':
    main()

