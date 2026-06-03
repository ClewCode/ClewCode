// Clew Docs — Mobile Nav, TOC, Code Copy, Heading Tracking
(function () {
  'use strict';

  var menuBtn = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');

  // ── Root Prefix ──────────────────────────────────────────────────────────
  var rootPrefix = '';
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].getAttribute('src');
    if (src && src.indexOf('js/main.js') !== -1) {
      rootPrefix = src.replace('js/main.js', '');
      break;
    }
  }

  // ── Sidebar Injection ────────────────────────────────────────────────────
  if (sidebar) {
    sidebar.innerHTML =
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Getting Started</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'index.html" class="sidebar-link"><span class="link-icon"></span>Overview</a>' +
      '    <a href="' + rootPrefix + 'quick-start.html" class="sidebar-link"><span class="link-icon"></span>Quick Start</a>' +
      '    <a href="' + rootPrefix + 'installation.html" class="sidebar-link"><span class="link-icon"></span>Installation</a>' +
      '    <a href="' + rootPrefix + 'configuration.html" class="sidebar-link"><span class="link-icon"></span>Configuration</a>' +
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
      '  </nav>' +
      '</div>' +
      '<div class="sidebar-section">' +
      '  <div class="sidebar-label">Internals</div>' +
      '  <nav>' +
      '    <a href="' + rootPrefix + 'internals/hidden-features.html" class="sidebar-link"><span class="link-icon"></span>Hidden Features</a>' +
      '    <a href="' + rootPrefix + 'internals/growthbook-ab-testing.html" class="sidebar-link"><span class="link-icon"></span>A/B Testing</a>' +
      '  </nav>' +
      '</div>';
  }

  // ── Mobile Nav ───────────────────────────────────────────────────────────
  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
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

  // ── Active Link Highlighting ─────────────────────────────────────────────
  var currentPath = window.location.pathname;
  var currentPage = currentPath.split('/').pop() || 'index.html';
  if (currentPage === '') currentPage = 'index.html';

  document.querySelectorAll('.sidebar-link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;
    var hrefPage = href.split('/').pop().split('#')[0];
    if (hrefPage === currentPage) link.classList.add('active');
  });

  document.querySelectorAll('.header-nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;
    var hrefPage = href.split('/').pop().split('#')[0];
    if (hrefPage === currentPage) link.classList.add('active');
  });

  // ── Code Copy Buttons ────────────────────────────────────────────────────
  function addCopyButtons() {
    document.querySelectorAll('.content pre').forEach(function (pre) {
      // Skip if already wrapped
      if (pre.parentElement && pre.parentElement.classList.contains('code-block-wrap')) return;

      var wrap = document.createElement('div');
      wrap.className = 'code-block-wrap';

      var header = document.createElement('div');
      header.className = 'code-block-header';

      var lang = document.createElement('span');
      // Detect language from class or content
      var code = pre.querySelector('code');
      var langName = '';
      if (code) {
        var cls = code.className || '';
        var match = cls.match(/language-(\w+)/);
        if (match) langName = match[1];
      }
      lang.textContent = langName || '';

      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      btn.addEventListener('click', function () {
        var text = pre.textContent || '';
        // Strip leading/trailing newlines
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

  // ── Table Wrapping ───────────────────────────────────────────────────────
  document.querySelectorAll('.content table').forEach(function (table) {
    if (table.parentElement && table.parentElement.classList.contains('table-wrap')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // ── TOC Generation ───────────────────────────────────────────────────────
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
      // Ensure heading has an id
      if (!h.id) {
        var text = (h.textContent || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
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

    // IntersectionObserver for active heading
    if (typeof IntersectionObserver !== 'undefined' && items.length > 0) {
      var observeTargets = [];
      headings.forEach(function (h) { observeTargets.push(h); });

      var observer = new IntersectionObserver(function (entries) {
        var visible = [];
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            visible.push(entry.target.id);
          }
        });
        if (visible.length > 0) {
          // Use the last visible heading (closest to top of viewport)
          var active = visible[0];
          items.forEach(function (item) {
            if (item.id === active) {
              item.el.classList.add('active');
            } else {
              item.el.classList.remove('active');
            }
          });
        }
      }, {
        rootMargin: '-64px 0px -60% 0px',
        threshold: 0
      });

      observeTargets.forEach(function (h) { observer.observe(h); });
    }
  }

  buildTOC();
})();
