# iFanControl 官网部署规范

## 涉及文件

| 文件 | 用途 | 改动频率 |
|------|------|----------|
| `docs/index.html` | 页面结构 + JS 逻辑 | 极少（新增板块时才动） |
| `docs/styles.YYYYMMDDa.css` | 样式表 | 极少（CSS 改动时重命名） |
| `docs/timeline.json` | 时间线数据 | **每次发版都改** |
| `docs/update-manifest.json` | 自动更新 manifest | **每次发版都改** |
| `docs/iFanControl-macOS.zip` | 最新安装包 | **每次发版都替换** |

## 每次发版流程

### 1. 准备 Release Notes

在 GitHub 创建 Release 时写好文案（中英双语），这就是面向用户的正式表述。

### 2. 更新 timeline.json

在 `docs/timeline.json` 数组中插入新条目：

- **同一天**：在第一个日期组的 `entries` 开头插入
- **新的一天**：新建 `{ "date": "YYYY-MM-DD", "entries": [...] }` 放在数组最前面

```json
{
  "time": "HH:MM",
  "version": "vX.Y.Z / build N",
  "desc": {
    "zh": "中文 Release Notes",
    "en": "English Release Notes"
  }
}
```

- `time`：用 GitHub Release 的 `published_at` 转本地时间
- `desc`：直接使用 Release Notes 文案，不暴露内部实现细节
- `version`：可选，没有版本号的条目不显示胶囊

### 3. 更新 update-manifest.json

```json
{
  "latest_version": "X.Y.Z",
  "latest_build": N,
  ...
}
```

### 4. 替换安装包

```bash
cp /path/to/iFanControl-macOS-X.Y.Z.zip docs/iFanControl-macOS.zip
```

### 5. 部署

```bash
cd '/Users/puremilk/Documents/mac fancontrol/docs'
npx wrangler pages deploy ./ --project-name ifan --no-bundle --skip-caching
```

**禁止**：不要在 `docs/` 放 `_worker.js` 或 `_worker.bundle`（会覆盖 functions/ 自动构建）

### 6. 同步检查清单

- [ ] `timeline.json` 已插入新条目
- [ ] `update-manifest.json` 版本号已更新
- [ ] `iFanControl-macOS.zip` 已替换为新包
- [ ] Cloudflare Pages 部署成功
- [ ] 官网 `ifan-59w.pages.dev` 可正常访问
- [ ] GitHub Release 已创建（含 ZIP 附件）

### 校验注意事项

**SHA256 已足够，不要依赖文件大小。** Cloudflare CDN 传输大文件时可能微调字节数（实测 6008350 → 6008345，差 5 字节），但内容 SHA256 不变。manifest 中的 `size` 字段仅作展示参考，App 端更新校验应只检查 SHA256。

### 覆盖同版本发版（热修复）

当需要修复紧急 bug 但不想升版本号时：

1. **不创建新 Release**：直接编辑现有版本的 Release（如 v2.9.5）
2. **替换 ZIP 附件**：先 `gh release delete-asset` 旧 ZIP，再 `gh release upload` 新 ZIP
3. **更新 manifest sha256/size**：ZIP 内容变了，hash 一定变
4. **更新 Release Notes**：如有需要，用 `gh release edit` 修改文案
5. **timeline.json 不加新条目**：覆盖不产生新时间线，如有需要修改已有条目文案
6. **deploy docs**：确保 manifest 在线生效

注意：已下载旧版 ZIP 的用户不会自动收到覆盖更新，只有通过应用内自动更新或重新从官网下载才能拿到新包。

### 公开文案规范

心跳上报、匿名统计等内部实现细节**不在公开渠道暴露**。对外统一使用：
- Release Notes："Bug 修复与性能优化"
- timeline.json：同上
- update-manifest.json notes：同上

## CSS 缓存策略

CSS 文件名包含日期（如 `styles.20260427a.css`）。当 CSS 有改动时：

1. 复制为新文件名（改日期）
2. 更新 `index.html` 中的 `<link>` 引用
3. 部署

这样可以避免 Cloudflare CDN 缓存旧版本。

## 时间线板块架构

- HTML：`<section class="timeline-section">`，位于 iteration-section 和 showcase-section 之间
- JS：通过 `fetch("./timeline.json")` 加载数据，失败时静默不显示
- 默认展示最近 1 天的条目，点击按钮展开全部
- 中英文切换时自动重新渲染
