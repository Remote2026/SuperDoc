<script setup lang="ts">
// 上传面板:选 .docx → POST /api/upload(服务端落盘登记)→ 自动触发一次章节结构分析
import { ref } from "vue";
import { useAgent, useAgentContext } from "@copilotkit/vue/v2";
import { currentDoc } from "./docState";
import { DOC_AGENT_ID } from "./agentId";

const status = ref<"idle" | "uploading" | "done" | "error">("idle");
const message = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

// 把当前文档作为 agent 上下文暴露(供工具/后续追问使用)
useAgentContext({
  description: "当前已上传并待分析的 docx 文档(为空表示尚未上传)",
  value: () => currentDoc.value,
});

// agent 由 CopilotKit 经 /api/copilotkit 连到服务端 doc_analyzer(SSE)
const { agent } = useAgent({ agentId: DOC_AGENT_ID });

// 发起分析:固定话术命中 instructions 的"解析章节结构"触发条件
async function analyze() {
  const a = agent.value;
  if (!a) {
    message.value = "助手尚未连接,请稍候再试。";
    return;
  }
  a.addMessage({
    id: crypto.randomUUID(),
    role: "user",
    content: "请分步解析这份文档的章节结构并输出分析报告。",
  });
  // runAgent 走 SSE 流式返回;void = 不等待整条流,上传流程先行返回
  void a.runAgent();
}

async function onPick(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;

  status.value = "uploading";
  message.value = "";
  try {
    // 解析必须服务端做(SuperDoc 是 Node SDK),前端只上传原始文件
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? `上传失败 (${res.status})`);
    }
    const body = (await res.json()) as { docId: string; name: string };
    // 记录当前文档:供 UI 展示与 agent 上下文;工具默认取"最近上传",无需传 docId
    currentDoc.value = body;
    status.value = "done";
    message.value = `已上传《${body.name}》,开始分析…`;
    // 上传即自动分析;之后可在 chat 继续追问
    await analyze();
  } catch (e) {
    status.value = "error";
    message.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}
</script>

<template>
  <div class="upload">
    <button class="btn" :disabled="status === 'uploading'" @click="fileInput?.click()">
      {{ status === "uploading" ? "上传中…" : "选择 .docx 上传" }}
    </button>
    <input
      ref="fileInput"
      type="file"
      accept=".docx"
      class="hidden"
      @change="onPick"
    />
    <p v-if="message" class="status" :class="status">{{ message }}</p>
    <p v-if="currentDoc" class="doc-name">当前文档:{{ currentDoc.name }}</p>
  </div>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  padding: 10px 14px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #222;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.hidden {
  display: none;
}

.status {
  font-size: 13px;
  margin: 0;
}
.status.error {
  color: #c0392b;
}
.status.done {
  color: #1e8449;
}

.doc-name {
  font-size: 12px;
  color: #777;
  margin: 0;
  word-break: break-all;
}
</style>
