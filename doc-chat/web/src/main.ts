// Vue 应用入口:挂载 App(内含 CopilotKit Provider);dev 由 Vite 起,生产由 server 静态托管
import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
