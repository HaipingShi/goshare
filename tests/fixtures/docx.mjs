import { zipSync, strToU8 } from 'fflate';

export function docxFixture(extraFiles = {}) {
  const xml = (body) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  const paragraph = (text, properties = '') => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const list = (text, num, level = 0) => paragraph(text, `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr>`);
  const cell = (text, span = '') => `<w:tc><w:tcPr>${span}</w:tcPr>${paragraph(text)}</w:tc>`;
  return zipSync({
    '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="numbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'),
    'word/styles.xml': xml('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style><w:style w:type="paragraph" w:styleId="ChineseHeading2"><w:name w:val="标题 2"/></w:style></w:styles>'),
    'word/numbering.xml': xml('<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>'),
    'word/document.xml': xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
      ${paragraph('DOCX 学习计划', '<w:pStyle w:val="Heading1"/>')}
      ${paragraph('这份学习计划通过实践、复盘与讨论，帮助团队把新知识应用到真实项目。')}
      ${paragraph('实践与复盘', '<w:pStyle w:val="ChineseHeading2"/>')}
      ${list('先理解要解决的问题', 1)}${list('确认目标和验收标准', 1, 1)}${list('每周复盘，记录新的经验', 1)}
      ${list('选择一个真实项目练习', 2)}${list('向团队展示结果并收集反馈', 2)}
      ${paragraph('学习安排', '<w:pStyle w:val="ChineseHeading2"/>')}
      <w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('阶段')}${cell('任务')}</w:tr><w:tr>${cell('第一周')}${cell('理解问题与目标')}</w:tr><w:tr>${cell('第二周')}${cell('实践并复盘')}</w:tr><w:tr>${cell('每个阶段都需要团队反馈', '<w:gridSpan w:val="2"/>')}</w:tr></w:tbl>
      ${paragraph('示意图片', '<w:pStyle w:val="ChineseHeading2"/>')}
      <w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Learning" descr="学习循环示意图"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="img1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
      ${paragraph('图：通过实践与复盘持续改进。')}<w:sectPr/>
    </w:body></w:document>`),
    'word/media/image.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=', 'base64'),
    ...extraFiles,
  });
}
