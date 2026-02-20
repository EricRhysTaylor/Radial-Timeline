import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type Category = "stale-comment" | "drift-term";

interface TokenDefinition {
  token: string;
  category: Category;
  regex: RegExp;
}

interface HitContextLine {
  line: number;
  text: string;
}

interface Hit {
  filePath: string;
  line: number;
  token: string;
  category: Category;
  lineText: string;
  context: {
    before?: HitContextLine;
    current: HitContextLine;
    after?: HitContextLine;
  };
}

const staleCommentMarkers = [
  "TODO",
  "FIXME",
  "HACK",
  "WORKAROUND",
  "TEMP",
  "DEPRECATED",
  "NOTE",
  "IMPORTANT",
] as const;

const driftTerms = [
  "Synopsis",
  "legacy key",
  "plaintext key",
  "api key in settings",
  "mergeTemplates",
  "getMergedBeatYaml",
  "advanced template cleanup",
  "refreshTimelineIfNeeded",
  "ChangeType.SETTINGS",
  "Ripple Rename",
  "prefix normalization",
] as const;

const tokenDefinitions: TokenDefinition[] = [
  ...staleCommentMarkers.map((token) => ({
    token,
    category: "stale-comment" as const,
    regex: new RegExp(`\\b${escapeRegExp(token)}\\b`, "i"),
  })),
  ...driftTerms.map((token) => ({
    token,
    category: "drift-term" as const,
    regex: new RegExp(escapeRegExp(token), "i"),
  })),
];

const scanRoots = ["src", "scripts"];
const ignoredDirectoryNames = new Set([
  ".git",
  ".obsidian",
  "node_modules",
  "release",
  "release-ts",
  "build",
  "dist",
  ".cursor",
  ".agent",
  ".claude",
]);

const scanExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".sh",
]);

