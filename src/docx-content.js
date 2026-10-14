import sanitizeHtml from 'sanitize-html';

export const MAX_DOCX_CONTENT_BYTES = 10 * 1024 * 1024;

// DOCX imports are semantic article fragments, never executable HTML pages.
// This runs on preview, creation, editing and rendering, including API submissions.
export function sanitizeDocxContent(content) {
  const source = String(content || '');
  if (new TextEncoder().encode(source).byteLength > MAX_DOCX_CONTENT_BYTES) {
    throw new RangeError('DOCX 解析结果过大（含图片），请控制在10MB以内');
  }
  return sanitizeHtml(source, {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'img'],
    allowedAttributes: {
      a: ['href', 'id'], ol: ['start'], li: ['value', 'id'],
      th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
      img: ['src', 'alt', 'title'],
      pre: ['hidden', { name: 'data-goshare-analysis', values: ['v1'] }, { name: 'data-goshare-diagram', values: ['mindmap', 'flowchart', 'architecture'] }],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'embed', 'svg', 'math'],
    transformTags: {
      li(tagName, attribs) {
        if (attribs.id && !/^(?:footnote|endnote|comment)-[A-Za-z0-9_-]+$/.test(attribs.id)) delete attribs.id;
        return { tagName, attribs };
      },
      a(tagName, attribs) {
        if (attribs.id && !/^(?:footnote|endnote|comment)-[A-Za-z0-9_-]+$/.test(attribs.id)) delete attribs.id;
        if (attribs.href && !/^(?:https?:\/\/|mailto:|#)/i.test(attribs.href)) delete attribs.href;
        return { tagName, attribs };
      },
    },
    exclusiveFilter(frame) {
      return frame.tag === 'img' && !/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.attribs.src || '');
    },
  });
}
