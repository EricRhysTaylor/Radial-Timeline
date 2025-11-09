#!/usr/bin/env python3
"""Replace getSceneData method in main.ts"""

with open('src/main.ts', 'r') as f:
    content = f.read()

# Find the start of getSceneData (line 1756)
# Find the end by looking for the next method after the closing brace

lines = content.split('\n')

# Find start: "async getSceneData"
start_idx = None
for i, line in enumerate(lines):
    if 'async getSceneData(options?: GetSceneDataOptions)' in line:
        start_idx = i
        break

if start_idx is None:
    print("ERROR: Could not find getSceneData method")
    exit(1)

# Find end: count braces to find matching close
brace_count = 0
started = False
end_idx = None

for i in range(start_idx, len(lines)):
    line = lines[i]
    
    # Count braces
    for char in line:
        if char == '{':
            brace_count += 1
            started = True
        elif char == '}':
            brace_count -= 1
            
    # When braces balance after we started, we found the end
    if started and brace_count == 0:
        end_idx = i
        break

if end_idx is None:
    print(f"ERROR: Could not find end of getSceneData method (started at line {start_idx + 1})")
    exit(1)

print(f"Found getSceneData: lines {start_idx + 1} to {end_idx + 1}")
print(f"Removing {end_idx - start_idx + 1} lines")

# Replace with simple delegation
new_method = [
    "    async getSceneData(options?: GetSceneDataOptions): Promise<Scene[]> {",
    "        // Delegate to SceneDataService",
    "        return this.sceneDataService.getSceneData(options);",
    "    }"
]

# Build new content
new_lines = lines[:start_idx] + new_method + lines[end_idx + 1:]

# Write back
with open('src/main.ts', 'w') as f:
    f.write('\n'.join(new_lines))

print(f"✅ Replaced method successfully")
print(f"New file: {len(new_lines)} lines (was {len(lines)} lines)")
print(f"Removed: {len(lines) - len(new_lines)} lines")

