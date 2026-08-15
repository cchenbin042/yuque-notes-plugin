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
        imageHosting:
          provider: github
          # 图片图床仓库（建议独立公开仓库）；优先读环境变量 YUQUE_IMAGE_REPO，
          # 未设置时回退到示例默认值——他人使用时请设环境变量指向自己的仓库
          repo: !!js (process.env.YUQUE_IMAGE_REPO || '<owner>/<repo>')
          token: !!js process.env.GITHUB_TOKEN
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `token`（或环境变量 `YUQUE_TOKEN`） | 无（必填） | 语雀 API token；只注入请求头，绝不写入工具参数、返回或日志 |
| `bookName` | `我的笔记` | 目标知识库名，不存在时自动创建；知识库默认私有创建 |
| `baseUrl` | `https://www.yuque.com` | 语雀 API 基址，为私有化部署预留 |
| `imageHosting.provider` | 无 | 图片图床类型，目前仅支持 `github` |
| `imageHosting.repo`（或环境变量 `YUQUE_IMAGE_REPO`） | 无（有图片时必填） | 图片仓库，`owner/repo` 形式；多人使用时须各自设置环境变量指向自己的仓库 |
| `imageHosting.token`（或环境变量 `GITHUB_TOKEN`） | 无（有图片时必填） | GitHub token（contents API 写权限） |
| `imageHosting.branch` / `basePath` / `cdn` | `main` / `images` / `jsdelivr` | 目标分支 / 仓库内目录前缀 / 对外 URL 形式（`jsdelivr` 或 `raw`） |

未配置 token 时插件加载即报错（fail-loud），不会带病运行。

## 内置 skill：yuque-pdf-notes

插件还附带一个 dsh skill：**把 PDF 课件整理成带插图的笔记存进语雀**。它会自动完成「提取文本 → 提取插图 → 组装 Markdown → 保存到语雀」整个流程，不用你手动拆 PDF。

### 需要什么（前置条件）

| 条件 | 说明 |
| --- | --- |
| 插件已安装并配置好 | 见上方「安装」「配置」，语雀与图床 token 就绪 |
| 本机装有 Python 3 | skill 用 `pypdf` 提取 PDF 文本与图片：`pip install pypdf` |
| 有 PDF 文件路径 | 告诉模型 PDF 在本机的位置 |

### 安装（二选一）

**方式 A：项目内自动发现（零安装）**

`.dsh/skills/` 在仓库根目录里，任何在项目目录中运行的 dsh 会话（如仓库内 headless 调试）会自动发现它，无需额外操作。

**方式 B：全局安装（推荐，任何目录都生效）**

把 skill 复制到 dsh 的全局 skills 目录，所有 dsh 会话（包括 web 界面）都能用：

```sh
mkdir -p ~/.agents/skills
cp -r .dsh/skills/yuque-pdf-notes ~/.agents/skills/
```

Windows 上等价于复制到 `C:\Users\<你的用户名>\.agents\skills\yuque-pdf-notes\`（含 `SKILL.md`）。

### 使用

在 dsh 会话（命令行或 web 界面）里直接说，例如：

> 把 `E:\学习\langchain-02.pdf` 整理成笔记存到语雀

模型会加载 skill 并自动执行：

1. 用 pypdf 按页提取文本（保留标题层级、表格、代码块）
2. 提取插图到 `images/`（跳过封面页与 15KB 以下的装饰小图）
3. 组装 Markdown，在关键论述处插入图片引用
4. 调 `yuque_list_toc` 看目录 → 目录不存在则 `yuque_create_dir` 创建 → `yuque_create_doc` 保存
5. 校验返回的 `uploadedImages` 等于插入的图片数，缺图会重试而不是静默存纯文本

### 标题与目录规则（skill 自动遵守）

- **标题优先复用**：PDF 课件自带标题直接用，只去掉品牌词。例：「尚硅谷-02-模型的创建与调用.pdf」→ 标题「02-模型的创建与调用」；无标题的琐碎笔记才由模型自拟
- **正文去品牌**：删除封面、页眉页脚、正文里的讲师/企业信息（如「讲师：尚硅谷 - 宋红康」），只保留知识内容
- **目录按主题命名**：如上传 LangChain 1.2 课件 → 目录「langchain1.2」

### 出错时

- 图片上传失败：整次保存中止并报出失败引用与原因（fail-loud）。常见原因：图片引用路径写错、`GITHUB_TOKEN` 无写权限、`YUQUE_IMAGE_REPO` 指向不存在的仓库
- 确认插件配置：`--dump-config` 可查看合成后的配置（token 以 `!!js` 表达式保留，不会打印出明文）

## 使用示例

对话指令：

> 帮我把这段记到语雀：git rebase 时遇到冲突，用 git status 查看冲突文件，解决后 git add 再 git rebase --continue

模型会依次调用 `yuque_list_toc`（查看现有分类）→ 决定分类（必要时 `yuque_create_dir` 新建）→ `yuque_create_doc`，最后输出文档 URL。

## 图片引用格式

`yuque_create_doc` 的正文支持两种图片引用，插件自动读取、上传到配置的图床（`imageHosting`，GitHub 仓库）并替换为公网 CDN URL：

- `![](attachment://<attachmentId>)` — 会话中已有的图片（attachment 服务）
- 本地路径，如 `![](./screenshot.png)` — 绝对路径，或相对 agent 会话 cwd 的路径
- `http(s)` 外链引用原样保留，不重新上传

任一张图片读取或上传失败，整次保存都会中止并报出失败引用与原始原因（fail-loud，不产生半成品文档）。正文含图片引用但未配置 `imageHosting` 时同样中止并提示配置。

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
