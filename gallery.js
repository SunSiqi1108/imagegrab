/**
 * gallery.js
 * 读取 storage 中的图片列表，网格展示 / 勾选 / 请求后台批量转 PNG 下载
 */

'use strict';

const STORAGE_KEY = 'imagegrab_gallery_data';

/** @type {{ url: string, width: number, height: number }[]} */
let images = [];

/** @type {Set<number>} 选中的下标 */
const selected = new Set();

let downloading = false;

// —— DOM ——

const el = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('emptyState'),
  meta: document.getElementById('sourceMeta'),
  count: document.getElementById('selectedCount'),
  btnSelectAll: document.getElementById('btnSelectAll'),
  btnInvert: document.getElementById('btnInvert'),
  btnDownload: document.getElementById('btnDownload'),
  progress: document.getElementById('progressBar'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  toast: document.getElementById('toast'),
};

// —— UI 辅助 ——

function showToast(text, isError = false) {
  el.toast.textContent = text;
  el.toast.classList.toggle('is-error', !!isError);
  el.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove('show'), 2800);
}

function updateCount() {
  const n = selected.size;
  const total = images.length;
  el.count.textContent = `已选 ${n} / ${total}`;
  el.btnDownload.disabled = downloading || n === 0;
}

function setProgress(visible, current, total, text) {
  el.progress.hidden = !visible;
  if (!visible) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressText.textContent = text || `${current} / ${total}`;
}

function truncateUrl(url, max = 64) {
  if (!url) return '';
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '…';
}

// —— 渲染 ——

function renderGrid() {
  el.grid.innerHTML = '';

  if (!images.length) {
    el.empty.hidden = false;
    el.grid.hidden = true;
    updateCount();
    return;
  }

  el.empty.hidden = true;
  el.grid.hidden = false;

  const frag = document.createDocumentFragment();

  images.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.index = String(index);
    card.setAttribute('role', 'listitem');
    if (selected.has(index)) card.classList.add('is-selected');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'card-check';
    check.checked = selected.has(index);
    check.title = '选择此图';
    check.addEventListener('change', () => toggleSelect(index, check.checked));

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    thumbWrap.title = '点击勾选 / 取消';
    thumbWrap.addEventListener('click', () => {
      toggleSelect(index, !selected.has(index));
    });

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = `商品图 ${index + 1}`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('span'), {
        textContent: '加载失败',
        style: 'color:#5c6570;font-size:12px;',
      }));
    });

    thumbWrap.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML =
      `<span class="idx">#${String(index + 1).padStart(3, '0')}</span>` +
      `<span class="size">${item.width} × ${item.height}</span>`;

    card.appendChild(check);
    card.appendChild(thumbWrap);
    card.appendChild(meta);
    frag.appendChild(card);
  });

  el.grid.appendChild(frag);
  updateCount();
}

function toggleSelect(index, on) {
  if (on) selected.add(index);
  else selected.delete(index);

  const card = el.grid.querySelector(`.card[data-index="${index}"]`);
  if (card) {
    card.classList.toggle('is-selected', on);
    const check = card.querySelector('input[type="checkbox"]');
    if (check) check.checked = on;
  }
  updateCount();
}

function selectAll() {
  images.forEach((_, i) => selected.add(i));
  renderGrid();
}

function invertSelection() {
  const next = new Set();
  images.forEach((_, i) => {
    if (!selected.has(i)) next.add(i);
  });
  selected.clear();
  next.forEach((i) => selected.add(i));
  renderGrid();
}

// —— 数据加载 ——

async function loadData() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_GALLERY_DATA' });
    const data = res && res.data;

    if (!data || !Array.isArray(data.images) || !data.images.length) {
      // 兜底直接读 storage
      const local = await chrome.storage.local.get(STORAGE_KEY);
      const fallback = local[STORAGE_KEY];
      if (fallback && Array.isArray(fallback.images) && fallback.images.length) {
        applyData(fallback);
        return;
      }
      images = [];
      el.meta.textContent = '暂无提取记录';
      renderGrid();
      return;
    }

    applyData(data);
  } catch (err) {
    console.error(err);
    el.meta.textContent = '加载失败';
    showToast('加载图片数据失败', true);
    renderGrid();
  }
}

function applyData(data) {
  images = data.images.map((img) => ({
    url: img.url,
    width: img.width || 0,
    height: img.height || 0,
  }));

  selected.clear();
  images.forEach((_, i) => selected.add(i)); // 默认全选

  const title = data.pageTitle ? data.pageTitle.slice(0, 40) : '';
  const when = data.capturedAt
    ? new Date(data.capturedAt).toLocaleString()
    : '';
  el.meta.textContent = [title || truncateUrl(data.pageUrl || ''), when]
    .filter(Boolean)
    .join(' · ');

  document.title = `商品图片（${images.length}）· ImageGrab`;
  renderGrid();
}

// —— 下载 ——

async function downloadSelected() {
  if (downloading || selected.size === 0) return;

  const urls = Array.from(selected)
    .sort((a, b) => a - b)
    .map((i) => images[i].url);

  downloading = true;
  updateCount();
  setProgress(true, 0, urls.length, `准备下载 ${urls.length} 张…`);
  showToast(`开始下载 ${urls.length} 张 PNG`);

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_IMAGES',
      urls,
    });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || '启动下载失败');
    }
  } catch (err) {
    downloading = false;
    updateCount();
    setProgress(false);
    showToast(err.message || String(err), true);
  }
}

// 接收后台进度
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'DOWNLOAD_PROGRESS') return;
  const p = message.payload || {};

  if (p.status === 'downloading') {
    setProgress(
      true,
      p.current || 0,
      p.total || 1,
      `正在下载 ${p.filename || ''}（${p.current}/${p.total}）成功 ${p.success || 0}，失败 ${p.failed || 0}`
    );
  }

  if (p.status === 'done') {
    downloading = false;
    updateCount();
    setProgress(
      true,
      p.total || 0,
      p.total || 1,
      `完成：成功 ${p.success}，失败 ${p.failed}`
    );
    if (p.failed > 0) {
      showToast(`下载完成：成功 ${p.success}，失败 ${p.failed}`, true);
    } else {
      showToast(`全部下载完成（${p.success} 张 PNG）`);
    }
    setTimeout(() => setProgress(false), 4000);
  }

  if (p.status === 'error') {
    downloading = false;
    updateCount();
    setProgress(false);
    showToast(p.error || '下载出错', true);
  }
});

// —— 绑定 ——

el.btnSelectAll.addEventListener('click', selectAll);
el.btnInvert.addEventListener('click', invertSelection);
el.btnDownload.addEventListener('click', downloadSelected);

loadData();
