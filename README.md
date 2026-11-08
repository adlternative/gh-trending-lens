# GitHub Trending Lens

把 github.com/trending 的列表替换成我们自己的榜单：通过 GitHub Search API 找近 7 / 30 / 90 天新出的仓库，
本地打分和分类，展示"真正有潜力"的新项目。GitHub 原榜保留在一个切换按钮后面。

## 安装

1. `chrome://extensions` 开启"开发者模式"，"加载已解压的扩展程序"选这个目录
2. 打开 github.com/trending，列表会被替换；点工具栏图标也能打开独立页面
3. 建议在扩展"设置"里填一个 GitHub token（不需要任何权限勾选）。不填也能用，
   但未认证限额 10 次/分钟，一次刷新要 11 次，最后一两组查询可能被丢弃

## 榜单

- **新星**：创建 ≤ N 天、≤ 2000 star，按潜力得分排序。这是主视图
- **上升**：创建 ≤ 1 年、> 2000 star，按同样的分数排序
- **GitHub 原榜**：切回原始 trending 列表

时间窗口 7 / 30 / 90 天，对应最低 star 门槛 30 / 50 / 80。

## 候选池怎么来的

11 次 Search API 调用，结果缓存 30 分钟：

- 3 页通用查询：`created:>=日期 stars:>=门槛`，按 star 降序
- 2 页上升查询：`created:>=一年前 stars:>=2000`
- 6 组关键词查询，各 1 页，保证硬件、游戏、安全、数据这些小众类别不被 AI 淹没
  （每组 ≤ 6 个词，因为 GitHub 限制每个查询最多 5 个 OR）

30 天窗口实测候选池约 900 个，新星桶约 650 个。

## 打分

只用 Search API 返回的字段，不需要额外请求：

| 权重 | 指标 |
|---|---|
| 40% | star / 存在天数（在候选池内的百分位） |
| 20% | 最近 push 距今（≤3 天满分，≤14 天 0.7，≤45 天 0.3） |
| 15% | fork / star 比 |
| 10% | open issue / star 比 |
| 10% | 有描述、有 license、有 topic |
| 5% | 是否组织账号 |

不按内容排除任何仓库；awesome、教程一类归入 Skills / 资料 大类的子类，想藏就在类别 chip 上右键。

## 分类

`classify.js` 里的关键词规则，按 name + description + topics 打分，最高分类别胜出，没命中归"传统软件"。
Skills 类权重最高，因为它最容易和 AI 混淆。默认全部可见。⌥+点击或右键类别 chip 可以切换隐藏；
每行右侧下拉可以手动改类别，会记住；设置页可以给每类追加关键词。

## 文件

| 文件 | 作用 |
|---|---|
| `radar.js` | 查询构造、打分、分桶 |
| `classify.js` | 分类规则 |
| `background.js` | 调 GitHub API、缓存、打开页面 |
| `view.js` / `view.css` | 榜单渲染，独立页和注入页共用 |
| `content.js` | 在 github.com/trending 替换原列表 |
| `trending.html` | 独立页面 |
| `options.html` / `options.js` | token 和自定义关键词 |
