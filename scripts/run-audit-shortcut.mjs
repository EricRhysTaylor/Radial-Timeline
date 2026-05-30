#!/usr/bin/env node

const shortcuts = {
  daily: {
    label: 'Daily Control Tower',
    prompt: 'Use $radial-timeline-daily-control-tower'
  },
  friday: {
    label: 'Friday Release Gate',
    prompt: 'Use $radial-timeline-friday-release-gate'
  },
  deep: {
    label: 'Biweekly Deep Audit',
    prompt: 'Use $radial-timeline-deep-audit'
  }
};

const key = (process.argv[2] || '').toLowerCase();
const shortcut = shortcuts[key];

if (!shortcut) {
  console.error('[audit] Unknown audit shortcut. Use: daily, friday, or deep.');
  process.exit(1);
}

console.log(`[audit] ${shortcut.label}`);
console.log(`[audit] Send this prompt in Codex chat: ${shortcut.prompt}`);
