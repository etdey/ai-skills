#!/usr/bin/env -S qjs --std -m
//
// Helper script for the Obsidian note creation skill. This script is
// responsible for combining the path-like arguments into a file path
// within the user's vault, creating the dynamic frontmatter field
// values, and creating the new note.
//
// Copyright (C) 2026 Eric Dey. All rights reserved.
//
// Any changes to the arguments or behavior MUST be documented within
// the SKILL.md file so that it can be correctly used by the skill.
//

function writeStderr(message) {
  std.err.puts(`${message}\n`);
}


function usage() {
  writeStderr([
    "Usage:",
    "  create-note.js --vault-root <path> --note-dir <vault-relative-dir> --note-name <name> [--overwrite]",
    "",
    "Options:",
    "  --vault-root   Absolute path to the Obsidian vault root",
    "  --note-dir     Vault-relative directory for the note (use . for vault root)",
    "  --note-name    Note name; .md is implied",
    "  --overwrite    Allow replacing an existing file",
    "  stdin          Markdown body content",
  ].join("\n"));
}


function fail(message) {
  writeStderr(`Error: ${message}`);
  std.exit(1);
}


function parseArgs(argv) {
  const options = {
    overwrite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      usage();
      std.exit(0);
    }

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      fail(`Unexpected argument: ${arg}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--vault-root":
        options.vaultRoot = value;
        break;
      case "--note-dir":
        options.noteDir = value;
        break;
      case "--note-name":
        options.noteName = value;
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }

    index += 1;
  }

  if (!options.vaultRoot || !options.noteDir || !options.noteName) {
    usage();
    std.exit(1);
  }

  return options;
}


function pad_zero(value) {
  return String(value).padStart(2, "0");
}


function formatLocalTimestamp(date) {
  const year = date.getFullYear();
  const month = pad_zero(date.getMonth() + 1);
  const day = pad_zero(date.getDate());
  const hour = pad_zero(date.getHours());
  const minute = pad_zero(date.getMinutes());
  const second = pad_zero(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}


function normalizeNoteName(noteName) {
  const trimmed = noteName.trim();
  if (!trimmed) {
    fail("Note name must not be empty");
  }

  const withoutExtension = trimmed.endsWith(".md")
    ? trimmed.slice(0, -3)
    : trimmed;

  if (!withoutExtension.trim()) {
    fail("Note name must contain characters before the .md extension");
  }

  if (withoutExtension.includes("/") || withoutExtension.includes("\\")) {
    fail("Note name must not contain path separators");
  }

  return `${withoutExtension}.md`;
}


function normalizeVaultRelativeDir(noteDir) {
  const trimmed = noteDir.trim();
  if (!trimmed) {
    fail("Note directory must not be empty");
  }

  const normalizedInput = trimmed
    .replace(/\\/g, "/")  // Change DOS path separators to slashes
    .replace(/^(\.+\/)+/, "")  // Remove leading ./ or ../ sequences
    .replace(/^\/+/, "");  // Remove leading slashes (non-relative path)

  const parts = [];
  for (const part of normalizedInput.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }

    if (part === "..") {  // a little crude but fine for this use case
      if (parts.length === 0) {
        fail("Note directory must stay within the vault");
      }

      parts.pop();
      continue;
    }

    parts.push(part);
  }

  if (trimmed === ".") {
    return "";
  }

  return parts.join("/");
}


function stripTrailingSlash(value) {
  if (value === "/") {
    return value;
  }

  return value.replace(/\/+$/, "");
}


function joinPath(basePath, relativePath) {
  const normalizedBasePath = stripTrailingSlash(basePath);
  if (!relativePath) {
    return normalizedBasePath;
  }

  return `${normalizedBasePath}/${relativePath}`;
}


function fileExists(path) {
  const [, err] = os.stat(path);
  return err === 0;
}


function isDirectory(path) {
  const [stat, err] = os.stat(path);
  return err === 0 && stat !== null && (stat.mode & os.S_IFMT) === os.S_IFDIR;
}


// Test that the target path exists and is a directory
// This creates the entire content for the note, including the frontmatter
// and the body. The dynamic frontmatter fields values are generated here.
//
function buildContent(date, body) {
  const created = formatLocalTimestamp(date);
  const createdTs = Math.floor(date.getTime() / 1000);
  const frontmatter = [
    "---",
    `created: ${created}`,
    `created-ts: ${createdTs}`,
    "document-type: copilot chat",
    "---",
    "",
  ].join("\n");

  if (body === undefined || body === null || body === "") {
    return `${frontmatter}\n`;
  }

  return `${frontmatter}\n${body.endsWith("\n") ? body : `${body}\n`}`;
}


function writeFile(targetPath, content) {
  const file = std.open(targetPath, "w");
  if (file === null) {
    fail(`Unable to open file for writing: ${targetPath}`);
  }

  try {
    file.puts(content);
    file.close();
  } catch (error) {
    file.close();
    fail(`Partial file created at ${targetPath}; write failed: ${String(error)}`);
  }
}


// Read body content from a stdin pipe; if stdin is a TTY, fail since we
// need to ensure that this helper doesn't hang if a skill has invoked
// it incorrectly
function readBodyFromStdin() {
  if (os.isatty(0)) {
    fail("Note body must be provided via stdin (use pipes or redirection)");
  }

  const body = std.in.readAsString();
  return body === null ? "" : body;
}


// Entry point when running this script directly
function main() {
  const options = parseArgs(scriptArgs.slice(1));
  const now = new Date();
  const body = readBodyFromStdin();
  const [resolvedVaultRoot, vaultRootErr] = os.realpath(options.vaultRoot);

  if (vaultRootErr !== 0 || !resolvedVaultRoot) {
    fail(`Vault root path does not exist: ${options.vaultRoot}`);
  }

  if (!isDirectory(resolvedVaultRoot)) {
    fail(`Vault root path is not a directory: ${resolvedVaultRoot}`);
  }

  const noteDir = normalizeVaultRelativeDir(options.noteDir);
  const noteName = normalizeNoteName(options.noteName);
  const targetDir = joinPath(resolvedVaultRoot, noteDir);
  const targetPath = joinPath(targetDir, noteName);

  // Combined vault root + note directory
  if (!isDirectory(targetDir)) {
    fail(`Target path is not a directory: ${targetDir}`);
  }

  // Target note file cannot already exist unless --overwrite is specified
  if (fileExists(targetPath) && !options.overwrite) {
    fail(`Target note already exists: ${targetPath}`);
  }

  writeFile(targetPath, buildContent(now, body));

  std.out.puts(`${targetPath}\n`);
}


// Export functions for testing when NODE env variable TESTING=1
if (typeof process !== 'undefined' && process.env.TESTING === '1') {
  // expose selected utilities
  module.exports = {
    formatLocalTimestamp,
    normalizeNoteName,
    normalizeVaultRelativeDir,
    joinPath,
  };
}

// Auto‑run when executed directly in the QuickJS runtime (or any non‑test environment)
if (typeof scriptArgs !== 'undefined' && (typeof process === 'undefined' || process.env.TESTING !== '1')) {
  main();
}
