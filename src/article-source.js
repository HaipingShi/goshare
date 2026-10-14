import { parseDocument } from 'htmlparser2';
import { findOne, getElementsByTagName } from 'domutils';

export function extractArticleSource(rendered) {
  const document = parseDocument(rendered);
  const article = findOne(node => node.attribs && Object.hasOwn(node.attribs, 'data-article-content'), document.children, true);
  if (!article) throw new Error('AI 文章流程支持 DOCX、Markdown 和纯文本；此格式请直接预览。');
  function text(node) {
    if (node.type === 'text') return node.data;
    if (['script', 'style'].includes(node.name)) return '';
    if (node.name === 'img') return node.attribs?.alt ? `[图片说明：${node.attribs.alt}]` : '';
    return (node.children || []).map(text).join(' ');
  }
  const elements = article.children.filter(node => node.type === 'tag');
  const blocks = elements.map((node, index) => {
    if (node.attribs?.['data-goshare-analysis'] || node.attribs?.['data-goshare-diagram']) return null;
    const value = text(node).replace(/\s+/g, ' ').trim();
    return value ? { id: `block-${index + 1}`, text: value } : null;
  }).filter(Boolean);
  const roots = [], stack = [];
  elements.forEach((element, index) => {
    if (element.attribs?.['data-goshare-analysis'] || element.attribs?.['data-goshare-diagram']) return;
    const headings = /^[h][1-6]$/.test(element.name) ? [element]
      : getElementsByTagName(name => /^h[1-6]$/.test(name), element.children || [], true);
    headings.forEach(heading => {
      const level = Number(heading.name[1]);
      const entry = { title: text(heading).trim(), summary: '原文标题', blockId: `block-${index + 1}`, children: [] };
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      (stack.length ? stack.at(-1).entry.children : roots).push(entry);
      stack.push({ level, entry });
    });
  });
  return { blocks, headingAnalysis: roots.length ? { title: roots[0].title, summary: '根据原文标题生成', nodes: roots, source: 'headings' } : null };
}
