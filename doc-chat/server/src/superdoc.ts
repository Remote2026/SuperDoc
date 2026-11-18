// SuperDoc Node SDK 封装:把 .docx 解析成"章节骨架"(标题层级 + 标题文本 + 每节段落数)。
// SDK 内部 spawn 平台原生二进制,只能在 Node 服务端运行,不能打进前端 bundle。
import { existsSync } from "node:fs";
import { SuperDocClient } from "@superdoc/sdk";

export interface ChapterEntry {
  nodeId: string;
  level: number;
  title: string;
  /** 该标题之后、下一个标题之前的非空正文段落数 */
  paragraphCount: number;
}

export interface SkeletonResult {
  chapters: ChapterEntry[]; // 按文档顺序的扁平目录树,level 表层级
  totalBlocks: number;      // 文档 block 总数(含表格等非段落块)
  revision: string;         // extract 时的文档修订号
}

/**
 * doc.blocks.list 的查询选项(官方 document-api blocks/list 参考的常用子集,
 * 完整参数见 SDK 的 DocBlocksListParams,如 in(StoryLocator)/reviewMode)。
 */
export interface ListBlocksOptions {
  /** 按顶层块类型过滤(heading/paragraph/listItem/table/image/sdt…);省略=全部 */
  nodeTypes?: Array<
    | "paragraph"
    | "heading"
    | "listItem"
    | "table"
    | "tableRow"
    | "tableCell"
    | "tableOfContents"
    | "image"
    | "sdt"
  >;
  /** 字面文本搜索:terms 必填;match="any" 任一词命中(默认 "all" 全词) */
  textSearch?: {
    terms: string[];
    match?: "all" | "any";
    caseSensitive?: boolean;
  };
  /** 分页起始序数 */
  offset?: number;
  /** 单次最多返回的块数 */
  limit?: number;
  /** true=每个块附完整扁平正文 text(默认只给 textPreview);大文档注意 token 开销 */
  includeText?: boolean;
}

/**
 * SuperDoc Node SDK 的薄封装:进程级单例 client(README 要求),
 * 懒连接,extract() 后把 blocks 折叠成章节骨架。
 */
export class SuperdocService {
  private client: SuperDocClient | null = null;

  // 懒连接:首次 extract 才 new + connect;进程级单例 client(README 要求)
  private async getClient(): Promise<SuperDocClient> {
    if (!this.client) {
      this.client = new SuperDocClient();
      await this.client.connect();
    }
    return this.client;
  }

  /** 只读解析:open → extract → 折叠 blocks → close(discard,不写回文档)。 */
  async extractFromFile(filePath: string): Promise<SkeletonResult> {
    if (!existsSync(filePath)) {
      // registry 已校验过路径;此处兜底:文件被外部删除时报明确错误
      throw new Error(`Document not found: ${filePath}`);
    }
    const client = await this.getClient();
    const doc = await client.open({ doc: filePath });
    try {
      const extract = await doc.extract(); // 整档 block 列表(原始 JSON)
      //打印json内容
      console.log(JSON.stringify(extract, null, 2));

      // 线性扫描:遇标题(level>0)开新章节,其后非空段落计入当前章节
      const chapters: ChapterEntry[] = [];
      let current: ChapterEntry | null = null;
      for (const block of extract.blocks) {
        const level =
          typeof block.headingLevel === "number" && block.headingLevel > 0
            ? block.headingLevel
            : undefined;
        if (level !== undefined) {
          // 标题块:text 即章节名;段落计数从 0 起,由后续正文累加
          current = {
            nodeId: block.nodeId,
            level,
            title: block.text.trim(),
            paragraphCount: 0,
          };
          chapters.push(current);
        } else if (current && block.type === "paragraph" && block.text.trim()) {
          // 只计非空正文;空章节(paragraphCount 为 0)的判断依据
          current.paragraphCount += 1;
        }
      }

      return {
        chapters,
        totalBlocks: extract.blocks.length,
        revision: extract.revision,
      };
    } finally {
      // 无论成败都关文档,释放宿主进程句柄(一文档一开/关)
      await doc.close({ discard: true });
    }
  }

  /**
   * 块级查询 API(对应 SDK 的 doc.blocks.list):返回 { total, blocks, revision }。
   * 块类型覆盖 heading/paragraph/listItem/table/image 等;支持类型过滤、
   * 文本搜索、分页,以及 includeText=true 时取每个块的完整正文。
   * 只读操作:open → blocks.list → close(discard),不改动文档。
   */
  async listBlocks(filePath: string, options: ListBlocksOptions = {}) {
    if (!existsSync(filePath)) {
      // 与 extractFromFile 一致的兜底:文件不存在报明确错误
      throw new Error(`Document not found: ${filePath}`);
    }
    const client = await this.getClient();
    const doc = await client.open({ doc: filePath });
    try {
      return await doc.blocks.list(options);
    } finally {
      await doc.close({ discard: true });
    }
  }

  // SIGINT/SIGTERM 时由 index.ts 调用:断开 SDK 宿主进程
  async dispose(): Promise<void> {
    if (this.client) {
      await this.client.dispose();
      this.client = null;
    }
  }
}
