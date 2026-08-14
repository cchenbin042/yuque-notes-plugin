import { defineConfig } from 'vitest/config'

// 独立项目：@deepseek-ai/* 依赖经 node_modules 正常解析，无需 alias
export default defineConfig({
  test: { environment: 'node' },
})
