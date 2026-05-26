---
name: create-obsidian-note
description: Creates a new note in the user's Obsidian vault with Markdown body content; the included helper script adds the required frontmatter to the note.
---

# Create Obsidian Note

Use this skill when the user wants to create a new note in Obsidian.

Example requests:

- "Create an Obsidian note called 'Design Ideas'"
- "Summarize this conversation in Obsidian"
- "Add a note in `Projects/Ideas`"
- "Save this conversation in 'AI/Chats' as 'Skill Notes'"


## Known configuration

- Vault root directory: `$HOME/Documents/vault-main`
- Document type frontmatter: `ai chat`
- Helper script: `scripts/create-note.js`

The helper script adds the required frontmatter automatically; this skill should not construct frontmatter itself.


## Required prompts

If the user did not already provide them, prompt for:

- The vault-relative directory path. This cannot be left blank, but it can be a simple "." or "/" character.
- The note name; the helper script enforces the final naming rules.

These are checks that you MUST perform:

- Query the user about any note names that use characters that are not strictly alphanumeric or " _-.=+" (quotes not included) to confirm that the final file name will be as expected. If the user confirms, proceed with the name as‑given; if the user wants to change it, prompt again for a new name.
- Notes must always have body content; the helper script does not check for this. If the user's request does not include any identifiable content to use as the body of the note, you MUST confirm with the user that they want to create a note with placeholder text as the body. The placeholder text should be "This space intentionally left unblank."

All filesystem validation of the vault path and note path MUST be performed by the helper script using `--preflight`.

Never run any OS command (`ls`, `test`, `stat`, etc.) to check whether the vault root, a sub-folder, or a note file exists. The helper script is the sole authority for these validations and will return the appropriate exit codes (see section below for exit code definitions). Rely exclusively on its exit status and error messages. 

Prompts to the user should ask for yes/no type confirmations or for required information. Any "no" like response to a confirmation prompt should cancel the note creation process.


## Creating the note using the helper script

Use the helper script in this skill's directory tree.  You MUST substitute the
appropriate path to the script based on where this skill is located in the AI
coding tool's configured skills directory.

The helper script performs two functions:
1. Preflight validation
2. Note creation

Always run a preflight before creating the note. Use feedback from the 
preflight to determine what actions to take before attempting to create
the note.

```bash
 {{SKILL_SUBDIR}}/scripts/create-note.js \
  --vault-root "{{VAULT_DIR}}" \
  --note-dir "{{VAULT_RELATIVE_DIRECTORY}}" \
  --note-name "{{NOTE_NAME}}" \
  --document-type "{{DOCUMENT_TYPE}}"
```

These placeholders in the above command should be replaced as follows:
- `{{SKILL_SUBDIR}}` is the path to this skill's subdirectory within the AI coding tool's configured skills directory.
- `{{VAULT_DIR}}` is the path to the vault root directory exactly as defined in Known configuration section above.
- `{{VAULT_RELATIVE_DIRECTORY}}` is the vault-relative directory path where the note should be created within the vault.
- `{{NOTE_NAME}}` is the desired note name.
- `{{DOCUMENT_TYPE}}` is the document type frontmatter exactly as defined in the Known configuration section above.

Performance and cost optimization: Wait until after the preflight validation passes (or gets cancelled by the user) before generating the note body content. Do not pipe any content into the helper script when performing a preflight validation since it does not read STDIN in that mode. 

When creating a note after preflight: Always pipe the body content into the helper script via STDIN. Do not use a temporary file since this would require additional filesystem permissions and cleanup logic.

### Exit codes returned by the helper script

  - 0: successful – preflight passed, or note created.
  - 1: generic error (missing arguments, permission issues, etc.).
  - 2: note already exists.
  - 3: target directory does not exist.
  - 4: vault root does not exist.
  - 5: resolved path would escape the vault root.

Error messages are printed to STDERR for non-zero exit codes. These
messages are suitable for displaying to the user to explain the problem.

### Preflight validation with helper script

- Use the `--preflight` flag when you only need to verify that the note can be created. In preflight mode the helper does not write a note.
- The script will exit with one of the numeric codes listed above; no error text is printed unless an unexpected failure occurs.
- If the exit code is `2` (note already exists), prompt the user for explicit confirmation to overwrite. Only after the user says “yes” should you run the helper with the `--overwrite` flag.
- Never combine `--preflight` and `--overwrite` in the same call.

NOTE: The only retryable error from a preflight check is if the note already exists (exit code 2). In that case, you MUST ask the user if they want to overwrite the existing note. For all other errors, you should display the error message and cancel the note creation process.

### Behavior of the helper script when creating the note

- Computes `created` and `created-ts`
- Reads Markdown body content from STDIN
- Requires the target directory to already exist
- Refuses to overwrite an existing note unless `--overwrite` option is included
- Prints the final created file path on success and returns exit code 0

### Rules enforced by the helper script

- Ensures the vault‑relative path does not escape the configured vault root. Using a leading "." or "/" in the vault path is treated as being relative to the vault root.
- Verifies that the target directory (vault root + note path) exists before creating the note.
- Checks to see if an existing note will be overwritten.
- Rejects note names that contain slashes `/` or backslashes `\\`.
- Normalizes note's file extension to ensure it ends with exactly one `.md` pattern.
- Trims leading/trailing whitespace and condenses inside whitespace to single spaces in the note name.
- Adds the required frontmatter to the note including `created` and `created‑ts` values (which it computes).
- Returns specific exit codes for any validation failure.


## Note format

Always use Markdown formatting for the body of the note.

When the note comes from an AI tool CLI session, prefer a Markdown structure that is easy to review in Obsidian, using short sections, bullet lists, or both.

When choosing headings for the note body:

- Do not repeat the note's file name as an H1 heading at the top of the body.
- Treat the file name and the note body structure as separate concerns: the file name names the note, and the body starts directly with its first real section.
- Use H1 headings for the top-level sections in the body.
- Use H2, H3, and deeper headings only as subsections beneath those H1 sections.
- Do not shift the entire heading hierarchy down by one level just because the file already has a name.

When writing Markdown tables:

- Prefer a Markdown table and treat it as the default format whenever the source content is tabular.
- Do not convert tabular comparison content to bullets merely because some cells contain `|`, `||`, or operator-like text.
- First preserve the Markdown table formatting by:
  - using HTML code tags such as `<code>&#124;</code>` or `<code>&#124;&#124;</code>`
  - escaping pipe characters as `\|` if the cell content is otherwise plain text
- Before replacing a naturally tabular structure with bullets, ask the user for confirmation.
- Use bullets only if the table would still be malformed, misleading, or clearly less readable after those safer encodings.
- When in doubt between a readable table and bullets, choose the table, especially if the source content is already tabular.

Writing inline code in Obsidian that is compatible with the Dataview plugin:

- Do not use any inline code span whose first character is =. For such text, use plain quoted text instead of backticks to 
avoid Dataview parse errors. 
- This only applies to inline code spans, not fenced code blocks, and only when the character immediately following the backtick is =. 
- These are examples of quoting patterns that start with =: `=SUM(A1:A10)` should be written as '=SUM(A1:A10)', or `==` written as '=='.
