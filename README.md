# yuque-notes-plugin

dsh 工具插件：把零散的笔记（文本 + 图片）保存到语雀知识库，由模型根据笔记内容自动分类。

## 功能

插件向 agent 暴露三个工具：

| 工具 | 作用 |
| --- | --- |
| `yuque_list_toc` | 列出笔记知识库的目录树（含文档），模型据此决定新笔记归到哪个分类 |
| `yuque_create_dir` | 在知识库中创建目录（分类）节点；同名同父已存在时直接返回既有节点，不重复创建 |
| `yuque_create_doc` | 把一条笔记保存为语雀文档：Markdown 正文，图片引用自动读取、上传并替换，返回文档 URL |

保存链路：

```
yuque_list_toc（看现有分类）
  ├─ 已有合适目录 → yuque_create_doc（title + Markdown + dirUuid）
  └─ 没有合适目录 → yuque_create_dir（新建分类）→ yuque_create_doc
```

每次保存只需 2–3 次工具调用；图片上传在 `yuque_create_doc` 内部完成，模型只需在正文里写图片引用。

其他行为：

- 知识库不存在时自动创建（使用配置的 `bookName`）
- 错误归一化并 fail-loud：401/403 为鉴权错误、404 为资源缺失；429/5xx 自动退避重试（最多 3 次）
- 请求可取消：所有网络请求都随 agent 的 `signal` 中止

## 安装

三种方式：

**1. 安装到 profile（推荐，持久生效）**

```sh
dsh plugin --profile <name> add .
```

（在插件仓库根目录执行）插件包的 `dsh.bundle.patch` 声明会让 profile 自动把本插件的 `cordis.patch.yml` 加入 bundle 层。

> 注意：本地目录安装（`dsh plugin add .`）不触发 `prepare`，需先构建：`pnpm build`。

**2. 从 GitHub 安装（社区用户）**

```sh
dsh plugin --profile <name> add github:cchenbin042/yuque-notes-plugin
```

git 安装拉取的是源码而非构建产物，pnpm 会在安装时自动运行本插件的 `prepare` 脚本（`tsc` 构建出 `lib/`，故 `prepare` 脚本不可删）。pnpm ≥ 10 默认拒绝执行 git 依赖的构建脚本：首次 `add` 失败时，把 pnpm 打印的包键加入该 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`，再重新执行 `add`。该授权允许包代码在安装时于本机执行，建议锁定 commit（`github:cchenbin042/yuque-notes-plugin#<sha>`）后再授权。

不想做构建授权时：可等 npm 发布后用 `dsh plugin --profile <name> add yuque-notes-plugin`，或 `pnpm pack` 后 `dsh plugin --profile <name> add ./yuque-notes-plugin-0.1.0.tgz`。

**3. 临时 overlay（仓库内调试，不安装）**

```sh
pnpm dsh --profile headless --patch ./cordis.patch.yml "<任务文本>"
```

## 配置

插件随附的 `cordis.patch.yml` 已默认接入配置：

```yaml
- insert:
    - id: yuque-notes
      name: yuque-notes-plugin
      config:
        bookName: 我的笔记
        token: !!js process.env.YUQUE_TOKEN
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `token`（或环境变量 `YUQUE_TOKEN`） | 无（必填） | 语雀 API token；只注入请求头，绝不写入工具参数、返回或日志 |
| `bookName` | `我的笔记` | 目标知识库名，不存在时自动创建；知识库默认私有创建 |
| `baseUrl` | `https://www.yuque.com` | 语雀 API 基址，为私有化部署预留 |

未配置 token 时插件加载即报错（fail-loud），不会带病运行。

## 使用示例

对话指令：

> 帮我把这段记到语雀：git rebase 时遇到冲突，用 git status 查看冲突文件，解决后 git add 再 git rebase --continue

模型会依次调用 `yuque_list_toc`（查看现有分类）→ 决定分类（必要时 `yuque_create_dir` 新建）→ `yuque_create_doc`，最后输出文档 URL。

## 图片引用格式

`yuque_create_doc` 的正文支持两种图片引用，插件自动读取、上传到语雀并替换为返回的 URL：

- `![](attachment://<attachmentId>)` — 会话中已有的图片（attachment 服务）
- 本地路径，如 `![](./screenshot.png)` — 绝对路径，或相对 agent 会话 cwd 的路径
- `http(s)` 外链引用原样保留，不重新上传

任一张图片读取或上传失败，整次保存都会中止并报出失败引用（fail-loud，不产生半成品文档）。

## 非目标

- 文档的更新 / 移动 / 删除（一期只写入）
- 多知识库并行（一期固定一个专用库，`bookName` 可配）
- 语雀富文本控件（只产出标准 Markdown）
- 团队 / 组织知识库（按个人 users API 路径实现）

## 开发

```sh
pnpm test        # vitest：单元 + mock 网络的完整链路集成
pnpm typecheck   # tsc --noEmit
pnpm build       # tsc -p tsconfig.build.json → lib/
```
