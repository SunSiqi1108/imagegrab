/**
 * 图提取 ImageGrab · 官网交互脚本
 * - 滚动吸顶样式
 * - 移动端汉堡菜单
 * - IntersectionObserver 淡入上移
 * - 导航当前区块高亮
 */

(function () {
  "use strict";

  /* ---------- DOM 引用 ---------- */
  const header = document.getElementById("siteHeader");
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  const sectionLinks = document.querySelectorAll(".nav-link[data-section]");
  const sections = document.querySelectorAll("main section[id]");
  const revealEls = document.querySelectorAll(".reveal");

  /* ---------- 滚动时导航栏样式 ---------- */
  function updateHeaderOnScroll() {
    if (!header) return;
    const scrolled = window.scrollY > 12;
    header.classList.toggle("is-scrolled", scrolled);
  }

  /* ---------- 移动端菜单 ---------- */
  function closeMenu() {
    if (!menuToggle || !navLinks) return;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "打开菜单");
    navLinks.classList.remove("is-open");
  }

  function toggleMenu() {
    if (!menuToggle || !navLinks) return;
    const open = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!open));
    menuToggle.setAttribute("aria-label", open ? "打开菜单" : "关闭菜单");
    navLinks.classList.toggle("is-open", !open);
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleMenu);
  }

  // 点击导航链接后关闭菜单
  if (navLinks) {
    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }

  // 窗口变宽到桌面时强制关闭移动菜单
  window.addEventListener("resize", function () {
    if (window.innerWidth >= 768) {
      closeMenu();
    }
  });

  /* ---------- 滚动进入视口：淡入上移 ---------- */
  if ("IntersectionObserver" in window && revealEls.length) {
    const revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.12,
      }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // 不支持 Observer 时直接显示
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------- 导航当前区块高亮 ---------- */
  function setActiveNav(sectionId) {
    sectionLinks.forEach(function (link) {
      const match = link.getAttribute("data-section") === sectionId;
      link.classList.toggle("is-active", match);
    });
  }

  function updateActiveSection() {
    // 接近页底时高亮「下载插件」
    const nearBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
    if (nearBottom) {
      setActiveNav("download");
      return;
    }

    const headerOffset = (header ? header.offsetHeight : 64) + 24;
    let currentId = "";

    sections.forEach(function (section) {
      const top = section.getBoundingClientRect().top;
      if (top - headerOffset <= 0) {
        currentId = section.id;
      }
    });

    // Hero 区不对应右侧导航项，保持无高亮或沿用上一逻辑
    if (currentId === "hero" || currentId === "") {
      sectionLinks.forEach(function (link) {
        link.classList.remove("is-active");
      });
      return;
    }

    setActiveNav(currentId);
  }

  /* ---------- 滚动监听（节流） ---------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      updateHeaderOnScroll();
      updateActiveSection();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  updateHeaderOnScroll();
  updateActiveSection();
})();
