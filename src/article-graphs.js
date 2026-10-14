export const GRAPH_LABELS = { mindmap: '思维导图', flowchart: '流程图', architecture: '架构图' };
const palette = '\nclassDef goshareRoot fill:#dfeaff,stroke:#6688b7,color:#20334d,stroke-width:2px;\nclassDef goshareTopic fill:#eef4fb,stroke:#9ab0c9,color:#20334d;\nclassDef goshareDetail fill:#ffffff,stroke:#bac8d8,color:#30435d;';

export function label(value, width = 14) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 42);
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9_-]*|\s+|[^\s]/gu) || [];
  const lines = [];
  let line = '';
  for (let token of tokens) {
    if (token.length > 22) token = token.slice(0, 21) + '…';
    if (line.trim() && [...line + token].length > width) { lines.push(line.trim()); line = ''; }
    line += token;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map(value => value.replace(/&/g, '#38;').replace(/"/g, '#quot;').replace(/</g, '#60;').replace(/>/g, '#62;').replace(/`/g, '#96;')).join('<br/>');
}

export function buildMindmap(roots, title, requestedLimit = 24, profile = 'balanced') {
  const limit = Math.max(1, Math.min(profile === 'compact' ? 18 : 24, requestedLimit));
  const lines = ['flowchart LR', `root["${label(title || '文章结构')}"]:::goshareRoot`];
  const pending = roots.slice(0, 6).map(node => ({ node, parent: 'root', depth: 1 }));
  let count = 0;
  for (let i = 0; i < pending.length && count < limit; i++) {
    const { node, parent, depth } = pending[i];
    const id = `n${++count}`;
    lines.push(`${id}["${label(node.text || node.title)}"]:::${depth === 1 ? 'goshareTopic' : 'goshareDetail'}`, `${parent} --- ${id}`);
    if (depth < 3) pending.push(...(node.children || []).slice(0, profile === 'compact' ? 2 : 3).map(child => ({ node: child, parent: id, depth: depth + 1 })));
  }
  return { source: lines.join('\n') + palette, count };
}

export function buildRelationGraph(graph, profile = 'balanced') {
  const lines = [`flowchart ${graph.kind === 'architecture' ? 'TB' : 'LR'}`];
  // Keep connected nodes together; never cut edges to fit a visual profile.
  graph.nodes.forEach((node, index) => lines.push(`n${index}["${label(node.title, profile === 'compact' ? 12 : 14)}"]:::${index ? 'goshareTopic' : 'goshareRoot'}`));
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
  graph.edges.forEach(edge => lines.push(`${ids.get(edge.from)} -->${edge.label ? `|"${label(edge.label, 10)}"|` : ''} ${ids.get(edge.to)}`));
  return lines.join('\n') + palette;
}

export function stripArtifacts(source) {
  return String(source).replace(/\s*<pre\b[^>]*\bdata-goshare-(?:analysis|diagram)=["'][^"']*["'][^>]*>[\s\S]*?<\/pre>/gi, '').trim();
}

export function readArtifacts(source) {
  const value = String(source);
  const encoded = value.match(/<pre\b[^>]*data-goshare-analysis=["']v1["'][^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  let analysis;
  try { analysis = encoded ? JSON.parse(encoded.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : undefined; } catch {}
  const kinds = [...value.matchAll(/<pre\b[^>]*data-goshare-diagram=["'](mindmap|flowchart|architecture)["']/gi)].map(match => match[1]);
  return { analysis, kinds: [...new Set(kinds)] };
}

export function composeArticle(source, analysis, kinds = [], profile = 'balanced') {
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let content = stripArtifacts(source);
  if (!analysis) return content;
  if (analysis.source !== 'headings') content += `\n\n<pre data-goshare-analysis="v1" hidden>${escape(JSON.stringify(analysis))}</pre>`;
  kinds.forEach(kind => {
    if (!Object.hasOwn(GRAPH_LABELS, kind)) return;
    const roots = analysis.source === 'headings' && analysis.nodes.length === 1 ? analysis.nodes[0].children : analysis.nodes;
    const graph = kind === 'mindmap'
      ? buildMindmap(roots, analysis.title, 24, profile).source
      : analysis.diagrams?.find(item => item.kind === kind && !item.unavailableReason);
    if (!graph) return;
    const mermaid = typeof graph === 'string' ? graph : buildRelationGraph(graph, profile);
    content += `\n\n<pre data-goshare-diagram="${kind}">${escape(mermaid)}</pre>`;
  });
  return content;
}
