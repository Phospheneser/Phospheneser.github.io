# 架构与扩展契约

## 数据到页面

`meta.json → 缓存数据层 → 按语言解析记录 → 筛选/排序 → 共享渲染器 → 页面`

`pages/home.js` 同时服务单页和多页，布局由 HTML 的 `data-layout` 指定。博客列表复用论文/项目卡片的渲染器。文章页负责长正文、脚本加载和 MathJax。原有入口 URL、博客 slug 和内容顺序保持。

`core/data.js` 以模块位置确定站点根目录，兼容用户站点和 `/repository/` 项目站点。相同路径的并发与后续 JSON 请求共享 Promise；失败后移除缓存，允许重试。刷新页面会取得新内容，不做跨会话缓存。

`core/content.js` 是无 DOM 的翻译与筛选层。解析顺序是公共字段 → 默认语言字段 → 请求语言字段，再递归解析嵌套对象。缺失翻译不隐藏记录。`null` 删除字段，不同语言可以有意省略某个可选字段。

`createRenderGate()` 让旧异步结果不能提交到新路由；它不取消其他页面仍在复用的缓存请求。页面提交前销毁上一次的组件、插件和渲染器资源。

## 新增内容与字段

每个 `data/content/<source>.json` 文件包含栏目元数据和 `items` 数组。普通记录只增加 JSON，不注册 JS。扩展已有类型时，在 `meta.itemTypes` 的 `requiredKeys`、`optionalKeys` 和 `templateOptions` 描述字段；校验器逐语言解析后验证必填字段。

普通卡片支持 `titleField`、`mediaField`、`subtitleFields`、`metaFields`、`descriptionFields`、`detailsField`、`tagsField`、`primaryLink` 和 `actions`，保留旧配置中的字段映射。结构化文本使用 `template: "text"` 和 `texts`/`paragraphs`，也能作为新板块接入。

## 自定义模板

在自己的模块中注册，然后在 `static/js/extensions.js` 导入该模块。首页、博客列表和校验器都会加载这个统一扩展入口。注册重复名称会报错，防止静默覆盖。

```js
import { TemplateRegistry } from '../templates.js';

TemplateRegistry.register('gallery', (items, section, container, context) => {
  // context.meta、context.language 是显式依赖。
  for (const item of items) {
    const figure = document.createElement('figure');
    figure.textContent = item.title;
    container.appendChild(figure);
  }
  // 有监听器/计时器/观察器时，返回清理函数。
  return () => {};
});
```

在 `sections[].template` 或 `itemTypes[...].template` 引用 `gallery`。模板处理整个栏目，不依赖某一种卡片 DOM；返回的清理函数会在筛选、语言切换、导航或离页时调用。普通 DOM 节点由宿主替换。

内置模板：`list-inline`、`paper-card`（兼容 `meta-card`/`feature-card`/`card` 别名）、`timeline`、`experience`、`member-card`、`visitor-globe`、`default`。`text` 由页面负责渲染段落。

## 自定义插件

```js
import { PluginRegistry } from '../plugins.js';

PluginRegistry.register('featured-only', {
  mount({ controls, update, scope }) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', 'Only featured items');
    controls.appendChild(checkbox);
    scope.on(checkbox, 'change', () => update({ featuredOnly: checkbox.checked }));
  },
  transform(items, state) {
    return state.featuredOnly ? items.filter(item => item.featured) : items;
  }
});
```

再在 `singlePage.plugins` 或 `multiPage.plugins` 启用。`mount` 接收 `section`、`controls`、原始 `items`、`state()`、`update(patch)`、本地化 `labels`、`scope`。`transform` 可选，接收搜索排序后的记录和当前状态；多个插件按配置顺序组合。插件不能原地修改数据源。移除筛选与排序后自然恢复原始顺序。

`scope.on` 和 `scope.interval` 自动记录清理动作；其他资源可使用 `scope.add(cleanup)` 或从 `mount` 返回清理函数。不要通过查找卡片内的文本和日期节点实现筛选。

