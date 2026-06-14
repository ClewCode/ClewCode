// Clew Docs — Mobile Nav, Header, Sidebar, TOC, Code Copy
(function () {
  'use strict';

  // ── Root Prefix (for script location detection) ──
  var rootPrefix = '';
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].getAttribute('src');
    if (src && src.indexOf('js/main.js') !== -1) {
      rootPrefix = src.replace('js/main.js', '');
      break;
    }
  }

  // ── Header Injection ──
  function injectHeader() {
    var header = document.querySelector('.header');
    if (!header) return;

    var path = window.location.pathname;
    var isThai = /\.th\.html$/.test(path);
    var isIndex = /\/index(\.th)?\.html$/.test(path) || path === '/' || path.endsWith('/docs/');
    var currentPage = path.split('/').pop() || 'index.html';

    var logoHref = isThai ? 'index.th.html' : 'index.html';
    var docsHref = isThai ? 'quick-start.th.html' : 'quick-start.html';
    var ariaLabel = isThai ? '\u0E40\u0E1B\u0E34\u0E14/\u0E1B\u0E34\u0E14\u0E40\u0E21\u0E19\u0E39' : 'Toggle navigation';

    // Language toggle
    var langTarget = isThai
      ? currentPage.replace(/\.th\.html$/, '.html')
      : currentPage.replace(/\.html$/, '.th.html');
    var langLabel = isThai ? 'EN' : '\u0E44\u0E17\u0E22';
    // If no .html page exists for the target, just use README
    if (isIndex) langTarget = isThai ? 'index.html' : 'index.th.html';

    // Build breadcrumbs from path
    var crumbs = [];
    var parts = path.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts[0] === 'docs') parts.shift(); // remove leading "docs"
    if (parts.length > 0) {
      var crumbPath = '';
      for (var i = 0; i < parts.length; i++) {
        crumbPath += (i === 0 ? '' : '/') + parts[i];
        var isLast = i === parts.length - 1;
        var label = parts[i].replace(/\.th\.html$/, '').replace(/\.html$/, '').replace(/-/g, ' ');
        if (isLast) {
          crumbs.push('<span class="current">' + label + '</span>');
        } else {
          crumbs.push('<a href="' + crumbPath + '">' + label + '</a>');
          crumbs.push('<span class="sep">/</span>');
        }
      }
    }
    var breadcrumbsHtml = crumbs.length > 0
      ? '<nav class="header-breadcrumbs">' + crumbs.join('') + '</nav>'
      : '';

    header.innerHTML =
      '<div class="header-inner">' +
      '  <a href="' + logoHref + '" class="logo">Clew</a>' +
      breadcrumbsHtml +
      '  <div class="header-search">' +
      '    <input type="text" id="headerSearchInput" placeholder="' + (isThai ? '\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23...' : 'Search docs...') + '" autocomplete="off">' +
      '    <span class="search-icon">\u2315</span>' +
      '    <div class="search-results" id="headerSearchResults"></div>' +
      '  </div>' +
      '  <nav class="header-nav">' +
      '    <a href="' + logoHref + '">' + (isThai ? '\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01' : 'Home') + '</a>' +
      '    <a href="' + docsHref + '">' + (isThai ? '\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23' : 'Docs') + '</a>' +
      '    <a href="https://github.com/JonusNattapong/ClewCode" target="_blank">GitHub</a>' +
      '  </nav>' +
      '  <button class="lang-toggle" id="langToggle" aria-label="Switch language">' + langLabel + '</button>' +
      '  <button class="menu-btn" id="menuToggle" aria-label="' + ariaLabel + '"><span></span><span></span><span></span></button>' +
      '</div>';

    // Language toggle
    var langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.addEventListener('click', function () {
        window.location.href = langTarget;
      });
    }

    // Active nav link
    var navLinks = header.querySelectorAll('.header-nav a');
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var hrefPage = href.split('/').pop().split('#')[0] || 'index.html';
      if (hrefPage === currentPage) link.classList.add('active');
    });
    if (!isIndex) {
      var docsLink = header.querySelector('.header-nav a[href*="quick-start"]');
      if (docsLink) docsLink.classList.add('active');
    }

    // Search functionality
    initHeaderSearch();
  }

  function initHeaderSearch() {
    var input = document.getElementById('headerSearchInput');
    var results = document.getElementById('headerSearchResults');
    if (!input || !results) return;

    // Build search index from sidebar links + TOC headings
    var searchIndex = [];
    document.querySelectorAll('.sidebar-link').forEach(function (link) {
      searchIndex.push({ text: link.textContent.trim(), href: link.getAttribute('href'), type: 'page' });
    });
    document.querySelectorAll('.content h2, .content h3').forEach(function (h) {
      searchIndex.push({ text: h.textContent.trim(), href: '#' + h.id, type: 'section' });
    });

    input.addEventListener('input', function () {
      var query = this.value.trim().toLowerCase();
      results.innerHTML = '';
      results.classList.remove('open');
      if (query.length < 1) return;

      var matches = [];
      for (var i = 0; i < searchIndex.length; i++) {
        var item = searchIndex[i];
        if (item.text.toLowerCase().indexOf(query) !== -1) {
          matches.push(item);
        }
      }

      if (matches.length === 0) {
        results.innerHTML = '<div class="search-empty">No results found</div>';
        results.classList.add('open');
        return;
      }

      for (var j = 0; j < Math.min(matches.length, 8); j++) {
        var m = matches[j];
        var highlighted = m.text.replace(
          new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
          '<mark>$1</mark>'
        );
        results.innerHTML +=
          '<a href="' + m.href + '" class="search-result">' +
          '<span class="search-type">' + (m.type === 'page' ? '\u{1F4C4}' : '#') + '</span> ' +
          highlighted +
          '</a>';
      }
      results.classList.add('open');
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove('open');
      }
    });

    // Close on Escape
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        results.classList.remove('open');
        input.blur();
      }
    });
  }

  injectHeader();

  // ── Sidebar Injection ──
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML =
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Getting Started</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'index.html" class="sidebar-link"><span class="link-icon"></span>Overview</a>' +
      '    <a href="' + rootPrefix + 'quick-start.html" class="sidebar-link"><span class="link-icon"></span>Quick Start</a>' +
      '    <a href="' + rootPrefix + 'installation.html" class="sidebar-link"><span class="link-icon"></span>Installation</a>' +
      '    <a href="' + rootPrefix + 'configuration.html" class="sidebar-link"><span class="link-icon"></span>Configuration</a>' +
      '    <a href="' + rootPrefix + 'cli-reference.html" class="sidebar-link"><span class="link-icon"></span>CLI Reference</a>' +
      '    <a href="' + rootPrefix + 'troubleshooting.html" class="sidebar-link"><span class="link-icon"></span>Troubleshooting</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Core Concepts</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'providers.html" class="sidebar-link"><span class="link-icon"></span>Providers</a>' +
      '    <a href="' + rootPrefix + 'models.html" class="sidebar-link"><span class="link-icon"></span>Models</a>' +
      '    <a href="' + rootPrefix + 'commands.html" class="sidebar-link"><span class="link-icon"></span>Commands</a>' +
      '    <a href="' + rootPrefix + 'tools.html" class="sidebar-link"><span class="link-icon"></span>Tools</a>' +
      '    <a href="' + rootPrefix + 'permission-model.html" class="sidebar-link"><span class="link-icon"></span>Permission Model</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Extending</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'plugins.html" class="sidebar-link"><span class="link-icon"></span>Plugins</a>' +
      '    <a href="' + rootPrefix + 'skills.html" class="sidebar-link"><span class="link-icon"></span>Skills</a>' +
      '    <a href="' + rootPrefix + 'architecture.html" class="sidebar-link"><span class="link-icon"></span>Architecture</a>' +
      '    <a href="' + rootPrefix + 'mcp.html" class="sidebar-link"><span class="link-icon"></span>MCP</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Autonomous</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'daemon.html" class="sidebar-link"><span class="link-icon"></span>Daemon Mode</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Features</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'research-memory.html" class="sidebar-link"><span class="link-icon"></span>Research & Memory</a>' +
      '    <a href="' + rootPrefix + 'features/searxng-search.html" class="sidebar-link"><span class="link-icon"></span>SearXNG Search</a>' +
      '    <a href="' + rootPrefix + 'features/bridge-mode.html" class="sidebar-link"><span class="link-icon"></span>Bridge Mode</a>' +
      '    <a href="' + rootPrefix + 'features/evals.html" class="sidebar-link"><span class="link-icon"></span>Evaluation Harness</a>' +
      '    <a href="' + rootPrefix + 'features/sentry-setup.html" class="sidebar-link"><span class="link-icon"></span>Sentry Setup</a>' +
      '    <a href="' + rootPrefix + 'voice-mode.html" class="sidebar-link"><span class="link-icon"></span>Voice Mode</a>' +
      '    <a href="' + rootPrefix + 'swarm.html" class="sidebar-link"><span class="link-icon"></span>Swarm System</a>' +
      '    <a href="' + rootPrefix + 'loop.html" class="sidebar-link"><span class="link-icon"></span>Agent Loop</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Internals</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'internals/hidden-features.html" class="sidebar-link"><span class="link-icon"></span>Hidden Features</a>' +
      '    <a href="' + rootPrefix + 'internals/growthbook-ab-testing.html" class="sidebar-link"><span class="link-icon"></span>A/B Testing</a>' +
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Community</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'changelog.html" class="sidebar-link"><span class="link-icon"></span>Changelog</a>' +
      '    <a href="' + rootPrefix + 'security.html" class="sidebar-link"><span class="link-icon"></span>Security</a>' +
      '    <a href="' + rootPrefix + 'contributing.html" class="sidebar-link"><span class="link-icon"></span>Contributing</a>' +
      '  </nav>' +
      '</div>';
  }

  // ── Mobile Nav ──
  var menuBtn = document.getElementById('menuToggle');
  var overlay = document.getElementById('sidebarOverlay');

  function openSidebar() {
    sidebar && sidebar.classList.add('open');
    menuBtn && menuBtn.setAttribute('aria-expanded', 'true');
    overlay && overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar && sidebar.classList.remove('open');
    menuBtn && menuBtn.setAttribute('aria-expanded', 'false');
    overlay && overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (menuBtn) menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar && sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  if (overlay) overlay.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) closeSidebar();
  });

  if (sidebar) {
    sidebar.querySelectorAll('.sidebar-link').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });
  }

  // ── Active Sidebar Link ──
  var currentPath = window.location.pathname;
  var currentPage = currentPath.split('/').pop() || 'index.html';
  if (currentPage === '') currentPage = 'index.html';

  document.querySelectorAll('.sidebar-link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;
    var hrefPage = href.split('/').pop().split('#')[0];
    if (hrefPage === currentPage) link.classList.add('active');
  });

  // ── Code Copy Buttons ──
  function addCopyButtons() {
    document.querySelectorAll('.content pre').forEach(function (pre) {
      if (pre.parentElement && pre.parentElement.classList.contains('code-block-wrap')) return;

      var wrap = document.createElement('div');
      wrap.className = 'code-block-wrap';

      var header = document.createElement('div');
      header.className = 'code-block-header';

      var lang = document.createElement('span');
      var code = pre.querySelector('code');
      var langName = '';
      if (code) {
        var cls = code.className || '';
        var match = cls.match(/language-(\w+)/);
        if (match) langName = match[1];
      }
      lang.textContent = langName || '';
      lang.style.textTransform = 'lowercase';

      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      btn.addEventListener('click', function () {
        var text = pre.textContent || '';
        text = text.replace(/^\n+|\n+$/g, '');
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        }).catch(function () {
          btn.textContent = 'Failed';
          setTimeout(function () {
            btn.textContent = 'Copy';
          }, 2000);
        });
      });

      header.appendChild(lang);
      header.appendChild(btn);

      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(header);
      wrap.appendChild(pre);
    });
  }

  addCopyButtons();

  // ── Table Wrapping ──
  document.querySelectorAll('.content table').forEach(function (table) {
    if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // ── TOC Generation ──
  function buildTOC() {
    var toc = document.querySelector('.toc-sidebar');
    if (!toc) return;

    var content = document.querySelector('.content');
    if (!content) return;

    var headings = content.querySelectorAll('h2, h3');
    if (headings.length < 2) {
      toc.style.display = 'none';
      return;
    }

    var label = document.createElement('div');
    label.className = 'toc-label';
    label.textContent = 'On this page';
    toc.appendChild(label);

    var list = document.createElement('nav');
    list.className = 'toc-list';

    var items = [];
    headings.forEach(function (h) {
      if (!h.id) {
        var text = (h.textContent || '')
          .toLowerCase()
          .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
          .replace(/^-|-$/g, '');
        h.id = text || 'section-' + Math.random().toString(36).slice(2, 6);
      }

      var link = document.createElement('a');
      link.href = '#' + h.id;
      link.className = 'toc-link';
      if (h.tagName === 'H3') link.classList.add('toc-h3');
      link.textContent = h.textContent;

      list.appendChild(link);
      items.push({ el: link, id: h.id });
    });

    toc.appendChild(list);

    if (typeof IntersectionObserver !== 'undefined' && items.length > 0) {
      var observeTargets = [];
      headings.forEach(function (h) { observeTargets.push(h); });

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            items.forEach(function (item) {
              item.el.classList.toggle('active', item.id === entry.target.id);
            });
          }
        });
      }, {
        rootMargin: '-64px 0px -60% 0px',
        threshold: 0
      });

      observeTargets.forEach(function (h) { observer.observe(h); });
    }
  }

  buildTOC();
})();
