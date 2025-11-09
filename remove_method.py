#!/usr/bin/env python3
"""Helper script to remove large method from main.ts"""
import sys

# Read the file
with open('src/main.ts', 'r') as f:
    lines = f.readlines()

# Find and replace the getSceneData method (lines 1756-2398)
# Line numbers are 1-indexed, so subtract 1
start_line = 1755  # Line before method starts
end_line = 2398   # Last line of method

# New method content
new_method = """    async getSceneData(options?: GetSceneDataOptions): Promise<Scene[]> {
        // Delegate to SceneDataService
        return this.sceneDataService.getSceneData(options);
    }

"""

# Rebuild file
new_lines = lines[:start_line] + [new_method] + lines[end_line:]

# Write back
with open('src/main.ts', 'w') as f:
    f.writelines(new_lines)

print(f"Removed {end_line - start_line} lines, replaced with {len(new_method.splitlines())} lines")
print(f"New file size: {len(new_lines)} lines")

