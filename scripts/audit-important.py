#!/usr/bin/env python3
"""
CSS !important Audit Script

Scans src/styles/*.css files, extracts all !important declarations,
categorizes them by selector patterns, and outputs a report.

Categories:
1. Obsidian Resets - .setting-item, .modal-content, etc.
2. Validation States - .rt-input-error, .rt-setting-input-success
3. Hover States - :hover, .scene-hover
4. Selection States - .rt-selected, .rt-non-selected, .rt-search-result
5. Mode Overrides - [data-shift-mode], [data-gossamer-mode], [data-chronologue-mode]
6. Subplot Colors - [data-subplot-idx]
7. Other - Uncategorized
"""

import re
import json
import os
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import List, Dict

@dataclass
class ImportantDeclaration:
    file: str
    line_number: int
    selector: str
    property: str
    value: str
    category: str

def categorize_selector(selector: str, property_value: str) -> str:
    """Categorize a selector based on patterns."""
    selector_lower = selector.lower()
    
    # Category 6: Subplot Colors
    if '[data-subplot-idx' in selector:
        return '6_subplot_colors'
    
    # Category 5: Mode Overrides
    mode_patterns = [
        '[data-shift-mode',
        '[data-gossamer-mode',
        '[data-chronologue-mode',
        '[data-mode=',
        '.rt-mode-',
        '.rt-shift-mode',
        '.rt-gossamer-',
        '.rt-runtime-mode',
    ]
    if any(p in selector for p in mode_patterns):
        return '5_mode_overrides'
    
    # Category 4: Selection States
    state_patterns = [
        '.rt-selected',
        '.rt-non-selected',
        '.rt-search-result',
        '.rt-scene-is-open',
        '.rt-has-edits',
        '.rt-missing-when',
        '.rt-grade-',
        '.rt-global-fade',
    ]
    if any(p in selector for p in state_patterns):
        return '4_selection_states'
    
    # Category 3: Hover States
    if ':hover' in selector or '.scene-hover' in selector or '.rt-hover' in selector:
        return '3_hover_states'
    
    # Category 2: Validation States
    validation_patterns = [
        '.rt-input-error',
        '.rt-setting-input-success',
        '.rt-setting-input-error',
        '.rt-flash-',
    ]
    if any(p in selector for p in validation_patterns):
        return '2_validation_states'
    
    # Category 1: Obsidian Resets
    obsidian_patterns = [
        '.setting-item',
        '.modal-content',
        '.modal-title',
        '.dropdown',
        '.markdown-preview',
    ]
    if any(p in selector for p in obsidian_patterns):
        return '1_obsidian_resets'
    
    return '7_other'

def parse_css_file(file_path: Path) -> List[ImportantDeclaration]:
    """Parse a CSS file and extract all !important declarations."""
    declarations = []
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Track current selector context
    lines = content.split('\n')
    current_selector = ''
    brace_depth = 0
    selector_start_line = 0
    
    for line_num, line in enumerate(lines, 1):
        # Track braces to understand context
        open_braces = line.count('{')
        close_braces = line.count('}')
        
        # If we see a selector (line before opening brace or at same line)
        if open_braces > 0:
            # Check if selector is on this line or previous lines
            brace_pos = line.find('{')
            if brace_pos > 0:
                # Selector might be on this line
                potential_selector = line[:brace_pos].strip()
                if potential_selector and not potential_selector.startswith('/*'):
                    current_selector = potential_selector
                    selector_start_line = line_num
            elif brace_depth == 0:
                # Look back for selector
                for back_line in range(line_num - 2, max(0, line_num - 10), -1):
                    prev_line = lines[back_line].strip()
                    if prev_line and not prev_line.startswith('/*') and not prev_line.startswith('*'):
                        if '{' not in prev_line and '}' not in prev_line:
                            current_selector = prev_line
                            selector_start_line = back_line + 1
                            break
        
        brace_depth += open_braces - close_braces
        
        # Reset selector when we close back to root
        if brace_depth == 0 and close_braces > 0:
            current_selector = ''
        
        # Check for !important
        if '!important' in line:
            # Extract property and value
            match = re.search(r'([a-z-]+)\s*:\s*(.+?)!important', line, re.IGNORECASE)
            if match:
                prop = match.group(1).strip()
                value = match.group(2).strip().rstrip(';').strip()
                
                # Get the full selector context
                selector = current_selector
                if not selector:
                    # Try to find it by looking back
                    for back_line in range(line_num - 2, max(0, line_num - 20), -1):
                        prev = lines[back_line].strip()
                        if prev.endswith('{'):
                            selector = prev[:-1].strip()
                            break
                        elif '{' in prev:
                            brace_pos = prev.find('{')
                            selector = prev[:brace_pos].strip()
                            break
                
                category = categorize_selector(selector, f"{prop}: {value}")
                
                declarations.append(ImportantDeclaration(
                    file=file_path.name,
                    line_number=line_num,
                    selector=selector,
                    property=prop,
                    value=value,
                    category=category
                ))
    
    return declarations

