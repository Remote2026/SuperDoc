<script setup lang="ts">
// 主布局:左侧上传面板 + 右侧 CopilotKit 聊天窗
import { CopilotChat, CopilotChatConfigurationProvider, CopilotKitProvider } from "@copilotkit/vue/v2";
import "@copilotkit/vue/styles.css";
import UploadPanel from "./UploadPanel.vue";
import { DOC_AGENT_ID } from "./agentId";
</script>

<template>
  <!-- Provider:runtime-url 指向服务端 CopilotKit 路由(dev 走 Vite 代理,生产同源) -->
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <div class="layout">
      <aside class="sidebar">
        <h1 class="title">SuperDoc 分析</h1>
        <UploadPanel />
        <p class="hint">
          上传 .docx 后,助手会分步提取章节结构、分析问题并输出 markdown 报告。
          上传后可继续在右侧追问文档内容。
        </p>
      </aside>
      <main class="chat-area">
        <!-- 把聊天窗绑定到 doc_analyzer;UploadPanel 的 useAgent 用同一 id -->
        <CopilotChatConfigurationProvider :agent-id="DOC_AGENT_ID">
          <CopilotChat />
        </CopilotChatConfigurationProvider>
      </main>
    </div>
  </CopilotKitProvider>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100dvh;
  width: 100%;
}

.sidebar {
  width: 300px;
  flex: 0 0 300px;
  padding: 20px;
  border-right: 1px solid #e4e4e4;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fafafa;
}

.title {
  font-size: 18px;
  margin: 0;
}

.hint {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.chat-area {
  flex: 1;
  min-width: 0;
  height: 100dvh;
}
</style>
