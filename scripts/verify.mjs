#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  {
    name: "Build",
    cmd: "npm",
    args: ["run", "build"],
    display: "npm run build",
  },
  {
    name: "CSS drift",
    cmd: "npm",
    args: ["run", "css-drift", "--", "--maintenance"],
    display: "npm run css-drift -- --maintenance",
  },
  {
    name: "Standards",
    cmd: "npm",
    args: ["run", "standards"],
    display: "npm run standards",
  },
  {
    name: "Tests",
    cmd: "npm",
    args: ["test"],
    display: "npm test",
  },
];

function banner(label, command) {
  console.log(`\n=== ${label} ===`);
  console.log(`> ${command}\n`);
}

for (const step of steps) {
  banner(step.name, step.display);
  const result = spawnSync(step.cmd, step.args, { stdio: "inherit" });
  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(`\n[verify] Failed: ${step.name}`);
    console.error(`[verify] Re-run: ${step.display}`);
    process.exit(code);
  }
}
