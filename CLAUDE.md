# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

dsh（DeepSeek agent）工具插件：把零散笔记（文本 + 图片）保存到语雀知识库，由模型根据内容自动分类。基于 `@deepseek-ai/cordis`，向 agent 暴露三个工具：`yuque_list_toc`（列目录树）、`yuque_create_dir`（建分类，幂等）、`yuque_create_doc`（存文档，自动上传图片）。保存链路：list_toc →（必要时 create_dir）→ create_doc。

## 常用命令

包管理器为 pnpm。构建产物 `lib/` 与 `node_modules/` 均被 gitignore。

```sh
pnpm test                                # 全部测试（vitest run）
pnpm exec vitest run test/tools.test.ts  # 单个测试文件（vitest 配置无需 alias）
pnpm typecheck                           # tsc --noEmit（含 test/）
pnpm build                               # tsc -p tsconfig.build.json → lib/
```

- 真实运行需要 `YUQUE_TOKEN`（`cordis.patch.yml` 只注入凭据引用名 `tokenEnv: YUQUE_TOKEN`，值由 `src/credentials.ts` 的 `resolveCredential` 在**每次工具调用时**解析：凭据 seam（web 设置页 / `$DSH_HOME/.credentials.yaml`）优先，缺失时回退启动环境读取；未配置时抛出自助配置指引，不阻塞启动）。图片图床同构（`tokenEnv: GITHUB_TOKEN`）。
- 本地目录安装（`dsh plugin add ./yuque-notes-plugin`）不触发 `prepare`，需先 `pnpm build`。
- 仓库内调试不安装：`pnpm dsh --profile headless --patch ./cordis.patch.yml "<任务文本>"`。
- 本地目录安装（`dsh plugin add ./yuque-notes-plugin`）不触发 `prepare`，需先 `pnpm build`。
- 仓库内调试不安装：`pnpm dsh --profile headless --patch ./cordis.patch.yml "<任务文本>"`。

## 架构分层

调用链：`src/index.ts`（cordis 入口）→ `src/tools.ts`（工具定义/注册）→ `src/book.ts` + `src/doc.ts`（编排）→ `src/yuque.ts`（API 客户端）+ `src/toc.ts`（目录树）+ `src/images.ts`（图片管线）。`test/` 与 `src/` 一一对应（`yuque-endpoints.test.ts` 覆盖客户端，`tools.test.ts` 覆盖工具注册）。

- **入口（index.ts）**：导出 `name`、`inject: ['tools']`、`apply(ctx, config)`。`attachments` 服务是**可选的**——`ctx.get('attachments')` 取不到时工具仍注册，只是 `attachment://` 图片引用会抛错。
- **客户端（yuque.ts）**：`YuqueClient` 持有 token 提供函数（`#resolveToken`，每次请求前 await 解析），只注入 `X-Auth-Token` 请求头。所有方法接受可选 `AbortSignal` 随 agent 取消。`#request` 对 429/5xx 指数退避重试（`2^n * 250ms`，最多 3 次）；错误经 `normalizeError` 归一化为 `unauthorized`（401/403）、`not-found`（404）、`yuque-api`（其余）。TOC 追加（PUT）返回完整 toc 数组，用 `matchTocNode` 按（type, title, parent_uuid ?? ''）定位新节点。
- **编排**：`ensureBook` 按 name 精确匹配复用知识库，缺失则创建，422 缺 slug 时带 `makeSlug` 生成的 ASCII slug 重试一次。`createNote` = 图片管线 → createDoc → 挂 TOC。
- **fail-loud**：任一张图片读取/上传失败 → 整次保存中止（不产生半成品文档）；文档创建成功但挂 TOC 失败 → `deleteDoc` 回滚（回滚也失败则抛错并保留 URL）；工具不吞错误。

## 编码约定（违反会编译失败）

- **相对导入必须带 `.ts` 扩展名**（`tsconfig` 的 `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`，编译后自动改写为 `.js`）。
- **`exactOptionalPropertyTypes` 开启**：可选字段绝不显式传 `undefined`，一律用 `...(x === undefined ? {} : { x })` 展开模式（全库统一写法）。
- **`noUncheckedIndexedAccess` 开启**：数组下标访问可能是 `undefined`，需判空。
- `strict` + `noUnusedLocals/Parameters`：typecheck 必须零错误。

## 工具执行上下文（tools.ts 中非显然的约定）

- 取消：`execute(args, exec)` 用 `exec.signal` 贯穿所有网络调用。
- **agent cwd 取自 `exec.agent.session.header.cwd`，不是 meta**——`yuque_create_doc` 用它解析正文中的相对路径本地图片。测试里 mock 的 exec 对象必须带 `agent.session.header.cwd`。
- `yuque_create_dir` 幂等：先 `getToc` 按 title + parentUuid 找既有节点，找到直接返回，不再创建。
- 工具输出走 `output.schema` + `output.render`（render 生成给模型看的文本）。

## 测试模式

- 单元测试：`vi.fn()` mock `YuqueClient` 的各个方法，验证编排逻辑与幂等行为。
- 端点测试（yuque-endpoints.test.ts）：`vi.stubGlobal('fetch', fn)` mock 网络，断言 URL、方法、请求体；`afterEach(() => vi.unstubAllGlobals())`。
- 工具测试：构造 fake `ctx`（仅 `tools.register`）捕获注册的工具，直接调 `execute` 断言返回值。

## 非目标（README 明确排除）

文档更新/移动/删除；多知识库并行；语雀富文本控件（只产标准 Markdown）；团队/组织知识库（按个人 `users` API 路径实现）。新增功能不应打破这些边界。