const excludedRelativePaths = new Set(["scripts/audit/run-scan.ts"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function collectFiles(rootPath: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(rootPath)) {
    return files;
  }

  const stack: string[] = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const filePathRelative = relativePath(fullPath);
      if (
        scanExtensions.has(extension) &&
        !excludedRelativePaths.has(filePathRelative)
      ) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function scanFile(filePath: string): Hit[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hits: Hit[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];

    for (const definition of tokenDefinitions) {
      if (!definition.regex.test(rawLine)) {
        continue;
      }

      const beforeRaw = index > 0 ? lines[index - 1] : undefined;
      const afterRaw = index < lines.length - 1 ? lines[index + 1] : undefined;

      hits.push({
        filePath: relativePath(filePath),
        line: index + 1,
        token: definition.token,
        category: definition.category,
        lineText: normalizeWhitespace(rawLine),
        context: {
          before:
            beforeRaw === undefined
              ? undefined
              : { line: index, text: normalizeWhitespace(beforeRaw) },
          current: { line: index + 1, text: normalizeWhitespace(rawLine) },
          after:
            afterRaw === undefined
              ? undefined
              : { line: index + 2, text: normalizeWhitespace(afterRaw) },
        },
      });
    }
  }

  return hits;
}

function toMarkdownTableRow(columns: string[]): string {
  const escaped = columns.map((column) => column.replace(/\|/g, "\\|"));
  return `| ${escaped.join(" | ")} |`;
}

function inlineCode(value: string): string {
  return "`" + value + "`";
}

function buildMarkdownReport(
  hits: Hit[],
  totalsByToken: Map<string, number>,
  totalsByFile: Map<string, number>,
): string {
  const orderedTokenDefinitions = [...tokenDefinitions].sort((left, right) => {
    const leftCount = totalsByToken.get(left.token) ?? 0;
    const rightCount = totalsByToken.get(right.token) ?? 0;
    return rightCount - leftCount;
  });

  const totalHits = hits.length;
  const filesWithHits = totalsByFile.size;
  const laneATokens = new Set([
    "HACK",
    "WORKAROUND",
    "TEMP",
    "DEPRECATED",
    "legacy key",
    "plaintext key",
    "api key in settings",
  ]);
  const laneBTokens = new Set([
    "refreshTimelineIfNeeded",
    "ChangeType.SETTINGS",
    "Ripple Rename",
    "prefix normalization",
  ]);
  const laneCTokens = new Set([
    "mergeTemplates",
    "getMergedBeatYaml",
    "advanced template cleanup",
    "Synopsis",
  ]);

  const laneACount = hits.filter((hit) => laneATokens.has(hit.token)).length;
  const laneBCount = hits.filter((hit) => laneBTokens.has(hit.token)).length;
  const laneCCount = hits.filter((hit) => laneCTokens.has(hit.token)).length;

  const hotspotRows = [...totalsByFile.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20);

  const sections: string[] = [];

  sections.push("# Sanitation Audit");
  sections.push("");
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push("");
  sections.push("## Executive summary");
  sections.push("");
  sections.push(
    [
      "This audit pass is report-only and does not change runtime behavior.",
      `The scan found ${totalHits} matched lines across ${filesWithHits} files, indicating comment debt plus terminology drift around settings refresh and AI/export plumbing.`,
      "Recent refactors increased drift risk where old naming or adapter helpers may still be referenced in comments and wrappers (especially around settings refresh flow and template merge paths).",
    ].join(" "),
  );
  sections.push("");
  sections.push("## Totals by token");
  sections.push("");
  sections.push(toMarkdownTableRow(["Token", "Category", "Total hits"]));
  sections.push(toMarkdownTableRow(["---", "---", "---"]));
  for (const definition of orderedTokenDefinitions) {
    sections.push(
      toMarkdownTableRow([
        inlineCode(definition.token),
        definition.category,
        String(totalsByToken.get(definition.token) ?? 0),
      ]),
    );
  }

  sections.push("");
  sections.push("## Supporting reports");
  sections.push("");
  sections.push("- TypeScript unused symbol report: `docs/audits/tsc-unused.txt`");
  sections.push("- ESLint audit output: `docs/audits/eslint.txt`");
  sections.push(
    "- ts-prune export analysis: skipped in this pass to avoid adding another audit dependency.",
  );

  sections.push("");
  sections.push("## Top hotspots");
  sections.push("");
  sections.push(toMarkdownTableRow(["File", "Hits"]));
  sections.push(toMarkdownTableRow(["---", "---"]));
  for (const [filePath, count] of hotspotRows) {
    sections.push(toMarkdownTableRow([inlineCode(filePath), String(count)]));
  }

  sections.push("");
  sections.push("## Suggested cleanup lanes");
  sections.push("");
  sections.push(
    `- Lane A: Safety/destructive ops (${laneACount} hits). Focus on risky transitional language and stale safeguards before deleting wrappers.`,
  );
  sections.push(
    `- Lane B: Settings + refresh (${laneBCount} hits). Normalize refresh path references and retire stale ` +
      "settings-change terminology.",
  );
  sections.push(
    `- Lane C: AI + export pipeline (${laneCCount} hits). Consolidate merge-helper naming and align comments with canonical helpers.`,
  );

  sections.push("");
  sections.push("## Comment cleanup rubric");
  sections.push("");
  sections.push("- Keep: constraints, tradeoffs, footguns, canonical pointers.");
  sections.push(
    "- Delete: obvious narration, outdated internals, duplicate explanations, and stale migration notes.",
  );

  sections.push("");
  sections.push("## Findings by token (top 20 per token)");
  sections.push("");
  for (const definition of orderedTokenDefinitions) {
    const tokenHits = hits
      .filter((hit) => hit.token === definition.token)
      .sort(
        (left, right) =>
          left.filePath.localeCompare(right.filePath) || left.line - right.line,
      )
      .slice(0, 20);

    sections.push(
      "### " +
        inlineCode(definition.token) +
        " (" +
        String(totalsByToken.get(definition.token) ?? 0) +
        ")",
    );
    sections.push("");
    sections.push(toMarkdownTableRow(["File", "Line", "Matched line"]));
    sections.push(toMarkdownTableRow(["---", "---", "---"]));
    if (tokenHits.length === 0) {
      sections.push(toMarkdownTableRow(["(none)", "-", "-"]));
      sections.push("");
      continue;
    }

    for (const hit of tokenHits) {
      sections.push(
        toMarkdownTableRow([
          inlineCode(hit.filePath),
          String(hit.line),
          inlineCode(hit.lineText || "(blank)"),
        ]),
      );
    }
    sections.push("");
  }

  sections.push("## Next PR checklist (no edits in this PR)");
  sections.push("");
  sections.push(
    "- [ ] Convert unlabeled TODO/FIXME to `TODO(#issue)` or delete if obsolete.",
  );
  sections.push(
    "- [ ] Rewrite comments that reference removed systems to point to canonical helpers.",
  );
  sections.push("- [ ] Remove dead wrappers after a dev-guard period.");
  sections.push("- [ ] Remove unused exports and legacy adapters.");
  sections.push("");

  return sections.join("\n");
}

function main(): void {
  const absoluteScanRoots = scanRoots.map((scanRoot) =>
    path.resolve(process.cwd(), scanRoot),
  );

  const files = absoluteScanRoots.flatMap((scanRootPath) =>
    collectFiles(scanRootPath),
  );

  const hits = files.flatMap((filePath) => scanFile(filePath));

  const totalsByToken = new Map<string, number>();
  const totalsByCategory = new Map<Category, number>();
  const totalsByFile = new Map<string, number>();

  for (const hit of hits) {
    totalsByToken.set(hit.token, (totalsByToken.get(hit.token) ?? 0) + 1);
    totalsByCategory.set(
      hit.category,
      (totalsByCategory.get(hit.category) ?? 0) + 1,
    );
    totalsByFile.set(hit.filePath, (totalsByFile.get(hit.filePath) ?? 0) + 1);
  }

  const reportDirectory = path.resolve(process.cwd(), "docs", "audits");
  fs.mkdirSync(reportDirectory, { recursive: true });

  const jsonOutputPath = path.join(reportDirectory, "sanitation-audit.json");
  const markdownOutputPath = path.join(reportDirectory, "sanitation-audit.md");

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    scannedDirectories: scanRoots,
    filesScanned: files.map((filePath) => relativePath(filePath)).sort(),
    tokenDefinitions: tokenDefinitions.map((definition) => ({
      token: definition.token,
      category: definition.category,
    })),
    summary: {
      totalHits: hits.length,
      totalFilesScanned: files.length,
      filesWithHits: totalsByFile.size,
      totalsByToken: Object.fromEntries(
        [...totalsByToken.entries()].sort((left, right) =>
          left[0].localeCompare(right[0]),
        ),
      ),
      totalsByCategory: Object.fromEntries(
        [...totalsByCategory.entries()].sort((left, right) =>
          left[0].localeCompare(right[0]),
        ),
      ),
      hotspots: [...totalsByFile.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 50)
        .map(([filePath, hitCount]) => ({ filePath, hitCount })),
    },
    hits,
  };

  fs.writeFileSync(jsonOutputPath, `${JSON.stringify(jsonPayload, null, 2)}\n`);
  fs.writeFileSync(
    markdownOutputPath,
    `${buildMarkdownReport(hits, totalsByToken, totalsByFile)}\n`,
  );

  process.stdout.write(
    `Sanitation scan complete: ${hits.length} hits in ${totalsByFile.size} files.\n`,
  );
  process.stdout.write(`- ${relativePath(markdownOutputPath)}\n`);
  process.stdout.write(`- ${relativePath(jsonOutputPath)}\n`);
}

main();
