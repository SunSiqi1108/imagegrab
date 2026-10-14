/**
 * content.js
 * 在淘宝 / 天猫 / 京东 / 拼多多商家版商品详情页注入「获取图片」按钮，
 * 扫描页面商品图并发送给扩展后台，由后台打开 gallery 页展示。
 */

(function () {
  'use strict';

  /** 最小宽高阈值（像素），低于此值视为图标/占位图 */
  const MIN_SIZE = 100;

  /** 需要排除的 URL / 文件名关键词 */
  const EXCLUDE_KEYWORDS = [
    'logo',
    'icon',
    'sprite',
    'avatar',
    'placeholder',
    'loading',
    'blank',
    'spacer',
    'pixel',
    '1x1',
    'favicon',
    'qrcode',
    'qr_code',
    'watermark',
    'badge',
    'btn_',
    'button',
    'arrow',
    'close',
    'share',
    'default_img',
    'no_pic',
    'nopic',
    'empty',
    's.gif',
    'transparent',
  ];

  /** 懒加载常见属性（各平台差异兼容） */
  const LAZY_ATTRS = [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-img',
    'data-url',
    'data-lazy',
    'data-ks-lazyload', // 淘宝
    'data-lazyload-src',
    'data-lazy-img',
    'data-init',
    'data-big',
    'data-zoom-image',
    'data-origin',
    'data-src-retina',
  ];

  // —— 仅在商品详情页显示按钮 ——

  /**
   * 判断当前是否为支持的商品详情页
   */
  function isProductDetailPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname;
    const search = location.search;
    const href = location.href.toLowerCase();

    // 淘宝 / 天猫详情
    if (/(^|\.)(taobao|tmall)\.com$/.test(host) || host.includes('tmall.') || host.includes('taobao.')) {
      if (
        host.includes('item.taobao.com') ||
        host.includes('detail.tmall.com') ||
        host.includes('chaoshi.detail.tmall') ||
        /\/item\.htm/.test(path) ||
        /[?&]id=\d+/.test(search) ||
        /detail\.tmall/.test(host)
      ) {
        return true;
      }
    }

    // 京东详情：item.jd.com/xxxxx.html 或带 sku 的详情路径
    if (/(^|\.)jd\.com$/.test(host) || host.endsWith('.jd.com')) {
      if (
        host.includes('item.jd.com') ||
        host.includes('item.m.jd.com') ||
        /\/\d+\.html/.test(path) ||
        /sku|product|item/i.test(path)
      ) {
        return true;
      }
    }

    // 拼多多 / 商家版详情
    if (
      host.includes('pinduoduo.com') ||
      host.includes('yangkeduo.com')
    ) {
      // 商家后台商品编辑/详情、C 端商品页
      if (
        /goods|detail|product|sku|item|commodity/i.test(path + search) ||
        host.includes('mms.pinduoduo.com') ||
        /[?&](goods_id|goodsId)=/.test(search)
      ) {
        return true;
      }
      // 拼多多商品页常见形态
      if (/\/goods\//.test(path) || /\/product\//.test(path)) {
        return true;
      }
    }

    return false;
  }

  // —— URL 处理 ——

  /**
   * 将相对路径 / 协议相对路径补全为绝对 URL
   */
  function toAbsoluteUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let url = raw.trim().replace(/^["']|["']$/g, '');
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
    if (url.startsWith('javascript:')) return null;

    // 去掉淘宝等常见尺寸后缀参数前的多余空格
    url = url.split(/\s+/)[0];

    try {
      if (url.startsWith('//')) {
        return location.protocol + url;
      }
      return new URL(url, location.href).href;
    } catch (e) {
      return null;
    }
  }

  /**
   * 从 srcset 中取出候选 URL（优先更清晰的大图）
   */
  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  /**
   * 尝试把电商 CDN 缩略图升级为更大尺寸（尽量拿高清图）
   * 失败则返回原 URL，不做破坏性改写
   */
  function upgradeImageUrl(url) {
    if (!url) return url;
    let next = url;

    // 淘宝 / 天猫：_xxXx.jpg / .jpg_xxXx.jpg 等尺寸后缀
    next = next.replace(/_\d+x\d+\.(jpg|jpeg|png|webp|gif)/gi, '.$1');
    next = next.replace(/\.(jpg|jpeg|png|webp)_\d+x\d+\./gi, '.$1.');

    // 京东：!q70 / s100x100_ 等
    next = next.replace(/!q\d+/, '');
    next = next.replace(/\/s\d+x\d+_/g, '/');

    // 拼多多：常见缩略参数
    next = next.replace(/[?&]imageView2\/[^&]+/g, '');

    return next;
  }

  /**
   * 是否应排除该 URL（图标、logo、占位等）
   */
  function shouldExcludeUrl(url) {
    const lower = url.toLowerCase();
    return EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * 从 CSS background-image 提取 url(...)
   */
  function extractBgUrls(value) {
    if (!value || value === 'none') return [];
    const urls = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m;
    while ((m = re.exec(value))) {
      if (m[2]) urls.push(m[2]);
    }
    return urls;
  }

  /**
   * 收集页面上所有候选图片 URL
   */
  function collectCandidateUrls() {
    const set = new Set();

    const add = (raw) => {
      const abs = toAbsoluteUrl(raw);
      if (!abs) return;
      if (shouldExcludeUrl(abs)) return;
      set.add(upgradeImageUrl(abs));
    };

    // 1) <img> 及懒加载属性、srcset
    document.querySelectorAll('img').forEach((img) => {
      LAZY_ATTRS.forEach((attr) => {
        if (img.hasAttribute(attr)) add(img.getAttribute(attr));
      });
      if (img.currentSrc) add(img.currentSrc);
      if (img.srcset) parseSrcset(img.srcset).forEach(add);
      const srcsetAttr = img.getAttribute('data-srcset') || img.getAttribute('srcset');
      if (srcsetAttr) parseSrcset(srcsetAttr).forEach(add);
    });

    // 2) <source> / picture
    document.querySelectorAll('source[srcset], source[data-srcset]').forEach((el) => {
      parseSrcset(el.getAttribute('srcset') || el.getAttribute('data-srcset') || '').forEach(add);
    });

    // 3) 背景图（含内联 style 与计算样式抽样）
    document.querySelectorAll('[style*="background"]').forEach((el) => {
      extractBgUrls(el.style.backgroundImage).forEach(add);
    });

    // 常见主图容器上再扫一遍计算样式（限制数量，避免整页过慢）
    const bgSelectors = [
      '.tb-booth',
      '.tb-pic',
      '.spec-items',
      '#spec-list',
      '.product-img',
      '.main-img',
      '[class*="gallery"]',
      '[class*="sku"]',
      '[class*="detail"]',
      '[class*="preview"]',
    ];
    bgSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        try {
          const bg = getComputedStyle(el).backgroundImage;
          extractBgUrls(bg).forEach(add);
          el.querySelectorAll('*').forEach((child) => {
            const childBg = getComputedStyle(child).backgroundImage;
            extractBgUrls(childBg).forEach(add);
          });
        } catch (e) {
          /* 跨域 iframe 等忽略 */
        }
      });
    });

    // 4) 部分站点把大图放在 data-* 上的非 img 节点
    document.querySelectorAll('[data-src], [data-lazy-src], [data-original], [data-img], [data-zoom-image]').forEach((el) => {
      LAZY_ATTRS.forEach((attr) => {
        if (el.hasAttribute(attr)) add(el.getAttribute(attr));
      });
    });

    return Array.from(set);
  }

  /**
   * 探测单张图片真实尺寸；加载失败则丢弃
   */
  function probeImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      // 跨域探测：不设置 crossOrigin 时仍可读 naturalWidth（不污染 canvas）
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => done(null), 8000);

      img.onload = () => {
        clearTimeout(timer);
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        // 过滤 1x1、过小图
        if (w < MIN_SIZE || h < MIN_SIZE) {
          done(null);
          return;
        }
        done({ url, width: w, height: h });
      };

      img.onerror = () => {
        clearTimeout(timer);
        done(null);
      };

      img.src = url;
    });
  }

  /**
   * 并发限制探测，避免一次打开过多连接
   */
  async function probeAll(urls, concurrency = 8) {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < urls.length) {
        const i = index++;
        const item = await probeImage(urls[i]);
        if (item) results.push(item);
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
    await Promise.all(workers);

    // 按面积从大到小排序，主图更靠前
    results.sort((a, b) => b.width * b.height - a.width * a.height);
    return results;
  }

  // —— UI ——

  function showToast(text, duration = 2200) {
    let toast = document.getElementById('ig-extract-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ig-extract-toast';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('ig-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('ig-show'), duration);
  }

  function injectButton() {
    if (document.getElementById('ig-extract-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ig-extract-btn';
    btn.type = 'button';
    btn.textContent = '获取图片';
    btn.addEventListener('click', onExtractClick);
    document.documentElement.appendChild(btn);
  }

  async function onExtractClick() {
    const btn = document.getElementById('ig-extract-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '提取中…';
    showToast('正在扫描页面图片…', 4000);

    try {
      const urls = collectCandidateUrls();
      if (!urls.length) {
        showToast('未找到可用图片，请确认已打开商品详情', 3000);
        return;
      }

      showToast(`候选 ${urls.length} 张，正在过滤小图…`, 5000);
      const images = await probeAll(urls);

      if (!images.length) {
        showToast('过滤后无符合尺寸的商品图', 3000);
        return;
      }

      // 交给后台：写入 storage 并打开 gallery
      const response = await chrome.runtime.sendMessage({
        type: 'OPEN_GALLERY',
        payload: {
          images,
          pageUrl: location.href,
          pageTitle: document.title || '',
          capturedAt: Date.now(),
        },
      });

      if (response && response.ok) {
        showToast(`已提取 ${images.length} 张，正在打开预览页`, 2500);
      } else {
        showToast((response && response.error) || '打开预览页失败', 3000);
      }
    } catch (err) {
      console.error('[imagegrab]', err);
      showToast('提取失败：' + (err && err.message ? err.message : String(err)), 3500);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  // 扩展图标点击时的探测（background 用）
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'PING_CONTENT') {
      sendResponse({ ok: true, detail: isProductDetailPage() });
    }
  });

  // —— 启动 ——

  function boot() {
    if (!isProductDetailPage()) return;
    injectButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // SPA / 异步跳转：短暂监听 URL 变化后重新判断
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      const existing = document.getElementById('ig-extract-btn');
      if (isProductDetailPage()) {
        injectButton();
      } else if (existing) {
        existing.remove();
      }
    }
  }, 1200);
})();
