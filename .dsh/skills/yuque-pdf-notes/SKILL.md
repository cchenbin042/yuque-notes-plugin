---
name: yuque-pdf-notes
description: Use this skill when the user wants to organize/turn a PDF into structured notes saved to the Yuque knowledge base (把 PDF 整理成笔记保存到语雀 / 整理 PDF / 存到语雀). It extracts BOTH text and images from the PDF, builds markdown notes with image references, and saves them through the yuque tools (yuque_list_toc / yuque_create_dir / yuque_create_doc). Do NOT fall back to text-only notes - extracting and inserting the key diagrams is part of this workflow.
---

# PDF → 语雀笔记工作流

把 PDF 整理为结构化 Markdown 笔记并保存到语雀知识库，**必须包含关键插图**（这是流程的一部分，不是可选项）。

## 1. 提取文本

用 pypdf 按页提取文本，保留章节层级、对比表格、代码块；整理时不要丢失标题层级和列表结构。

```python
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pypdf import PdfReader
r = PdfReader('目标.pdf')
for i, p in enumerate(r.pages):
    print(f'===== PAGE {i+1} =====')
    print(p.extract_text() or '(no text)')
```

## 2. 提取插图

用 pypdf 的 `page.images` 把图片保存到当前目录下的 `images/` 子目录，文件名 `page-XX-N.png`。**跳过封面页（通常是第 1 页）和 15KB 以下的装饰小图**；同一页多张图都要保存。

```python
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
from pypdf import PdfReader
os.makedirs('images', exist_ok=True)
r = PdfReader('目标.pdf')
count = 0
for i, page in enumerate(r.pages):
    for j, img in enumerate(page.images):
        data = bytes(img.data)
        if i == 0 or len(data) < 15 * 1024:   # 跳过封面页与装饰小图
            continue
        name = f'page-{i+1:02d}-{j+1}.png'
        with open(os.path.join('images', name), 'wb') as f:
            f.write(data)
        count += 1
        print('saved', name, len(data))
print('TOTAL', count)
```

## 3. 组装 Markdown（含插图）

- 按章节结构化整理文本；在每章/每节的关键论述处插入对应插图。
- 插图引用用**相对路径**（相对会话当前目录，即 PDF 所在目录），例如 `![](images/page-07-1.png)`。
- 绝对路径也可以（Windows 风格 `E:\...`）；**不要用 `/e/...` 这种 msys 路径**（Windows 上解析会失败）。
- 若提取的图片很少（≤3 张）或都是空白/重复图，至少也要插入能对上内容的图，不要整篇纯文本。

## 4. 保存到语雀

1. `yuque_list_toc` 查看知识库目录树，决定分类；
2. 目标目录不存在时用 `yuque_create_dir` 创建；
3. `yuque_create_doc` 保存文档；
4. **校验返回的 `uploadedImages` 等于插入的图片数**——若小于，说明有图片失败（可能路径写错），修正后重试，不要静默接受纯文本结果。

## 约束

- **正文去品牌**：删除所有讲师/企业/课程品牌信息——封面文字、页眉页脚、正文引用块（如「讲师：尚硅谷 - 宋红康」）、水印。只保留知识内容本身。
- **标题优先复用**：材料本身带标题（如 PDF 课件标题/文件名）就直接复用，仅去除品牌词（如「尚硅谷」）与讲师信息，不要自行改写。例：课件「尚硅谷-02-模型的创建与调用.pdf」→ 标题「02-模型的创建与调用」。
- **无标题再自拟**：只有琐碎的知识片段（聊天记录、随手记的笔记等）没有标题时，才根据内容拟一个简洁准确的标题。
- **目录按主题命名**：目录名根据上传内容的主题定义，简洁、不含品牌词。例：上传 LangChain 1.2 课件 → 目录「langchain1.2」，不是「学习笔记」「LangChain 1.2 学习笔记」。若知识库本身就是该主题，则不必建同名目录。
- 工具由 yuque-notes-plugin 提供；图片会经插件上传到 GitHub 图床并替换为 CDN URL。
