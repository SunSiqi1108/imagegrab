# 角色设定
你是一位资深的Chrome浏览器扩展开发工程师，精通Manifest V3、Content Script、Service Worker、chrome.downloads API、跨域图片处理与前端交互设计。你擅长把需求拆解为清晰的文件结构，写出可直接运行、无报错、注释完善的代码。

# 任务目标
开发一个Chrome浏览器扩展：电商图片提取下载插件。支持在淘宝、京东、拼多多商家版的商品详情页，一键提取页面内所有商品图片，并在新标签页中集中展示、勾选、下载为PNG格式。

# 功能需求
1. 插件按钮
- 位置：电商详情页右下角悬浮显示
- 文案：「获取图片」
- 样式：圆角按钮、有阴影、hover有反馈，不遮挡页面原有操作
- 仅在淘宝、京东、拼多多商家版的商品详情页注入显示，其他页面不显示

2. 图片提取
- 点击按钮后，扫描当前页面所有商品相关图片
- 来源包括：<img>标签、srcset、data-src、data-lazy-src、背景图background-image等懒加载图片
- 过滤掉图标、logo、占位图、1x1像素图、小于指定尺寸（如100x100）的图片
- 对相对路径补全为绝对URL，去重
- 通过chrome.runtime.sendMessage把图片列表传给扩展

3. 新页面展示
- 打开一个新的扩展页面（如gallery.html），网格化展示所有提取到的图片
- 每张图片显示：缩略图、尺寸信息、复选框
- 顶部提供：全选/反选/已选数量显示/「下载选中」按钮
- 界面简洁美观，响应式网格布局

4. 下载功能
- 支持勾选后批量下载
- 统一转换为PNG格式（如原图是jpg/webp，需通过canvas转换）
- 文件名规则：商品图_序号.png，序号补零（如001）
- 使用chrome.downloads.download保存到浏览器默认下载目录
- 下载过程有进度提示，完成后给出结果反馈

# 技术约束
- 使用Manifest V3
- 权限：activeTab、scripting、downloads、storage
- 匹配域名：
  淘宝：*://*.taobao.com/*、*://*.tmall.com/*
  京东：*://*.jd.com/*
- 图片转PNG若遇到跨域问题，在background/service worker中通过createImageBitmap处理，或在manifest中声明对应host权限
- 代码需模块化、有注释、可直接加载到chrome://extensions运行

# 测试
开发完成后，自主测试所有功能，确保能正常工作。

# 交付物
请按以下结构输出完整代码：
1. manifest.json
2. content.js（注入按钮+提取图片）
3. content.css（按钮样式）
4. background.js（service worker，处理下载与消息转发）
5. gallery.html + gallery.js + gallery.css（新页面展示与勾选下载）
6. 一段简短的安装与使用说明

# 输出要求
- 先给出整体文件结构与实现思路，再逐个文件输出完整代码
- 代码要能直接运行，不要伪代码
- 关键逻辑加中文注释
- 遇到平台差异（如懒加载属性不同）要做兼容处理