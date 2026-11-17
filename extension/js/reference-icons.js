/* Original AE Designer toolbar vectors. No vendor artwork is embedded. */
(function () {
  const fallback = window.icon,
    pointer = '<path d="M3.5 3.5 17 7.6c1.4.4 1.5 1.7.1 2.3l-5.3 2.2-2.1 5.3c-.5 1.3-1.9 1.3-2.3-.1Z"/>';
  const small = '<g transform="translate(-.4,-.4) scale(.76)">' + pointer + '</g>';
  const shapes = {
    select: small + '<path d="m14 16 4-2 4 2-4 2Zm0 3 4 2 4-2"/>',
    'group-select': small + '<path d="M14 14h3l1 2h4v6h-8Z"/>',
    'path-select':
      small +
      '<path d="M14 21c1-7 6-1 8-7"/><rect x="13" y="20" width="2" height="2"/><rect x="21" y="13" width="2" height="2"/>',
    direct: pointer,
    pen: '<path d="m4 21 1-7 5-7 7 7-7 5Zm0 0 7-7M11 4l3-3 9 9-3 3Z"/>',
    offset:
      '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 8h.1M12 8h.1M16 8h.1M8 12h.1M12 12h.1M16 12h.1M8 16h.1M12 16h.1M16 16h.1"/>',
    text: '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
    gradient:
      '<rect x="3" y="4" width="18" height="16"/><path d="M6 4v16M9 4v16M11 4v16M13 4v16M15 4v16M17 4v16M19 4v16"/>',
  };
  window.icon = (name) =>
    shapes[name]
      ? '<svg class="icon reference-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
        shapes[name] +
        '</svg>'
      : fallback(name);
})();