## 组件与主题

`core/preferences.js` 统一语言与主题偏好，`core/lifecycle.js` 管理资源。主题图标通过 CSS 显隐，不为每个链接创建观察器。首页轮播在重新挂载前销毁，离开多页首页时停止计时。词云库与占卜组件按需加载；占卜组件通过参数获取配置，退出时断开监听和未完成请求。

`static/css/pages/` 存放博客专用规则；`components.css` 管理共享组件、主题图标、经历布局和基础交互。`index.css` 保留既有视觉规则以控制迁移范围；整体视觉设计及其历史覆盖规则的进一步整理是后续工作。

## 验证范围

- `npm run validate`：语言、稳定 ID、必填字段、栏目数据源、渲染器/插件引用、默认语言正文。
- `npm test`：翻译、缓存、错误重试、异步提交保护，以及 jsdom 下的页面流程和资源清理。
- `npm run verify:migration`：可选的一次性旧内容摘要对比，后续编辑内容后无需继续通过。

jsdom 不计算真实布局。此次浏览器控制未获批准，视觉、移动设备布局、实际音频输出与外部服务仍需要浏览器验收。没有更改线上发布源或推送部署。

## 性能优化与验收边界

- 四个入口不再加载完整的 Font Awesome SVG 脚本（文件原始大小 1,194,960 字节），改用原有 CSS 与本地 WOFF2 字体。三份字体合计 172,336 字节，浏览器只请求使用到的字重/字体；这是磁盘资源大小对比，不是实测网络传输量或加载时间。字体许可证保存在 `static/webfonts/LICENSE.txt`。
- 移除 Google Fonts 和未使用的 Academicons 外部样式依赖，正文使用系统字体。图标不再通过运行时扫描及观察 DOM 替换成 SVG。
- 多页模式只请求当前板块的内容；导航标签由内容文件在构建时提取，无需为菜单下载全部正文。单页保留板块顺序并独立提交已返回的内容，一个慢请求不会拖住其他板块。标题、头像与正文不等待卡片/词云 JSON，占卜入口也不等待正文。JSON 请求仍会缓存并复用。
- `core/activity.js` 统一观察视口、页面可见性和减少动态效果偏好；词云进入视口后才加载，离屏或隐藏时暂停，卸载时删除实例。轮播离屏后不自动切换。TagCanvas 的 Pause 会跳过动画计算，但其库级定时回调仍存在，参见 [官方函数说明](https://www.goat1000.com/tagcanvas-functions.php)。
- 单页首个板块以后的内容使用 `content-visibility: auto`，减少离屏布局与绘制；内容仍保留在 DOM，浏览器不支持该属性时正常显示。预估高度采用 `contain-intrinsic-size: auto 700px`；点击锚点或带 hash 进入时先恢复完整布局，避免前方板块的估算高度导致滚动落错位置，返回首页时恢复离屏优化。机制参见 [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)。
- 移除多页模式的固定背景滚动效果，缩小轮播动画属性范围，取消导航项的逐项背景模糊。成员头像改用支持懒加载的图片，内容缩略图异步解码。
- MathJax 从文章页的同步脚本改为检测到公式时异步加载；文章记录可设置 `math: true` 强制启用或 `math: false` 禁用。加载失败不阻止正文展示。

测试覆盖慢板块请求、词云进入/离开视口、隐藏标签页、减少动态效果、清理监听器、本地图标资源及数学库按需加载。没有实际 FPS、LCP、INP 或 CLS 测量结果，不能将测试通过解释为已经达到某个流畅度指标。

待真实浏览器验收：冷缓存和热缓存各测试桌面/移动尺寸，记录首屏 LCP、交互 INP、滚动长任务及布局偏移；切换三种语言与主题、点击跨板块锚点、验证图标和数学公式。本地浏览器已检查桌面与 390px 手机布局、图片实际选用的 WebP 地址及导航。仍需上线后用冷缓存/慢网络测量完整体验，磁盘体积下降不能直接换算为 LCP 或 FPS 改善。

### 占卜服务预热

单页和多页首页取得配置后立即异步调用 `/health`，早于板块内容加载完成；预热不等待占卜窗口打开，也不阻塞首屏。隐藏标签页等到首次可见再预热，回到页面时只在缓存过期后重新检查。设置 `divine.prewarm: false` 可关闭；`add_diviner: false` 同时关闭组件与预热。

`core/service-warmup.js` 按服务地址合并同一页面的并发请求，成功记录缓存 5 分钟，失败记录缓存 30 秒。支持 Web Locks 和 localStorage 的同源标签页会共享预热结果；锁竞争者取得锁后再次检查结果，避免连续重复唤醒。两种 API 不可用时回退到页内合并，不阻止使用。所有检查都有覆盖响应体的 75 秒截止时间，没有周期心跳或无限重试。

窗口显示预热状态。业务请求始终可直接发出，不排队等待健康检查；占卜成功也会刷新就绪记录。就绪只是最近成功访问的提示，不保证服务期间没有重启。

跨设备访客之间没有共享浏览器存储，仍可能各发一个轻量健康检查。Render 免费服务只有一个实例，各访客的请求都会到同一个后端；严格做到“全球仅一条预热请求”需要另设常驻协调入口，本方案没有引入该依赖。平台仍需要完成冷启动，只是把启动提前到浏览页面期间；首个访客立即点击时仍可能等待。

参考：[Render 免费实例休眠规则](https://render.com/docs/free#spinning-down-on-idle)、[同源标签页 Web Locks 协调](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)。自动化测试模拟了慢启动、失败与多标签页竞争；真实浏览器验证了就绪提示。本轮没有通过等待实例休眠 15 分钟来量测完整冷启动过程。该策略属于前端改动，需要发布前端后才对线上访客生效。


### 图片构建与内容维护

`npm run build` 自动生成资源并执行内容/回归检查；`npm run prepare:assets` 仅生成资源。Node 22.15+ 与 `npm ci` 安装的 sharp 只用于开发和构建，部署仍是静态文件。

- 扫描 `media/` 和 `blogs/` 下大于 16 KiB 的 JPEG、PNG、WebP，保留原图；跳过动画与生成目录。按原始宽度生成最多 160/320/640/960/1280/1920px 的 WebP，不放大图片，保留纵横比及 EXIF 方向。
- 输出到 `media/optimized/`；文件名包含内容和编码配置哈希，重复构建复用已有文件。`static/js/generated/assets.js` 保存图片候选与各语言导航标签；`static/css/generated/media.css` 为默认背景提供手机/桌面候选。不要手工编辑这些生成文件。
- `core/images.js` 统一设置 `srcset`、`sizes`、尺寸与解码策略，支持仓库子路径。头像与文章封面优先加载，列表图片继续懒加载。未知/新加入/外部图片保留原地址，不会因缺少优化记录而消失。
- 首页静态头像与运行时使用同一组候选，避免先下载完整原图；配置 JSON 在 HTML 中预加载。导航标签仍从原有内容文件提取，无需额外手工维护翻译。
- 新增 item 的流程不变：修改对应内容 JSON，添加原图，运行 `npm run build`。按分支发布时将生成目录与 HTML 一起提交；现有 CI 会构建和检查，但不会替你提交生成物或变更部署设置。

示例文件体积：ESP32 项目原图 1,912,231 字节，640px 副本 28,622 字节；三张博客封面原图共 4,310,350 字节，640px 副本共 124,458 字节。完整明细由每次构建写到本地 `artifacts/image-sizes.json`。这些数字比较的是原图与特定尺寸候选，实际浏览器下载量取决于视口、像素密度与缓存。

本轮没有切换为静态 HTML 生成框架，也未裁剪 Bulma/图标字体；这些仍可在采集性能基线后单独评估。
