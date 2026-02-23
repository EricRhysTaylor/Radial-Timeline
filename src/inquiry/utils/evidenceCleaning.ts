const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const OBSIDIAN_COMMENT_RE = /%%[\s\S]*?%%/g;

/** Strip YAML frontmatter, HTML comments, and Obsidian %% comments from raw note content. */
export function cleanEvidenceBody(raw: string): string {
    let body = raw.replace(FRONTMATTER_RE, '');
    body = body.replace(HTML_COMMENT_RE, '');
    body = body.replace(OBSIDIAN_COMMENT_RE, '');
    return body.trim();
}
