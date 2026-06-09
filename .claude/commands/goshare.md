# goshare — Upload content to your QuickShare service

Upload files or text content to your QuickShare instance and return a shareable URL.

## Configuration

This skill requires a one-time setup. The config is stored in `.claude/goshare.json` in the project root.

### First-time setup wizard

If `.claude/goshare.json` does not exist, run the setup wizard:

1. Ask the user: "请输入你的 QuickShare 服务地址（例如 https://goshare.ilihe.shop）："
2. Save the config:

```json
{
  "endpoint": "https://goshare.ilihe.shop"
}
```

3. Create the file and proceed with the upload.

### Config file location

`<project_root>/.claude/goshare.json`

If the file exists, read the `endpoint` field and use it as the base URL for all API calls.

---

## Usage

```
/goshare <file_path_or_description>
```

The user may provide:
- A **file path** (e.g. `/tmp/report.html`, `./diagram.svg`) — read the file and upload it
- A **description** of what to share — generate the content first, then upload
- **Nothing** — share the currently opened file or selected text in the editor

## Parameters

| Param | Description |
|-------|-------------|
| `$ARGUMENTS` | File path, description, or empty (use current context) |

## Instructions

### Step 0: Load config

1. Check if `.claude/goshare.json` exists in the project root
2. If not, run the setup wizard (ask user for endpoint URL, save config)
3. Read `endpoint` from config — this is the base URL for all API calls (e.g. `https://goshare.ilihe.shop`)

### Step 1: Determine content

1. If `$ARGUMENTS` is a file path that exists on disk → read that file
2. If `$ARGUMENTS` is text/a description → generate the content as described
3. If `$ARGUMENTS` is empty → use the IDE selection (`ide_selection`) or the currently opened file (`ide_opened_file`)
4. If no content can be determined, ask the user what they want to share

### Step 2: Detect content type

Auto-detect the `codeType` from the content:

| codeType | Detection rule |
|----------|---------------|
| `html` | Starts with `<!DOCTYPE html>` or `<html`, or contains `<div>`, `<body>`, `<script>` etc. |
| `markdown` | Has Markdown features (headings `#`, lists `-`, links `[]()`, code fences `` ``` ``, tables, bold `**`) |
| `svg` | Starts with `<svg` |
| `mermaid` | Starts with Mermaid keywords: `graph`, `flowchart`, `sequenceDiagram`, `gantt`, `pie`, `classDiagram`, `stateDiagram`, `erDiagram`, `journey`, `gitGraph`, `mindmap`, `timeline`, `quadrantChart`, `sankey`, `xychart` |
| `zip` | Binary ZIP file (must base64 encode) |

### Step 3: Upload via API

Use the `endpoint` from config as the base URL.

For text content (html, markdown, svg, mermaid):

```bash
curl -s -X POST {endpoint}/api/pages/create \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<CONTENT_HERE>",
    "codeType": "<DETECTED_TYPE>"
  }'
```

For ZIP files, read the file as base64 and use `zipContent` instead of `htmlContent`:

```bash
BASE64_DATA=$(base64 -i <file_path>)
curl -s -X POST {endpoint}/api/pages/create \
  -H "Content-Type: application/json" \
  -d "{
    \"zipContent\": \"$BASE64_DATA\",
    \"codeType\": \"zip\"
  }"
```

### Step 4: Return the result

Parse the JSON response. On success, output:

> ✅ Shared successfully!
> 🔗 {endpoint}/view/{urlId}

If the response includes a `password` (for protected pages), also show:

> 🔒 Password: {password}

On failure, show the error message and suggest fixes.

## Examples

### Share an HTML file
```
/goshare ./report.html
```

### Share a Mermaid diagram
```
/goshare Generate a flowchart showing the CI/CD pipeline
```

### Share current selection
User selects code in editor → `/goshare`

### Share a ZIP site
```
/goshare ./my-website.zip
```
