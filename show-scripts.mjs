#!/usr/bin/env node

// Show key project scripts in a concise format
const quiet = process.argv.includes('--quiet');

if (!quiet) {
  console.log('\n📦 Available commands: \x1b[32mnpm run build\x1b[0m (auto-backup if >1h) | \x1b[32mbackup\x1b[0m | \x1b[32mrelease\x1b[0m | \x1b[32mstandards\x1b[0m | \x1b[32msync-release-notes\x1b[0m | \x1b[32mupdate-models\x1b[0m | \x1b[32mupdate-patreon\x1b[0m | \x1b[32mpublish-wiki\x1b[0m\n');
}
