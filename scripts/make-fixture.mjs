// 生成 sample.docx(docx 本质是 OOXML 部件打包成的 zip)。
// 结构:大标题 + 三章正文(一级/二级标题)+ 分页符 + 费用表格,
// 附录 A:待填写的个人信息表格 + 带边框的图片上传占位区。
// 正文保留关键词 termination(恰好 2 处)/ confidential,
// 使 tests/superdoc-common-api.test.js 的断言继续成立。
import { writeFileSync, mkdirSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}">
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

// 样式定义:Normal / Title / Heading1 / Heading2 / TableGrid
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>`;

// 单元格快捷函数
const tc = (text, bold = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr><w:p><w:r>${
    bold ? "<w:rPr><w:b/></w:rPr>" : ""
  }<w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
const tr = (cells) => `<w:tr>${cells.join("")}</w:tr>`;
const p = (text) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const heading = (styleId, text) =>
  `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const feeTable = `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
      ${tr([tc("Fee item", true), tc("Amount (USD)", true)])}
      ${tr([tc("Annual licence"), tc("5,000")])}
      ${tr([tc("Cancellation fee"), tc("1,200")])}
      ${tr([tc("Late payment interest (per month)"), tc("0.8%")])}
    </w:tbl>`;

// 待填写的个人信息表格:表头 + 值列留空
const personalRows = [
  ["项目 (Item)", "内容(待填)"],
  ["姓名 Name", ""],
  ["性别 Gender", ""],
  ["出生日期 Date of Birth", ""],
  ["证件号码 ID Number", ""],
  ["联系电话 Phone", ""],
];
const personalTable = `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
      ${personalRows
        .map(([a, b], i) => tr([tc(a, i === 0), tc(b, i === 0)]))
        .join("\n      ")}
    </w:tbl>`;

// 图片上传占位区:带四边边框的居中空框,提示用户在此插入图片
const border = `<w:top w:val="single" w:sz="8" w:space="4" w:color="808080"/><w:left w:val="single" w:sz="8" w:space="4" w:color="808080"/><w:bottom w:val="single" w:sz="8" w:space="4" w:color="808080"/><w:right w:val="single" w:sz="8" w:space="4" w:color="808080"/>`;
const imageBox = `
    <w:p>
      <w:pPr><w:pBdr>${border}</w:pBdr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>【图片区域】请在此处插入本人照片(编辑器中点入此框上传,或调用 create.image 指向本块)</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pBdr>${border}</w:pBdr></w:pPr>
      <w:r><w:t xml:space="preserve"> </w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pBdr>${border}</w:pBdr></w:pPr>
      <w:r><w:t xml:space="preserve"> </w:t></w:r>
    </w:p>`;

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    ${heading("Title", "Sample Agreement")}
    ${heading("Heading1", "Chapter 1  End of Agreement")}
    ${heading("Heading2", "1.1 Notice Period")}
    ${p("Either party may end this agreement by giving written notice of termination to the other party.")}
    ${heading("Heading2", "1.2 Effects")}
    ${p("All fees paid before termination remain non-refundable.")}
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    ${heading("Heading1", "Chapter 2  Confidentiality")}
    ${heading("Heading2", "2.1 Obligations")}
    ${p("Each party shall protect the other's confidential information with reasonable care.")}
    ${heading("Heading1", "Chapter 3  Fee Schedule")}
    ${p("The following fees apply to this agreement.")}
    ${feeTable}
    <w:p/>
    ${heading("Heading1", "Appendix A  个人信息登记表")}
    ${p("请用户填写以下个人信息,并在图片区域插入本人照片。")}
    ${personalTable}
    ${imageBox}
    <w:p/>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const zip = zipSync({
  "[Content_Types].xml": strToU8(contentTypes),
  "_rels/.rels": strToU8(rels),
  "word/_rels/document.xml.rels": strToU8(docRels),
  "word/settings.xml": strToU8(settings),
  "word/styles.xml": strToU8(styles),
  "word/document.xml": strToU8(document),
});

mkdirSync("fixtures", { recursive: true });
writeFileSync("fixtures/sample.docx", Buffer.from(zip));
console.log("fixtures/sample.docx 已生成");
