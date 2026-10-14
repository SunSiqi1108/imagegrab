/**
 * background.js — Manifest V3 Service Worker
 * 职责：
 * 1. 接收 content script 的图片列表，写入 storage 并打开 gallery 页
 * 2. 接收 gallery 的批量下载请求，拉取图片 → OffscreenCanvas 转 PNG → chrome.downloads
 */

'use strict';

const STORAGE_KEY = 'imagegrab_gallery_data';

// —— 工具 ——

/**
 * Blob → data URL（供 chrome.downloads.download 使用）
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 序号补零：1 → 001
 */
function padIndex(n, width = 3) {
  return String(n).padStart(width, '0');
}

/**
 * 拉取远程图片并转为 PNG Blob
 * 使用 createImageBitmap + OffscreenCanvas，可在 Service Worker 中运行
 */
async function convertUrlToPngBlob(url) {
  const response = await fetch(url, {
    credentials: 'omit',
    // 部分 CDN 对 Referer 敏感，扩展 fetch 通常不带页面 Referer
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * 下载单张 PNG
 * @returns {{ ok: boolean, id?: number, error?: string }}
 */
async function downloadOnePng(url, filename) {
  try {
    const pngBlob = await convertUrlToPngBlob(url);
    const dataUrl = await blobToDataUrl(pngBlob);
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    return { ok: true, id: downloadId };
  } catch (err) {
    console.warn('[imagegrab] download failed:', url, err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * 批量下载（串行，降低并发与限流风险），并向 gallery 推送进度
 * @param {string[]} urls
 * @param {number} tabId 可选，用于发送进度
 */
async function downloadBatch(urls, tabId) {
  const total = urls.length;
  let success = 0;
  let failed = 0;
  const errors = [];

  const notify = (payload) => {
    if (typeof tabId === 'number') {
      chrome.tabs.sendMessage(tabId, { type: 'DOWNLOAD_PROGRESS', payload }).catch(() => {
        // gallery 页不是 content script，改用 runtime 广播给扩展页
      });
    }
    // 扩展页通过 runtime.onMessage 接收
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_PROGRESS', payload }).catch(() => {
      /* 无监听时忽略 */
    });
  };

  for (let i = 0; i < urls.length; i++) {
    const filename = `商品图_${padIndex(i + 1)}.png`;
    notify({
      current: i + 1,
      total,
      filename,
      status: 'downloading',
      success,
      failed,
    });

    const result = await downloadOnePng(urls[i], filename);
    if (result.ok) {
      success += 1;
    } else {
      failed += 1;
      errors.push({ index: i + 1, url: urls[i], error: result.error });
    }

    // 轻微间隔，避免瞬时打满下载队列
    await new Promise((r) => setTimeout(r, 120));
  }

  const donePayload = {
    current: total,
    total,
    status: 'done',
    success,
    failed,
    errors,
  };
  notify(donePayload);
  return donePayload;
}

// —— 消息处理 ——

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'OPEN_GALLERY') {
    (async () => {
      try {
        const payload = message.payload || {};
        const images = Array.isArray(payload.images) ? payload.images : [];
        if (!images.length) {
          sendResponse({ ok: false, error: '图片列表为空' });
          return;
        }

        await chrome.storage.local.set({
          [STORAGE_KEY]: {
            images,
            pageUrl: payload.pageUrl || '',
            pageTitle: payload.pageTitle || '',
            capturedAt: payload.capturedAt || Date.now(),
          },
        });

        const galleryUrl = chrome.runtime.getURL('gallery.html');
        await chrome.tabs.create({ url: galleryUrl });
        sendResponse({ ok: true, count: images.length });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      }
    })();
    return true; // 异步 sendResponse
  }

  if (message.type === 'GET_GALLERY_DATA') {
    (async () => {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      sendResponse({ ok: true, data: data[STORAGE_KEY] || null });
    })();
    return true;
  }

  if (message.type === 'DOWNLOAD_IMAGES') {
    (async () => {
      try {
        const urls = Array.isArray(message.urls) ? message.urls.filter(Boolean) : [];
        if (!urls.length) {
          sendResponse({ ok: false, error: '未选择图片' });
          return;
        }
        // 先回执「已开始」，进度通过 DOWNLOAD_PROGRESS 推送；下载过程中用短心跳维持 SW
        sendResponse({ ok: true, started: true, total: urls.length });

        const keepAlive = setInterval(() => {
          chrome.runtime.getPlatformInfo(() => {});
        }, 20000);

        try {
          await downloadBatch(urls, sender.tab && sender.tab.id);
        } finally {
          clearInterval(keepAlive);
        }
      } catch (err) {
        chrome.runtime
          .sendMessage({
            type: 'DOWNLOAD_PROGRESS',
            payload: {
              status: 'error',
              error: err && err.message ? err.message : String(err),
            },
          })
          .catch(() => {});
      }
    })();
    return true;
  }
});

// 点击扩展图标时，若当前页可注入则提示用户使用页面悬浮按钮
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING_CONTENT' });
  } catch (e) {
    // 非匹配站点：打开空 gallery 说明
    const galleryUrl = chrome.runtime.getURL('gallery.html');
    await chrome.tabs.create({ url: galleryUrl });
  }
});
