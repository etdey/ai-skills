---
name: create-obsidian-note
description: Creates a new note in the user's Obsidian vault with Markdown body content; the included helper script adds the required frontmatter to the note.
---

# Create Obsidian Note

Use this skill when the user wants to create a new note in Obsidian.

## Known configuration

- Vault root directory: `$HOME/Documents/vault-main`
- Document type frontmatter: `ai chat`
- Helper script: `scripts/create-note.js`

The helper script adds the required frontmatter automatically; this skill should not construct frontmatter itself.


## Required prompts

If the user did not already provide them, prompt for:

1. The vault-relative path where the note should be created; using a value of "." is interpreted as the base vault directory and the helper script understands this. A leading / is treated as vault-relative, not as a filesystem absolute path; the helper will strip it and resolve the path from the vault root.
2. The note name; rules are discussed below.

Rules:

- Treat the note name as a base name for the file.
- The `.md` extension is implicit for the actual note file name.
- If the user includes `.md`, normalize it so the final file ends with exactly one `.md`
- The note path (vault-relative path) must stay inside the configured vault root; the helper script will enforce this, but you should also check for this when the user provides the path to give faster feedback if they try to write outside the vault.
- Test that the directory path of vault root + note path exists; do not create new directories.
- The note name must not contain slashes (/) or backslashes (\) since they cannot contain directory path components (e.g., `basename {note name}` must be equal to the note name with the .md extension; GOOD: "my note.md", BAD: "my/note.md").
- Query the user about any note names that use characters that are not strictly alphanumeric, spaces, underscores, or hyphens, to confirm that the final file name will be as expected. If the user confirms, proceed with the name as-given; if the user wants to change it, prompt again for a new name.
- Notes must always have body content, even if it's just a placeholder like "No content provided." If no identifiable content is recognized from the user's request, use that placeholder text as the body content for the note. You should always confirm with the user if they want to create a note with placeholder content before proceeding.


## How to create the note

Use the helper script in this skill's directory tree.  You MUST substitute the
appropriate path to the script based on where this skill is located in the AI
coding tool's configured skills directory.

```bash
 SKILL_SUBDIR/scripts/create-note.js \
  --vault-root "VAULT_DIR" \
  --note-dir "VAULT_RELATIVE_DIRECTORY" \
  --note-name "NOTE_NAME" \
  --document-type "DOCUMENT_TYPE"
```

These placeholders in the above command should be replaced as follows:
- `SKILL_SUBDIR` is the path to this skill's subdirectory within the AI coding tool's configured skills directory.
- `VAULT_DIR` is the path to the vault root directory as defined in Known configuration section above.
- `VAULT_RELATIVE_DIRECTORY` is the vault-relative directory path where the note should be created within the vault.
- `NOTE_NAME` is the desired note name.
- `DOCUMENT_TYPE` is the document type frontmatter as defined in the Known configuration section above.

Always pipe the body content into the helper script via stdin. Do not use a temporary file.

Behavior of the helper script:

- Computes `created` and `created-ts`
- Reads Markdown body content from standard input
- Requires the target directory to already exist
- Refuses to overwrite an existing note unless `--overwrite` option is included
- Prints the final created file path on success

If the file already exists, ask the user whether to overwrite it before rerunning with `--overwrite`. Never include
this option without explicit user confirmation to overwrite the existing file.


## Note format

Always use Markdown formatting for the body of the note.

When the note comes from a Copilot CLI session, prefer a Markdown structure that is easy to review in Obsidian, using short sections, bullet lists, or both.

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


## Safety rules

- Never write outside the configured vault root
- Never overwrite an existing file without the user's confirmation
- Do not guess missing path or note name if the user wants to choose them
- Confirm the final file path after writing


## Example requests

- "Create an Obsidian note"
- "Add a note to my vault"
- "Save this conversation as an Obsidian note"
- "Create a note in `Projects/Ideas` called `CLI skill draft`"
