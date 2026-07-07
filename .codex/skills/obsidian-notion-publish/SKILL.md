---
name: obsidian-notion-publish
description: Use this project-scoped skill when publishing Obsidian project notes to Notion pages, especially when Markdown should be preserved and Obsidian [[wikilinks]] must be resolved to existing Notion pages or gated before creating missing linked pages.
---

# Obsidian Notion Publish

## Scope

This skill publishes notes from this project to Notion as one Notion page per Obsidian note. It is intentionally project-local and should only be used for notes under:

- `<obsidian-vault-project-dir>`

Known project Notion parent candidate:

- `https://app.notion.com/p/AI-<notion-page-id>?source=copy_link`

Fetch the parent before writing. If the user gives a different Notion parent, use the user-provided parent.

## Tooling

Use the Notion connector for page search, fetch, creation, and updates. If Notion tools are not already visible, discover them with `tool_search` using a query such as `notion search create update page`.

Use local filesystem reads for Obsidian Markdown. Do not write outside this project-local skill directory unless the user explicitly asks for project note edits.

## Workflow

### 1. Establish publish target

Identify the selected Obsidian notes and the target Notion parent page.

- Selected notes:
  - Treat the user's explicitly named notes as the publish set.
  - If the user says "these project notes" without a list, use the active system architecture set only when that is clear from context.
- Target parent:
  - Use the user-provided Notion URL or page id when present.
  - Otherwise use the known project parent candidate, after fetching it successfully.
- Existing pages:
  - Search Notion for each selected note title under the project parent when possible.
  - If an exact title match exists, update that page only if the user asked for sync/update/publish.
  - If no exact title match exists for a selected note, create it under the target parent because publishing that note is the requested action.

### 2. Prepare Markdown

Read each note as Markdown and prepare the body for Notion.

- Frontmatter:
  - Omit YAML frontmatter by default.
  - Preserve frontmatter only if the user explicitly asks for raw note export.
- Markdown:
  - Preserve headings, nested bullets, tables, and fenced code blocks.
  - Preserve Mermaid as fenced `mermaid` code blocks.
  - Do not flatten nested bullets unless Notion import requires a fallback.
- Sensitive content:
  - Before publishing, scan for credential-like content: `credentials`, `password`, `secret`, `token`, `RTSP`, private/public IP addresses, camera paths, and access routes.
  - If sensitive content is detected, stop and ask before publishing that note.

### 3. Extract wikilinks

Extract Obsidian links from the Markdown body before creating or updating the Notion page.

- Supported inline forms:
  - `[[Page]]`
  - `[[Page|Alias]]`
  - `[[Page#Heading]]`
  - `[[Page#Heading|Alias]]`
- Embeds:
  - Treat `![[Embed]]` as an embed, not a normal page link.
  - Do not auto-create pages for embeds unless the user explicitly asks.
- Link target:
  - Resolve the note target by exact basename first.
  - Then resolve by exact `.md` filename.
  - Keep heading fragments as display context; do not assume Notion has an equivalent heading anchor unless it is verified.

### 4. Resolve wikilinks to Notion pages

For each extracted non-embed wikilink, build a link-resolution table before writing the page content.

- If a matching Notion page exists:
  - Convert `[[Page]]` to `[Page](notion-page-url)`.
  - Convert `[[Page|Alias]]` to `[Alias](notion-page-url)`.
  - Convert `[[Page#Heading]]` to `[Page - Heading](notion-page-url)` unless a verified heading anchor is available.
  - Convert `[[Page#Heading|Alias]]` to `[Alias](notion-page-url)`.
- If no matching Notion page exists:
  - Add it to `missing_links`.
  - Do not create the linked page silently.
  - Ask the user whether to create missing linked pages before continuing with those links.
- If multiple Notion candidates match:
  - Ask the user to choose the correct page.
  - Do not guess between duplicates.

### 5. Missing linked-page gate

When `missing_links` is non-empty, ask one concise question before creating any missing linked pages:

```text
다음 Obsidian wikilink에 대응하는 Notion 페이지가 없습니다: <titles>. 프로젝트 parent 아래에 새 Notion 페이지로 만들까요?
```

Proceed according to the answer.

- If the user approves creation:
  - If the linked Obsidian note exists locally, publish it as a full page under the same parent.
  - If the linked Obsidian note does not exist locally, create a minimal stub only if the user explicitly approves stub creation.
  - Replace the wikilink with the created page URL.
- If the user rejects creation:
  - Convert the wikilink to plain display text.
  - Report that the link was not connected in Notion.
- If the user gives partial approval:
  - Create only the approved linked pages.
  - Leave the remaining missing links as plain display text and report them.

### 6. Create or update pages

Create or update exactly one Notion page per Obsidian note.

- Page title:
  - Use the Obsidian filename without `.md`.
  - Do not include the full path in the Notion title.
- Page parent:
  - Use the confirmed project parent page unless the user specifies a database or another parent.
  - If the target is a database, fetch the database schema before creating pages.
- Existing page update:
  - Fetch the page first.
  - Avoid destructive replacement if the page contains child pages, databases, or hand-authored content that is not part of the source note.
  - Prefer updating the main imported body while preserving existing child pages.
- New page creation:
  - Create as a child of the confirmed parent.
  - Use the prepared Markdown content with resolved links.

### 7. Verify and report

After writing, fetch the affected Notion pages and verify the result.

- Verify:
  - Parent page is correct.
  - Titles match the Obsidian basenames.
  - At least one resolved wikilink sample points to a Notion URL when links existed.
  - Mermaid fences and nested bullets survived in a readable form.
- Report:
  - Created pages.
  - Updated pages.
  - Skipped pages.
  - Missing links created.
  - Missing links left as plain text.
  - Sensitive notes that were gated or skipped.

## Safety Rules

- Never create linked pages discovered through `[[wikilinks]]` without asking the user first.
- Never publish credential-bearing or network-access notes without an explicit confirmation after detection.
- Do not broaden scope outside this project unless the user explicitly says to.
- Do not treat every Obsidian link as a Notion page; embeds and unresolved references need separate handling.
- Do not use browser automation for Notion writes when the Notion connector is available.