def main():
    # Find the styles directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    styles_dir = project_root / 'src' / 'styles'
    
    if not styles_dir.exists():
        print(f"Error: Styles directory not found at {styles_dir}")
        return
    
    all_declarations: List[ImportantDeclaration] = []
    
    # Parse all CSS files
    css_files = sorted(styles_dir.glob('*.css'))
    print(f"\nScanning {len(css_files)} CSS files in {styles_dir}\n")
    
    for css_file in css_files:
        declarations = parse_css_file(css_file)
        all_declarations.extend(declarations)
        print(f"  {css_file.name}: {len(declarations)} !important declarations")
    
    print(f"\n{'='*60}")
    print(f"TOTAL: {len(all_declarations)} !important declarations")
    print(f"{'='*60}\n")
    
    # Group by category
    by_category: Dict[str, List[ImportantDeclaration]] = defaultdict(list)
    for decl in all_declarations:
        by_category[decl.category].append(decl)
    
    # Print summary by category
    print("SUMMARY BY CATEGORY:\n")
    category_names = {
        '1_obsidian_resets': 'Category 1: Obsidian Resets',
        '2_validation_states': 'Category 2: Validation States',
        '3_hover_states': 'Category 3: Hover States',
        '4_selection_states': 'Category 4: Selection States',
        '5_mode_overrides': 'Category 5: Mode Overrides',
        '6_subplot_colors': 'Category 6: Subplot Colors',
        '7_other': 'Category 7: Other/Uncategorized',
    }
    
    for cat_key in sorted(by_category.keys()):
        cat_name = category_names.get(cat_key, cat_key)
        decls = by_category[cat_key]
        print(f"{cat_name}: {len(decls)}")
        
        # Group by file within category
        by_file: Dict[str, int] = defaultdict(int)
        for d in decls:
            by_file[d.file] += 1
        for fname, count in sorted(by_file.items()):
            print(f"    {fname}: {count}")
        print()
    
    # Output detailed JSON report
    report = {
        'total': len(all_declarations),
        'by_category': {},
        'declarations': [asdict(d) for d in all_declarations]
    }
    
    for cat_key in sorted(by_category.keys()):
        cat_name = category_names.get(cat_key, cat_key)
        report['by_category'][cat_key] = {
            'name': cat_name,
            'count': len(by_category[cat_key]),
            'files': {}
        }
        by_file = defaultdict(list)
        for d in by_category[cat_key]:
            by_file[d.file].append(asdict(d))
        report['by_category'][cat_key]['files'] = dict(by_file)
    
    # Write JSON report
    report_path = project_root / 'scripts' / 'important-audit-report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    
    print(f"Detailed report written to: {report_path}")
    
    # Print detailed list for each category
    print(f"\n{'='*60}")
    print("DETAILED BREAKDOWN BY CATEGORY")
    print(f"{'='*60}\n")
    
    for cat_key in sorted(by_category.keys()):
        cat_name = category_names.get(cat_key, cat_key)
        decls = by_category[cat_key]
        
        print(f"\n{'-'*60}")
        print(f"{cat_name} ({len(decls)} declarations)")
        print(f"{'-'*60}")
        
        # Group by file
        by_file: Dict[str, List[ImportantDeclaration]] = defaultdict(list)
        for d in decls:
            by_file[d.file].append(d)
        
        for fname in sorted(by_file.keys()):
            file_decls = by_file[fname]
            print(f"\n  {fname}:")
            for d in sorted(file_decls, key=lambda x: x.line_number):
                selector_short = d.selector[:60] + '...' if len(d.selector) > 60 else d.selector
                print(f"    L{d.line_number}: {d.property}: {d.value[:30]}...")
                print(f"        Selector: {selector_short}")

if __name__ == '__main__':
    main()

