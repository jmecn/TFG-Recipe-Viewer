(function (global) {
  'use strict';

  function siteBase() {
    let path = location.pathname.replace(/\/index\.html$/i, '');
    if (path === '' || path === '/') return '/';
    if (!path.endsWith('/')) path += '/';
    return path;
  }

  function siteUrl(relative) {
    return siteBase() + String(relative).replace(/^\//, '');
  }

  function normalizeSitePath() {
    const base = siteBase();
    const path = location.pathname.replace(/\/index\.html$/i, '');
    const baseNoSlash = base === '/' ? '/' : base.slice(0, -1);
    if (path === baseNoSlash) {
      history.replaceState({}, '', base + location.search + location.hash);
    }
  }

  function initSiteLinks() {
    const home = siteBase();
    for (const el of document.querySelectorAll('[data-site-home]')) {
      el.href = home;
    }
  }

  global.siteBase = siteBase;
  global.siteUrl = siteUrl;
  global.normalizeSitePath = normalizeSitePath;

  normalizeSitePath();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteLinks, { once: true });
  } else {
    initSiteLinks();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
