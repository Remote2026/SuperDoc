// 预处理模块:用户上传 docx 后,先取 doc.blocks.list(完整文本),再按"标题栈算法"做层级归类。
// 纯函数(groupBlocks)+ 只读 SDK 编排(preprocessDocument),不依赖 HTTP 框架,Electron/测试可复用。
import type { SuperdocService } from "./superdoc.js";

/** 参与归类的块:取自 DocBlocksListResult.blocks 的常用字段(结构化子集)。 */
export interface HierarchyBlock {
  nodeId: string;
  nodeType: string; // heading / paragraph / table / image / listItem / sdt ...
  headingLevel?: number; // 仅 heading 有值(1-6)
  text?: string | null; // includeText=true 时的完整扁平正文
  textPreview?: string | null;
  styleId?: string | null; // 段落样式(如 "Title"、"Heading1")
  ordinal?: number; // 文档内原始顺序
  isEmpty?: boolean;
}

/** 层级归类的结果节点:一个标题开一个组,组持有直属块与子组。 */
export interface Group {
  groupId: string; // ROOT / G0001...(按创建顺序)
  title: string; // 标题文本;root 为 "Document"
  level: number; // 0=root,1=H1 Chapter,2=H2 Section,...
  headingNodeId: string; // 产生本组的标题块 nodeId;root 为 ""
  blocks: HierarchyBlock[]; // 本组直属块:标题块自身 + 归入的非标题块,保持原始顺序
  children: Group[]; // 下级组
}

/**
 * 标题栈算法(规则 1-6):
 * - 遇标题:弹出栈中所有"同级或更深"的组(规则 5),新组挂到栈顶之下并入栈;
 * - 非标题块:归入栈顶(当前最近的标题组,规则 4);未遇任何标题时归 root;
 * - 层级跳变(如 H1→H3)自然挂到最近的更浅级标题下(规则 2/3 的推广);
 * - 块对象原样入组,顺序与 nodeId 不变(规则 6)。
 */
export function groupBlocks(blocks: HierarchyBlock[]): Group {
  const root: Group = {
    groupId: "ROOT",
    title: "Document",
    level: 0,
    headingNodeId: "",
    blocks: [],
    children: [],
  };
  const stack: Group[] = [root]; // 当前各级标题对应的组,栈顶=最深打开组
  let groupCounter = 0;

  for (const block of blocks) {
    if (block.nodeType === "heading") {
      const level = block.headingLevel ?? 1;
      while (stack.length > 1 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }
      const group: Group = {
        groupId: `G${String(++groupCounter).padStart(4, "0")}`,
        title: block.text ?? block.textPreview ?? "",
        level,
        headingNodeId: block.nodeId,
        blocks: [block], // 标题块自身是组内第一个块
        children: [],
      };
      stack[stack.length - 1]!.children.push(group);
      stack.push(group);
    } else {
      stack[stack.length - 1]!.blocks.push(block);
    }
  }

  return root;
}

export interface PreprocessResult {
  hierarchy: Group;
  blocks: HierarchyBlock[]; // blocks.list 原始返回(含 root 直属),便于对比/追溯
  total: number;
  revision: string;
}

/**
 * 上传后的一站式预处理:listBlocks(includeText) → groupBlocks。
 * 只读;任何失败抛给调用方决定降级策略(上传主链路不应因此失败)。
 * 注:若文档不使用 Word 标题样式(如部分公文/标书),hierarchy 将是无子级的平铺 root——
 * 这是算法的真实输出,不是丢失内容。
 */
export async function preprocessDocument(
  superdoc: SuperdocService,
  filePath: string,
): Promise<PreprocessResult> {
  const listed = await superdoc.listBlocks(filePath, { includeText: true });
  const blocks: HierarchyBlock[] = listed.blocks;
  return {
    hierarchy: groupBlocks(blocks),
    blocks,
    total: listed.total,
    revision: listed.revision,
  };
}
