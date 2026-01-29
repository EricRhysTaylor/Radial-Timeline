import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["src/settings", "src/modals"];
const CSS_FILE = "src/styles/rt-ui.css";
const FORBIDDEN_PREFIX = "ert-inquiry-";
const CSS_VAR_PREFIX = "--ert-inquiry-";
const ALLOWED_PREFIXES = ["data-ert-inquiry-"];

const stringPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;

const violations = [];

const extractTokens = (raw) => {
  const cleaned = raw.replace(/\$\{[^}]+\}/g, " ");
  return cleaned.split(/\s+/).map((token) => token.trim()).filter(Boolean);
};

const isAllowed = (token) => {
  if (token.includes(CSS_VAR_PREFIX)) {
    if (token.includes(`.${FORBIDDEN_PREFIX}`)) return false;
    if (token.startsWith(FORBIDDEN_PREFIX)) return false;
    return true;
  }
  return ALLOWED_PREFIXES.some((prefix) => token.startsWith(prefix));
};

const addViolation = (file, line, token) => {
  violations.push({ file, line, token });
};

const checkTsContent = (filePath, content) => {
  let match;
  while ((match = stringPattern.exec(content))) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    const tokens = extractTokens(value);
    tokens.forEach((token) => {
      if (!token.includes(FORBIDDEN_PREFIX)) return;
      if (isAllowed(token)) return;
      const line = content.slice(0, match.index).split("\n").length;
      addViolation(filePath, line, token);
    });
  }
};

const scanDir = (relativeDir) => {
  const dirPath = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const relPath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      scanDir(relPath);
      return;
    }
    if (!entry.name.endsWith(".ts")) return;
    const filePath = path.join(ROOT, relPath);
    const content = fs.readFileSync(filePath, "utf8");
    checkTsContent(relPath, content);
  });
};

TARGET_DIRS.forEach(scanDir);

const cssPath = path.join(ROOT, CSS_FILE);
if (fs.existsSync(cssPath)) {
  const content = fs.readFileSync(cssPath, "utf8");
  const selectorPattern = /([^{}]+)\{[^{}]*\}/g;
  let match;
  while ((match = selectorPattern.exec(content))) {
    const selectorText = match[1] ?? "";
    const classPattern = /\.ert-inquiry-[a-z0-9-]+/gi;
    let classMatch;
    while ((classMatch = classPattern.exec(selectorText))) {
      const line = content.slice(0, match.index).split("\n").length;
      addViolation(CSS_FILE, line, classMatch[0]);
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ Inquiry ERT lock failed. ert-inquiry-* tokens detected:");
  violations.forEach(({ file, line, token }) => {
    console.error(`  ${file}:${line} -> ${token}`);
  });
  process.exit(1);
}

console.log("✅ Inquiry ERT lock passed (no ert-inquiry-* tokens in settings/modals TS or rt-ui.css).");
