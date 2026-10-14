export const ARTICLE_PROMPT_VERSION = 'article-workflow-v3';

// This is the application's built-in generation recipe. Presentation rules
// also live in deterministic graph builders; a prompt alone cannot fix layout.
export function diagramPrompt(kinds) {
  return `VISUAL RECIPE ${ARTICLE_PROMPT_VERSION}:
The outline must have 3–6 top-level topics where appropriate, 12–24 nodes total, at most 3 levels.
Merge overlapping topics. Prefer short topic labels of 6–14 characters in Chinese, or 2–6 words in English.
Do not enumerate every example as a top-level branch. Keep the full article as evidence, not as graph labels.
The required relation diagram kinds are ${JSON.stringify(kinds)}.
${kinds.length ? `The diagrams array MUST contain exactly ${kinds.length} objects, one for EACH requested kind. Never return an empty array or omit a requested kind.` : 'No relation diagrams were requested; return diagrams: [].'}
Mindmaps are built by the application from the semantic outline, so never return a mindmap diagram here.
For each requested flowchart or architecture return:
Use the exact requested kind string; each graph has title, nodes [{id,title,blockId}], and edges [{from,to,label,blockId}].
Use 3–12 nodes, at most 18 edges. Every node and edge must cite an existing evidence block.
Flowcharts express steps, decisions and dependencies actually described by the article, not the article heading order.
Architecture diagrams express components, boundaries and dependencies explicitly present in the article, not an invented implementation.
If the article lacks sufficient evidence, still include that kind as {"kind":"requested kind","unavailableReason":"brief reason in the article language"}. Do not omit it.
Never produce raw Mermaid, HTML, CSS, colors, scripts, extra nodes, or URLs.`;
}
