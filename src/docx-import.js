import { Unzip, UnzipInflate } from 'fflate';

export const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 2000;

// Read central-directory sizes before inflating; then verify actual output with
// streaming inflation so forged size fields cannot bypass the expansion limit.
export function validateDocxArchive(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length > MAX_DOCX_BYTES) throw new RangeError('DOCX 文件过大，请控制在10MB以内');
  if (bytes.length < 22) throw new Error('文件不是有效的 DOCX 文档');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const lower = Math.max(0, end - 65535);
  while (end >= lower && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length)) end--;
  if (end < lower) throw new Error('DOCX 压缩包损坏或被加密');
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  const centralEnd = offset + centralSize;
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || !count || count > MAX_ENTRIES || centralEnd !== end) {
    throw new Error('DOCX 压缩包结构不受支持或文件数量过多');
  }
  const entries = new Map();
  let declaredSize = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > centralEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error('DOCX 压缩包目录损坏');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (next > centralEnd || localOffset + 30 > view.getUint32(end + 16, true) || flags & 1 || ![0, 8].includes(method) || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('DOCX 包含加密或损坏的内容');
    if (view.getUint16(localOffset + 6, true) !== flags || view.getUint16(localOffset + 8, true) !== method || (!(flags & 8) && (view.getUint32(localOffset + 18, true) !== compressed || view.getUint32(localOffset + 22, true) !== expanded))) {
      throw new Error('DOCX 本地文件头与目录不一致');
    }
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!name || entries.has(name) || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) throw new Error('DOCX 包含重复或无效的文件路径');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength + view.getUint16(localOffset + 28, true);
    const localName = new TextDecoder().decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name || dataStart + compressed > view.getUint32(end + 16, true)) throw new Error('DOCX 文件数据损坏');
    declaredSize += expanded;
    if (expanded > MAX_ENTRY_BYTES || declaredSize > MAX_EXPANDED_BYTES) throw new RangeError('DOCX 解压内容过大，请压缩图片或拆分文档');
    entries.set(name, expanded);
    offset = next;
  }
  if (offset !== centralEnd || !entries.has('[Content_Types].xml') || !entries.has('word/document.xml')) throw new Error('文件不是 Word DOCX 文档（不支持旧版 .doc）');
  let actualSize = 0;
  const seen = new Set();
  const completed = new Set();
  const unzip = new Unzip((file) => {
    if (!entries.has(file.name) || seen.has(file.name)) throw new Error('DOCX 文件目录不一致');
    seen.add(file.name);
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error) throw new Error('DOCX 解压失败，请检查文件是否损坏');
      size += data.length;
      actualSize += data.length;
      if (size > entries.get(file.name) || actualSize > MAX_EXPANDED_BYTES) throw new RangeError('DOCX 实际解压内容超过安全限制');
      if (final) {
        if (size !== entries.get(file.name)) throw new Error('DOCX 文件大小校验失败');
        completed.add(file.name);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let start = 0; start < bytes.length; start += 4096) unzip.push(bytes.subarray(start, start + 4096), start + 4096 >= bytes.length);
  if (completed.size !== entries.size) throw new Error('DOCX 解压内容不完整');
}

export async function convertDocx(input, mammoth) {
  const warnings = [];
  const styleMap = ["p[style-name='Title'] => h1:fresh", "p[style-name='标题'] => h1:fresh"];
  for (let level = 1; level <= 6; level++) {
    styleMap.push(`p[style-name='标题 ${level}'] => h${level}:fresh`, `p[style-name='标题${level}'] => h${level}:fresh`);
  }
  const result = await mammoth.convertToHtml(input, {
    styleMap, includeEmbeddedStyleMap: false, externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async (image) => {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType)) {
        warnings.push('有图片格式不受浏览器支持（如 WMF/EMF），请在 Word 中转为 PNG/JPEG 后重新上传。');
        return { alt: image.altText || '不支持的图片格式' };
      }
      return { src: `data:${image.contentType};base64,${await image.read('base64')}` };
    }),
  });
  if (!result.value.trim()) throw new Error('DOCX 没有可读取的正文内容');
  if (new TextEncoder().encode(result.value).byteLength > MAX_DOCX_BYTES) throw new RangeError('DOCX 解析结果过大（含图片），请压缩图片后重试');
  return { html: result.value, warnings: [...new Set([...warnings, ...result.messages.map((item) => item.message)])] };
}
