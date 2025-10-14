#!/usr/bin/env node
/**
 * CSS Quality Checker
 * Scans styles.css for duplicate selectors and empty rulesets
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cssPath = join(__dirname, 'src', 'styles.css');

try {
  const css = readFileSync(cssPath, 'utf-8');
  
  // Simple CSS parser - finds selectors, line numbers, and rule content
  const lines = css.split('\n');
  const selectors = new Map(); // selector -> array of line numbers
  const emptyRules = []; // array of {selector, line}
  
  let currentSelector = '';
  let currentSelectorLine = 0;
  let inComment = false;
  let braceDepth = 0;
  let ruleContent = '';
  
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNum = idx + 1;
    
    // Handle multi-line comments
    if (trimmed.includes('/*')) inComment = true;
    if (inComment) {
      if (trimmed.includes('*/')) inComment = false;
      return;
    }
    
    // Skip empty lines and single-line comments
    if (!trimmed || trimmed.startsWith('//')) return;
    
    // Track brace depth
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // If we're at depth 0 and see a selector (line with { but not starting with @)
    if (braceDepth === 0 && trimmed.includes('{') && !trimmed.startsWith('@')) {
      // Extract selector (everything before {)
      const selector = trimmed.split('{')[0].trim();
      if (selector) {
        currentSelector = selector;
        currentSelectorLine = lineNum;
        ruleContent = '';
        
        if (!selectors.has(selector)) {
          selectors.set(selector, []);
        }
        selectors.get(selector).push(lineNum);
      }
    }
    
    // Collect rule content (between braces)
    if (braceDepth > 0 && !trimmed.includes('{')) {
      ruleContent += trimmed;
    }
    
    // Check for empty ruleset when closing brace
    if (braceDepth === 1 && closeBraces > 0 && currentSelector) {
      // Remove comments from rule content
      const contentWithoutComments = ruleContent.replace(/\/\*.*?\*\//g, '').trim();
      if (!contentWithoutComments || contentWithoutComments === '') {
        emptyRules.push({ selector: currentSelector, line: currentSelectorLine });
      }
      currentSelector = '';
      ruleContent = '';
    }
    
    braceDepth += openBraces - closeBraces;
    if (braceDepth < 0) braceDepth = 0;
  });
  
  // Find duplicates
  const duplicates = [];
  for (const [selector, lineNumbers] of selectors.entries()) {
    if (lineNumbers.length > 1) {
      duplicates.push({ selector, lines: lineNumbers });
    }
  }
  
  // Report results
  let hasIssues = false;
  
  if (duplicates.length > 0) {
    console.log(`⚠️  Found ${duplicates.length} duplicate CSS selector(s):\n`);
    duplicates.forEach(({ selector, lines }) => {
      console.log(`  ${selector}`);
      console.log(`    Defined at lines: ${lines.join(', ')}`);
      console.log('');
    });
    console.log('💡 Tip: Consolidate duplicate rules to avoid conflicts.\n');
    hasIssues = true;
  }
  
  if (emptyRules.length > 0) {
    console.log(`⚠️  Found ${emptyRules.length} empty CSS ruleset(s):\n`);
    emptyRules.forEach(({ selector, line }) => {
      console.log(`  ${selector}`);
      console.log(`    Line ${line}`);
      console.log('');
    });
    console.log('💡 Tip: Remove empty rulesets or add properties.\n');
    hasIssues = true;
  }
  
  if (!hasIssues) {
    console.log('✅ No duplicate selectors or empty rulesets found.');
    process.exit(0);
  } else {
    process.exit(1);
  }
  
} catch (error) {
  console.error('Error reading styles.css:', error.message);
  process.exit(1);
}

