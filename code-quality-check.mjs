#!/usr/bin/env node

/**
 * Script to check for Obsidian.md guideline violations
 * This script scans JavaScript and TypeScript files for innerHTML and outerHTML usage
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// The patterns to check for in the code
const PATTERNS = [
  { pattern: /\.innerHTML\s*=/g, message: 'innerHTML assignment' },
  { pattern: /\.outerHTML\s*=/g, message: 'outerHTML assignment' },
];

// Allowlist for specific patterns that are known to be safe
// Format: array of strings that if found in the line, will exempt the match
const ALLOWLIST = [
  '// SAFE: innerHTML used for',  // Special comment to mark safe usage
  'document.createElementNS',     // Safe SVG creation pattern
  'createSvgElement',             // Our safe SVG helper
  '.DOMParser',                   // Using DOM parser is safe
  'parser.parseFromString',       // Parsing from string with DOMParser is safe
  'eslint-disable-line',          // Explicitly disabled by lint
  'code-quality-check',           // References to this script itself
  'this script itself',           // Documentation about this script
];

// Check if a line with a match should be ignored because it's in the allowlist
function isInAllowlist(line) {
  return ALLOWLIST.some(allowedPattern => line.includes(allowedPattern));
}

// Process a single file
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let hasViolations = false;
    let violations = [];
    
    lines.forEach((line, lineNumber) => {
      PATTERNS.forEach(({ pattern, message }) => {
        if (pattern.test(line) && !isInAllowlist(line)) {
          hasViolations = true;
          violations.push({
            line: lineNumber + 1,
            content: line.trim(),
            message
          });
        }
      });
    });

    if (hasViolations) {
      console.error(`\x1b[31mViolations found in ${filePath}:\x1b[0m`);
      violations.forEach(v => {
        console.error(`  Line ${v.line}: ${v.message} - ${v.content}`);
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
}

// Process files passed as arguments
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('No files specified');
    process.exit(1);
  }

  let allFilesPass = true;
  for (const file of args) {
    const passes = processFile(file);
    allFilesPass = allFilesPass && passes;
  }

  if (!allFilesPass) {
    console.error('\n\x1b[31mViolations found. Commit aborted.\x1b[0m');
    console.error('\x1b[33mYou must fix these violations before committing.\x1b[0m');
    console.error('\x1b[33mFor safe usage of DOM APIs, consider using safe alternatives:\x1b[0m');
    console.error('  - Use element.textContent instead of innerHTML for text content');
    console.error('  - Use document.createElement and appendChild for DOM manipulation');
    console.error('  - For SVG elements, use document.createElementNS with the correct namespace');
    console.error('  - If you need to insert HTML, create elements properly and use appendChild');
    console.error('\n\x1b[33mIf you believe this is a false positive, you can add a comment:\x1b[0m');
    console.error('  // SAFE: innerHTML used for <reason>\n');
    process.exit(1);
  }

  console.log('\x1b[32mCode quality check passed!\x1b[0m');
}

main(); 