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

// Operational defaults
const Defaults = {
  "document-type": "ai chat",
};

// Exit codes
const EXIT_OK = 0; // successful run
const EXIT_ERROR = 1; // general error (missing args, permission, etc.)
const EXIT_FILE_EXISTS = 2; // target note already exists
const EXIT_NO_FOLDER = 3; // target directory does not exist
const EXIT_NO_VAULT = 4; // vault directory does not exist
const EXIT_VAULT_ESCAPE = 5; // resolved path escapes the vault root


function writeStderr(message) {
  std.err.puts(`${message}\n`);
}


function usage() {
  writeStderr([
    "Usage:",
    "  create-note.js --vault-root <path> --note-dir <vault-relative-dir> --note-name <name> [options]",
    "",
    "Options:",
    "  --vault-root     Absolute path to the Obsidian vault root",
    "  --note-dir       Vault-relative directory for the note (use . for vault root)",
    "  --note-name      Note name; .md extension is implied",
    "  --document-type  Document type frontmatter value (optional)",
    "  --overwrite      Allow replacing an existing file",
    "  --preflight      Validate only, do not create note",
    "  stdin            Markdown body content piped to STDIN",
  ].join("\n"));
}


function fail(message, code = EXIT_ERROR) {
  writeStderr(`Error: ${message}`);
  std.exit(code);
}


function parseArgs(argv) {
  const options = {
    overwrite: false,
    preflight: false,
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

    if (arg === "--preflight") {
      options.preflight = true;
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
      case "--document-type":
        options.documentType = value;
        break;
      default:
        fail(`Unknown option: ${arg}`);
    }

    index += 1;
  }

  if (!options.vaultRoot || !options.noteDir || !options.noteName) {
    usage();
    std.exit(EXIT_ERROR);
  }

  if (!options.documentType) {
    options.documentType = Defaults["document-type"];
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
  // Remove leading/trailing whitespace first
  const trimmed = noteName.trim();
  if (!trimmed) {
    fail("Note name must not be empty");
  }

  // Collapse any internal whitespace (including multiple spaces or tabs) to a single space
  const collapsed = trimmed.replace(/\s+/g, " ");

  // Strip a trailing .md extension if present – also trim any space that may precede it
  const withoutExtension = collapsed.toLowerCase().endsWith('.md')
    ? collapsed.slice(0, -3).trim()
    : collapsed;

  if (!withoutExtension) {
    fail("Note name must contain characters before the .md extension");
  }

  if (withoutExtension.includes('/') || withoutExtension.includes('\\')) {
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


// Validate all pre‑conditions for creating a note
// Returns an object {code, message?, targetPath?, targetDir?}
function validate(options, resolvedVaultRoot) {
  const noteDir   = normalizeVaultRelativeDir(options.noteDir);
  const noteName  = normalizeNoteName(options.noteName);
  const targetDir = joinPath(resolvedVaultRoot, noteDir);
  const targetPath = joinPath(targetDir, noteName);

  // Target directory must exist and be a directory
  if (!isDirectory(targetDir)) {
    return {code: EXIT_NO_FOLDER, message: `Target path is not a directory: ${targetDir}`};
  }

  // Ensure the resolved absolute path stays inside the vault root
  // (simple prefix check; both are absolute after realpath)
  if (!targetPath.startsWith(resolvedVaultRoot + "/")) {
    return {code: EXIT_VAULT_ESCAPE, message: `Resolved path escapes vault root: ${targetPath}`};
  }

  // Existing note handling
  if (fileExists(targetPath) && !options.overwrite) {
    return {code: EXIT_FILE_EXISTS, message: `Target note already exists: ${targetPath}`};
  }

  // All checks passed
  return {code: EXIT_OK, targetPath};
}


// Test that the target path exists and is a directory
// This creates the entire content for the note, including the frontmatter
// and the body. The dynamic frontmatter fields values are generated here.
//
function buildContent(date, documentType, body) {
  const created = formatLocalTimestamp(date);
  const createdTs = Math.floor(date.getTime() / 1000);
  const frontmatter = [
    "---",
    `created: ${created}`,
    `created-ts: ${createdTs}`,
    `document-type: ${documentType}`,
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

  const validation = validate(options, resolvedVaultRoot);
  // If preflight mode, exit silently with the appropriate code
  if (options.preflight) {
    std.exit(validation.code);
  }
  // Normal mode – on any error, report via fail (which now exits with the code)
  if (validation.code !== EXIT_OK) {
    fail(validation.message, validation.code);
  }
  // Success – extract prepared paths
  const { targetPath } = validation;

  writeFile(targetPath, buildContent(now, options.documentType, body));

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
