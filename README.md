# 电商图片提取下载（Chrome 扩展）

在淘宝 / 天猫 / 京东 / 拼多多商家版商品详情页一键提取商品图，于新标签页勾选后批量下载为 PNG。

## 文件结构

```
imagegrab/
├── manifest.json      # Manifest V3 配置
├── content.js         # 详情页注入按钮 + 图片扫描
├── content.css        # 悬浮按钮样式
├── background.js      # Service Worker：打开画廊、转 PNG、下载
├── gallery.html       # 图片预览页
├── gallery.js
├── gallery.css
├── icons/             # 扩展图标
└── README.md
```

## 安装

1. 打开 Chrome，地址栏进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目文件夹 `imagegrab`
4. 确认扩展已启用

## 使用

1. 打开淘宝、天猫、京东或拼多多商家版的**商品详情页**
2. 页面右下角出现青绿悬浮按钮「获取图片」
3. 点击后插件会扫描并过滤商品图，自动打开预览页
4. 在预览页勾选需要的图片（默认全选），点「下载选中」
5. 文件保存为 `商品图_001.png`、`商品图_002.png`…（浏览器默认下载目录）

## 说明

- 仅在匹配的商品详情页显示按钮，其他页面不注入
- 会过滤 logo、图标、占位图及小于约 100×100 的图片
- 下载时在后台将 JPG / WebP 等统一转为 PNG；若个别 CDN 拦截，该张会记为失败，其余继续下载
- 权限用途：`downloads` 保存文件，`storage` 在预览页间传递图片列表，`host_permissions` 用于拉取跨域商品图

## 实现思路（简要）

1. **Content Script** 按 URL 判断详情页 → 注入按钮 → 收集 `img` / 懒加载属性 / `srcset` / 背景图 → 尺寸探测与去重 → `sendMessage`
2. **Service Worker** 将列表写入 `chrome.storage.local` 并打开 `gallery.html`
3. **Gallery** 网格展示、勾选；下载请求发回后台
4. **后台** `fetch` + `createImageBitmap` + `OffscreenCanvas` 转 PNG，再 `chrome.downloads.download`
