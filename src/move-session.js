import fs from "node:fs/promises";
import path from "node:path";

import {
  SESSION_INDEX_FILE_BASENAME
} from "./constants.js";
import {
  applySessionChanges,
  collectSessionCwdChanges
} from "./session-files.js";

export async function collectSessionMoveChanges(codexHome, threadId, targetCwd) {
  const result = await collectSessionCwdChanges(codexHome, threadId, targetCwd);
  return result.changes.sort((left, right) => left.path.localeCompare(right.path));
}

export async function applySessionMoveChanges(changes) {
  return applySessionChanges((changes ?? []).filter((entry) => !entry.alreadyCurrent));
}

export async function updateSessionIndexCwd(codexHome, threadId, targetCwd, options = {}) {
  const indexPath = path.join(codexHome, SESSION_INDEX_FILE_BASENAME);
  const text = await fs.readFile(indexPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  const lines = text.split(/\r?\n/).filter(Boolean);
  let matchedEntries = 0;
  let changedEntries = 0;
  const nextLines = lines.map((line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return line;
    }
    if (parsed?.id !== threadId) {
      return line;
    }
    matchedEntries += 1;
    if (parsed.cwd === targetCwd) {
      return line;
    }
    changedEntries += 1;
    return JSON.stringify({
      ...parsed,
      cwd: targetCwd
    });
  });

  if (changedEntries > 0 && !options.dryRun) {
    await fs.writeFile(indexPath, `${nextLines.join("\n")}\n`, "utf8");
  }

  return {
    indexPath,
    matchedEntries,
    changedEntries
  };
}
