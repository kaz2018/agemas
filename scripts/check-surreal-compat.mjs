import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = ["src", "setup-guide.md", "CLAUDE.md"];
const allowedExtensions = new Set([".ts", ".js", ".svelte", ".md"]);
const forbiddenPatterns = [
  { label: "type::thing", regex: /\btype::thing\s*\(/ },
  { label: "DEFINE SCOPE", regex: /\bDEFINE\s+SCOPE\b/ },
  { label: "scope property", regex: /\bscope\s*:/ },
];

async function collectFiles(targetPath) {
  const absolutePath = path.join(root, targetPath);
  const stat = await readdir(path.dirname(absolutePath), {
    withFileTypes: true,
  }).catch(() => null);

  if (stat === null) {
    return [];
  }

  if (!targetPath.includes(".")) {
    return walkDirectory(absolutePath);
  }

  return [absolutePath];
}

async function walkDirectory(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(entryPath)));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function findViolations(filePath, content) {
  const violations = [];
  const lines = content.split("\n");

  for (const [index, line] of lines.entries()) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(line)) {
        violations.push({
          filePath,
          lineNumber: index + 1,
          label: pattern.label,
          line: line.trim(),
        });
      }
    }
  }

  return violations;
}

const files = (await Promise.all(targets.map(collectFiles))).flat();
const uniqueFiles = [...new Set(files)];
const violations = [];

for (const filePath of uniqueFiles) {
  const content = await readFile(filePath, "utf8");
  violations.push(...findViolations(path.relative(root, filePath), content));
}

if (violations.length > 0) {
  console.error("Found legacy SurrealDB syntax:\n");
  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.lineNumber} [${violation.label}] ${violation.line}`,
    );
  }
  process.exit(1);
}

console.log("No legacy SurrealDB syntax found.");
