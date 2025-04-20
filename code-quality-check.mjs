#!/usr/bin/env node

/**
 * Script to check for Obsidian.md guideline violations and TypeScript best practices
 * This script scans JavaScript and TypeScript files for:
 * 1. innerHTML, outerHTML, and inline CSS usage (Obsidian guidelines)
 * 2. Usage of 'any' type in TypeScript files (TypeScript best practices)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// The patterns to check for in the code
const PATTERNS = [
  { pattern: /\.innerHTML\s*=/g, message: 'innerHTML assignment' },
  { pattern: /\.outerHTML\s*=/g, message: 'outerHTML assignment' },
  { pattern: /style\s*=\s*["']{/g, message: 'inline style object assignment' },
  { pattern: /\.style\.(backgroundColor|color|fontSize|fontWeight|margin|padding|border|width|height|display|position)\s*=/g, message: 'inline CSS property assignment' },
  { pattern: /style\s*=\s*["'][^"']+["']/g, message: 'inline style attribute' },
  { pattern: /document\.createElement.*style\s*=/g, message: 'inline style during element creation' },
];

// Allowlist for specific patterns that are known to be safe
// Format: array of strings that if found in the line, will exempt the match
const ALLOWLIST = [
  '// SAFE: innerHTML used for',  // Special comment to mark safe usage
  '// SAFE: inline style used for', // Special comment for inline styles
  '// SAFE: any type used for',   // Special comment for allowed 'any' types
  'document.createElementNS',     // Safe SVG creation pattern
  'createSvgElement',             // Our safe SVG helper
  '.DOMParser',                   // Using DOM parser is safe
  'parser.parseFromString',       // Parsing from string with DOMParser is safe
  'eslint-disable-line',          // Explicitly disabled by lint
  'code-quality-check',           // References to this script itself
  'this script itself',           // Documentation about this script
  '// Allowlist:',                // Allow comments about the allowlist
  '/styles.css',                  // Reference to the styles.css file
  'classList.add',                // Using classList is the recommended approach
  'classList.remove',             // Using classList is the recommended approach
  'classList.toggle',             // Using classList is the recommended approach
];

// TypeScript "any" type check pattern
const ANY_TYPE_PATTERN = { pattern: /: any\b/g, message: 'TypeScript "any" type' };

// List of allowed 'any' type usage contexts (e.g., log functions)
const ALLOWED_ANY_CONTEXTS = [
  'log(message: string, data?: any)',
  'console.log',
  'console.error',
];

// Check if a line with a match should be ignored because it's in the allowlist
function isInAllowlist(line, pattern) {
  if (ALLOWLIST.some(allowedPattern => line.includes(allowedPattern))) {
    return true;
  }
  
  // Special handling for 'any' type in allowed contexts
  if (pattern === ANY_TYPE_PATTERN.pattern) {
    return ALLOWED_ANY_CONTEXTS.some(context => line.includes(context));
  }
  
  return false;
}

// Process a single file
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let hasViolations = false;
    let violations = [];
    
    // For TypeScript files, also check for 'any' type usage
    const isTypeScript = filePath.endsWith('.ts');
    
    lines.forEach((line, lineNumber) => {
      // Check Obsidian guidelines patterns
      PATTERNS.forEach(({ pattern, message }) => {
        if (pattern.test(line) && !isInAllowlist(line, pattern)) {
          hasViolations = true;
          violations.push({
            line: lineNumber + 1,
            content: line.trim(),
            message
          });
        }
      });
      
      // Check TypeScript 'any' types for TS files
      if (isTypeScript) {
        const { pattern, message } = ANY_TYPE_PATTERN;
        if (pattern.test(line) && !isInAllowlist(line, pattern)) {
          hasViolations = true;
          violations.push({
            line: lineNumber + 1,
            content: line.trim(),
            message
          });
        }
      }
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
    console.error('\n\x1b[33mFor safe DOM manipulation:\x1b[0m');
    console.error('  - Use element.textContent instead of innerHTML for text content');
    console.error('  - Use document.createElement and appendChild for DOM manipulation');
    console.error('  - For SVG elements, use document.createElementNS with the correct namespace');
    
    console.error('\n\x1b[33mFor CSS styling:\x1b[0m');
    console.error('  - Keep all CSS in styles.css file, not inline in JavaScript/TypeScript');
    console.error('  - Use classList methods to add/remove classes instead of manipulating className');
    console.error('  - Define styles in CSS classes and apply them with classList.add()');
    console.error('  - If dynamic styling is necessary, create CSS classes with CSS variables');
    
    console.error('\n\x1b[33mFor TypeScript best practices:\x1b[0m');
    console.error('  - Avoid using the "any" type - use specific types or unknown instead');
    console.error('  - If you must use "any", add a comment explaining why: // SAFE: any type used for <reason>');
    
    console.error('\n\x1b[33mIf you believe this is a false positive, you can add a comment:\x1b[0m');
    console.error('  // SAFE: innerHTML used for <reason>');
    console.error('  // SAFE: inline style used for <reason>');
    console.error('  // SAFE: any type used for <reason>\n');
    process.exit(1);
  }

  console.log('\x1b[32m✅ Code quality check passed!\x1b[0m');
}

main(); 