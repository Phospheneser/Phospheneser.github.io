# 学术个人主页

配置驱动、静态部署的个人主页：单页、多页、博客共用数据层与卡片渲染，支持中英日文、可扩展板块和插件。

[English](README.md) · [架构与扩展接口](docs/architecture.md)

## 本地预览

```sh
python3 -m http.server 8000
```

- 单页：`http://localhost:8000/index.html`
- 多页：`http://localhost:8000/multipage_index.html?page=publications`
- 博客：`http://localhost:8000/blogs/index.html`
- 语言：在地址后添加 `?lang=zh`（已有参数时使用 `&lang=zh`）。

仓库中的生成资源可以直接预览；修改图片或导航标签后，发布前运行 `npm ci && npm run build`。请使用 HTTP 服务预览，ES Modules 不适合直接用 `file://` 打开。

## 新增一条内容：只编辑一个文件

在 `data/content/news.json` 的 `items` 中追加：

```json
{
  "id": "new-paper-2026",
  "date": "2026.11.13",
  "translations": {
    "en": { "content": "Our new paper is available." },
    "zh": { "content": "我们的新论文已发布。" }
  }
}
```

日期、图片、链接等公共字段只写一次。需要翻译的字段放在 `translations`。缺少整个语言或某个字段时，逐字段回退到 `data/meta.json` 的 `defaultLanguage`；不需要同时编辑三个文件。ID 应稳定且在同一个文件内唯一，调整顺序或标题时不要更改 ID。

- `items` 的数组顺序就是默认展示顺序，筛选、排序不会改写原始数据。
- 各语言相同的文字也可以直接放在公共字段，例如论文标题。
- 嵌套对象同样支持 `translations`，链接的 URL 可以共享、标签可以翻译。
- 显式 `null` 表示该语言省略字段；空字符串和空数组也保留，不会自动回退。
- 缺少可选图片时不显示占位图。
- 仓库中的富文本和文章 HTML 是可信的作者内容，不适用于直接接收访客提交的 HTML。

## 新增板块

1. 新建 `data/content/awards.json`：

```json
{
  "translations": {
    "en": { "nav_label": "Awards", "title": "Awards" },
    "zh": { "nav_label": "获奖", "title": "获奖经历" }
  },
  "items": [
    {
      "id": "research-award-2026",
      "date": "2026",
      "translations": { "en": { "content": "Research Award" } }
    }
  ]
}
```

2. 在 `data/meta.json` 的 `sections` 中添加：

```json
{
  "id": "awards",
  "enabled": true,
  "dataSource": "awards",
  "itemType": "news",
  "singlePage": { "enabled": true, "layout": "list" },
  "multiPage": { "enabled": true, "layout": "list", "plugins": ["search"] }
}
```

导航与正文会自动生成，不需要修改页面。单页、多页分别支持 `enabled`、`plugins` 与 `layout`。卡片可设置 `layout: "grid"` 和 `options: { "columns": 2, "gap": "normal" }`，手机上自动变成单列。特殊布局通过注册模板扩展，见架构文档。

## 博客

- 元数据统一在 `data/content/blogs.json` 中维护。必填字段为 `id`、`slug`、`title`、`post_time`、`summary`；可翻译字段也可放在 `translations` 内。
- 正文保存在 `blogs/posts/<slug>/<language>.html`，缺少译文时回退到默认语言，并显示回退提示，不改变访客的语言偏好。
- 支持 `body` 字段指定仓库根目录下的正文路径。
- `hero_image` 保留原有“相对于 blogs/”的路径约定；其他内容的 `image`、链接图标路径相对于站点根目录，均兼容 GitHub 项目子路径。
- 正文中的相对图片、音频和脚本路径相对于正文所在目录解析。
- 保留 MathJax 公式和假名音频等文章交互脚本。

## 目录与配置

```text
data/meta.json            栏目、语言、模板映射和可选功能
data/content/*.json      每个板块一份内容记录及其翻译
data/i18n/*.json         导航、页脚等界面文案
static/js/core/          数据、翻译、偏好、URL 和资源清理
static/js/renderers/     通用栏目和卡片渲染
static/js/components/    首页、轮播与词云
static/js/pages/         首页、博客列表、文章页面入口
static/js/extensions.js  自定义渲染器/插件模块的导入入口
static/css/pages/        博客列表与文章样式
static/python/diviner/   独立运行的可选 Python 服务
```

`home.showHero`、`home.showWordCloud`、`navbar.showLanguageDropdown`、`add_diviner` 控制可选功能。占卜组件在配置加载后按需导入，通过 `divine.serverUrl` 指定服务地址。GitHub Pages 只提供静态页面，Python 服务仍独立部署。

## 内容与回归检查

需要 Node.js 22.15 或更高版本；仅本地预览不需要 Node。

```sh
npm ci
npm run build
```

检查包括内容字段、语言、重复 ID、板块/模板/插件引用、默认语言博文、语言回退、DOM 页面流程和组件清理。新增普通内容只需要通过这些通用检查。

`npm run verify:migration` 是一次性迁移审计：将当前解析结果与重构前提交 `f5cce8c` 的 33 份语言文档摘要对比。它不属于日常检查或 CI；后续有意编辑内容后不再要求通过。

## 部署

仍是 GitHub Pages 静态站点，保留现有入口 URL。`.nojekyll` 禁用不需要的 Jekyll 处理。新增的 GitHub Actions 只执行验证和测试，不更改发布源、不触发自定义部署。

构建会自动生成响应式 WebP 副本和多语言导航标签，原图保留。使用分支发布 Pages 时，需要连同 `media/optimized/`、`static/js/generated/`、`static/css/generated/` 和更新的 HTML 一起提交。`npm run check` 只检查、不重新生成。已检查本地桌面/手机布局；线上 Web Vitals 仍需实际测量。
