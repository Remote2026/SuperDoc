import { ref } from "vue";

/** 当前已上传文档;UploadPanel 写、分析消息读。 */
export const currentDoc = ref<{ docId: string; name: string } | null>(null);
