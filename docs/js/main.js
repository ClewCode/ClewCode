// Ceph Code Docs — Mobile Nav & Helpers
(function () {
  'use strict';

  var menuBtn = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');

  function open() {
    if (sidebar) sidebar.classList.add('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (sidebar) sidebar.classList.remove('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (menuBtn) menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar && sidebar.classList.contains('open') ? close() : open();
  });

  if (overlay) overlay.addEventListener('click', close);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) close();
  });

  // Close sidebar on link click (mobile)
  if (sidebar) {
    sidebar.querySelectorAll('.sidebar-link').forEach(function (link) {
      link.addEventListener('click', close);
    });
  }

  // Wrap tables and <pre> in scroll containers
  function wrapScroll(el) {
    if (el.parentElement && el.parentElement.classList.contains('scroll-wrap')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'scroll-wrap';
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  }

  document.querySelectorAll('.content table').forEach(wrapScroll);
  document.querySelectorAll('.content pre').forEach(wrapScroll);

  // Highlight active sidebar link
  var current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === current) link.classList.add('active');
  });

  // Highlight current page in header nav
  document.querySelectorAll('.header-nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === current) link.classList.add('active');
  });
})();
