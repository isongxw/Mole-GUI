/*
 * Mole GUI — inline SVG icon set.
 * No webfonts, no external assets. Every icon is a 24x24 stroke glyph.
 * MoleUI.icon(name, size) returns an SVG string.
 */
(function () {
  'use strict';

  var PATHS = {
    dashboard:
      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
    broom:
      '<path d="M14.8 3.8l5.4 5.4"/><path d="M17.4 6.4l-5.7 5.7-2.2-2.2 5.7-5.7z"/><path d="M9.5 9.9l4.6 4.6-4.2 4.2H4.7l-1.2-5.3 4.2-4.2"/><path d="M8.2 12.5l3.3 3.3"/><path d="M6.3 14.4l3.3 3.3"/>',
    trash:
      '<path d="M4 7h16"/><path d="M9 7V4.8h6V7"/><path d="M6.2 7l1 13.2h9.6L17.8 7"/><path d="M10 11v5.5M14 11v5.5"/>',
    wand:
      '<path d="M15.5 3.5l5 5L8 21l-5-5L15.5 3.5z"/><path d="M13.6 5.4l5 5"/><path d="M6.5 2.5v3M5 4h3M18.5 14.5v3M17 16h3M20.5 2.5v2M19.5 3.5h2"/>',
    archive:
      '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10.5h14V9"/><path d="M10 13h4"/>',
    chart:
      '<path d="M4 4v15.5h16"/><path d="M8 16.5v-5M12 16.5V8M16 16.5v-8M20 16.5V6"/>',
    history:
      '<path d="M3.2 12a8.8 8.8 0 1 0 2.9-6.5"/><path d="M3 4.2v5h5"/><path d="M12 7.8v4.6l3 1.8"/>',
    settings:
      '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9"/>',
    refresh:
      '<path d="M20.5 12a8.5 8.5 0 1 1-2.9-6.4"/><path d="M20.5 3.5v5.2h-5.2"/>',
    play:
      '<path d="M7.5 4.2l12 7.8-12 7.8V4.2z"/>',
    stop:
      '<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.2"/>',
    search:
      '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.6-4.6"/>',
    'chevron-right': '<path d="M9.2 5.8l6.2 6.2-6.2 6.2"/>',
    'chevron-down': '<path d="M5.8 9.2l6.2 6.2 6.2-6.2"/>',
    'chevron-up': '<path d="M5.8 14.8l6.2-6.2 6.2 6.2"/>',
    'arrow-right': '<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19.5 12h-15"/><path d="M10.5 6l-6 6 6 6"/>',
    folder:
      '<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h4l2 2.2h7.6A2.2 2.2 0 0 1 21 9.4v8.4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.8V7.2z"/>',
    file:
      '<path d="M6 3h7.6L18 7.4V21H6V3z"/><path d="M13.4 3v4.6H18"/><path d="M9 12h6M9 15.5h6"/>',
    check: '<path d="M4.5 12.5l5 5L20 6.5"/>',
    x: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    alert:
      '<path d="M12 3.2l9.4 17H2.6l9.4-17z"/><path d="M12 9.4v4.4"/><path d="M12 17.2v.2"/>',
    info:
      '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.4"/><path d="M12 7.6v.2"/>',
    shield:
      '<path d="M12 3l8 2.8V12c0 4.8-3.5 7.6-8 9-4.5-1.4-8-4.2-8-9V5.8L12 3z"/><path d="M8.6 12.2l2.3 2.3 4.5-4.6"/>',
    cpu:
      '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1"/><path d="M9.2 2.4v3.6M14.8 2.4v3.6M9.2 18v3.6M14.8 18v3.6M2.4 9.2h3.6M2.4 14.8h3.6M18 9.2h3.6M18 14.8h3.6"/>',
    memory:
      '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7V3.6M12 7V3.6M17 7V3.6M7 20.4V17M12 20.4V17M17 20.4V17"/><path d="M7 12.4h10"/>',
    disk:
      '<ellipse cx="12" cy="5.6" rx="8" ry="3"/><path d="M4 5.6v12.8c0 1.7 3.6 3 8 3s8-1.3 8-3V5.6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    'hard-drive':
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 13h18"/><circle cx="7.2" cy="16" r=".7"/><circle cx="10.4" cy="16" r=".7"/>',
    battery:
      '<rect x="2.2" y="7.6" width="17.2" height="8.8" rx="2.2"/><path d="M21.4 10.6v2.8"/><rect x="5" y="10.4" width="7.4" height="3.2" rx="1"/>',
    wifi:
      '<path d="M2.6 8.6a14.6 14.6 0 0 1 18.8 0"/><path d="M5.6 12a10.4 10.4 0 0 1 12.8 0"/><path d="M8.8 15.4a6.1 6.1 0 0 1 6.4 0"/><path d="M12 18.8v.2"/>',
    clock:
      '<circle cx="12" cy="12" r="9"/><path d="M12 7.2v5.2l3.2 2"/>',
    terminal:
      '<rect x="3" y="4" width="18" height="16" rx="2.2"/><path d="M7 9.2l3.1 2.9L7 15M13.2 15h4"/>',
    external:
      '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13.6v5.2A1.2 1.2 0 0 1 16.8 20H5.2A1.2 1.2 0 0 1 4 18.8V7.2A1.2 1.2 0 0 1 5.2 6h5.2"/>',
    sparkles:
      '<path d="M11.5 3l1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1L4.7 9.8l5.1-1.7L11.5 3z"/><path d="M18.6 14.6l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5z"/>',
    copy:
      '<rect x="8.2" y="8.2" width="12" height="12" rx="2"/><path d="M15.8 8.2V5.8A1.8 1.8 0 0 0 14 4H5.8A1.8 1.8 0 0 0 4 5.8V14a1.8 1.8 0 0 0 1.8 1.8h2.4"/>',
    download:
      '<path d="M12 3.2v11.6"/><path d="M7.2 10.2l4.8 4.8 4.8-4.8"/><path d="M4.2 20.4h15.6"/>',
    loader:
      '<path d="M12 2.8v3.6M12 17.6v3.6M2.8 12h3.6M17.6 12h3.6M5.5 5.5l2.5 2.5M16 16l2.5 2.5M18.5 5.5L16 8M8 16l-2.5 2.5"/>',
    gauge:
      '<path d="M3.6 17.6a8.6 8.6 0 1 1 16.8 0"/><path d="M12 14.4l4-4.2"/><circle cx="12" cy="17.4" r="1.4"/>',
    package:
      '<path d="M12 3l8.6 4.7v8.6L12 21l-8.6-4.7V7.7L12 3z"/><path d="M3.4 7.7L12 12.4l8.6-4.7M12 12.4V21"/>',
    database:
      '<ellipse cx="12" cy="5.2" rx="8" ry="2.8"/><path d="M4 5.2v13.6c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8V5.2"/><path d="M4 12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8"/>',
    lock:
      '<rect x="4.6" y="10" width="14.8" height="10.4" rx="2.2"/><path d="M8 10V7.6a4 4 0 0 1 8 0V10"/>',
    unlock:
      '<rect x="4.6" y="10" width="14.8" height="10.4" rx="2.2"/><path d="M8 10V7.6a4 4 0 0 1 7.6-1.8"/>',
    zap: '<path d="M13.2 2.6L4.4 13.6h6.2l-1 7.8 9-11.2h-6.3l.9-7.6z"/>',
    wrench:
      '<path d="M14.8 6.4a4.4 4.4 0 0 0 5.8 5.8L9.8 23 1 14.2 11.8 3.4a4.4 4.4 0 0 0 3 3z"/>',
    activity:
      '<path d="M2.8 12h4.2l2.6-6.4 4 13 2.4-6.6h5.2"/>',
    layers:
      '<path d="M12 3l9 4.8-9 4.8-9-4.8L12 3z"/><path d="M3 12.2l9 4.8 9-4.8M3 16.6l9 4.8 9-4.8"/>',
    list:
      '<path d="M8.6 6.4h12M8.6 12h12M8.6 17.6h12"/><path d="M4 6.4h.2M4 12h.2M4 17.6h.2"/>',
    more:
      '<circle cx="5.4" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.6" cy="12" r="1.1"/>',
    eye:
      '<path d="M2.4 12s3.6-6.8 9.6-6.8S21.6 12 21.6 12s-3.6 6.8-9.6 6.8S2.4 12 2.4 12z"/><circle cx="12" cy="12" r="2.9"/>',
    plus: '<path d="M12 4.8v14.4M4.8 12h14.4"/>',
    minus: '<path d="M4.8 12h14.4"/>',
    dot: '<circle cx="12" cy="12" r="3.2"/>',
    'dot-filled': '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
    'power': '<path d="M12 3.2v8"/><path d="M7.2 5.8a8 8 0 1 0 9.6 0"/>',
    users:
      '<circle cx="9" cy="8.4" r="3.4"/><path d="M2.8 20c.5-3.4 3.1-5.2 6.2-5.2s5.7 1.8 6.2 5.2"/><path d="M16 5.4a3.2 3.2 0 0 1 0 6.2M17.4 15c2.1.5 3.5 2.2 3.8 5"/>',
    globe:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 3.9 5.6 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.6-3.9-9S9.4 5.5 12 3z"/>',
    'thermometer':
      '<path d="M10 4.8a2 2 0 0 1 4 0v9.1a4.4 4.4 0 1 1-4 0V4.8z"/><path d="M12 9v7.4"/>',
    fan:
      '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8c0-3.2 1-5 3-5.6 1.8-.5 3.2 1.4 2.6 3.4-.5 2.1-2.4 3.8-5.6 4.4"/><path d="M9.8 12c-3.2 0-5-1-5.6-3-.5-1.8 1.4-3.2 3.4-2.6 2.1.5 3.8 2.4 4.4 5.6"/><path d="M14.2 12c3.2 0 5 1 5.6 3 .5 1.8-1.4 3.2-3.4 2.6-2.1-.5-3.8-2.4-4.4-5.6"/>',
    'power-plug':
      '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v2.5a6 6 0 0 1-12 0V9z"/><path d="M12 17.5V21"/>'
  };

  // Common aliases so screens can use their preferred naming.
  PATHS.close = PATHS.x;
  PATHS.remove = PATHS.x;
  PATHS.trash2 = PATHS.trash;
  PATHS.refresh_cw = PATHS.refresh;
  PATHS['refresh-cw'] = PATHS.refresh;
  PATHS.home = PATHS.dashboard;
  PATHS['file-text'] = PATHS.file;
  PATHS['chevron-left'] = PATHS['arrow-left'];
  PATHS['arrow-up'] = PATHS.download;
  PATHS['hard_drive'] = PATHS['hard-drive'];
  PATHS['shield-check'] = PATHS.shield;

  function icon(name, size) {
    size = size || 18;
    var key = String(name || '').toLowerCase();
    var body = PATHS[key] || PATHS[name] || PATHS.info;
    return (
      '<svg class="icon icon-' +
      key.replace(/[^a-z0-9_-]/g, '') +
      '" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body +
      '</svg>'
    );
  }

  window.MoleIcons = { icon: icon, names: Object.keys(PATHS), paths: PATHS };
})();
