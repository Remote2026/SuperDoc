import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SavedDoc {
  docId: string; // uuid,对外的文档句柄(前端/工具只用它,不暴露磁盘路径)
  name: string;  // 上传时的原始文件名(仅用于展示)
  path: string;  // uploads/<docId>.docx 的绝对路径
}

/** 上传文档登记表:把字节落盘为 <dir>/<docId>.docx,记住原始文件名。 */
export class DocRegistry {
  private latestDoc: SavedDoc | null = null;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /** 落盘并登记:写 <dir>/<uuid>.docx,同时把该文档记为"最近上传"(工具缺省 docId 时的目标)。 */
  save(bytes: Uint8Array | Buffer, name: string): SavedDoc {
    const docId = randomUUID();
    const filePath = path.join(this.dir, `${docId}.docx`);
    writeFileSync(filePath, bytes);
    const saved = { docId, name, path: filePath };
    this.latestDoc = saved;
    return saved;
  }

  /** 最近一次上传的文档(单用户本地场景的默认目标);无则 null。 */
  latest(): SavedDoc | null {
    return this.latestDoc;
  }

  /** docId → 磁盘路径;文件不存在(被外部删除等)返回 null。 */
  pathFor(docId: string): string | null {
    const filePath = path.join(this.dir, `${docId}.docx`);
    return existsSync(filePath) ? filePath : null;
  }
}
