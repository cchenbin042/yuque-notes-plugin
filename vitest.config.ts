import { defineConfig } from 'vitest/config'

// 独立项目：@deepseek-ai/* 依赖经 node_modules 正常解析，无需 alias
export default defineConfig({
  test: {
    environment: 'node',
    // Windows + Node 24 下并行 worker 会触发 V8 zone 分配崩溃，文件串行执行
    fileParallelism: false,
  },
})
