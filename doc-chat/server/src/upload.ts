export type ValidationResult = { ok: true } | { ok: false; error: string };

/** 只接受 .docx 扩展名(不区分大小写)。 */
export function validateDocx(filename: string): ValidationResult {
  if (!filename.toLowerCase().endsWith(".docx")) {
    return { ok: false, error: "仅支持 .docx 文档 (only .docx files are supported)" };
  }
  return { ok: true };
}
