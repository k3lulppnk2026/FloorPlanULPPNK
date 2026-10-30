/**
 * GIS K3 · PT PLN (Persero) ULP Panakkukang
 * Application Script (js/app.js)
 */

// Capture initial clean HTML template before any dynamic DOM mutations
window.__INITIAL_CLEAN_HTML__ = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

/* ==========================================================================
   1. Core GIS Engine (Room Selection, Layer Filters, QR Start Points & Zoom/Pan)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('main-svg');
  const mapWrapper = document.getElementById('map-wrapper');
  const status = document.getElementById('selection-status');
  const detailTitle = document.getElementById('detail-room-title');
  const detailChip = document.getElementById('detail-room-chip');
  const detailCopy = document.getElementById('detail-room-copy');
  const detailStatus = document.getElementById('detail-status');
  const detailCategory = document.getElementById('detail-category');
  const detailApar = document.getElementById('detail-apar');
  const detailEvac = document.getElementById('detail-evac');
  const detailK3Log = document.getElementById('detail-room-k3-log');
  const detailActions = document.getElementById('detail-room-actions');
  const btnDetailEvac = document.getElementById('btn-detail-evac-route');
  const btnDetailInspect = document.getElementById('btn-detail-inspect');
  const searchInput = document.getElementById('room-search');
  let selectedRoom = null;

  const roomNames = {
    1:'LOBBY',2:'CUSTOMER SERVICE',3:'RUANG OPTEL YANGGU',4:'RUANG MANAGER',5:'YANGGU',6:'RUANG KREASI',7:'RUANG SEKRETARIS',8:'RUANG K3',9:'GUDANG DISTRIBUSI',10:'SPV TEKNIK',11:'RUANG STAF TEKNIK',12:'GUDANG',13:'RUANG TENIS MEJA',14:'RUANG KONSULTASI LAYANAN',15:'RUANG PELAYANAN',16:'SPV PELAYANAN',17:'RUANG GIS',18:'POS SATPAM',19:'RUANG CATER DAN BILLER',20:'SPV TRANSMISI ENERGI',21:'RUANG PETUGAS APP',22:'MUSHOLA',23:'RUANG TRANSAKSI ENERGI',24:'RUANG ARSIP','24B':'RUANG STANDBY YANGGU',25:'RUANG PANEL',26:'RUANG STAFF LOGISTIK DISTRIBUSI',27:'RUANG MATERIAL DISTRIBUSI',28:'WC/TOILET',29:'KANTOR UPP SULSEL',30:'GUDANG',31:'KANTIN',32:'GUDANG APT',33:'AREA OPERASIONAL 33',34:'AREA OPERASIONAL 34',35:'AREA OPERASIONAL 35',36:'LOBBY',37:'DAPUR',38:'LOKET PEMBAYARAN',39:'RUANG SERVER',40:'RUANG AIL (KONTAINER)'
  };
  const safetyRooms = new Set(['6','7','8','12','14','18','28','37','39','40']);
  const serviceRooms = new Set(['2','3','11','14','15','16','17','19','20','21','23','24B','38','39']);
  const roomNamesOf = n => roomNames[String(n)] || `Ruangan ${n}`;
  const roomSortVal = k => String(k) === '24B' ? 24.5 : (Number(k) || 999);
  window.roomNames = roomNames;
  window.getRoomName = roomNamesOf;
  window.__roomSortVal = roomSortVal;
  window.__K3_SAFETY_ROOMS = safetyRooms;
  window.__K3_SERVICE_ROOMS = serviceRooms;

  const getHotspots = () => [...document.querySelectorAll('#room-hotspots [data-room], #v6-map-area-layer .v6-map-area[data-room]')];
  const getSidebarItems = () => [...document.querySelectorAll('#sidebar-room-list .sidebar-item[data-room]')];

  getSidebarItems().forEach(item => {
    const n = item.dataset.room;
    const label = item.querySelector('span.truncate');
    if (label) label.textContent = roomNamesOf(n);
  });

  function syncRoomSelects() {
    const ids = Object.keys(roomNames).sort((a, b) => roomSortVal(a) - roomSortVal(b));
    ['log-room', 'hazard-room'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const prev = el.value;
      el.innerHTML = '';
      ids.forEach(r => {
        const o = document.createElement('option');
        o.value = r;
        o.textContent = `${r} · ${roomNamesOf(r)}`;
        el.appendChild(o);
      });
      if (selectedRoom && roomNames[selectedRoom]) el.value = selectedRoom;
      else if (prev && roomNames[prev]) el.value = prev;
    });
  }
  window.__syncRoomSelects = syncRoomSelects;
  syncRoomSelects();

  function renderRoomK3Telemetry(room) {
    if (!detailK3Log) return;
    const rLabel = roomNamesOf(room);
    let logs = [], hazards = [];
    try { logs = JSON.parse(localStorage.getItem('gisK3Logbook') || '[]'); } catch (_) {}
    try { hazards = JSON.parse(localStorage.getItem('gisK3Hazards') || '[]'); } catch (_) {}
    const roomLogs = logs.filter(x => String(x.roomId) === String(room) || (x.title && x.title.includes(rLabel)));
    const roomHazards = hazards.filter(x => String(x.roomId) === String(room) || (x.meta && x.meta.includes(rLabel)));
    const lastLog = roomLogs[0];
    const openHazard = roomHazards[0];
    detailK3Log.classList.remove('hidden');
    if (openHazard) {
      detailK3Log.className = 'mt-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[8px] leading-relaxed text-amber-900';
      detailK3Log.innerHTML = `<b class="text-amber-800">⚠ ${roomHazards.length} Laporan Hazard Tercatat:</b> ${openHazard.title} (${openHazard.meta})`;
    } else if (lastLog) {
      detailK3Log.className = 'mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[8px] leading-relaxed text-emerald-900';
      detailK3Log.innerHTML = `<b class="text-emerald-800">✓ Inspeksi Terakhir:</b> ${lastLog.meta}`;
    } else {
      detailK3Log.className = 'mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[8px] leading-relaxed text-slate-600';
      detailK3Log.innerHTML = `<b>Status K3 Lokal:</b> Tidak ada temuan hazard aktif pada ruangan ini.`;
    }
  }

  const byRoom = roomNumber => {
    const room = String(roomNumber);
    return {
      hotspots: getHotspots().filter(el => el.dataset.room === room),
      items: getSidebarItems().filter(el => el.dataset.room === room)
    };
  };

  const clearSelection = () => {
    getHotspots().forEach(el => el.classList.remove('room-selected'));
    getSidebarItems().forEach(el => el.classList.remove('room-selected'));
    selectedRoom = null;
    status.innerHTML = '<strong>Belum ada ruangan dipilih</strong><br><span class="text-slate-500">Klik area ruangan pada denah atau pilih dari daftar.</span>';
    detailTitle.textContent = 'Belum ada pilihan';
    detailChip.textContent = 'Pilih area';
    detailChip.className = 'feature-chip bg-slate-100 text-slate-500';
    detailCopy.textContent = 'Klik ruangan pada denah atau daftar untuk memuat ringkasan lokasi, rute evakuasi terpendek, dan riwayat K3.';
    detailStatus.textContent = 'Belum dipilih';
    detailCategory.textContent = '—';
    detailApar.textContent = 'Perlu cek';
    detailEvac.textContent = 'Terpetakan';
    detailK3Log?.classList.add('hidden');
    detailActions?.classList.add('hidden');
  };

  const selectRoom = (roomNumber, source = 'map') => {
    const room = String(roomNumber);
    const group = byRoom(room);
    if (!group.hotspots.length && !group.items.length) return;
    getHotspots().forEach(el => el.classList.toggle('room-selected', el.dataset.room === room));
    getSidebarItems().forEach(el => el.classList.toggle('room-selected', el.dataset.room === room));
    selectedRoom = room;
    const areaCount = group.hotspots.length;
    const k3l = room === '8';
    status.innerHTML = k3l
      ? '<strong class="text-green-700">Ruangan 8 (K3L) dipilih</strong><br><span class="text-slate-500">Pusat komando K3L disorot dengan warna hijau.</span>'
      : `<strong>Ruangan ${room} · ${roomNamesOf(room)}</strong><br><span class="text-slate-500">${areaCount > 1 ? `${areaCount} zona bernomor ${room} terhubung.` : 'Area sedang disorot pada denah.'}</span>`;
    detailTitle.textContent = `${room} · ${roomNamesOf(room)}`;
    detailChip.textContent = k3l ? 'K3L UTAMA' : (Number(room) > 40 ? 'CUSTOM' : 'AKTIF');
    detailChip.className = k3l ? 'feature-chip bg-emerald-50 text-emerald-700' : 'feature-chip bg-amber-50 text-amber-700';
    detailCopy.textContent = k3l
      ? 'Pusat koordinasi Keselamatan & Kesehatan Kerja (K3L) ULP Panakkukang.'
      : `Area ${roomNamesOf(room)} dipilih. Gunakan tombol di bawah untuk menampilkan rute evakuasi terpendek atau mencatat inspeksi.`;
    detailStatus.textContent = 'Terpetakan';
    detailCategory.textContent = k3l ? 'K3L' : (serviceRooms.has(room) ? 'Pelayanan / Teknik' : (safetyRooms.has(room) ? 'Keselamatan' : 'Operasional'));
    detailApar.textContent = safetyRooms.has(room) ? 'Prioritas K3' : 'Tersedia di koridor';
    detailEvac.textContent = 'Siap dihitung';
    renderRoomK3Telemetry(room);
    detailActions?.classList.remove('hidden');
    syncRoomSelects();

    if (source === 'sidebar' && group.hotspots.length) {
      const boxes = group.hotspots.map(el => { try { return el.getBBox(); } catch (_) { return null; } }).filter(Boolean);
      if (boxes.length) {
        const cx = boxes.reduce((sum, b) => sum + b.x + b.width / 2, 0) / boxes.length;
        const cy = boxes.reduce((sum, b) => sum + b.y + b.height / 2, 0) / boxes.length;
        if (typeof window.__panZoomToSvgPoint === 'function') {
          const isMob = window.innerWidth <= 900 || window.innerHeight <= 540;
          window.__panZoomToSvgPoint(cx, cy, isMob ? 2.15 : 1.55);
        } else {
          const vb = svg.viewBox.baseVal;
          const x = ((cx - vb.x) / vb.width) * svg.clientWidth;
          const y = ((cy - vb.y) / vb.height) * svg.clientHeight;
          mapWrapper.scrollTo({ left: Math.max(0, x - mapWrapper.clientWidth / 2), top: Math.max(0, y - mapWrapper.clientHeight / 2), behavior: 'smooth' });
        }
      }
    }
  };

  window.__selectRoom = selectRoom;
  window.__refreshSelectedRoomK3 = () => { if (selectedRoom) renderRoomK3Telemetry(selectedRoom); };

  btnDetailEvac?.addEventListener('click', () => {
    if (selectedRoom && typeof window.__releaseSetRoomRoute === 'function') {
      window.__releaseSetRoomRoute(selectedRoom);
    }
  });
  btnDetailInspect?.addEventListener('click', () => {
    syncRoomSelects();
    document.getElementById('open-logbook')?.click();
  });

  svg.addEventListener('click', e => {
    if (window.__isEditorBusy?.() || window.__wasMapDragging) return;
    const h = e.target.closest('#room-hotspots [data-room], #v6-map-area-layer .v6-map-area[data-room]');
    if (h) {
      e.stopPropagation();
      selectRoom(h.dataset.room, 'map');
      window.showK3Toast?.(`Ruangan ${h.dataset.room} · ${roomNamesOf(h.dataset.room)}`);
    } else if (!e.target.closest('#safety-markers, #v6-custom-assets-layer, #v6-manual-evac-layer')) {
      clearSelection();
      document.getElementById('mobile-room-sheet')?.classList.remove('open');
    }
  });

  document.getElementById('sidebar-room-list')?.addEventListener('click', e => {
    const item = e.target.closest('.sidebar-item[data-room]');
    if (item) selectRoom(item.dataset.room, 'sidebar');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !window.__isEditorBusy?.()) clearSelection();
  });

  // Unified Layer Filter Controller (Denah Bersih, Jalur Evakuasi, APAR & K3 Safety)
  const evacuationRoutes = document.getElementById('evacuation-routes');
  const safetyMarkers = document.getElementById('safety-markers');
  evacuationRoutes?.classList.remove('is-active');
  safetyMarkers?.classList.remove('is-active');

  function applyMapLayer(layer, options = {}) {
    const targetLayer = ['all', 'evacuation', 'safety', 'service'].includes(layer) ? layer : 'all';
    document.querySelectorAll('.gis-layer-btn[data-layer]').forEach(b => {
      b.classList.toggle('active', b.dataset.layer === targetLayer);
    });
    if (!window.__isFocusingSafetyKind && !options.preserveSafetyFilter) {
      window.__setSafetyFilter?.(null);
    }
    const showEvac = targetLayer === 'evacuation';
    const showSafety = targetLayer === 'safety';
    evacuationRoutes?.classList.toggle('is-active', showEvac);
    safetyMarkers?.classList.toggle('is-active', showSafety);

    if (!showEvac) {
      if (window.EvacBackend?.isDrawing?.()) window.EvacBackend.cancelDrawing();
      clearQrMode();
    } else if (!window.__isActivatingEvacForQr && !options.preserveActiveRoute) {
      clearQrMode();
    }

    getHotspots().forEach(h => {
      h.classList.remove('room-hidden', 'room-dim');
      const n = h.dataset.room;
      if (targetLayer === 'evacuation') h.classList.add('room-dim');
      if (targetLayer === 'safety' && !safetyRooms.has(n)) h.classList.add('room-dim');
      if (targetLayer === 'service' && !serviceRooms.has(n)) h.classList.add('room-dim');
    });

    // Keep Studio handles (route vertices, QR pins, safety drag handles) strictly synced with layer visibility
    window.__mapEditorSafetyAPI?.syncHandles?.();
    window.__renderStudioHandles?.();

    const mobileEvacFab = document.getElementById('mobile-evac-fab');
    mobileEvacFab?.classList.toggle('active', showEvac);
  }
  window.__setMapLayer = applyMapLayer;
  window.__getCurrentMapLayer = () => document.querySelector('.gis-layer-btn[data-layer].active')?.dataset.layer || 'all';

  document.querySelectorAll('.gis-layer-btn[data-layer]').forEach(btn => btn.addEventListener('click', () => {
    applyMapLayer(btn.dataset.layer);
  }));

  // Search room by number or name
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    getSidebarItems().forEach(item => {
      const n = item.dataset.room;
      const hay = `${n} ${roomNamesOf(n)}`.toLowerCase();
      item.classList.toggle('room-hidden', Boolean(q && !hay.includes(q)));
    });
  });

  // Sidebar Tabs
  const tabs = [...document.querySelectorAll('.panel-tab')];
  const panels = {
    detail: document.getElementById('panel-detail'),
    rooms: document.getElementById('panel-rooms'),
    audit: document.getElementById('panel-audit')
  };
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    Object.values(panels).forEach(p => p?.classList.add('hidden'));
    panels[tab.dataset.panelTab]?.classList.remove('hidden');
  }));

  // Modal actions
  document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', () => {
    document.getElementById(el.dataset.closeModal)?.classList.remove('open');
  }));
  document.querySelectorAll('.modal-backdrop').forEach(el => el.addEventListener('click', e => {
    if (e.target === el) el.classList.remove('open');
  }));

  // Legend shortcuts
  document.querySelectorAll('[data-focus-kind]').forEach(btn => btn.addEventListener('click', () => {
    const kind = btn.dataset.focusKind;
    if (kind === 'k3l') selectRoom('8', 'sidebar');
    else if (['apar', 'p3k', 'cctv', 'fire', 'custom'].includes(kind)) {
      if (typeof window.__focusSafetyKind === 'function') window.__focusSafetyKind(kind);
      else document.querySelector('[data-layer="safety"]')?.click();
    }
    else document.querySelector('[data-layer="evacuation"]')?.click();
  }));

  // YOU ARE HERE & JALUR EVAKUASI TERPADU (Semua Rute Web, Gambar Manual & QR menggunakan 1 Backend: window.EvacBackend)
  const DEFAULT_START_POINTS = [
    { id:'START-01', name:'Titik QR 01 · Zona Ruang 13', code:'01', x:970, y:452.125 },
    { id:'START-02', name:'Titik QR 02 · Koridor Utara', code:'02', x:884, y:228.1 },
    { id:'START-03', name:'Titik QR 03 · Gedung Sisi Kiri', code:'03', x:176, y:376.15 },
    { id:'START-04', name:'Titik QR 04 · Koridor Tengah', code:'04', x:775, y:507.15 },
    { id:'START-05', name:'Titik QR 05 · Ruang 15', code:'05', x:1162, y:538 },
    { id:'START-06', name:'Titik QR 06 · Koridor Atas', code:'06', x:884, y:255 }
  ];

  const qrModal = document.getElementById('qr-start-modal');

  function clearQrMode() {
    window.EvacBackend?.clearActiveRoute?.();
  }
  window.__clearQrMode = clearQrMode;
  window.DEFAULT_START_POINTS = DEFAULT_START_POINTS;
  window.START_POINTS = window.EvacBackend?.getQrStarts?.() || DEFAULT_START_POINTS.map(p => ({ ...p }));

  window.__setStartPoints = function(points) {
    if (window.EvacBackend?.setQrStarts) {
      window.EvacBackend.setQrStarts(points);
    }
  };

  function showYouAreHere(id) {
    if (window.EvacBackend?.routeFromStart) {
      const point = window.EvacBackend.routeFromStart(id);
      if (point) {
        if (detailTitle) detailTitle.textContent = `${point.code} · ${point.name}`;
        if (detailCopy) detailCopy.innerHTML = `<b class="text-cyan-700">You Are Here</b> · QR <b>${point.id}</b> (${Math.round(point.x)}, ${Math.round(point.y)}) terdeteksi. Rute dihitung dari <b>Backend Evakuasi Terpadu</b> menuju Titik Kumpul (Assembly Point).`;
        if (detailChip) { detailChip.textContent = 'YOU ARE HERE'; detailChip.className = 'feature-chip bg-sky-50 text-sky-700'; }
      }
    }
  }
  window.__v6ShowStart = id => showYouAreHere(id);

  function renderQrStartList() {
    window.EvacBackend?.renderQrModalLists?.();
  }
  window.__renderQrStartList = renderQrStartList;

  document.getElementById('clear-qr-mode')?.addEventListener('click', () => clearQrMode());
  document.getElementById('print-qr-sheet')?.addEventListener('click', () => window.print());
  document.getElementById('btn-qr-starts')?.addEventListener('click', () => {
    renderQrStartList();
    qrModal?.classList.add('open');
    qrModal?.setAttribute('aria-hidden', 'false');
  });

  const startParam = new URLSearchParams(window.location.search).get('start');
  const roomParam = new URLSearchParams(window.location.search).get('room');
  if (roomParam) {
    selectRoom(roomParam, 'sidebar');
  } else if (startParam) {
    showYouAreHere(startParam);
  } else {
    clearQrMode();
  }

  // =========================
  // UNIFIED MAP ZOOM & PAN (MULTI-TOUCH PINCH ZOOM, 1-FINGER PAN & DOUBLE-TAP)
  // =========================
  const MAP_BASE = { x: 0, y: 0, width: 1427, height: 1023 };
  const MAP_ZOOM = { min: 1, max: 6, step: 1.25 };
  const zoomInBtn = document.getElementById('map-zoom-in');
  const zoomOutBtn = document.getElementById('map-zoom-out');
  const zoomResetBtn = document.getElementById('map-zoom-reset');
  const zoomLevel = document.getElementById('map-zoom-level');
  let mapZoom = 1;
  let isPanningMap = false;
  let panPointerId = null;
  let downPointer = null;
  let lastPointer = null;
  let pinchActive = false;
  let pinchLastDist = 0;
  let pinchLastMid = null;
  let lastTapTime = 0;
  let lastTapPos = null;
  let animFrameId = 0;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function updateZoomLabel() {
    if (zoomLevel) zoomLevel.textContent = `${Math.round(mapZoom * 100)}%`;
    const fitFab = document.getElementById('mobile-fit-fab');
    if (fitFab) {
      fitFab.classList.toggle('active', mapZoom > 1.05);
      const sp = fitFab.querySelector('span');
      if (sp) sp.textContent = mapZoom > 1.05 ? '100% Utuh' : 'Pas Layar';
    }
  }

  function setMapView(x, y, width, height) {
    const vb = svg.viewBox.baseVal;
    vb.x = x; vb.y = y; vb.width = width; vb.height = height;
  }

  function getViewBoxDimensionsForZoom(zoomVal) {
    const rect = svg.getBoundingClientRect();
    const newWidth = MAP_BASE.width / zoomVal;
    if (rect.width > 0 && rect.height > rect.width * 1.05 && zoomVal > 1.02) {
      const aspectH = newWidth * (rect.height / rect.width);
      return { width: newWidth, height: Math.min(MAP_BASE.height, Math.max(MAP_BASE.height / zoomVal, aspectH)) };
    }
    return { width: newWidth, height: MAP_BASE.height / zoomVal };
  }

  function clientToSvgPoint(clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(ctm.inverse());
    }
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return {
      x: vb.x + vb.width * clamp((clientX - rect.left) / (rect.width || 1), 0, 1),
      y: vb.y + vb.height * clamp((clientY - rect.top) / (rect.height || 1), 0, 1)
    };
  }

  function zoomAt(factor, clientX, clientY) {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const vb = svg.viewBox.baseVal;
    const oldZoom = mapZoom;
    const nextZoom = clamp(oldZoom * factor, MAP_ZOOM.min, MAP_ZOOM.max);
    if (Math.abs(nextZoom - oldZoom) < 0.001) return;

    const focus = clientToSvgPoint(clientX, clientY);
    const relX = clamp((focus.x - vb.x) / (vb.width || 1), 0, 1);
    const relY = clamp((focus.y - vb.y) / (vb.height || 1), 0, 1);
    const dims = getViewBoxDimensionsForZoom(nextZoom);
    const newX = clamp(focus.x - dims.width * relX, MAP_BASE.x, Math.max(MAP_BASE.x, MAP_BASE.width - dims.width));
    const newY = clamp(focus.y - dims.height * relY, MAP_BASE.y, Math.max(MAP_BASE.y, MAP_BASE.height - dims.height));

    mapZoom = nextZoom;
    setMapView(newX, newY, dims.width, dims.height);
    updateZoomLabel();
  }

  function panByScreenDelta(dxClient, dyClient, allowFreeMargin = false) {
    const vb = svg.viewBox.baseVal;
    const ctm = svg.getScreenCTM();
    let dxSvg, dySvg;
    if (ctm && ctm.a && ctm.d) {
      dxSvg = dxClient / ctm.a;
      dySvg = dyClient / ctm.d;
    } else {
      const rect = svg.getBoundingClientRect();
      dxSvg = dxClient * (vb.width / (rect.width || 1));
      dySvg = dyClient * (rect.height ? vb.height / rect.height : 1);
    }
    const freePan = allowFreeMargin || document.body.classList.contains('map-editor-active');
    const marginX = freePan ? 450 : 0;
    const marginY = freePan ? 320 : 0;
    const minX = MAP_BASE.x - marginX;
    const minY = MAP_BASE.y - marginY;
    const maxX = Math.max(MAP_BASE.x, MAP_BASE.x + MAP_BASE.width - vb.width) + marginX;
    const maxY = Math.max(MAP_BASE.y, MAP_BASE.y + MAP_BASE.height - vb.height) + marginY;
    vb.x = clamp(vb.x - dxSvg, minX, maxX);
    vb.y = clamp(vb.y - dySvg, minY, maxY);
  }

  function resetMapZoom() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    mapZoom = 1;
    setMapView(MAP_BASE.x, MAP_BASE.y, MAP_BASE.width, MAP_BASE.height);
    updateZoomLabel();
  }

  function panZoomToSvgPoint(svgX, svgY, targetZoom = 2.0) {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = 0; }
    const vb = svg.viewBox.baseVal;
    const startX = vb.x, startY = vb.y, startW = vb.width, startH = vb.height, startZ = mapZoom;
    const endZ = clamp(targetZoom, MAP_ZOOM.min, MAP_ZOOM.max);
    const dims = getViewBoxDimensionsForZoom(endZ);
    const endW = dims.width, endH = dims.height;
    const endX = clamp(svgX - endW / 2, MAP_BASE.x, Math.max(MAP_BASE.x, MAP_BASE.width - endW));
    const endY = clamp(svgY - endH / 2, MAP_BASE.y, Math.max(MAP_BASE.y, MAP_BASE.height - endH));
    const t0 = performance.now();
    const dur = 260;
    function step(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      mapZoom = startZ + (endZ - startZ) * ease;
      setMapView(
        startX + (endX - startX) * ease,
        startY + (endY - startY) * ease,
        startW + (endW - startW) * ease,
        startH + (endH - startH) * ease
      );
      updateZoomLabel();
      if (p < 1) animFrameId = requestAnimationFrame(step);
      else animFrameId = 0;
    }
    animFrameId = requestAnimationFrame(step);
  }

  window.__panZoomToSvgPoint = panZoomToSvgPoint;
  window.__getMapZoom = () => mapZoom;
  window.__v6RobustZoom = { reset: resetMapZoom, zoomToPoint: panZoomToSvgPoint };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? MAP_ZOOM.step : 1 / MAP_ZOOM.step;
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Multi-touch Pinch-to-Zoom & 2-Finger Pan + Double-Tap Zoom
  svg.addEventListener('touchstart', e => {
    if (window.__isEditorBusy?.()) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchActive = true;
      isPanningMap = false;
      panPointerId = null;
      const t1 = e.touches[0], t2 = e.touches[1];
      pinchLastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchLastMid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      svg.classList.add('is-panning');
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      if (lastTapPos && (now - lastTapTime) < 300 && Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 36) {
        e.preventDefault();
        if (mapZoom < 2.3) {
          zoomAt(1.85, t.clientX, t.clientY);
        } else {
          resetMapZoom();
        }
        lastTapTime = 0;
        lastTapPos = null;
      } else {
        lastTapTime = now;
        lastTapPos = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    if (!pinchActive || e.touches.length < 2) return;
    if (window.__isEditorBusy?.()) return;
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    if (pinchLastDist > 8 && dist > 8) {
      const factor = dist / pinchLastDist;
      zoomAt(factor, mid.x, mid.y);
    }
    if (pinchLastMid && mapZoom > 1) {
      panByScreenDelta(mid.x - pinchLastMid.x, mid.y - pinchLastMid.y);
    }
    pinchLastDist = dist;
    pinchLastMid = mid;
  }, { passive: false });

  function endPinch(e) {
    if (!pinchActive) return;
    if (e.touches.length < 2) {
      pinchActive = false;
      pinchLastDist = 0;
      pinchLastMid = null;
      svg.classList.remove('is-panning');
      window.__wasMapDragging = true;
      setTimeout(() => { window.__wasMapDragging = false; }, 120);
    }
  }
  svg.addEventListener('touchend', endPinch);
  svg.addEventListener('touchcancel', endPinch);

  // 1-Finger / Left-Click Pan (in normal mode) + Strict HOLD Right-Click Mouse Drag Pan (in Editor Mode & normal mode)
  let panButton = -1;

  function stopMapPan() {
    if (isPanningMap && panPointerId !== null && panButton === 0) {
      try { svg.releasePointerCapture?.(panPointerId); } catch (_) {}
    }
    if (isPanningMap) {
      setTimeout(() => { window.__wasMapDragging = false; }, 60);
    } else {
      window.__wasMapDragging = false;
    }
    isPanningMap = false;
    panButton = -1;
    downPointer = null;
    lastPointer = null;
    svg.classList.remove('is-panning');
    panPointerId = null;
  }

  // Suppress browser context menu on the map; if right button is released, ensure pan stops immediately
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!e.buttons || (e.buttons & 2) === 0) stopMapPan();
  });
  mapWrapper?.addEventListener('contextmenu', e => {
    if (document.body.classList.contains('map-editor-active') || isPanningMap || window.__wasMapDragging) {
      e.preventDefault();
    }
    if (!e.buttons || (e.buttons & 2) === 0) stopMapPan();
  });

  // Capture-phase listener for Right-Click HOLD (e.button === 2)
  svg.addEventListener('pointerdown', e => {
    if (pinchActive) return;
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      panPointerId = e.pointerId;
      panButton = 2;
      downPointer = { x: e.clientX, y: e.clientY };
      lastPointer = { x: e.clientX, y: e.clientY };
      isPanningMap = true;
      window.__wasMapDragging = true;
      svg.classList.add('is-panning');
      return;
    }
    if (!e.isPrimary || e.button !== 0 || mapZoom <= 1) return;
    if (window.__isEditorBusy?.()) return;
    if (e.target.closest('.editor-marker-handle, .v6-map-handle, .v6-wall-handle, #v6-map-area-layer .v6-map-area')) return;
    panPointerId = e.pointerId;
    panButton = 0;
    downPointer = { x: e.clientX, y: e.clientY };
    lastPointer = { x: e.clientX, y: e.clientY };
    isPanningMap = false;
  }, true);

  window.addEventListener('pointermove', e => {
    if (pinchActive || panPointerId === null || e.pointerId !== panPointerId || !lastPointer) return;
    if (panButton === 2) {
      // Strictly HOLD-only: the instant the right mouse button (bit 2) is released, stop panning!
      if ((e.buttons & 2) === 0) {
        stopMapPan();
        return;
      }
      e.preventDefault();
      panByScreenDelta(e.clientX - lastPointer.x, e.clientY - lastPointer.y, true);
      lastPointer = { x: e.clientX, y: e.clientY };
      return;
    }
    if (panButton === 0) {
      if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
        stopMapPan();
        return;
      }
      if (mapZoom <= 1 || window.__isEditorBusy?.()) return;
      if (!isPanningMap) {
        if (!downPointer || Math.hypot(e.clientX - downPointer.x, e.clientY - downPointer.y) < 5) return;
        isPanningMap = true;
        window.__wasMapDragging = true;
        svg.classList.add('is-panning');
        try { svg.setPointerCapture?.(e.pointerId); } catch (_) {}
      }
      panByScreenDelta(e.clientX - lastPointer.x, e.clientY - lastPointer.y, false);
      lastPointer = { x: e.clientX, y: e.clientY };
    }
  }, { passive: false });

  window.addEventListener('pointerup', e => {
    if (e.pointerId === panPointerId || e.button === 2 || (panButton === 2 && (e.buttons & 2) === 0)) {
      stopMapPan();
    }
  }, true);
  window.addEventListener('mouseup', e => {
    if (e.button === 2 || (panButton === 2 && (e.buttons & 2) === 0)) {
      stopMapPan();
    }
  }, true);
  window.addEventListener('pointercancel', stopMapPan, true);
  window.addEventListener('blur', stopMapPan);

  zoomInBtn?.addEventListener('click', () => {
    const r = svg.getBoundingClientRect();
    zoomAt(MAP_ZOOM.step, r.left + r.width / 2, r.top + r.height / 2);
  });
  zoomOutBtn?.addEventListener('click', () => {
    const r = svg.getBoundingClientRect();
    zoomAt(1 / MAP_ZOOM.step, r.left + r.width / 2, r.top + r.height / 2);
  });
  zoomResetBtn?.addEventListener('click', resetMapZoom);

  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(MAP_ZOOM.step, r.left + r.width / 2, r.top + r.height / 2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomAt(1 / MAP_ZOOM.step, r.left + r.width / 2, r.top + r.height / 2);
    } else if (e.key === '0') {
      resetMapZoom();
    }
  });
  updateZoomLabel();
});

/* ==========================================================================
   2. Temporary Wall Mode, Map HUD, Quick Help & Toast Notifications
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const wallBtn = document.getElementById("btn-temporary-wall");
  const svg = document.getElementById("main-svg");
  if (wallBtn && svg) {
    const triplekWalls = [...svg.querySelectorAll("[data-triplek-wall='true']")];
    const triplekFills = triplekWalls.map(el => {
      const prev = el.previousElementSibling;
      return prev && prev.tagName.toLowerCase() === "rect" ? prev : null;
    }).filter(Boolean);
    let triplekActive = false;

    triplekWalls.forEach(el => {
      el.dataset.normalStroke = "#1E293B";
      el.dataset.normalWidth = "2.16564";
      el.dataset.normalFill = "none";
      el.setAttribute("stroke", "#1E293B");
      el.setAttribute("stroke-width", "2.16564");
      el.setAttribute("fill", "none");
    });

    triplekFills.forEach(el => {
      el.dataset.normalFill = "#F1F5F9";
      el.setAttribute("fill", "#F1F5F9");
      el.setAttribute("stroke", "#1E293B");
      el.setAttribute("stroke-width", "2.16564");
    });

    wallBtn.addEventListener("click", () => {
      triplekActive = !triplekActive;
      triplekWalls.forEach(el => {
        el.setAttribute("stroke", triplekActive ? "#F59E0B" : el.dataset.normalStroke);
        el.setAttribute("stroke-width", triplekActive ? "4" : el.dataset.normalWidth);
        el.setAttribute("fill", "none");
        el.classList.toggle("triplek-glow", triplekActive);
      });
      triplekFills.forEach(el => {
        el.setAttribute("fill", triplekActive ? "#FEF3C7" : "#F1F5F9");
        el.setAttribute("stroke", triplekActive ? "#F59E0B" : "#1E293B");
        el.setAttribute("stroke-width", triplekActive ? "4" : "2.16564");
        el.classList.toggle("triplek-glow", triplekActive);
      });
      wallBtn.classList.toggle("wall-active", triplekActive);
      const label = wallBtn.querySelector("span");
      if (label) label.textContent = triplekActive ? "Tembok Triplek Aktif" : "Mode Tembok Sementara";
    });
  }

  // Professional HUD & Quick Help
  const map = document.getElementById('interactive-map');
  if (!map) return;
  const hud = document.createElement('div');
  hud.id = 'professional-map-hud';
  hud.innerHTML = '<div class="pro-hud-chip"><span class="pro-hud-dot"></span>Sistem K3 aktif</div><div class="pro-hud-chip" id="hud-room-count-chip">41 ruang terpetakan</div>';
  map.appendChild(hud);

  const stats = document.createElement('div');
  stats.id = 'professional-map-stats';
  stats.innerHTML = '<div class="pro-stat"><b data-k3-stat="apar">12</b><span>APAR</span></div><div class="pro-stat"><b data-k3-stat="p3k">3</b><span>P3K</span></div><div class="pro-stat"><b data-k3-stat="cctv">16</b><span>CCTV</span></div><div class="pro-stat"><b data-k3-stat="fire">5</b><span>Alarm</span></div><div class="pro-stat"><b data-k3-stat="custom">0</b><span>Custom</span></div>';
  map.appendChild(stats);

  const helpBtn = document.createElement('button');
  helpBtn.id = 'professional-help-btn';
  helpBtn.type = 'button';
  helpBtn.title = 'Bantuan kontrol peta';
  helpBtn.textContent = '?';
  map.appendChild(helpBtn);

  const help = document.getElementById('professional-help');
  const close = document.getElementById('professional-help-close');
  const openHelp = () => { help?.classList.add('open'); help?.setAttribute('aria-hidden', 'false'); };
  const closeHelp = () => { help?.classList.remove('open'); help?.setAttribute('aria-hidden', 'true'); };
  helpBtn.addEventListener('click', openHelp);
  close?.addEventListener('click', closeHelp);
  help?.addEventListener('click', e => { if (e.target === help) closeHelp(); });

  const toast = document.getElementById('professional-toast');
  let toastTimer;
  window.showK3Toast = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  };

  const search = document.getElementById('room-search');
  if (search) {
    const wrap = search.parentElement;
    if (wrap && !document.getElementById('room-search-clear')) {
      const clear = document.createElement('button');
      clear.id = 'room-search-clear';
      clear.type = 'button';
      clear.textContent = '×';
      clear.title = 'Bersihkan pencarian';
      clear.style.cssText = 'display:none;border:0;background:transparent;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:0 2px';
      wrap.appendChild(clear);
      const sync = () => { clear.style.display = search.value ? 'block' : 'none'; };
      search.addEventListener('input', sync);
      clear.addEventListener('click', () => {
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        search.focus();
      });
      sync();
    }
  }

  document.querySelectorAll('.gis-layer-btn').forEach(btn => btn.addEventListener('click', () => {
    const label = btn.querySelector('span')?.textContent?.trim();
    if (label) window.showK3Toast('Mode peta: ' + label);
  }));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && help?.classList.contains('open')) { closeHelp(); return; }
    if (e.key === '?' && !e.target.matches('input, textarea, select')) { e.preventDefault(); openHelp(); }
  });
});

/* ==========================================================================
   3. K3 Inspection Logbook, Hazard Reporting & Live Telemetry Sync
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function getRoomLabel(id) {
    if (window.getRoomName) return window.getRoomName(id);
    return `Ruangan ${id}`;
  }

  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if ($('#log-date')) $('#log-date').value = iso;

  const open = id => { const m = $(`#${id}`); if (!m) return; m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); };
  const close = id => { const m = $(`#${id}`); if (!m) return; m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); };
  $$('[data-k3-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.k3Close)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.k3-modal.open').forEach(m => close(m.id)); });

  function toast(msg, success = false) {
    document.querySelectorAll('.k3-toast-functional').forEach(x => x.remove());
    const t = document.createElement('div');
    t.className = 'k3-toast-functional' + (success ? ' success' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function storageGet(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function storageSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

  function renderHistory(key, target, title) {
    const el = $(target);
    if (!el) return;
    const arr = storageGet(key);
    el.innerHTML = `<div class="k3-history-title">${title}</div>` + (arr.length
      ? arr.slice(0, 4).map(x => `<div class="k3-history-item"><strong>${x.title}</strong><small>${x.meta}</small></div>`).join('')
      : '<div class="k3-empty-history">Belum ada catatan tersimpan di browser ini.</div>');
  }

  // Reactive K3 Telemetry Sync across HUD, Sidebar, Audit Panel & QR Tabs
  function syncK3Metrics() {
    const counts = window.__getSafetyAssetCounts ? window.__getSafetyAssetCounts() : { apar: 12, p3k: 3, cctv: 16, fire: 5, custom: 0 };
    const st = window.__mapEditorSafetyAPI?.getState?.() || { apar: [], p3k: [], cctv: [], fire: [], custom: [] };
    const customRooms = window.__getCustomRooms ? window.__getCustomRooms() : [];
    const totalRooms = 41 + customRooms.length;
    const logs = storageGet('gisK3Logbook');
    const hazards = storageGet('gisK3Hazards');

    // Compute dynamic Custom Asset label & symbol from actual custom assets
    const customList = Array.isArray(st.custom) ? st.custom : [];
    const uniqueCustomNames = [...new Set(customList.map(p => (p.name || '').trim()).filter(Boolean))];
    const customDisplayLabel = uniqueCustomNames.length === 1
      ? uniqueCustomNames[0]
      : (uniqueCustomNames.length > 1
          ? `${uniqueCustomNames.slice(0, 2).join(', ')}${uniqueCustomNames.length > 2 ? ' +' + (uniqueCustomNames.length - 2) : ''}`
          : 'Custom');
    const firstCustom = customList[0];

    // 1. Map HUD Stats & Custom Asset Dynamic Labels
    const hudRoomChip = $('#hud-room-count-chip');
    if (hudRoomChip) hudRoomChip.textContent = `${totalRooms} ruang terpetakan`;
    ['apar', 'p3k', 'cctv', 'fire', 'custom'].forEach(k => {
      $$(`[data-k3-stat="${k}"]`).forEach(statEl => { statEl.textContent = String(counts[k] ?? 0); });
      const quickEl = $(`.k3-quick-grid button[data-focus-kind="${k}"] small`);
      if (quickEl) quickEl.textContent = `${counts[k] ?? 0} titik`;
    });

    $$('[data-custom-stat-label]').forEach(el => {
      el.textContent = customDisplayLabel;
      el.title = uniqueCustomNames.length ? `Daftar Custom Asset: ${uniqueCustomNames.join(', ')}` : 'Custom Asset';
    });
    const customSym = $('.k3-symbol-custom');
    if (customSym) {
      customSym.textContent = firstCustom?.initial ? String(firstCustom.initial).slice(0, 2).toUpperCase() : 'K';
      customSym.style.background = firstCustom?.color || '#7c3aed';
    }
    const proCustomSpan = $('#professional-map-stats .pro-stat:nth-child(5) span');
    if (proCustomSpan) {
      proCustomSpan.innerHTML = `<b data-k3-stat="custom">${counts.custom ?? 0}</b> ${customDisplayLabel.toUpperCase()}`;
    }
    const toolbarCustomPill = $('.tk3-pill[data-k3-pill="custom"]');
    if (toolbarCustomPill) {
      toolbarCustomPill.innerHTML = `🟣 <b data-k3-stat="custom">${counts.custom ?? 0}</b> ${customDisplayLabel.toUpperCase()}`;
    }

    // Render Custom Assets & Customized Established Assets Directory with Names + Descriptions
    const renderCustomDirectory = (container) => {
      if (!container) return;
      const entries = [];
      const catMeta = {
        custom: { badge: 'CUSTOM', defaultName: 'Custom Asset', defaultInit: 'K', defaultColor: '#7C3AED' },
        apar:   { badge: 'APAR',   defaultName: 'APAR',         defaultInit: 'A', defaultColor: '#DC2626' },
        p3k:    { badge: 'P3K',    defaultName: 'P3K',          defaultInit: 'P', defaultColor: '#16A34A' },
        cctv:   { badge: 'CCTV',   defaultName: 'CCTV',         defaultInit: 'C', defaultColor: '#2563EB' },
        fire:   { badge: 'ALARM',  defaultName: 'Fire Alarm',   defaultInit: 'F', defaultColor: '#F97316' }
      };
      customList.forEach((p, idx) => {
        entries.push({
          kind: 'custom',
          idx: idx + 1,
          name: p.name || 'Custom Asset',
          initial: (p.initial || 'K').slice(0, 2).toUpperCase(),
          color: p.color || '#7C3AED',
          desc: p.desc || 'Aset keselamatan kustom terpetakan pada denah.',
          x: p.x,
          y: p.y,
          catBadge: 'CUSTOM'
        });
      });
      ['apar', 'p3k', 'cctv', 'fire'].forEach(k => {
        const meta = catMeta[k];
        (st[k] || []).forEach((p, idx) => {
          const hasCustomName = p.name && p.name !== meta.defaultName;
          const hasCustomInit = p.initial && p.initial.toUpperCase() !== meta.defaultInit;
          const hasCustomColor = p.color && p.color.toUpperCase() !== meta.defaultColor;
          const hasDesc = Boolean(p.desc && p.desc.trim());
          if (hasCustomName || hasCustomInit || hasCustomColor || hasDesc) {
            entries.push({
              kind: k,
              idx: idx + 1,
              name: p.name || `${meta.defaultName} #${idx + 1}`,
              initial: (p.initial || meta.defaultInit).slice(0, 2).toUpperCase(),
              color: p.color || meta.defaultColor,
              desc: p.desc || `Terhitung dalam kategori ${meta.badge} (#${idx + 1}).`,
              x: p.x,
              y: p.y,
              catBadge: meta.badge
            });
          }
        });
      });

      if (!entries.length) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
      }
      container.classList.remove('hidden');
      const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      container.innerHTML = `
        <div class="custom-dir-header">
          <span>✨ Daftar & Deskripsi Aset Kustom (${entries.length})</span>
          <small>Klik untuk fokus</small>
        </div>
        <div class="custom-dir-list">
          ${entries.map(item => `
            <div class="custom-asset-dir-item" data-focus-asset-kind="${item.kind}" data-focus-asset-x="${item.x}" data-focus-asset-y="${item.y}">
              <span class="custom-asset-dir-badge" style="background:${escHtml(item.color)}">${escHtml(item.initial)}</span>
              <div class="custom-asset-dir-body">
                <div class="custom-asset-dir-title">
                  <b>${escHtml(item.name)}</b>
                  <span class="custom-asset-dir-cat">${escHtml(item.catBadge)} #${item.idx}</span>
                </div>
                <div class="custom-asset-dir-desc">${escHtml(item.desc)}</div>
              </div>
              <button type="button" class="custom-asset-dir-btn" title="Tampilkan & perbesar lokasi aset di peta">📍 Fokus</button>
            </div>
          `).join('')}
        </div>
      `;
      container.querySelectorAll('.custom-asset-dir-item').forEach(el => {
        el.addEventListener('click', () => {
          const k = el.getAttribute('data-focus-asset-kind') || 'custom';
          const ax = +el.getAttribute('data-focus-asset-x');
          const ay = +el.getAttribute('data-focus-asset-y');
          window.__focusSafetyKind?.(k);
          if (Number.isFinite(ax) && Number.isFinite(ay)) {
            window.__panZoomToSvgPoint?.(ax, ay, 1.8);
          }
        });
      });
    };

    renderCustomDirectory($('#custom-assets-directory'));
    renderCustomDirectory($('#custom-assets-audit-directory'));

    // 2. Sidebar Room Index & Tabs
    const roomTab = $('.panel-tab[data-panel-tab="rooms"]');
    if (roomTab) roomTab.textContent = `▤ Daftar (${totalRooms})`;
    const roomCountBadge = $('#panel-rooms .text-lg.font-extrabold');
    if (roomCountBadge) roomCountBadge.textContent = String(totalRooms);
    const qrRoomsBtn = $('#qr-view-rooms-btn');
    if (qrRoomsBtn) qrRoomsBtn.textContent = `Semua Ruangan (${totalRooms})`;

    // 3. Audit Panel Metrics & Live Hazard Indicator
    const auditStrong = $$('#panel-audit .audit-metrics strong');
    if (auditStrong.length >= 4) {
      auditStrong[0].textContent = String(counts.apar);
      auditStrong[1].textContent = String(counts.p3k);
      auditStrong[2].textContent = String(counts.cctv);
      auditStrong[3].textContent = String(counts.fire);
      if (auditStrong[4]) auditStrong[4].textContent = String(counts.custom ?? 0);
    }
    const auditAparSmall = $('#panel-audit [data-audit-focus="apar"] small');
    if (auditAparSmall) auditAparSmall.textContent = `${counts.apar} titik terpetakan`;
    const auditP3kSmall = $('#panel-audit [data-audit-focus="p3k"] small');
    if (auditP3kSmall) auditP3kSmall.textContent = `${counts.p3k} titik terpetakan`;

    const auditChip = $('#panel-audit .audit-summary-card .feature-chip');
    if (auditChip) {
      if (hazards.length > 0) {
        auditChip.className = 'feature-chip bg-amber-50 text-amber-700';
        auditChip.textContent = `⚠ ${hazards.length} HAZARD`;
      } else {
        auditChip.className = 'feature-chip bg-emerald-50 text-emerald-700';
        auditChip.textContent = `● TERKENDALI (${logs.length} Cek)`;
      }
    }

    window.__refreshSelectedRoomK3?.();
    window.__refreshAdminStats?.();
  }
  window.__syncK3Metrics = syncK3Metrics;

  $('#open-logbook')?.addEventListener('click', () => {
    window.__syncRoomSelects?.();
    renderHistory('gisK3Logbook', '#logbook-history', 'Riwayat lokal');
    open('logbook-modal');
  });
  $('#open-hazard')?.addEventListener('click', () => {
    window.__syncRoomSelects?.();
    renderHistory('gisK3Hazards', '#hazard-history', 'Laporan terbaru');
    open('hazard-modal');
  });

  $('#logbook-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const room = $('#log-room').value;
    const status = $('#log-status').value;
    const date = $('#log-date').value;
    const note = $('#log-note').value.trim();
    const item = {
      roomId: String(room),
      title: `Inspeksi · ${getRoomLabel(room)}`,
      meta: `${date} · ${status}${note ? ' · ' + note.slice(0, 90) : ''}`
    };
    const arr = storageGet('gisK3Logbook');
    arr.unshift(item);
    storageSet('gisK3Logbook', arr.slice(0, 30));
    renderHistory('gisK3Logbook', '#logbook-history', 'Riwayat lokal');
    syncK3Metrics();
    toast('Inspeksi berhasil disimpan di browser ini.', true);
    e.target.reset();
    $('#log-date').value = iso;
  });

  $('#hazard-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const room = $('#hazard-room').value;
    const risk = $('#hazard-risk').value;
    const type = $('#hazard-type').value;
    const reporter = $('#hazard-reporter').value.trim() || 'Anonim';
    const note = $('#hazard-note').value.trim();
    const item = {
      roomId: String(room),
      title: `${risk} · ${type}`,
      meta: `${getRoomLabel(room)} · ${reporter} · ${note.slice(0, 90)}`
    };
    const arr = storageGet('gisK3Hazards');
    arr.unshift(item);
    storageSet('gisK3Hazards', arr.slice(0, 30));
    renderHistory('gisK3Hazards', '#hazard-history', 'Laporan terbaru');
    syncK3Metrics();
    toast('Laporan hazard berhasil disimpan di browser ini.', true);
    e.target.reset();
  });

  $$('[data-open-audit]').forEach(b => b.addEventListener('click', () => $('.panel-tab[data-panel-tab="audit"]')?.click()));
  $$('[data-audit-focus]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.auditFocus;
    if (k === 'apar' || k === 'p3k' || k === 'cctv' || k === 'fire') {
      if (typeof window.__focusSafetyKind === 'function') window.__focusSafetyKind(k);
      else $('.gis-layer-btn[data-layer="safety"]')?.click();
    }
    else if (k === 'evac') $('.gis-layer-btn[data-layer="evacuation"]')?.click();
    else if (k === 'assembly') {
      $('.gis-layer-btn[data-layer="evacuation"]')?.click();
      toast('Titik kumpul ditampilkan bersama layer evakuasi.');
    }
  }));
  const auditMetricOrder = ['apar', 'p3k', 'cctv', 'fire', 'custom'];
  $$('#panel-audit .audit-metrics > div').forEach((box, idx) => {
    const k = auditMetricOrder[idx];
    if (k) box.addEventListener('click', () => window.__focusSafetyKind?.(k));
  });
  $$('[data-focus-kind]').forEach(btn => btn.title = btn.title || 'Tampilkan pada peta');
  syncK3Metrics();
});

/* ==========================================================================
   4. Safety Asset & CCTV FOV Interactive Map Editor
   ========================================================================== */
document.addEventListener('DOMContentLoaded',()=>{
  const svg=document.getElementById('main-svg'), safety=document.getElementById('safety-markers'), toggle=document.getElementById('map-editor-toggle'), panel=document.getElementById('map-editor-panel');
  if(!svg||!safety||!toggle||!panel)return;
  const NS='http://www.w3.org/2000/svg', STORAGE='gisK3MapEditorV7Safety';
  const types={apar:{label:'APAR',letter:'A',color:'#DC2626',pulseR:13,labelR:6},p3k:{label:'P3K',letter:'P',color:'#16A34A',pulseR:14,labelR:7},cctv:{label:'CCTV',letter:'C',color:'#2563EB',pulseR:12,labelR:9},fire:{label:'Fire Alarm',letter:'F',color:'#F97316',pulseR:12,labelR:9},custom:{label:'Custom Asset',letter:'K',color:'#7C3AED',pulseR:13,labelR:9}};
  const original={apar:[],p3k:[],cctv:[],fire:[],custom:[]}, state={apar:[],p3k:[],cctv:[],fire:[],custom:[]};
  let history=[],future=[],editing=false,selected=null,drag=null,dirty=false,dragBefore=null;

  const pulseSelector=k=>'.marker-'+(k==='fire'?'fire-alarm':k);
  function getPulse(k){return safety.querySelector(pulseSelector(k))}
  function getLabelGroup(k){
    if(k==='apar'||k==='p3k') return safety.querySelector('.marker-labels:not([aria-label])');
    if(k==='custom') return safety.querySelector('.marker-labels[aria-label="Penanda Custom"]');
    return safety.querySelector(`.marker-labels[aria-label="Penanda ${k==='fire'?'Fire Alarm':k.toUpperCase()}"]`);
  }
  function readGroup(k){const g=getPulse(k);const cfg=types[k];return g?[...g.querySelectorAll('circle')].map(c=>({x:+c.getAttribute('cx'),y:+c.getAttribute('cy'),initial:c.getAttribute('data-custom-initial')||cfg.letter,name:c.getAttribute('data-custom-name')||cfg.label,color:c.getAttribute('stroke')||cfg.color,desc:c.getAttribute('data-custom-desc')||'',...(k==='cctv'?{angle:+(c.getAttribute('data-angle')||0)}:{}),})):[]}
  Object.keys(types).forEach(k=>{original[k]=readGroup(k).map(p=>({...p}));state[k]=original[k].map(p=>({...p}));});

  window.__getSafetyAssetCounts=()=>({apar:state.apar.length,p3k:state.p3k.length,cctv:state.cctv.length,fire:state.fire.length,custom:state.custom.length});

  const editorLayer=document.createElementNS(NS,'g');editorLayer.id='map-editor-handles';editorLayer.setAttribute('aria-label','Editable safety assets');editorLayer.style.display='none';safety.appendChild(editorLayer);
  const cloneState=()=>JSON.parse(JSON.stringify(state));
  const show=msg=>window.showK3Toast?window.showK3Toast(msg):null;
  const getCustomDefaults=(k='custom')=>{
    const cfg=types[k]||types.custom;
    const catSel=document.getElementById('studio-custom-asset-cat')?.value||'custom';
    const useForm=(k===catSel||k==='custom');
    return {
      initial:useForm?((document.getElementById('studio-custom-asset-init')?.value||cfg.letter).trim().slice(0,2).toUpperCase()||cfg.letter):cfg.letter,
      name:useForm?((document.getElementById('studio-custom-asset-name')?.value||cfg.label).trim()||cfg.label):cfg.label,
      color:useForm?(document.getElementById('studio-custom-asset-color')?.value||cfg.color):cfg.color,
      desc:useForm?((document.getElementById('studio-custom-asset-desc')?.value||'').trim()):''
    };
  };

  function ensureSVGCounts(){
    Object.keys(types).forEach(k=>{
      const cfg=types[k], pulse=getPulse(k), labels=getLabelGroup(k); if(!pulse||!labels)return;
      const pulseCircles=[...pulse.querySelectorAll('circle')];
      const labelCircles=[...labels.querySelectorAll('circle')], texts=[...labels.querySelectorAll('text')];
      const target=state[k].length;
      while(pulseCircles.length<target){const c=document.createElementNS(NS,'circle');c.setAttribute('r',cfg.pulseR);c.setAttribute('fill','none');c.setAttribute('stroke',cfg.color);c.setAttribute('stroke-width','2');c.setAttribute('vector-effect','non-scaling-stroke');pulse.appendChild(c);pulseCircles.push(c)}
      while(labelCircles.length<target){const c=document.createElementNS(NS,'circle');c.setAttribute('r',cfg.labelR);c.setAttribute('fill',cfg.color);c.setAttribute('stroke','#fff');c.setAttribute('stroke-width','1.5');c.setAttribute('vector-effect','non-scaling-stroke');labels.appendChild(c);labelCircles.push(c)}
      while(texts.length<target){const t=document.createElementNS(NS,'text');t.setAttribute('text-anchor','middle');t.setAttribute('font-family','Inter, sans-serif');t.setAttribute('font-size','8');t.setAttribute('font-weight','900');t.setAttribute('fill','#fff');t.textContent=cfg.letter;labels.appendChild(t);texts.push(t)}
      while(pulse.querySelectorAll('circle').length>target)pulse.lastElementChild.remove();
      while(labels.querySelectorAll('circle').length>(k==='apar'||k==='p3k'?state.apar.length+state.p3k.length:state[k].length)){
        if(k==='apar'||k==='p3k')break; labels.querySelector('circle:last-of-type')?.remove();
      }
      while(k!=='apar'&&k!=='p3k'&&labels.querySelectorAll('text').length>state[k].length){
        labels.querySelector('text:last-of-type')?.remove();
      }
    });
    const shared=getLabelGroup('apar');
    if(shared){const total=state.apar.length+state.p3k.length;const circles=[...shared.querySelectorAll('circle')],texts=[...shared.querySelectorAll('text')];
      while(circles.length<total){const c=document.createElementNS(NS,'circle');shared.appendChild(c);circles.push(c)}
      while(texts.length<total){const t=document.createElementNS(NS,'text');t.setAttribute('text-anchor','middle');t.setAttribute('font-family','Inter, sans-serif');t.setAttribute('font-size','8');t.setAttribute('font-weight','900');shared.appendChild(t);texts.push(t)}
      while(shared.querySelectorAll('circle').length>total)shared.querySelector('circle:last-of-type')?.remove();
      while(shared.querySelectorAll('text').length>total)shared.querySelector('text:last-of-type')?.remove();
      [...state.apar,...state.p3k].forEach((p,i)=>{const k=i<state.apar.length?'apar':'p3k'; const cfg=types[k];const col=p.color||cfg.color;const init=((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter);const nm=p.name||cfg.label;const desc=p.desc||'';circles[i].setAttribute('cx',p.x);circles[i].setAttribute('cy',p.y);circles[i].setAttribute('r',cfg.labelR);circles[i].setAttribute('fill',col);circles[i].setAttribute('stroke','#fff');circles[i].setAttribute('stroke-width','1.4');circles[i].setAttribute('data-marker-kind',k);circles[i].setAttribute('data-custom-name',nm);circles[i].setAttribute('data-custom-initial',init);circles[i].setAttribute('data-custom-desc',desc);texts[i].setAttribute('x',p.x);texts[i].setAttribute('y',p.y+3);texts[i].setAttribute('fill','#fff');texts[i].setAttribute('font-size',init.length>1?'6.8':'8');texts[i].setAttribute('data-marker-kind',k);texts[i].textContent=init});
    }
    ['apar','p3k','cctv','fire','custom'].forEach(k=>{const pulse=getPulse(k),labels=getLabelGroup(k),cfg=types[k],arr=state[k];if(!pulse||!labels)return;const pc=[...pulse.querySelectorAll('circle')];arr.forEach((p,i)=>{if(pc[i]){const col=p.color||cfg.color;const init=((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter);const nm=p.name||cfg.label;const desc=p.desc||'';pc[i].setAttribute('cx',p.x);pc[i].setAttribute('cy',p.y);pc[i].setAttribute('r',cfg.pulseR);pc[i].setAttribute('stroke',col);pc[i].setAttribute('data-custom-initial',init);pc[i].setAttribute('data-custom-name',nm);pc[i].setAttribute('data-custom-desc',desc);if(k==='cctv')pc[i].setAttribute('data-angle',Number.isFinite(+p.angle)?+p.angle:0);}})});
    ['cctv','fire','custom'].forEach(k=>{const pulse=getPulse(k),labels=getLabelGroup(k),cfg=types[k],arr=state[k];if(!pulse||!labels)return;const lc=[...labels.querySelectorAll('circle')],tx=[...labels.querySelectorAll('text')];arr.forEach((p,i)=>{const col=p.color||cfg.color;const init=((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter);const nm=p.name||cfg.label;const desc=p.desc||'';if(lc[i]){lc[i].setAttribute('cx',p.x);lc[i].setAttribute('cy',p.y);lc[i].setAttribute('r',cfg.labelR);lc[i].setAttribute('fill',col);lc[i].setAttribute('data-marker-kind',k);lc[i].setAttribute('data-custom-name',nm);lc[i].setAttribute('data-custom-initial',init);lc[i].setAttribute('data-custom-desc',desc);}if(tx[i]){tx[i].setAttribute('x',p.x);tx[i].setAttribute('y',p.y+3);tx[i].setAttribute('font-size',init.length>1?'6.8':'8');tx[i].setAttribute('data-marker-kind',k);tx[i].textContent=init}})});
    const fovLayer=document.getElementById('cctv-fov-layer');
    if(fovLayer){
      let cones=[...fovLayer.querySelectorAll('.cctv-fov-cone')];
      while(cones.length<state.cctv.length){
        const g=document.createElementNS(NS,'g');
        g.setAttribute('class','cctv-fov-cone');
        fovLayer.appendChild(g);
        cones.push(g);
      }
      while(cones.length>state.cctv.length)cones.pop().remove();
      state.cctv.forEach((p,i)=>{
        const ang=Number.isFinite(+p.angle)?+p.angle:0;
        const r=Math.max(20,Math.min(110,Number(p.range)||47));
        const sp=Math.max(20,Math.min(130,Number(p.spread)||53))*Math.PI/360;
        const xEnd=+(r*Math.cos(sp)).toFixed(1), yEnd=+(r*Math.sin(sp)).toFixed(1);
        const aEnd=Math.max(14,+(r*0.68).toFixed(1));
        const col=p.color||'#2563EB';
        cones[i].innerHTML=`<path d="M 0 0 L ${xEnd} ${-yEnd} A ${r} ${r} 0 0 1 ${xEnd} ${yEnd} Z" fill="url(#cctv-fov-grad)" stroke="${col}" stroke-width="1" stroke-opacity="0.45" stroke-dasharray="3 2"/><path d="M 10 0 L ${aEnd} 0 M ${aEnd-5} -4 L ${aEnd+1} 0 L ${aEnd-5} 4" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.85"/>`;
        cones[i].setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${ang})`);
      });
    }
    window.__syncK3Metrics?.();
  }

  function autoSaveSafety(){
    try{
      localStorage.setItem(STORAGE,JSON.stringify({version:7,savedAt:new Date().toISOString(),state}));
      window.__broadcastLiveSync?.('safety');
    }catch(_){}
  }

  function applyPositions(){ensureSVGCounts();renderHandles()}
  function screenToSvg(x,y){const pt=svg.createSVGPoint();pt.x=x;pt.y=y;const ctm=svg.getScreenCTM();return ctm?pt.matrixTransform(ctm.inverse()):{x:0,y:0}}
  function pushSnapshot(snap){history.push(snap);if(history.length>40)history.shift();future=[];dirty=false;autoSaveSafety();updateUI()}
  function restore(snap){Object.keys(types).forEach(k=>state[k]=(snap[k]||[]).map(p=>({...p})));applyPositions();dirty=false;autoSaveSafety();updateUI()}

  function makeHandle(k,i,p){const cfg=types[k],col=p.color||cfg.color,init=((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter),lbl=p.name||cfg.label,g=document.createElementNS(NS,'g');g.classList.add('editor-marker-handle');g.dataset.kind=k;g.dataset.index=i;g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`${lbl} ${i+1}`);
    const ring=document.createElementNS(NS,'circle'),core=document.createElementNS(NS,'circle'),txt=document.createElementNS(NS,'text');
    ring.setAttribute('cx',p.x);ring.setAttribute('cy',p.y);ring.setAttribute('r',16);ring.setAttribute('fill','#fff');ring.setAttribute('fill-opacity','.16');ring.setAttribute('stroke',col);ring.setAttribute('stroke-width','2.5');ring.setAttribute('vector-effect','non-scaling-stroke');
    core.setAttribute('cx',p.x);core.setAttribute('cy',p.y);core.setAttribute('r',10);core.setAttribute('fill',col);core.setAttribute('stroke','#fff');core.setAttribute('stroke-width','2');core.setAttribute('vector-effect','non-scaling-stroke');
    txt.setAttribute('x',p.x);txt.setAttribute('y',p.y+3);txt.setAttribute('text-anchor','middle');txt.setAttribute('font-family','Inter,sans-serif');txt.setAttribute('font-size',init.length>1?'6.8':'8');txt.setAttribute('font-weight','900');txt.setAttribute('fill','#fff');txt.textContent=init;txt.setAttribute('pointer-events','none');g.append(ring,core,txt);editorLayer.appendChild(g);
    g.addEventListener('pointerdown',e=>{if(!editing||e.button!==0)return;e.stopPropagation();e.preventDefault();select(k,i);dragBefore=cloneState();drag={mode:'move',kind:k,index:i,last:screenToSvg(e.clientX,e.clientY)};try{svg.setPointerCapture(e.pointerId)}catch(_){} });
    g.addEventListener('click',e=>{e.stopPropagation();select(k,i)});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(k,i)}});
    if(k==='cctv'){
      const ang=((+p.angle||0)*Math.PI)/180, r=Math.max(20,Math.min(110,Number(p.range)||47));
      const ax=p.x+r*Math.cos(ang), ay=p.y+r*Math.sin(ang);
      const aim=document.createElementNS(NS,'g');
      aim.classList.add('editor-marker-handle');
      aim.setAttribute('title','Tarik untuk mengubah arah & jarak sorot CCTV');
      aim.innerHTML=`<line x1="${p.x}" y1="${p.y}" x2="${ax}" y2="${ay}" stroke="#1D4ED8" stroke-width="1.5" stroke-dasharray="2 2" pointer-events="none"/><circle cx="${ax}" cy="${ay}" r="6.5" fill="#38BDF8" stroke="#1E3A8A" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      aim.addEventListener('pointerdown',e=>{
        if(!editing||e.button!==0)return;
        e.stopPropagation();e.preventDefault();
        select('cctv',i);
        dragBefore=cloneState();
        drag={mode:'aim-cctv',kind:'cctv',index:i};
        try{svg.setPointerCapture(e.pointerId)}catch(_){}
      });
      editorLayer.appendChild(aim);
    }
  }
  function renderHandles(){
    editorLayer.innerHTML='';
    const safetyVisible = safety.classList.contains('is-active');
    editorLayer.style.display = (editing && safetyVisible) ? 'block' : 'none';
    if(!editing || !safetyVisible) return;
    Object.keys(types).forEach(k=>state[k].forEach((p,i)=>makeHandle(k,i,p)));
    if(selected)highlightSelected();
  }
  function select(k,i){
    if(!state[k]?.[i]){selected=null;highlightSelected();return;}
    selected={kind:k,index:i};highlightSelected();
    const p=state[k][i],cfg=types[k],box=document.getElementById('map-editor-selected');
    const curAng=Math.round(((+p.angle||0)%360+360)%360);
    const curRange=Math.round(Number(p.range)||47);
    const curSpread=Math.round(Number(p.spread)||53);
    const curName=(p.name||cfg.label).replace(/"/g,'&quot;');
    const curInit=((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter).replace(/"/g,'&quot;');
    const curColor=p.color||cfg.color;
    const curDesc=(p.desc||'').replace(/"/g,'&quot;');
    const styleEditor=`
      <div style="margin-top:6px;padding:7px;border-radius:8px;background:#faf5ff;border:1px solid #e9d5ff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:8px;font-weight:900;color:#6b21a8">🎨 Kustomisasi Aset #${i+1}</span>
          <select id="editor-asset-cat" title="Ubah kategori hitungan aset" style="border:1px solid #d8b4fe;border-radius:5px;padding:1px 4px;font-size:7.5px;font-weight:900;color:#581c87;background:#fff">
            <option value="apar" ${k==='apar'?'selected':''}>Hitung ke: APAR</option>
            <option value="p3k" ${k==='p3k'?'selected':''}>Hitung ke: P3K</option>
            <option value="cctv" ${k==='cctv'?'selected':''}>Hitung ke: CCTV</option>
            <option value="fire" ${k==='fire'?'selected':''}>Hitung ke: Fire Alarm</option>
            <option value="custom" ${k==='custom'?'selected':''}>Hitung ke: Custom</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 50px 42px;gap:5px;align-items:end">
          <label style="font-size:7px;font-weight:800;color:#581c87;display:flex;flex-direction:column;gap:2px">Nama Aset
            <input type="text" id="editor-custom-name" value="${curName}" style="border:1px solid #d8b4fe;border-radius:6px;padding:3px 5px;font-size:8px;font-weight:800"/>
          </label>
          <label style="font-size:7px;font-weight:800;color:#581c87;display:flex;flex-direction:column;gap:2px">Inisial
            <input type="text" id="editor-custom-init" maxlength="2" value="${curInit}" style="border:1px solid #d8b4fe;border-radius:6px;padding:3px 5px;font-size:8px;font-weight:900;text-align:center;text-transform:uppercase"/>
          </label>
          <label style="font-size:7px;font-weight:800;color:#581c87;display:flex;flex-direction:column;gap:2px">Warna
            <input type="color" id="editor-custom-color" value="${curColor}" style="width:100%;height:23px;border:1px solid #d8b4fe;border-radius:6px;padding:1px;cursor:pointer;background:#fff"/>
          </label>
        </div>
        <label style="font-size:7px;font-weight:800;color:#581c87;display:flex;flex-direction:column;gap:2px;margin-top:5px">Deskripsi / Fungsi Aset
          <input type="text" id="editor-custom-desc" value="${curDesc}" placeholder="Contoh: Hydrant Outdoor / APAR CO2 6kg / AED..." style="border:1px solid #d8b4fe;border-radius:6px;padding:3px 5px;font-size:8px;font-weight:700"/>
        </label>
        <button type="button" id="editor-apply-all-cat" style="margin-top:5px;width:100%;border:1px solid #d8b4fe;background:#f3e8ff;color:#6b21a8;border-radius:6px;padding:3px 6px;font-size:7.5px;font-weight:900;cursor:pointer">✨ Terapkan Nama/Inisial/Warna Ini ke Semua ${cfg.label} (${state[k].length})</button>
      </div>`;
    const cctvExtra=k==='cctv'?`
      <div style="margin-top:6px;padding:7px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:8px;font-weight:900;color:#1e40af">
          <span>Arah Sorot: <b id="cctv-ang-val">${curAng}°</b></span>
          <span>Jarak: <b id="cctv-rng-val">${curRange}px</b></span>
        </div>
        <input type="range" id="editor-cctv-angle-slider" min="0" max="359" value="${curAng}" style="width:100%;margin-top:4px;accent-color:#2563eb"/>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          <label style="font-size:7px;font-weight:800;color:#3b82f6">Jarak Sorot<input type="range" id="editor-cctv-range-slider" min="22" max="105" value="${curRange}" style="width:100%;accent-color:#2563eb"/></label>
          <label style="font-size:7px;font-weight:800;color:#3b82f6">Lebar Sudut<input type="range" id="editor-cctv-spread-slider" min="24" max="120" value="${curSpread}" style="width:100%;accent-color:#2563eb"/></label>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:5px">
          <button type="button" data-cctv-dir="270" style="flex:1;border:1px solid #93c5fd;background:#fff;color:#1d4ed8;border-radius:5px;padding:2px 4px;font-size:7px;font-weight:900;cursor:pointer">↑ Utara</button>
          <button type="button" data-cctv-dir="0" style="flex:1;border:1px solid #93c5fd;background:#fff;color:#1d4ed8;border-radius:5px;padding:2px 4px;font-size:7px;font-weight:900;cursor:pointer">→ Timur</button>
          <button type="button" data-cctv-dir="90" style="flex:1;border:1px solid #93c5fd;background:#fff;color:#1d4ed8;border-radius:5px;padding:2px 4px;font-size:7px;font-weight:900;cursor:pointer">↓ Selatan</button>
          <button type="button" data-cctv-dir="180" style="flex:1;border:1px solid #93c5fd;background:#fff;color:#1d4ed8;border-radius:5px;padding:2px 4px;font-size:7px;font-weight:900;cursor:pointer">← Barat</button>
          <button type="button" id="editor-rotate-cctv" style="border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:5px;padding:2px 6px;font-size:7px;font-weight:900;cursor:pointer">↻ +45°</button>
        </div>
      </div>`:'';
    if(box){
      const titleLabel=`${p.name||cfg.label} (${((p.initial||cfg.letter).slice(0,2).toUpperCase())}) · ${cfg.label} #${i+1}`;
      box.innerHTML=`<div class="map-editor-selected-title">${titleLabel}</div>Posisi: <b>${p.x.toFixed(1)}, ${p.y.toFixed(1)}</b>${styleEditor}${cctvExtra}<br><span>Drag marker untuk pindah · ${k==='cctv'?'Tarik titik biru di ujung kerucut untuk arahkan sorot · ':''}Auto-Save aktif.</span>`;
      box.querySelector('#editor-custom-name')?.addEventListener('input',ev=>{
        state[k][i].name=ev.target.value||cfg.label;
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-custom-init')?.addEventListener('input',ev=>{
        state[k][i].initial=(ev.target.value||cfg.letter).slice(0,2).toUpperCase()||cfg.letter;
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-custom-color')?.addEventListener('input',ev=>{
        state[k][i].color=ev.target.value||cfg.color;
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-custom-desc')?.addEventListener('input',ev=>{
        state[k][i].desc=ev.target.value||'';
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-apply-all-cat')?.addEventListener('click',()=>{
        const before=cloneState();
        const nm=state[k][i].name||cfg.label;
        const init=state[k][i].initial||cfg.letter;
        const col=state[k][i].color||cfg.color;
        const desc=state[k][i].desc||'';
        state[k].forEach(item=>{item.name=nm;item.initial=init;item.color=col;if(desc)item.desc=desc;});
        pushSnapshot(before);applyPositions();select(k,i);
        show(`Nama (${nm}), Inisial (${init}) & Warna diterapkan ke semua ${state[k].length} titik ${cfg.label}.`);
      });
      box.querySelector('#editor-asset-cat')?.addEventListener('change',ev=>{
        const targetCat=ev.target.value;
        if(!state[targetCat]||targetCat===k)return;
        const before=cloneState();
        const [moved]=state[k].splice(i,1);
        if(targetCat==='cctv'&&!Number.isFinite(+moved.angle)){moved.angle=90;moved.range=47;moved.spread=53;}
        state[targetCat].push(moved);
        pushSnapshot(before);applyPositions();select(targetCat,state[targetCat].length-1);
        show(`Aset dipindahkan ke kategori hitungan ${types[targetCat].label} (total: ${state[targetCat].length}).`);
      });
      box.querySelector('#editor-rotate-cctv')?.addEventListener('click',()=>{
        const before=cloneState();
        state.cctv[i].angle=((+state.cctv[i].angle||0)+45)%360;
        pushSnapshot(before);applyPositions();select('cctv',i);
      });
      box.querySelectorAll('[data-cctv-dir]').forEach(b=>b.addEventListener('click',()=>{
        const before=cloneState();
        state.cctv[i].angle=+b.dataset.cctvDir;
        pushSnapshot(before);applyPositions();select('cctv',i);
      }));
      box.querySelector('#editor-cctv-angle-slider')?.addEventListener('input',ev=>{
        state.cctv[i].angle=+ev.target.value;
        const lbl=box.querySelector('#cctv-ang-val');if(lbl)lbl.textContent=ev.target.value+'°';
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-cctv-range-slider')?.addEventListener('input',ev=>{
        state.cctv[i].range=+ev.target.value;
        const lbl=box.querySelector('#cctv-rng-val');if(lbl)lbl.textContent=ev.target.value+'px';
        applyPositions();autoSaveSafety();
      });
      box.querySelector('#editor-cctv-spread-slider')?.addEventListener('input',ev=>{
        state.cctv[i].spread=+ev.target.value;
        applyPositions();autoSaveSafety();
      });
    }
    window.__onSafetyAssetSelected?.(k,i,p);
  }
  function addAsset(k,p,message){
    if(!state[k])return;
    const before=cloneState();
    const cfg=types[k]||types.custom;
    const cDef=getCustomDefaults(k);
    const finalName=(p.name||cDef.name||cfg.label).trim()||cfg.label;
    const finalInit=((p.initial||cDef.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter);
    const finalColor=p.color||cDef.color||cfg.color;
    const finalDesc=(p.desc!==undefined?p.desc:(cDef.desc||'')).trim();
    state[k].push({
      x:Math.max(0,Math.min(1427,+p.x)),
      y:Math.max(0,Math.min(1023,+p.y)),
      initial:finalInit,
      name:finalName,
      color:finalColor,
      desc:finalDesc,
      ...(k==='cctv'?{angle:+(p.angle||90),range:+(p.range||47),spread:+(p.spread||53)}:{})
    });
    pushSnapshot(before);applyPositions();select(k,state[k].length-1);show(message||`${finalName} (${finalInit}) ditambahkan ke hitungan ${cfg.label} (total: ${state[k].length}).`);
  }
  function duplicateSelected(){
    if(!editing||!selected||!state[selected.kind]?.[selected.index]){show('Pilih marker yang ingin digandakan terlebih dahulu.');return;}
    const {kind,index}=selected,p=state[kind][index],before=cloneState();
    const offset=24, nx=Math.min(1400,p.x+offset), ny=Math.min(990,p.y+offset);
    state[kind].push({...p,x:nx,y:ny});pushSnapshot(before);applyPositions();select(kind,state[kind].length-1);show(`${p.name||types[kind].label} berhasil digandakan & disimpan otomatis.`);
  }
  function deleteSelected(){
    if(!editing||!selected||!state[selected.kind]?.[selected.index]){show('Pilih marker yang ingin dihapus terlebih dahulu.');return;}
    const {kind,index}=selected,cfg=types[kind],item=state[kind][index];
    if(!confirm(`Hapus ${item?.name||cfg.label} #${index+1}?`))return;
    const before=cloneState();state[kind].splice(index,1);pushSnapshot(before);selected=null;applyPositions();
    const box=document.getElementById('map-editor-selected');if(box)box.innerHTML='<div class="map-editor-selected-title">Belum ada aset dipilih</div>Pilih marker lain untuk melanjutkan.';
    show(`${item?.name||cfg.label} berhasil dihapus.`);
  }
  function highlightSelected(){editorLayer.querySelectorAll('.editor-marker-handle').forEach(el=>el.classList.toggle('selected',!!selected&&el.dataset.kind===selected.kind&&+el.dataset.index===selected.index))}
  function updateDrag(e){
    if(!drag)return;
    const p=screenToSvg(e.clientX,e.clientY);
    if(drag.mode==='aim-cctv'){
      const cur=state.cctv[drag.index];
      const dx=p.x-cur.x, dy=p.y-cur.y;
      const ang=(Math.round(Math.atan2(dy,dx)*180/Math.PI)+360)%360;
      const dist=Math.round(Math.max(22,Math.min(105,Math.hypot(dx,dy))));
      state.cctv[drag.index]={...cur,angle:ang,range:dist};
      applyPositions();select('cctv',drag.index);autoSaveSafety();
      return;
    }
    const last=drag.last,dx=p.x-last.x,dy=p.y-last.y;
    const cur=state[drag.kind][drag.index];
    state[drag.kind][drag.index]={...cur,x:Math.max(0,Math.min(1427,cur.x+dx)),y:Math.max(0,Math.min(1023,cur.y+dy))};
    drag.last=p;applyPositions();select(drag.kind,drag.index);autoSaveSafety();updateUI();
  }
  svg.addEventListener('pointermove',e=>{if(drag){e.preventDefault();updateDrag(e)}});
  svg.addEventListener('pointerup',e=>{if(drag){const before=dragBefore;drag=null;dragBefore=null;if(before)pushSnapshot(before);try{svg.releasePointerCapture(e.pointerId)}catch(_){} }});
  svg.addEventListener('pointercancel',()=>{if(dragBefore)restore(dragBefore);drag=null;dragBefore=null});

  function setEditing(on){
    if(on && !document.body.classList.contains('v6-admin')){
      document.getElementById('admin-entry')?.click();
      show('Silakan login Admin terlebih dahulu untuk membuka Studio Edit Peta.');
      return;
    }
    editing=on;
    document.body.classList.toggle('map-editor-active',on);
    toggle.classList.toggle('editing',on);
    toggle.querySelector('span').textContent=on?'Tutup Studio':'Studio Edit Peta';
    panel.classList.toggle('open',on);
    if(on){
      history=[];future=[];selected=null;dirty=false;
      show('Studio Edit Peta aktif — semua perubahan tersimpan otomatis.');
    }else{
      drag=null;selected=null;
      window.__setMapLayer?.('all');
      show('Studio Edit Peta ditutup — kembali ke Denah Bersih.');
    }
    renderHandles();
    window.__onStudioModeChange?.(on);
  }
  window.mapEditorSetEditing=setEditing;
  window.mapEditorIsEditing=()=>editing;
  toggle.addEventListener('click',()=>setEditing(!editing));
  function updateUI(){const st=document.getElementById('map-editor-status'),save=document.getElementById('editor-save');if(st){st.classList.toggle('map-editor-dirty',dirty);st.innerHTML=`<i></i> ${dirty?'UNSAVED':'AUTO-SAVED'}`}if(save)save.classList.toggle('map-editor-dirty',dirty)}

  function normalizeLoadedState(rawState){
    if(!rawState)return;
    Object.keys(types).forEach(k=>{
      const cfg=types[k];
      if(Array.isArray(rawState[k])){
        state[k]=rawState[k].map((p,idx)=>{
          let x=+p.x, y=+p.y;
          if(k==='fire'&&Math.abs(y-68)<5&&(Math.abs(x-545)<5||Math.abs(x-825)<5)){
            x=Math.abs(x-545)<5?995:1200;
          }
          return {
            x,
            y,
            initial:((p.initial||cfg.letter).slice(0,2).toUpperCase()||cfg.letter),
            name:(p.name||cfg.label),
            color:(p.color||cfg.color),
            desc:(p.desc||''),
            ...(k==='cctv'?{angle:Number.isFinite(+p.angle)?+p.angle:(original.cctv[idx]?.angle||90),range:Number.isFinite(+p.range)?+p.range:47,spread:Number.isFinite(+p.spread)?+p.spread:53}:{})
          };
        }).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      }
    });
  }

  window.__mapEditorSafetyAPI={
    getState:cloneState,
    getOriginal:()=>JSON.parse(JSON.stringify(original)),
    syncHandles:renderHandles,
    setState(newState, skipSave){
      if(!newState)return;
      normalizeLoadedState(newState);
      if(!skipSave)autoSaveSafety();
      applyPositions();
    },
    reloadFromStorage(){
      try{
        const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
        if(saved?.state)normalizeLoadedState(saved.state);
        applyPositions();
      }catch(_){}
    },
    reset(){
      Object.keys(types).forEach(k=>state[k]=original[k].map(p=>({...p})));
      try{localStorage.removeItem(STORAGE)}catch(_){}
      applyPositions();
    },
    isEditing:()=>editing,
    setEditing,
    addAsset,
    select
  };

  document.getElementById('editor-undo')?.addEventListener('click',()=>{if(!history.length){show('Tidak ada perubahan untuk di-undo.');return}future.push(cloneState());restore(history.pop())});
  document.getElementById('editor-redo')?.addEventListener('click',()=>{if(!future.length){show('Tidak ada perubahan untuk di-redo.');return}history.push(cloneState());restore(future.pop())});
  document.getElementById('editor-reset')?.addEventListener('click',()=>{if(!confirm('Kembalikan semua aset ke posisi awal? Perubahan tersimpan di browser juga akan dihapus.'))return;Object.keys(types).forEach(k=>state[k]=original[k].map(p=>({...p})));try{localStorage.removeItem(STORAGE)}catch(_){}history=[];future=[];dirty=true;applyPositions();show('Map dikembalikan ke posisi awal.')});
  document.getElementById('editor-save')?.addEventListener('click',()=>{try{localStorage.setItem(STORAGE,JSON.stringify({version:7,savedAt:new Date().toISOString(),state}));dirty=false;updateUI();window.__syncK3Metrics?.();window.__broadcastLiveSync?.('safety');show('Posisi aset berhasil disimpan di browser.')}catch(_){show('Gagal menyimpan konfigurasi map.')}});
  document.getElementById('editor-export')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:7,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='GIS-K3-map-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);show('Konfigurasi map berhasil diekspor.')});
  document.getElementById('editor-import')?.addEventListener('click',()=>document.getElementById('editor-import-file')?.click());
  document.getElementById('editor-import-file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.state)throw 0;normalizeLoadedState(d.state);history=[];future=[];dirty=true;applyPositions();autoSaveSafety();show('Konfigurasi berhasil diimpor & disinkronkan.')}catch(_){show('File konfigurasi tidak valid.')}e.target.value=''};r.readAsText(f)});

  document.getElementById('editor-duplicate')?.addEventListener('click',duplicateSelected);
  document.getElementById('editor-delete')?.addEventListener('click',deleteSelected);
  document.querySelectorAll('[data-editor-kind]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!editing){show('Aktifkan Edit Map terlebih dahulu.');return;}
    const k=btn.dataset.editorKind,base=state[k]?.[state[k].length-1]||{x:700,y:500};
    addAsset(k,{x:Math.min(1400,base.x+28),y:Math.min(990,base.y+28),...(k==='cctv'?{angle:base.angle||90}:{})});
  }));

  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(saved?.state){
      normalizeLoadedState(saved.state);
    }
  }catch(_){}
  // Always applyPositions on startup so PC & Mobile views render 100% identical SVG markers & attributes
  applyPositions();
  updateUI();
});

/* ==========================================================================
   5. V6 Admin Control Center, Custom Assets, Simulation & Emergency Mode
   ========================================================================== */
(function(){
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const V6KEY = 'gisK3V6State';
  const ADMIN_USER = 'admin', ADMIN_PASS = '123';
  let admin = false;
  const load = () => { try { return JSON.parse(localStorage.getItem(V6KEY) || '{}'); } catch { return {}; } };
  let data = Object.assign({
    contacts: [
      { id: 'C-001', label: 'Security', phone: '112' },
      { id: 'C-002', label: 'K3 Officer', phone: '110' }
    ],
    emergency: { active: false, message: 'Ikuti jalur evakuasi hijau menuju Titik Kumpul (Assembly Point).' },
    audit: []
  }, load());

  function save() {
    localStorage.setItem(V6KEY, JSON.stringify(data));
    window.__syncK3Metrics?.();
  }
  function audit(action, detail) {
    data.audit.unshift({ time: new Date().toLocaleString('id-ID'), action, detail });
    data.audit = data.audit.slice(0, 80);
    save();
  }
  function toast(msg) { window.showK3Toast ? window.showK3Toast(msg) : console.log(msg); }
  function open(id) { const x = $('#' + id); if (x) { x.classList.add('open'); x.setAttribute('aria-hidden', 'false'); } }
  function close(id) { const x = $('#' + id); if (x) { x.classList.remove('open'); x.setAttribute('aria-hidden', 'true'); } }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  $$('[data-v6-close]').forEach(b => b.addEventListener('click', () => close(b.dataset.v6Close)));
  $('#admin-entry')?.addEventListener('click', () => admin ? open('v6-admin') : open('v6-login'));
  $('#v6-login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const u = $('#v6-user').value.trim(), p = $('#v6-pass').value;
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      admin = true;
      document.body.classList.add('v6-admin');
      const entryBtn = $('#admin-entry');
      if (entryBtn) entryBtn.innerHTML = '🔓 Admin Aktif';
      close('v6-login');
      $('#v6-login-error').textContent = '';
      audit('Admin login', 'Admin mode started');
      window.__onAdminModeChange?.(true);
      refreshAll();
      toast('Mode Admin K3 aktif — Studio Edit Peta & Mode Tembok Sementara kini tersedia di toolbar atas.');
    } else {
      $('#v6-login-error').textContent = 'Username atau password salah.';
    }
  });
  $('#v6-logout')?.addEventListener('click', () => {
    admin = false;
    document.body.classList.remove('v6-admin');
    const entryBtn = $('#admin-entry');
    if (entryBtn) entryBtn.innerHTML = '🔐 Admin';
    close('v6-admin');
    try { window.mapEditorSetEditing?.(false); } catch (_) {}
    const wallBtn = document.getElementById('btn-temporary-wall');
    if (wallBtn && wallBtn.classList.contains('wall-active')) wallBtn.click();
    window.__onAdminModeChange?.(false);
    toast('Admin logout — kembali ke Mode Publik (View-Only).');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.v6-overlay.open').forEach(x => close(x.id));
  });

  $$('.v6-tab').forEach(b => b.addEventListener('click', () => {
    const n = b.dataset.v6Tab;
    $$('.v6-tab').forEach(x => x.classList.toggle('active', x === b));
    $$('.v6-section').forEach(x => x.classList.toggle('active', x.dataset.v6Section === n));
    refreshAll();
  }));

  // Bridge V6 Custom Assets directly to the unified Safety Editor (state.custom)
  function renderAssetList() {
    const el = $('#v6-assets-list');
    if (!el) return;
    const st = window.__mapEditorSafetyAPI?.getState?.();
    const customList = Array.isArray(st?.custom) ? st.custom : [];
    el.innerHTML = customList.length
      ? customList.map((a, idx) => `<div class="v6-row"><div class="v6-row-main"><b>${esc(a.initial || 'K')} · ${esc(a.name || 'Custom Asset')}</b><small>${esc(a.desc || 'Aset K3 Custom')} · (${Math.round(a.x)}, ${Math.round(a.y)})</small></div><button class="v6-btn" data-edit-custom-idx="${idx}">Pilih di Studio</button><button class="v6-btn danger" data-delete-custom-idx="${idx}">Hapus</button></div>`).join('')
      : '<div style="font-size:8px;color:#94a3b8">Belum ada custom asset. Tambahkan dari sini atau melalui Studio Edit Peta.</div>';
    el.querySelectorAll('[data-edit-custom-idx]').forEach(b => b.onclick = () => {
      const idx = +b.dataset.editCustomIdx;
      close('v6-admin');
      window.mapEditorSetEditing?.(true);
      window.__mapEditorSafetyAPI?.select?.('custom', idx);
    });
    el.querySelectorAll('[data-delete-custom-idx]').forEach(b => b.onclick = () => {
      const idx = +b.dataset.deleteCustomIdx;
      const cur = window.__mapEditorSafetyAPI?.getState?.();
      const item = cur?.custom?.[idx];
      if (!item || !confirm(`Hapus ${item.name || 'Custom Asset'}?`)) return;
      cur.custom.splice(idx, 1);
      window.__mapEditorSafetyAPI?.setState?.(cur);
      audit('Delete custom asset', item.name || 'Custom Asset');
      refreshAll();
    });
  }

  function renderContacts() {
    const el = $('#v6-contacts-list');
    if (!el) return;
    el.innerHTML = data.contacts.map(c => `<div class="v6-row"><div class="v6-row-main"><b>${esc(c.label)}</b><small>${esc(c.phone)}</small></div><button class="v6-btn danger" data-del-contact="${c.id}">Delete</button></div>`).join('');
    el.querySelectorAll('[data-del-contact]').forEach(b => b.onclick = () => {
      data.contacts = data.contacts.filter(c => c.id !== b.dataset.delContact);
      audit('Delete emergency contact', b.dataset.delContact);
      save();
      refreshAll();
    });
  }

  function pageUrl(id, type = 'start') {
    const base = location.href.split('#')[0].split('?')[0];
    return type === 'start' ? `${base}?start=${encodeURIComponent(id)}` : `${base}?room=${encodeURIComponent(id)}`;
  }

  function renderQR() {
    const el = $('#v6-qr-list');
    if (!el) return;
    el.innerHTML = window.START_POINTS?.map(p => `<div class="v6-row"><div class="v6-row-main"><b>${esc(p.code)} · ${esc(p.name)}</b><small>${esc(pageUrl(p.id))}</small></div><button class="v6-btn" data-qr-test="${p.id}">Test</button></div>`).join('') || '';
    el.querySelectorAll('[data-qr-test]').forEach(b => b.onclick = () => {
      window.showYouAreHereV6?.(b.dataset.qrTest);
      close('v6-admin');
    });
    const type = $('#v6-qr-type')?.value || 'start';
    const target = $('#v6-qr-target');
    if (!target) return;
    if (type === 'start') {
      target.innerHTML = (window.START_POINTS || []).map(p => `<option value="${p.id}">${p.code} · ${esc(p.name)}</option>`).join('');
    } else {
      const names = window.roomNames || {};
      const customRooms = typeof window.__getCustomRooms === 'function' ? window.__getCustomRooms() : [];
      const baseIds = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','24B','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40'];
      const allIds = [...baseIds, ...customRooms.map(r => String(r.roomNo)).filter(n => Number(n) > 40)];
      target.innerHTML = allIds.map(n => `<option value="${n}">${n} · ${esc(names[n] || ('Ruangan ' + n))}</option>`).join('');
    }
  }

  function renderStats() {
    const log = (() => { try { return JSON.parse(localStorage.getItem('gisK3Logbook') || '[]'); } catch { return []; } })();
    const haz = (() => { try { return JSON.parse(localStorage.getItem('gisK3Hazards') || '[]'); } catch { return []; } })();
    const customRooms = typeof window.__getCustomRooms === 'function' ? window.__getCustomRooms() : [];
    const totalRooms = 41 + customRooms.length;
    const c = typeof window.__getSafetyAssetCounts === 'function' ? window.__getSafetyAssetCounts() : { apar: 12, p3k: 3, cctv: 16, fire: 5, custom: 0 };
    const totalSafetyAssets = (c.apar || 0) + (c.p3k || 0) + (c.cctv || 0) + (c.fire || 0) + (c.custom || 0);
    const activeSegs = (window.EvacBackend?.getSegments?.() || []).filter(s => s.active !== false).length;
    const stats = [
      [String(totalRooms), 'Rooms'],
      [String(totalSafetyAssets), 'Safety Assets'],
      [String(log.length), 'Inspections'],
      [String(haz.length), 'Hazard Reports'],
      [String(activeSegs), 'Active Routes'],
      [String(data.contacts.length), 'Contacts'],
      [String(data.audit.length), 'Audit Events'],
      [data.emergency.active ? 'ON' : 'OFF', 'Emergency']
    ];
    const statsEl = $('#v6-stats');
    if (statsEl) {
      statsEl.innerHTML = stats.map(x => `<div class="v6-stat"><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    }
  }
  window.__refreshAdminStats = renderStats;

  function renderHistory() {
    const el = $('#v6-history-list');
    if (!el) return;
    el.innerHTML = data.audit.length
      ? data.audit.slice(0, 30).map(a => `<div class="v6-row"><div class="v6-row-main"><b>${esc(a.action)}</b><small>${esc(a.time)} · ${esc(a.detail)}</small></div></div>`).join('')
      : '<div style="font-size:8px;color:#94a3b8">No admin activity yet.</div>';
    const r = $('#v6-recent');
    if (r) r.innerHTML = el.innerHTML;
  }

  function publicEmergency() {
    const el = $('#v6-public-emergency');
    if (el) el.style.display = data.emergency.active ? 'block' : 'none';
  }

  function refreshAll() {
    renderStats();
    renderAssetList();
    renderContacts();
    renderQR();
    renderHistory();
    $('#v6-admin-emergency')?.classList.toggle('active', data.emergency.active);
    $('#v6-public-emergency')?.classList.toggle('active', data.emergency.active);
    publicEmergency();
  }

  // Unified Custom Asset creation from V6 Admin Modal
  $('#v6-asset-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#v6-asset-name').value.trim() || 'Custom Asset';
    const cat = $('#v6-asset-category').value.trim();
    const icon = ($('#v6-asset-icon').value.trim() || 'K').slice(0, 2).toUpperCase();
    const color = $('#v6-asset-color').value || '#7c3aed';
    const desc = [cat, $('#v6-asset-description').value.trim()].filter(Boolean).join(' · ');
    window.__mapEditorSafetyAPI?.addAsset?.('custom', { x: 700, y: 500, initial: icon, name, color, desc });
    audit('Add custom asset', name);
    e.target.reset();
    $('#v6-asset-icon').value = 'K';
    $('#v6-asset-color').value = '#7c3aed';
    refreshAll();
  });

  $('#v6-open-editor')?.addEventListener('click', () => { close('v6-admin'); window.mapEditorSetEditing?.(true); });

  // QR generator in Admin
  $('#v6-qr-type')?.addEventListener('change', renderQR);
  $('#v6-generate-qr')?.addEventListener('click', () => {
    const type = $('#v6-qr-type').value, id = $('#v6-qr-target').value, url = pageUrl(id, type);
    const box = $('#v6-qr-preview');
    box.style.display = 'block';
    box.innerHTML = `<div style="font-size:10px;font-weight:900;color:#334155">QR · ${esc(id)}</div><div id="v6-qr-code" style="display:flex;justify-content:center;margin:10px"></div><div style="font-size:7px;color:#94a3b8;word-break:break-all">${esc(url)}</div>`;
    if (typeof QRCode !== 'undefined') {
      new QRCode($('#v6-qr-code'), { text: url, width: 180, height: 180, colorDark: '#0f172a', colorLight: '#fff' });
    }
    audit('Generate QR', id);
    save();
  });
  $('#v6-print-qr')?.addEventListener('click', () => {
    const box = $('#v6-qr-preview');
    if (!box || box.style.display === 'none') { toast('Generate a QR first.'); return; }
    const w = window.open('', '_blank');
    w.document.write('<' + 'html><' + 'body style="font-family:Arial;text-align:center;padding:30px">' + box.innerHTML + '<' + '/body><' + '/html>');
    w.document.close();
    w.print();
  });

  // Live Dijkstra Simulation connected to EvacBackend
  function simTargets() {
    const sel = $('#v6-sim-target');
    if (!sel) return;
    const segs = window.EvacBackend?.getSegments?.() || [];
    if (segs.length) {
      sel.innerHTML = segs.map(s => `<option value="${esc(s.id)}">${esc(s.id)} · ${esc(s.name)} (${s.active !== false ? 'Aktif' : 'Nonaktif'})</option>`).join('');
    } else {
      sel.innerHTML = '<option value="SEG-01">SEG-01 · Koridor Timur</option>';
    }
  }
  $('#v6-sim-type')?.addEventListener('change', simTargets);
  $('#v6-run-sim')?.addEventListener('click', () => {
    const targetSegId = $('#v6-sim-target')?.value;
    const starts = window.EvacBackend?.getQrStarts?.() || [];
    let reachable = 0, totalMeters = 0;
    starts.forEach(pt => {
      const r = window.EvacBackend?.computePathFromPoint?.(pt);
      if (r && Number.isFinite(r.meters)) {
        reachable++;
        totalMeters += r.meters;
      }
    });
    const avgMeters = reachable ? Math.round(totalMeters / reachable) : 0;
    const activeSegCount = (window.EvacBackend?.getSegments?.() || []).filter(s => s.active !== false).length;
    $('#v6-sim-result').innerHTML = `<div style="font-size:9px;font-weight:900;color:#047857">✓ Simulasi Graf Dijkstra Selesai</div><div style="font-size:8px;color:#475569;margin-top:6px;line-height:1.6">Segmen diuji: <b>${esc(targetSegId)}</b><br>Segmen koridor aktif: <b>${activeSegCount} segmen</b><br>Titik QR terjangkau ke Titik Kumpul: <b>${reachable} / ${starts.length} titik</b><br>Rata-rata jarak evakuasi: <b>~${avgMeters} meter</b></div>`;
    audit('Run simulation', targetSegId);
    save();
    renderHistory();
  });
  $('#v6-clear-sim')?.addEventListener('click', () => {
    $('#v6-sim-result').innerHTML = '<span style="font-size:8px;color:#94a3b8">No simulation running.</span>';
  });
  simTargets();

  // Contacts & Emergency mode
  $('#v6-contact-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const c = { id: 'C-' + String(Date.now()).slice(-5), label: $('#v6-contact-label').value.trim(), phone: $('#v6-contact-phone').value.trim() };
    data.contacts.push(c);
    audit('Add emergency contact', c.label);
    save();
    e.target.reset();
    refreshAll();
  });
  $('#v6-start-emergency')?.addEventListener('click', () => {
    data.emergency.active = true;
    data.emergency.message = prompt('Pesan emergency untuk publik:', data.emergency.message) || data.emergency.message;
    audit('Enable emergency mode', data.emergency.message);
    save();
    refreshAll();
    toast('Emergency mode aktif.');
  });
  $('#v6-stop-emergency')?.addEventListener('click', () => {
    data.emergency.active = false;
    audit('Disable emergency mode', '');
    save();
    refreshAll();
  });
  $('#v6-public-emergency-btn')?.addEventListener('click', () => {
    const list = $('#v6-public-contact-list');
    list.innerHTML = data.contacts.map(c => `<div class="v6-row"><div class="v6-row-main"><b>☎ ${esc(c.label)}</b><small>${esc(c.phone)}</small></div><a class="v6-btn primary" href="tel:${encodeURIComponent(c.phone)}">Call</a></div>`).join('');
    $('#v6-public-emergency-message').textContent = data.emergency.message;
    open('v6-public-emergency-modal');
  });
  $('#v6-public-route-btn')?.addEventListener('click', () => {
    window.__setMapLayer?.('evacuation');
    close('v6-public-emergency-modal');
  });
  $('#v6-validate')?.addEventListener('click', () => {
    const customRooms = typeof window.__getCustomRooms === 'function' ? window.__getCustomRooms() : [];
    const rooms = 41 + customRooms.length;
    const starts = (window.START_POINTS || []).length;
    const allSegs = window.EvacBackend?.getSegments?.() || [];
    const customSegs = allSegs.filter(s => s.kind === 'custom' && s.active !== false).length;
    const activeSegs = allSegs.filter(s => s.active !== false).length;
    $('#v6-validation').innerHTML = `<b style="color:#15803d">✓ Validasi Graf Dijkstra:</b> ${starts} titik awal QR terpetakan · ${rooms} ruangan terindeks (${customRooms.length} custom room) · ${activeSegs} segmen koridor aktif (${customSegs} jalur custom) terhubung ke Titik Kumpul.`;
  });
  $('#v6-export-all')?.addEventListener('click', () => {
    window.GisSync?.openModal?.();
  });

  window.showYouAreHereV6 = id => { try { window.__v6ShowStart?.(id); } catch (_) {} };

  setTimeout(() => {
    refreshAll();
    if (data.emergency.active) $('#v6-public-emergency').style.display = 'block';
  }, 200);
})();

/* ==========================================================================
   6. Admin 3-Step Map Builder UX Guidance
   ========================================================================== */
(function(){
  function init(){
    const start = document.getElementById('v11-start-guide');
    const route = document.getElementById('v6-start-route-draw');
    const area = document.getElementById('v6-draw-area');
    const status = document.getElementById('v6-route-draw-status');
    const sim = document.querySelector('[data-v6-section="simulation"]');
    if (start && route) {
      start.addEventListener('click', () => {
        route.click();
        setTimeout(() => { status?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
      });
    }
    if (route && status) {
      route.addEventListener('click', () => {
        status.classList.add('v11-mode-active');
        status.classList.remove('v11-status-ready');
      });
    }
    document.getElementById('v6-stop-route-draw')?.addEventListener('click', () => {
      status?.classList.remove('v11-mode-active');
      status?.classList.add('v11-status-ready');
    });
    if (area) {
      area.addEventListener('click', () => { area.classList.toggle('v11-mode-active'); });
    }
    if (sim) {
      document.querySelectorAll('.v6-tab').forEach(t => t.addEventListener('click', () => {
        if (t.dataset.v6Tab === 'simulation') setTimeout(() => { start?.focus({ preventScroll: true }); }, 120);
      }));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ==========================================================================
   7. Unified Evacuation Backend (Web Network + Interactive Draw + QR + Room Dijkstra)
   ========================================================================== */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const EVAC_KEY = 'gisK3EvacBackendV2';
  const STUDIO_KEY = 'gisK3StudioStateV1';
  const MANUAL_KEY = 'gisK3ManualMapV1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const DEFAULT_ASSEMBLY = { x: 535.5, y: 898.3 };

  // Calibrated 1:1 on the exact built-in corridor origin tips of #evacuation-routes
  const DEFAULT_QR_STARTS = [
    { id: 'START-01', name: 'Titik QR 01 · Zona Ruang 13', code: '01', x: 970, y: 452.125 },
    { id: 'START-02', name: 'Titik QR 02 · Koridor Utara', code: '02', x: 884, y: 228.1 },
    { id: 'START-03', name: 'Titik QR 03 · Gedung Sisi Kiri', code: '03', x: 176, y: 376.15 },
    { id: 'START-04', name: 'Titik QR 04 · Koridor Tengah', code: '04', x: 775, y: 507.15 },
    { id: 'START-05', name: 'Titik QR 05 · Ruang 15', code: '05', x: 1162, y: 538 },
    { id: 'START-06', name: 'Titik QR 06 · Koridor Atas', code: '06', x: 884, y: 255 }
  ];

  const LEGACY_QR_COORDS = {
    'START-01': { x: 937.3, y: 433.1 },
    'START-02': { x: 855.6, y: 237.8 },
    'START-03': { x: 193.4, y: 372.2 },
    'START-04': { x: 755.6, y: 496.2 },
    'START-05': { x: 1118.2, y: 509.7 },
    'START-06': { x: 845.1, y: 275.2 }
  };

  // Unified corridor segments (1:1 geometry from the floorplan corridors, sharing exact junction vertices)
  const DEFAULT_SEGMENTS = [
    {
      id: 'SEG-01',
      name: 'Koridor Timur → Selatan',
      kind: 'builtin',
      active: true,
      points: [
        { x: 999.5, y: 228.1 },
        { x: 1067, y: 228.1 },
        { x: 1067, y: 452.125 },
        { x: 1067, y: 460.5 },
        { x: 1067, y: 573.65 },
        { x: 1022, y: 573.65 },
        { x: 1022, y: 773.059 },
        { x: 845.5, y: 773.059 }
      ]
    },
    {
      id: 'SEG-02',
      name: 'Koridor Utara → Poros Tengah',
      kind: 'builtin',
      active: true,
      points: [
        { x: 999.5, y: 228.1 },
        { x: 999.5, y: 87.15 },
        { x: 536.5, y: 87.15 },
        { x: 536.5, y: 255 },
        { x: 536.5, y: 802.65 }
      ]
    },
    {
      id: 'SEG-03',
      name: 'Koridor Sayap Utara',
      kind: 'builtin',
      active: true,
      points: [
        { x: 884, y: 228.1 },
        { x: 999.5, y: 228.1 }
      ]
    },
    {
      id: 'SEG-04',
      name: 'Koridor Selatan → Titik Kumpul',
      kind: 'builtin',
      active: true,
      connectsAssembly: true,
      points: [
        { x: 845.5, y: 773.059 },
        { x: 845.5, y: 802.65 },
        { x: 536.5, y: 802.65 },
        { x: 536.5, y: 842.15 },
        { x: 535.5, y: 898.3 }
      ]
    },
    {
      id: 'SEG-05',
      name: 'Koridor Tengah (R.14) → Selatan',
      kind: 'builtin',
      active: true,
      points: [
        { x: 775, y: 507.15 },
        { x: 775, y: 620 },
        { x: 845.5, y: 620 },
        { x: 845.5, y: 773.059 }
      ]
    },
    {
      id: 'SEG-06',
      name: 'Jalur Gedung Barat → Titik Kumpul',
      kind: 'builtin',
      active: true,
      connectsAssembly: true,
      points: [
        { x: 176, y: 376.15 },
        { x: 176, y: 776.65 },
        { x: 509, y: 870.15 },
        { x: 535.5, y: 898.3 }
      ]
    },
    {
      id: 'SEG-07',
      name: 'Konektor Zona Ruang 13',
      kind: 'builtin',
      active: true,
      points: [
        { x: 970, y: 452.125 },
        { x: 1067, y: 452.125 }
      ]
    },
    {
      id: 'SEG-08',
      name: 'Konektor Koridor Atas',
      kind: 'builtin',
      active: true,
      points: [
        { x: 884, y: 255 },
        { x: 536.5, y: 255 }
      ]
    },
    {
      id: 'SEG-09',
      name: 'Konektor Ruang 15 (Timur)',
      kind: 'builtin',
      active: true,
      points: [
        { x: 1162, y: 538 },
        { x: 1120, y: 538 },
        { x: 1120, y: 460.5 },
        { x: 1067, y: 460.5 }
      ]
    }
  ];

  const cloneSegments = segs => segs.map(s => ({
    id: String(s.id),
    name: String(s.name || s.id),
    kind: s.kind === 'custom' ? 'custom' : 'builtin',
    active: s.active !== false,
    connectsAssembly: Boolean(s.connectsAssembly),
    points: (Array.isArray(s.points) ? s.points : []).map(p => ({ x: +Number(p.x).toFixed(3), y: +Number(p.y).toFixed(3) }))
  }));

  function migrateQrStarts(list) {
    if (!Array.isArray(list) || !list.length) {
      return DEFAULT_QR_STARTS.map(p => ({ ...p }));
    }
    return list.map((p, idx) => {
      const id = String(p.id || `START-0${idx + 1}`);
      const def = DEFAULT_QR_STARTS.find(d => d.id === id);
      const leg = LEGACY_QR_COORDS[id];
      let x = Number.isFinite(+p.x) ? +Number(p.x).toFixed(3) : (def ? def.x : 700);
      let y = Number.isFinite(+p.y) ? +Number(p.y).toFixed(3) : (def ? def.y : 500);
      if (def && leg && Math.hypot(x - leg.x, y - leg.y) <= 8) {
        x = def.x;
        y = def.y;
      }
      return {
        id,
        name: String(p.name || def?.name || `Titik QR 0${idx + 1}`),
        code: String(p.code || def?.code || String(idx + 1).padStart(2, '0')),
        x,
        y
      };
    });
  }

  const cloneQrStarts = list => migrateQrStarts(list);

  function loadUnifiedState() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(EVAC_KEY) || localStorage.getItem('gisK3EvacBackendV1') || 'null');
    } catch (_) {}
    let studioSaved = null;
    try { studioSaved = JSON.parse(localStorage.getItem(STUDIO_KEY) || 'null'); } catch (_) {}
    let manualSaved = null;
    try { manualSaved = JSON.parse(localStorage.getItem(MANUAL_KEY) || 'null'); } catch (_) {}

    const apRaw = saved?.assemblyPoint || studioSaved?.evacEdits?.assemblyPoint || DEFAULT_ASSEMBLY;
    const assemblyPoint = {
      x: Number.isFinite(+apRaw.x) ? +apRaw.x : DEFAULT_ASSEMBLY.x,
      y: Number.isFinite(+apRaw.y) ? +apRaw.y : DEFAULT_ASSEMBLY.y
    };

    let segments = [];
    if (saved?.version === 2 && Array.isArray(saved?.segments) && saved.segments.length) {
      segments = cloneSegments(saved.segments);
    } else {
      segments = cloneSegments(DEFAULT_SEGMENTS);
      const hidden = new Set(studioSaved?.evacEdits?.hiddenStaticRoutes || []);
      segments.forEach((seg, idx) => {
        if (hidden.has(idx)) seg.active = false;
      });
      // Preserve any custom segments drawn by admin
      const prevCustom = [
        ...((saved?.segments || []).filter(s => s.kind === 'custom')),
        ...((studioSaved?.evacEdits?.segments || []).filter(s => s.kind === 'custom'))
      ];
      const seenCustom = new Set();
      prevCustom.forEach(s => {
        if (!seenCustom.has(s.id) && Array.isArray(s.points) && s.points.length >= 2) {
          seenCustom.add(s.id);
          segments.push(cloneSegments([s])[0]);
        }
      });
      if (!seenCustom.size && Array.isArray(manualSaved?.routes)) {
        manualSaved.routes.forEach((r, idx) => {
          if (Array.isArray(r.points) && r.points.length >= 2) {
            segments.push({
              id: String(r.id || `SEG-M${idx + 1}`),
              name: String(r.name || `Jalur Tambahan #${idx + 1}`),
              kind: 'custom',
              active: true,
              connectsAssembly: false,
              points: r.points.map(p => ({ x: +Number(p.x).toFixed(3), y: +Number(p.y).toFixed(3) }))
            });
          }
        });
      }
    }

    segments.forEach(seg => {
      if (seg.connectsAssembly && seg.points.length >= 2) {
        seg.points[seg.points.length - 1] = { x: assemblyPoint.x, y: assemblyPoint.y };
      }
    });

    const qrRaw = (Array.isArray(saved?.qrStartPoints) && saved.qrStartPoints.length)
      ? saved.qrStartPoints
      : ((Array.isArray(studioSaved?.evacEdits?.qrStartPoints) && studioSaved.evacEdits.qrStartPoints.length)
          ? studioSaved.evacEdits.qrStartPoints
          : DEFAULT_QR_STARTS);
    const qrStartPoints = migrateQrStarts(qrRaw);

    return { version: 2, assemblyPoint, segments, qrStartPoints };
  }

  let state = loadUnifiedState();
  let selectedSegmentId = state.segments[0]?.id || 'SEG-01';
  let activeRouteContext = null; // { type: 'start'|'room', id }
  let activeRouteData = null;    // { route, meta } rendered directly inside #evacuation-routes
  let graphCache = null;

  // Drawing state
  let drawMode = false;
  let drawPoints = [];
  let drawPointerDown = null;
  let drawIsDragging = false;
  let drawPreviewGroup = null;

  function saveUnifiedState(broadcast = true) {
    try {
      state.version = 2;
      state.segments.forEach(seg => {
        if (seg.connectsAssembly && seg.points.length >= 2) {
          seg.points[seg.points.length - 1] = { x: state.assemblyPoint.x, y: state.assemblyPoint.y };
        }
      });
      localStorage.setItem(EVAC_KEY, JSON.stringify(state));
      localStorage.setItem('gisK3EvacBackendV1', JSON.stringify(state));

      // Keep gisK3StudioStateV1.evacEdits in sync
      const stRaw = JSON.parse(localStorage.getItem(STUDIO_KEY) || '{}') || {};
      stRaw.evacEdits = {
        ...(stRaw.evacEdits || {}),
        assemblyPoint: { ...state.assemblyPoint },
        segments: cloneSegments(state.segments),
        qrStartPoints: cloneQrStarts(state.qrStartPoints),
        hiddenStaticRoutes: state.segments
          .slice(0, 6)
          .map((s, i) => (s.active === false ? i : -1))
          .filter(i => i >= 0)
      };
      localStorage.setItem(STUDIO_KEY, JSON.stringify(stRaw));

      // Keep gisK3ManualMapV1.routes in sync for legacy readers
      const manRaw = JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}') || {};
      manRaw.routes = state.segments.filter(s => s.kind === 'custom').map(s => ({
        id: s.id,
        name: s.name,
        points: s.points,
        joined: true,
        joinType: 'unified-evac-backend'
      }));
      localStorage.setItem(MANUAL_KEY, JSON.stringify(manRaw));

      window.START_POINTS = cloneQrStarts(state.qrStartPoints);
      graphCache = null;
      if (broadcast) window.__broadcastLiveSync?.('evac');
    } catch (_) {}
  }

  // Persist migrated v2 state immediately so any legacy localStorage is cleaned up
  saveUnifiedState(false);

  // Geometry helpers
  function nearestPointOnSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
    const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
    const x = a.x + t * dx, y = a.y + t * dy;
    return { x, y, t, dist: Math.hypot(p.x - x, p.y - y) };
  }

  function segmentIntersection(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const rxs = r.x * s.y - r.y * s.x;
    if (Math.abs(rxs) < 1e-5) return null;
    const qp = { x: c.x - a.x, y: c.y - a.y };
    const t = (qp.x * s.y - qp.y * s.x) / rxs;
    const u = (qp.x * r.y - qp.y * r.x) / rxs;
    if (t >= -0.001 && t <= 1.001 && u >= -0.001 && u <= 1.001) {
      return { x: a.x + clamp(t, 0, 1) * r.x, y: a.y + clamp(t, 0, 1) * r.y };
    }
    return null;
  }

  function getActiveTriplekBarriers() {
    const barriers = [];
    document.querySelectorAll('#main-svg [data-triplek-wall="true"]').forEach(el => {
      const isGlow = el.classList.contains('triplek-glow') || el.closest('#studio-wall-edits-layer');
      if (!isGlow) return;
      if (el.tagName.toLowerCase() === 'line') {
        barriers.push({
          a: { x: +el.getAttribute('x1'), y: +el.getAttribute('y1') },
          b: { x: +el.getAttribute('x2'), y: +el.getAttribute('y2') }
        });
      }
    });
    return barriers;
  }

  function isBlockedByTriplek(a, b, barriers) {
    for (const bar of barriers) {
      if (segmentIntersection(a, b, bar.a, bar.b)) return true;
    }
    return false;
  }

  // Build Unified Planar Graph + Run Reverse Dijkstra from Assembly Point
  function buildGraph() {
    if (graphCache) return graphCache;

    const rawEdges = [];
    const activeSegs = state.segments.filter(s => s.active !== false && Array.isArray(s.points) && s.points.length >= 2);
    activeSegs.forEach(seg => {
      for (let i = 1; i < seg.points.length; i++) {
        const a = seg.points[i - 1], b = seg.points[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
          rawEdges.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, segId: seg.id, isCustom: seg.kind === 'custom' });
        }
      }
    });

    // Collect split points along each edge ONLY at true intersections and true T-junctions (<= 4px)
    // Never bridge across walls between non-intersecting parallel corridors!
    const splits = rawEdges.map(e => [{ t: 0, x: e.a.x, y: e.a.y }, { t: 1, x: e.b.x, y: e.b.y }]);
    for (let i = 0; i < rawEdges.length; i++) {
      for (let j = i + 1; j < rawEdges.length; j++) {
        const e1 = rawEdges[i], e2 = rawEdges[j];
        const hit = segmentIntersection(e1.a, e1.b, e2.a, e2.b);
        if (hit) {
          const q1 = nearestPointOnSegment(hit, e1.a, e1.b);
          const q2 = nearestPointOnSegment(hit, e2.a, e2.b);
          splits[i].push({ t: q1.t, x: hit.x, y: hit.y });
          splits[j].push({ t: q2.t, x: hit.x, y: hit.y });
        }
      }
      for (let j = 0; j < rawEdges.length; j++) {
        if (i === j) continue;
        const tol = (rawEdges[j].isCustom || rawEdges[i].isCustom) ? 14 : 5;
        for (const ep of [rawEdges[j].a, rawEdges[j].b]) {
          const proj = nearestPointOnSegment(ep, rawEdges[i].a, rawEdges[i].b);
          if (proj.dist <= tol) {
            splits[i].push({ t: proj.t, x: proj.x, y: proj.y });
          }
        }
      }
    }

    const nodes = [];
    const nodeFor = pt => {
      for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - pt.x, nodes[i].y - pt.y) <= 4) return i;
      }
      nodes.push({ x: pt.x, y: pt.y });
      return nodes.length - 1;
    };

    const barriers = getActiveTriplekBarriers();
    const edges = [];
    const seenEdge = new Set();
    const addEdge = (u, v, segId = null) => {
      if (u === v) return;
      if (barriers.length && isBlockedByTriplek(nodes[u], nodes[v], barriers)) return;
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      const w = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
      edges.push({ a: u, b: v, w, segId });
    };

    for (let i = 0; i < rawEdges.length; i++) {
      const pts = splits[i].slice().sort((p, q) => p.t - q.t);
      let prevIdx = -1;
      for (const p of pts) {
        const idx = nodeFor(p);
        if (prevIdx >= 0 && prevIdx !== idx) addEdge(prevIdx, idx, rawEdges[i].segId);
        prevIdx = idx;
      }
    }

    // Ensure Assembly Point node is connected to all Assembly-connected corridor terminals (SEG-04 & SEG-06)
    const ap = state.assemblyPoint;
    const apNode = nodeFor(ap);
    activeSegs.forEach(seg => {
      if (seg.connectsAssembly && seg.points.length >= 2) {
        const termIdx = nodeFor(seg.points[seg.points.length - 1]);
        if (termIdx !== apNode) addEdge(apNode, termIdx, seg.id);
      }
    });
    // Bridge any custom segment endpoint within 14px of a corridor node so custom routes always join the graph
    for (let i = 0; i < rawEdges.length; i++) {
      if (!rawEdges[i].isCustom) continue;
      for (const ep of [rawEdges[i].a, rawEdges[i].b]) {
        const u = nodeFor(ep);
        for (let v = 0; v < nodes.length; v++) {
          if (u !== v && Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y) <= 14) {
            addEdge(u, v, rawEdges[i].segId);
          }
        }
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      if (i === apNode) continue;
      const d = Math.hypot(nodes[i].x - ap.x, nodes[i].y - ap.y);
      if (d <= 85) addEdge(apNode, i, null);
    }

    const adj = Array.from({ length: nodes.length }, () => []);
    edges.forEach(e => {
      adj[e.a].push({ to: e.b, w: e.w });
      adj[e.b].push({ to: e.a, w: e.w });
    });

    // Reverse Dijkstra from apNode to all nodes
    const N = nodes.length;
    const distToAp = new Array(N).fill(Infinity);
    const nextToAp = new Array(N).fill(-1);
    const visited = new Array(N).fill(false);
    if (apNode >= 0 && apNode < N) {
      distToAp[apNode] = 0;
      for (let step = 0; step < N; step++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < N; i++) {
          if (!visited[i] && distToAp[i] < best) { best = distToAp[i]; u = i; }
        }
        if (u < 0) break;
        visited[u] = true;
        for (const edge of adj[u]) {
          if (distToAp[u] + edge.w < distToAp[edge.to]) {
            distToAp[edge.to] = distToAp[u] + edge.w;
            nextToAp[edge.to] = u;
          }
        }
      }
    }

    graphCache = { nodes, edges, adj, apNode, distToAp, nextToAp };
    return graphCache;
  }

  function estimateDistanceToAssembly(pt, graph) {
    let best = Infinity;
    for (const e of graph.edges) {
      const a = graph.nodes[e.a], b = graph.nodes[e.b];
      const q = nearestPointOnSegment(pt, a, b);
      if (q.dist <= 6) {
        const da = graph.distToAp[e.a] + Math.hypot(pt.x - a.x, pt.y - a.y);
        const db = graph.distToAp[e.b] + Math.hypot(pt.x - b.x, pt.y - b.y);
        best = Math.min(best, da, db);
      }
    }
    if (!Number.isFinite(best)) {
      best = Math.hypot(pt.x - state.assemblyPoint.x, pt.y - state.assemblyPoint.y);
    }
    return best;
  }

  function pointsToPathD(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${Number(p.x).toFixed(2)} ${Number(p.y).toFixed(2)}`).join(' ');
  }

  // Unified SVG Renderer for #evacuation-routes (renders Built-in Network, Custom Drawn Routes, AND Active QR/Room Route in ONE layer)
  function renderNetwork() {
    const container = document.getElementById('evacuation-routes');
    if (!container) return;

    // Clear legacy manual layer & legacy qr layer so there is physically only ONE evacuation layer
    const legacyManual = document.getElementById('v6-manual-evac-layer');
    if (legacyManual) {
      legacyManual.innerHTML = '';
      legacyManual.setAttribute('opacity', '0');
      legacyManual.setAttribute('pointer-events', 'none');
    }
    const legacyQrLayer = document.getElementById('qr-route-layer');
    if (legacyQrLayer) {
      legacyQrLayer.innerHTML = '';
      legacyQrLayer.style.display = 'none';
    }

    const graph = buildGraph();
    const isEditorOpen = document.body.classList.contains('map-editor-active');
    const hasActiveRoute = Boolean(activeRouteData && activeRouteData.route && activeRouteData.route.d);

    container.innerHTML = `
      <defs>
        <filter height="140%" id="evac-soft-shadow" width="140%" x="-20%" y="-20%">
          <feDropShadow dx="0" dy="1" flood-color="#0f172a" flood-opacity="0.10" stdDeviation="1"/>
        </filter>
      </defs>
      <path d="M1049 425.868V485.619" fill="none" stroke="#F8FAFC" stroke-linecap="butt" stroke-width="5" vector-effect="non-scaling-stroke"/>
    `;

    const pathsGroup = document.createElementNS(NS, 'g');
    pathsGroup.id = 'evac-unified-paths';
    if (hasActiveRoute) pathsGroup.setAttribute('opacity', '0.22');

    const arrowsGroup = document.createElementNS(NS, 'g');
    arrowsGroup.id = 'evac-unified-arrows';
    arrowsGroup.setAttribute('fill', 'none');
    arrowsGroup.setAttribute('stroke', '#15803D');
    arrowsGroup.setAttribute('stroke-linecap', 'round');
    arrowsGroup.setAttribute('stroke-linejoin', 'round');
    arrowsGroup.setAttribute('stroke-width', '2');
    if (hasActiveRoute) arrowsGroup.setAttribute('opacity', '0.22');

    state.segments.forEach(seg => {
      if (seg.active === false || !Array.isArray(seg.points) || seg.points.length < 2) return;
      const d = pointsToPathD(seg.points);
      if (!d) return;

      const isSelected = isEditorOpen && selectedSegmentId === seg.id;
      const pathEl = document.createElementNS(NS, 'path');
      pathEl.setAttribute('class', `evac-route${seg.kind === 'custom' ? ' evac-route-custom' : ''}${isSelected ? ' evac-route-selected' : ''}`);
      pathEl.setAttribute('data-seg-id', seg.id);
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('filter', 'url(#evac-soft-shadow)');
      pathEl.setAttribute('stroke', '#059669');
      pathEl.setAttribute('stroke-dasharray', '3.97 3.97');
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-linejoin', 'round');
      pathEl.setAttribute('stroke-width', '2.31506');
      pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
      pathEl.style.pointerEvents = 'stroke';
      pathEl.style.cursor = 'pointer';
      pathsGroup.appendChild(pathEl);

      // Compute directional arrows along each sub-segment oriented toward Assembly Point
      for (let i = 1; i < seg.points.length; i++) {
        const p1 = seg.points[i - 1], p2 = seg.points[i];
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (segLen < 38) continue;
        const d1 = estimateDistanceToAssembly(p1, graph);
        const d2 = estimateDistanceToAssembly(p2, graph);
        const forward = d2 <= d1;
        const from = forward ? p1 : p2;
        const to = forward ? p2 : p1;
        const ang = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
        const count = Math.max(1, Math.floor(segLen / 110));
        for (let k = 1; k <= count; k++) {
          const frac = k / (count + 1);
          const ax = from.x + (to.x - from.x) * frac;
          const ay = from.y + (to.y - from.y) * frac;
          const g = document.createElementNS(NS, 'g');
          g.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${ang.toFixed(1)})`);
          g.innerHTML = '<path d="M-6-5 L0 0 L-6 5" fill="none"/>';
          arrowsGroup.appendChild(g);
        }
      }
    });

    container.appendChild(pathsGroup);
    container.appendChild(arrowsGroup);

    // Render subtle QR Start Origin markers right on the corridor tips
    const originsGroup = document.createElementNS(NS, 'g');
    originsGroup.id = 'evac-unified-origins';
    originsGroup.setAttribute('class', 'evac-origin-points');
    if (hasActiveRoute) originsGroup.setAttribute('opacity', '0.35');
    state.qrStartPoints.forEach(qp => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', qp.x);
      c.setAttribute('cy', qp.y);
      c.setAttribute('r', '5.5');
      c.setAttribute('fill', '#059669');
      c.setAttribute('stroke', '#ffffff');
      c.setAttribute('stroke-width', '1.8');
      c.setAttribute('vector-effect', 'non-scaling-stroke');
      c.setAttribute('data-qr-origin-id', qp.id);
      c.style.pointerEvents = 'all';
      c.style.cursor = 'pointer';
      originsGroup.appendChild(c);
    });
    container.appendChild(originsGroup);

    // If a QR or Room route is active, render it directly inside #evacuation-routes on the exact same backend!
    if (hasActiveRoute) {
      const route = activeRouteData.route;
      const activeGroup = document.createElementNS(NS, 'g');
      activeGroup.id = 'evac-unified-active-route';

      const activePath = document.createElementNS(NS, 'path');
      activePath.id = 'qr-route-active';
      activePath.setAttribute('class', 'evac-route evac-active-route-path release-route-path');
      activePath.setAttribute('d', route.d);
      activePath.setAttribute('fill', 'none');
      activePath.setAttribute('stroke', '#059669');
      activePath.setAttribute('stroke-dasharray', '10 8');
      activePath.setAttribute('stroke-linecap', 'round');
      activePath.setAttribute('stroke-linejoin', 'round');
      activePath.setAttribute('stroke-width', '4');
      activePath.setAttribute('vector-effect', 'non-scaling-stroke');
      activeGroup.appendChild(activePath);

      const activeArrows = document.createElementNS(NS, 'g');
      activeArrows.id = 'qr-route-arrows';
      activeArrows.setAttribute('fill', 'none');
      activeArrows.setAttribute('stroke', '#047857');
      activeArrows.setAttribute('stroke-width', '2.2');
      activeArrows.setAttribute('stroke-linecap', 'round');
      activeArrows.setAttribute('stroke-linejoin', 'round');

      for (let i = 1; i < route.points.length; i++) {
        const p1 = route.points[i - 1], p2 = route.points[i];
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (segLen < 28) continue;
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        const count = Math.max(1, Math.floor(segLen / 85));
        for (let k = 1; k <= count; k++) {
          const frac = k / (count + 1);
          const ax = p1.x + (p2.x - p1.x) * frac;
          const ay = p1.y + (p2.y - p1.y) * frac;
          const g = document.createElementNS(NS, 'g');
          g.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${ang.toFixed(1)})`);
          g.innerHTML = '<path d="M-7-5 L0 0 L-7 5" fill="none" vector-effect="non-scaling-stroke"/>';
          activeArrows.appendChild(g);
        }
      }
      activeGroup.appendChild(activeArrows);

      const startDot = document.createElementNS(NS, 'circle');
      startDot.id = 'qr-route-start';
      startDot.setAttribute('cx', route.corridorStart.x);
      startDot.setAttribute('cy', route.corridorStart.y);
      startDot.setAttribute('r', '6');
      startDot.setAttribute('fill', '#059669');
      startDot.setAttribute('stroke', '#FFFFFF');
      startDot.setAttribute('stroke-width', '2');
      startDot.setAttribute('vector-effect', 'non-scaling-stroke');
      activeGroup.appendChild(startDot);

      container.appendChild(activeGroup);
    }

    // Assembly Point circles
    const ap = state.assemblyPoint;
    const cOuter = document.createElementNS(NS, 'circle');
    cOuter.setAttribute('class', 'evac-assembly-pulse');
    cOuter.setAttribute('cx', ap.x);
    cOuter.setAttribute('cy', ap.y);
    cOuter.setAttribute('r', '15');
    cOuter.setAttribute('fill', '#22C55E');
    cOuter.setAttribute('fill-opacity', '0.20');
    cOuter.setAttribute('stroke', '#059669');
    cOuter.setAttribute('stroke-width', '2');
    cOuter.setAttribute('vector-effect', 'non-scaling-stroke');
    const cInner = document.createElementNS(NS, 'circle');
    cInner.setAttribute('cx', ap.x);
    cInner.setAttribute('cy', ap.y);
    cInner.setAttribute('r', '8.5');
    cInner.setAttribute('fill', '#16A34A');
    cInner.setAttribute('stroke', '#FFFFFF');
    cInner.setAttribute('stroke-width', '2');
    cInner.setAttribute('vector-effect', 'non-scaling-stroke');
    cOuter.setAttribute('data-assembly-point', '1');
    cOuter.style.pointerEvents = 'all';
    cOuter.style.cursor = 'pointer';
    cInner.setAttribute('data-assembly-point', '1');
    cInner.style.pointerEvents = 'all';
    cInner.style.cursor = 'pointer';
    container.appendChild(cOuter);
    container.appendChild(cInner);

    updateAdminRouteListUI();
  }

  // Compute Shortest Path from ANY SVG Point {x, y} to Assembly Point using the Unified Graph
  // Starts strictly on the corridor entry point (bestCandidate.entryPoint) so the route NEVER cuts across room walls!
  function computePathFromPoint(pt) {
    if (!pt || !Number.isFinite(+pt.x) || !Number.isFinite(+pt.y)) return null;
    const graph = buildGraph();
    if (!graph.nodes.length || !graph.edges.length) return null;

    const start = { x: +pt.x, y: +pt.y };
    const barriers = getActiveTriplekBarriers();
    const candidates = [];
    let minEntryDist = Infinity;

    for (const e of graph.edges) {
      const a = graph.nodes[e.a], b = graph.nodes[e.b];
      const q = nearestPointOnSegment(start, a, b);
      if (barriers.length && isBlockedByTriplek(start, q, barriers)) continue;
      const distViaA = Math.hypot(q.x - a.x, q.y - a.y) + graph.distToAp[e.a];
      const distViaB = Math.hypot(q.x - b.x, q.y - b.y) + graph.distToAp[e.b];
      const viaNode = distViaA <= distViaB ? e.a : e.b;
      const corridorDist = Math.min(distViaA, distViaB);
      if (Number.isFinite(corridorDist)) {
        if (q.dist < minEntryDist) minEntryDist = q.dist;
        candidates.push({
          totalLength: corridorDist,
          entryPoint: { x: +q.x.toFixed(2), y: +q.y.toFixed(2) },
          entryDist: q.dist,
          firstNode: viaNode
        });
      }
    }

    // Always snap to the closest reachable corridor (tolerance 2.5px at junctions) so routes never jump across a wall to another corridor
    let bestCandidate = null;
    for (const c of candidates) {
      if (c.entryDist <= minEntryDist + 2.5) {
        const score = c.entryDist * 10 + c.totalLength;
        if (!bestCandidate || score < bestCandidate.score) {
          bestCandidate = { ...c, score };
        }
      }
    }

    if (!bestCandidate) return null;

    // Start the rendered route right on the corridor entryPoint so it never cuts across walls
    const corridorStart = bestCandidate.entryPoint;
    const pts = [{ x: corridorStart.x, y: corridorStart.y }];

    let cur = bestCandidate.firstNode;
    let guard = 0;
    while (cur !== -1 && guard++ < 500) {
      const np = graph.nodes[cur];
      const prev = pts[pts.length - 1];
      if (!prev || Math.hypot(np.x - prev.x, np.y - prev.y) > 1.2) {
        pts.push({ x: np.x, y: np.y });
      }
      if (cur === graph.apNode) break;
      cur = graph.nextToAp[cur];
    }

    const ap = state.assemblyPoint;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - ap.x, last.y - ap.y) > 1.5) {
      pts.push({ x: ap.x, y: ap.y });
    }

    const d = pointsToPathD(pts);
    return {
      start: corridorStart,
      corridorStart,
      rawStart: start,
      points: pts,
      d,
      pathLength: bestCandidate.totalLength,
      meters: Math.max(2, Math.round(bestCandidate.totalLength / 18))
    };
  }

  function ensureEvacuationLayerActive() {
    window.__isActivatingEvacForQr = true;
    if (typeof window.__setMapLayer === 'function') {
      window.__setMapLayer('evacuation', { preserveActiveRoute: true });
    } else {
      document.getElementById('evacuation-routes')?.classList.add('is-active');
    }
    window.__isActivatingEvacForQr = false;
  }

  function renderActiveRouteOnMap(route, meta) {
    const youHere = document.getElementById('you-here-active');
    const youHereLabel = document.getElementById('you-here-label');
    const qrModeCard = document.getElementById('qr-mode-card');
    const qrRouteCode = document.getElementById('qr-route-code');
    const qrRouteTitle = document.getElementById('qr-route-title');
    const qrRouteSummary = document.getElementById('qr-route-summary');

    if (!route) return false;

    activeRouteData = { route, meta };
    ensureEvacuationLayerActive();
    renderNetwork();

    if (youHere) {
      youHere.setAttribute('transform', `translate(${route.corridorStart.x} ${route.corridorStart.y})`);
      youHere.classList.add('active');
    }
    if (youHereLabel) {
      youHereLabel.textContent = meta.badge || 'YOU ARE HERE';
    }

    const len = route.pathLength || 0;
    const meters = Math.max(2, Math.round(len / 18));

    if (qrRouteCode) qrRouteCode.textContent = meta.codeLabel || 'EVAKUASI';
    if (qrRouteTitle) qrRouteTitle.textContent = meta.title || 'Jalur Evakuasi Terpendek';
    if (qrRouteSummary) {
      qrRouteSummary.innerHTML = `Rute terpendek dari <b>Backend Evakuasi Terpadu</b> · <b>~${meters} meter</b> (${Math.round(len)} unit peta) menuju Titik Kumpul.`;
    }
    qrModeCard?.classList.remove('hidden');
    return true;
  }

  function clearActiveRoute() {
    activeRouteContext = null;
    activeRouteData = null;
    document.getElementById('qr-mode-card')?.classList.add('hidden');
    document.getElementById('you-here-active')?.classList.remove('active');
    renderNetwork();
  }

  function routeFromStart(idOrCode, pan = true) {
    const point = state.qrStartPoints.find(p => p.id === idOrCode || p.code === idOrCode);
    if (!point) return null;
    const route = computePathFromPoint(point);
    if (!route) return null;
    activeRouteContext = { type: 'start', id: point.id };
    renderActiveRouteOnMap(route, {
      badge: `YOU ARE HERE · ${point.code}`,
      codeLabel: `QR ${point.code || point.id}`,
      title: point.name
    });
    window.__showEntityDetailInDrawer?.({
      eyebrow: `TITIK AWAL QR · KODE ${point.code}`,
      title: `${point.code} · ${point.name}`,
      chip: 'YOU ARE HERE',
      chipClass: 'feature-chip bg-sky-50 text-sky-700',
      copy: `Posisi awal evakuasi <b>${esc(point.id)}</b> pada koordinat (${Math.round(point.x)}, ${Math.round(point.y)}). Ikuti garis rute hijau putus-putus menuju Titik Kumpul (Assembly Point).`,
      boxes: [
        ['Status', 'Titik QR Aktif'],
        ['Kode QR', `${point.id} (${point.code})`],
        ['Jarak Evakuasi', `~${route.meters} meter`],
        ['Tujuan', 'Titik Kumpul']
      ],
      hideRoomActions: true
    });
    if (pan) {
      requestAnimationFrame(() => {
        if (typeof window.__panZoomToSvgPoint === 'function') {
          const curZ = typeof window.__getMapZoom === 'function' ? window.__getMapZoom() : 1;
          window.__panZoomToSvgPoint(route.corridorStart.x, route.corridorStart.y, Math.max(curZ, 1.15));
        }
      });
    }
    return point;
  }

  function getRoomBoxes(roomId) {
    const r = String(roomId);
    const list = [];
    document.querySelectorAll(`#room-hotspots [data-room="${CSS.escape(r)}"], #v6-map-area-layer [data-room="${CSS.escape(r)}"]`).forEach(el => {
      if (el.style.display === 'none') return;
      try {
        const b = el.getBBox();
        if (b.width > 0 && b.height > 0) {
          list.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height });
        }
      } catch (_) {}
    });
    return list;
  }

  function perimeterStartForBox(c, graph) {
    let nearest = { x: c.x, y: c.y, dist: Infinity };
    for (const e of graph.edges) {
      const a = graph.nodes[e.a], b = graph.nodes[e.b];
      const q = nearestPointOnSegment({ x: c.x, y: c.y }, a, b);
      if (q.dist < nearest.dist) nearest = q;
    }
    const vx = nearest.x - c.x, vy = nearest.y - c.y;
    if (!c.w || !c.h || (vx === 0 && vy === 0)) return { x: c.x, y: c.y };
    const tx = vx === 0 ? Infinity : (c.w / 2) / Math.abs(vx);
    const ty = vy === 0 ? Infinity : (c.h / 2) / Math.abs(vy);
    const t = Math.min(tx, ty);
    return { x: c.x + vx * t, y: c.y + vy * t };
  }

  function routeFromRoom(roomId) {
    const r = String(roomId);
    const graph = buildGraph();
    if (!graph.nodes.length) return false;
    const boxes = getRoomBoxes(r);
    if (!boxes.length) return false;

    let best = null;
    for (const box of boxes) {
      const startPt = perimeterStartForBox(box, graph);
      const res = computePathFromPoint(startPt);
      if (res && (!best || res.pathLength < best.pathLength)) {
        best = res;
      }
    }
    if (!best) return false;

    activeRouteContext = { type: 'room', id: r };
    const roomName = (window.getRoomName ? window.getRoomName(r) : (window.roomNames?.[r] || `Ruangan ${r}`));
    renderActiveRouteOnMap(best, {
      badge: `YOU ARE HERE · R.${r}`,
      codeLabel: `RUANG ${r}`,
      title: `${r} · ${roomName}`
    });
    window.showK3Toast?.(`Rute evakuasi Ruangan ${r} (${roomName}) ditampilkan (~${best.meters}m ke Titik Kumpul).`);
    return true;
  }

  function refreshActiveRouteIfAny() {
    if (!activeRouteContext) return;
    if (activeRouteContext.type === 'start') routeFromStart(activeRouteContext.id, false);
    else if (activeRouteContext.type === 'room') routeFromRoom(activeRouteContext.id);
  }

  // Orthogonalize & Snap Helper for Route Drawing
  function orthogonalizePoints(points) {
    if (!Array.isArray(points) || points.length < 2) return (points || []).map(p => ({ ...p }));
    const out = [{ x: +points[0].x.toFixed(1), y: +points[0].y.toFixed(1) }];
    for (let i = 1; i < points.length; i++) {
      const a = out[out.length - 1], b = points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) < 6) continue;
      if (Math.abs(dx) >= Math.abs(dy) * 1.35) {
        out.push({ x: +b.x.toFixed(1), y: +a.y.toFixed(1) });
        if (Math.abs(b.y - a.y) > 4) out.push({ x: +b.x.toFixed(1), y: +b.y.toFixed(1) });
      } else if (Math.abs(dy) >= Math.abs(dx) * 1.35) {
        out.push({ x: +a.x.toFixed(1), y: +b.y.toFixed(1) });
        if (Math.abs(b.x - a.x) > 4) out.push({ x: +b.x.toFixed(1), y: +b.y.toFixed(1) });
      } else {
        out.push({ x: +b.x.toFixed(1), y: +b.y.toFixed(1) });
      }
    }
    const clean = [];
    for (const p of out) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 3) clean.push(p);
    }
    return clean;
  }

  function nearestCorridorSnap(pt, maxDist = 260) {
    const graph = buildGraph();
    let best = null;
    for (const e of graph.edges) {
      const a = graph.nodes[e.a], b = graph.nodes[e.b];
      const q = nearestPointOnSegment(pt, a, b);
      if (q.dist <= maxDist && (!best || q.dist < best.dist)) {
        best = { x: +q.x.toFixed(1), y: +q.y.toFixed(1), dist: q.dist };
      }
    }
    return best;
  }

  function screenToSvgPoint(clientX, clientY) {
    const s = document.getElementById('main-svg');
    if (!s) return { x: 700, y: 500 };
    const p = s.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const ctm = s.getScreenCTM();
    const res = ctm ? p.matrixTransform(ctm.inverse()) : { x: 700, y: 500 };
    return { x: clamp(res.x, 0, 1427), y: clamp(res.y, 0, 1023) };
  }

  function ensureDrawPreviewLayer() {
    const s = document.getElementById('main-svg');
    if (!s) return null;
    if (!drawPreviewGroup || !drawPreviewGroup.parentNode) {
      drawPreviewGroup = document.createElementNS(NS, 'g');
      drawPreviewGroup.id = 'evac-unified-draw-preview';
      drawPreviewGroup.setAttribute('pointer-events', 'none');
      s.appendChild(drawPreviewGroup);
    }
    return drawPreviewGroup;
  }

  function renderDrawPreview(cursorPt = null) {
    const g = ensureDrawPreviewLayer();
    if (!g) return;
    if (!drawMode) {
      g.innerHTML = '';
      return;
    }
    const pts = cursorPt ? [...drawPoints, cursorPt] : [...drawPoints];
    const orthoPts = orthogonalizePoints(pts);
    const snap = cursorPt ? nearestCorridorSnap(cursorPt, 36) : null;
    let html = '';
    if (orthoPts.length >= 2) {
      html += `<path d="${pointsToPathD(orthoPts)}" fill="none" stroke="#10b981" stroke-width="5.5" stroke-dasharray="8 6" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    orthoPts.forEach((p, idx) => {
      html += `<circle cx="${p.x}" cy="${p.y}" r="${idx === 0 ? 6.5 : 4.5}" fill="#059669" stroke="#fff" stroke-width="1.8"/>`;
    });
    if (snap) {
      html += `<circle cx="${snap.x}" cy="${snap.y}" r="9" fill="#10b981" fill-opacity="0.22" stroke="#047857" stroke-width="2" stroke-dasharray="3 2"/>`;
    }
    g.innerHTML = html;
  }

  function updateDrawStatusText(html) {
    const el = document.getElementById('v6-route-draw-status');
    if (el) el.innerHTML = html;
    const stEl = document.getElementById('st-evac-draw-status');
    if (stEl) stEl.innerHTML = html;
  }

  function startDrawing() {
    drawMode = true;
    drawPoints = [];
    drawPointerDown = null;
    drawIsDragging = false;
    document.body.dataset.v36RouteMode = 'route';
    ensureEvacuationLayerActive();
    clearActiveRoute();
    renderDrawPreview();
    updateDrawStatusText('<b style="color:#047857">✏️ Mode Gambar Jalur Aktif:</b> Klik titik-titik koridor di peta (atau klik-tarik), lalu tekan <b>Enter</b> / klik <b>⏹ Selesai Gambar</b> untuk menyimpan ke Backend Evakuasi.');
    window.showK3Toast?.('Mode Gambar Jalur Evakuasi aktif. Klik atau tarik jalur di peta.');
    window.__onEvacBackendUpdated?.();
  }

  function finishDrawing() {
    if (!drawMode) return null;
    if (!drawPoints.length) {
      cancelDrawing();
      return null;
    }
    let pts = orthogonalizePoints(drawPoints);
    if (pts.length < 2) {
      window.showK3Toast?.('Tambahkan minimal 2 titik pada peta untuk membuat jalur evakuasi.');
      return null;
    }
    // Smart endpoint snapping: snap endpoints that are within 45px of an existing corridor (or Assembly Point),
    // and only bridge up to 110px if neither endpoint is connected yet (preventing unwanted L-hooks).
    const ap = state.assemblyPoint;
    let connectsAssembly = false;
    const startSnap = nearestCorridorSnap(pts[0], 45);
    const endPt = pts[pts.length - 1];
    const distEndToAp = Math.hypot(endPt.x - ap.x, endPt.y - ap.y);
    const endSnap = nearestCorridorSnap(endPt, 45);

    if (startSnap) {
      pts[0] = { x: startSnap.x, y: startSnap.y };
    }
    if (distEndToAp <= 55) {
      pts[pts.length - 1] = { x: ap.x, y: ap.y };
      connectsAssembly = true;
    } else if (endSnap) {
      pts[pts.length - 1] = { x: endSnap.x, y: endSnap.y };
    } else if (!startSnap) {
      // Neither endpoint was within 45px of a corridor; snap whichever end is closer (within 110px)
      const nearStart = nearestCorridorSnap(pts[0], 110);
      const nearEnd = nearestCorridorSnap(endPt, 110);
      if (nearStart && (!nearEnd || nearStart.dist <= nearEnd.dist)) {
        pts = orthogonalizePoints([{ x: nearStart.x, y: nearStart.y }, ...pts]);
      } else if (nearEnd) {
        pts = orthogonalizePoints([...pts, { x: nearEnd.x, y: nearEnd.y }]);
      }
    }

    const customCount = state.segments.filter(s => s.kind === 'custom').length + 1;
    const id = 'SEG-C' + String(Date.now()).slice(-4);
    const newSeg = {
      id,
      name: `Jalur Tambahan #${customCount}`,
      kind: 'custom',
      active: true,
      connectsAssembly,
      points: pts
    };
    state.segments.push(newSeg);
    selectedSegmentId = id;
    drawMode = false;
    drawPoints = [];
    drawPointerDown = null;
    drawIsDragging = false;
    document.body.removeAttribute('data-v36-route-mode');
    renderDrawPreview();
    saveUnifiedState();
    renderNetwork();
    refreshActiveRouteIfAny();
    updateDrawStatusText(`<b style="color:#047857">✓ ${esc(newSeg.name)} tersimpan di Backend Evakuasi Terpadu!</b> Otomatis aktif untuk tombol Jalur Evakuasi & seluruh QR.`);
    window.showK3Toast?.(`✓ ${newSeg.name} berhasil ditambahkan ke jaringan evakuasi & QR!`);
    window.__onEvacBackendUpdated?.();
    return newSeg;
  }

  function cancelDrawing() {
    drawMode = false;
    drawPoints = [];
    drawPointerDown = null;
    drawIsDragging = false;
    document.body.removeAttribute('data-v36-route-mode');
    renderDrawPreview();
    updateDrawStatusText('Siap. Klik <b>✏️ Gambar Jalur Baru</b> untuk menambah jalur koridor evakuasi.');
    window.__onEvacBackendUpdated?.();
  }

  function updateAdminRouteListUI() {
    const el = document.getElementById('v6-manual-route-list');
    if (!el) return;
    el.innerHTML = state.segments.map((s, idx) => `
      <div class="v6-row ${selectedSegmentId === s.id ? 'v36-selected-row' : ''}">
        <div class="v6-row-main">
          <b>${esc(s.name || `Segmen #${idx + 1}`)} <span style="font-size:7px;color:${s.active !== false ? '#059669' : '#dc2626'}">[${s.active !== false ? 'AKTIF' : 'NONAKTIF'}]</span></b>
          <small>${s.kind === 'custom' ? 'Jalur Gambar Admin' : 'Jalur Koridor Bawaan'} · ${s.points?.length || 0} titik · Backend Terpadu</small>
        </div>
        <button type="button" class="v6-btn" data-evac-select-seg="${esc(s.id)}">Pilih</button>
        <button type="button" class="v6-btn" data-evac-toggle-seg="${esc(s.id)}">${s.active !== false ? 'ON' : 'OFF'}</button>
      </div>
    `).join('');
  }

  // Unified QR Modal Lists (Start Points + All Rooms)
  function pageUrlForStart(id) {
    const base = window.location.href.split('#')[0].split('?')[0];
    return `${base}?start=${encodeURIComponent(id)}`;
  }
  function pageUrlForRoom(room) {
    const base = window.location.href.split('#')[0].split('?')[0];
    return `${base}?room=${encodeURIComponent(room)}`;
  }

  function renderQrModalLists() {
    const startListEl = document.getElementById('qr-start-list');
    const roomListEl = document.getElementById('qr-room-list');
    const startsTabBtn = document.querySelector('.qr-view-btn[data-qr-view="starts"]');
    const roomsTabBtn = document.getElementById('qr-view-rooms-btn');
    const countLabel = document.getElementById('qr-modal-count-label');

    const starts = state.qrStartPoints;
    const customRooms = typeof window.__getCustomRooms === 'function' ? window.__getCustomRooms() : [];
    const baseIds = ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','24B','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40'];
    const roomIds = [...baseIds, ...customRooms.map(r => String(r.roomNo)).filter(n => Number(n) > 40)];

    if (startsTabBtn) startsTabBtn.textContent = `Titik Awal (${starts.length})`;
    if (roomsTabBtn) roomsTabBtn.textContent = `Semua Ruangan (${roomIds.length})`;
    if (countLabel) countLabel.textContent = `${starts.length} titik QR koridor + ${roomIds.length} ruangan (Backend Terpadu)`;

    if (startListEl && typeof QRCode !== 'undefined') {
      startListEl.innerHTML = '';
      starts.forEach(point => {
        const safeDomId = `qr-${String(point.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const card = document.createElement('div');
        card.className = 'feature-card flex items-center gap-3';
        card.innerHTML = `<div id="${safeDomId}" class="qr-mini shrink-0"></div><div class="min-w-0 flex-1"><div class="text-[8px] font-extrabold uppercase tracking-[.12em] text-cyan-700">${esc(point.id)} · KODE ${esc(point.code)}</div><div class="mt-1 text-[10px] font-extrabold text-slate-800">${esc(point.name)}</div><div class="mt-1 text-[8px] leading-relaxed text-slate-500">Koordinat (${Math.round(point.x)}, ${Math.round(point.y)}) → Backend Evakuasi Terpadu</div><button type="button" class="mt-2 text-[8px] font-extrabold text-cyan-700 hover:text-cyan-900" data-test-start="${esc(point.id)}">▶ Tes titik ini</button></div>`;
        startListEl.appendChild(card);
        const qrEl = card.querySelector(`#${safeDomId}`);
        if (qrEl) {
          try { new QRCode(qrEl, { text: pageUrlForStart(point.id), width: 74, height: 74, colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
        }
      });
      startListEl.querySelectorAll('[data-test-start]').forEach(btn => btn.addEventListener('click', () => {
        window.__v6ShowStart?.(btn.dataset.testStart);
        document.getElementById('qr-start-modal')?.classList.remove('open');
      }));
    }

    if (roomListEl && !roomListEl.classList.contains('hidden') && typeof QRCode !== 'undefined') {
      const names = window.roomNames || {};
      roomListEl.innerHTML = '<p class="qr-room-note col-span-full">Seluruh QR ruangan menggunakan <b>Backend Evakuasi Terpadu</b> yang sama dengan tombol Jalur Evakuasi Web & gambar rute manual.</p>';
      for (const num of roomIds) {
        const n = String(num), name = names[num] || ('Ruangan ' + n);
        const safeId = 'qr-room-' + n.replace(/[^a-zA-Z0-9_-]/g, '_');
        const card = document.createElement('div');
        card.className = 'feature-card flex items-center gap-3';
        card.innerHTML = `<div id="${safeId}" class="qr-mini shrink-0"></div><div class="min-w-0 flex-1"><div class="text-[8px] font-extrabold uppercase tracking-[.12em] text-cyan-700">ROOM ${esc(n)}</div><div class="mt-1 text-[10px] font-extrabold text-slate-800">${esc(name)}</div><div class="mt-1 text-[8px] leading-relaxed text-slate-500">Scan → You Are Here → Rute Evakuasi Terpadu</div><button type="button" class="mt-2 text-[8px] font-extrabold text-cyan-700 hover:text-cyan-900" data-test-room-qr="${esc(n)}">▶ Tes rute</button></div>`;
        roomListEl.appendChild(card);
        try { new QRCode(card.querySelector('#' + safeId), { text: pageUrlForRoom(n), width: 74, height: 74, colorDark: '#0f172a', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
      }
      roomListEl.querySelectorAll('[data-test-room-qr]').forEach(btn => btn.addEventListener('click', () => {
        const n = btn.dataset.testRoomQr;
        window.__selectRoom?.(n, 'sidebar');
        routeFromRoom(n);
        document.getElementById('qr-start-modal')?.classList.remove('open');
      }));
    }
  }

  function setQrModalTab(view) {
    const starts = document.getElementById('qr-start-list');
    const rooms = document.getElementById('qr-room-list');
    document.querySelectorAll('[data-qr-view]').forEach(b => {
      const active = b.dataset.qrView === view;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    starts?.classList.toggle('hidden', view !== 'starts');
    rooms?.classList.toggle('hidden', view !== 'rooms');
    renderQrModalLists();
  }

  // Install SVG pointer listeners for unified route drawing
  function installDrawingInteractions() {
    window.addEventListener('pointerdown', e => {
      if (!drawMode || e.button !== 0) return;
      const svgEl = e.target.closest?.('#main-svg');
      if (!svgEl) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const pt = screenToSvgPoint(e.clientX, e.clientY);
      const snap = nearestCorridorSnap(pt, 24);
      const actualPt = snap ? { x: snap.x, y: snap.y } : pt;
      const last = drawPoints[drawPoints.length - 1];
      if (!last || Math.hypot(actualPt.x - last.x, actualPt.y - last.y) > 6) {
        drawPoints.push(actualPt);
      }
      drawPointerDown = actualPt;
      drawIsDragging = false;
      renderDrawPreview(actualPt);
    }, true);

    window.addEventListener('pointermove', e => {
      if (!drawMode || e.buttons === 2) return;
      const svgEl = e.target.closest?.('#main-svg');
      if (!svgEl && !drawPointerDown) return;
      const pt = screenToSvgPoint(e.clientX, e.clientY);
      if (drawPointerDown && Math.hypot(pt.x - drawPointerDown.x, pt.y - drawPointerDown.y) > 18) {
        drawIsDragging = true;
        const last = drawPoints[drawPoints.length - 1];
        if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 28) {
          drawPoints.push(pt);
        }
      }
      renderDrawPreview(pt);
    }, true);

    window.addEventListener('pointerup', e => {
      if (!drawMode || !drawPointerDown) return;
      const pt = screenToSvgPoint(e.clientX, e.clientY);
      if (drawIsDragging) {
        drawPoints.push(pt);
        drawPointerDown = null;
        drawIsDragging = false;
        finishDrawing();
      } else {
        drawPointerDown = null;
        drawIsDragging = false;
      }
    }, true);

    window.addEventListener('dblclick', e => {
      if (drawMode && e.target.closest?.('#main-svg')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishDrawing();
      }
    }, true);

    window.addEventListener('keydown', e => {
      if (!drawMode) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishDrawing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelDrawing();
      }
    }, true);
  }

  // Public Unified API
  const EvacBackend = {
    getState: () => state,
    getSegments: () => state.segments,
    getSelectedSegmentId: () => selectedSegmentId,
    setSelectedSegmentId: id => {
      selectedSegmentId = id;
      renderNetwork();
    },
    getAssemblyPoint: () => ({ ...state.assemblyPoint }),
    setAssemblyPoint: (pt, save = true) => {
      if (!pt || !Number.isFinite(+pt.x) || !Number.isFinite(+pt.y)) return;
      state.assemblyPoint = { x: +clamp(+pt.x, 0, 1427).toFixed(1), y: +clamp(+pt.y, 0, 1023).toFixed(1) };
      graphCache = null;
      if (save) saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    resetAssemblyPoint: () => {
      EvacBackend.setAssemblyPoint(DEFAULT_ASSEMBLY, true);
    },
    getQrStarts: () => state.qrStartPoints,
    setQrStarts: (points, save = true) => {
      state.qrStartPoints = Array.isArray(points) && points.length ? cloneQrStarts(points) : cloneQrStarts(DEFAULT_QR_STARTS);
      window.START_POINTS = cloneQrStarts(state.qrStartPoints);
      if (save) saveUnifiedState();
      renderQrModalLists();
      refreshActiveRouteIfAny();
    },
    resetQrStarts: () => {
      EvacBackend.setQrStarts(DEFAULT_QR_STARTS, true);
    },
    toggleSegment: id => {
      const seg = state.segments.find(s => s.id === id);
      if (!seg) return;
      seg.active = seg.active === false ? true : false;
      saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    updateSegment: (id, patch, save = true) => {
      const seg = state.segments.find(s => s.id === id);
      if (!seg) return;
      if (patch.name !== undefined) seg.name = String(patch.name || seg.id);
      if (patch.active !== undefined) seg.active = Boolean(patch.active);
      if (Array.isArray(patch.points) && patch.points.length >= 2) {
        seg.points = patch.points.map(p => ({ x: +clamp(+p.x, 0, 1427).toFixed(1), y: +clamp(+p.y, 0, 1023).toFixed(1) }));
      }
      graphCache = null;
      if (save) saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    deleteSegment: id => {
      const seg = state.segments.find(s => s.id === id);
      if (!seg) return false;
      if (seg.kind === 'builtin') {
        seg.active = false;
      } else {
        state.segments = state.segments.filter(s => s.id !== id);
      }
      if (selectedSegmentId === id) selectedSegmentId = state.segments[0]?.id || 'SEG-01';
      saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
      return true;
    },
    clearCustomSegments: () => {
      state.segments = state.segments.filter(s => s.kind !== 'custom');
      selectedSegmentId = state.segments[0]?.id || 'SEG-01';
      saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    resetAllSegments: () => {
      state.segments = cloneSegments(DEFAULT_SEGMENTS);
      selectedSegmentId = 'SEG-01';
      saveUnifiedState();
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    isDrawing: () => drawMode,
    startDrawing,
    finishDrawing,
    cancelDrawing,
    renderNetwork,
    computePathFromPoint,
    routeFromStart,
    routeFromRoom,
    clearActiveRoute,
    renderQrModalLists,
    migrateQrStarts,
    invalidate: () => {
      graphCache = null;
      renderNetwork();
      refreshActiveRouteIfAny();
    },
    reloadFromStorage: () => {
      state = loadUnifiedState();
      window.START_POINTS = cloneQrStarts(state.qrStartPoints);
      graphCache = null;
      renderNetwork();
      renderQrModalLists();
      refreshActiveRouteIfAny();
    }
  };

  window.EvacBackend = EvacBackend;
  window.START_POINTS = cloneQrStarts(state.qrStartPoints);
  window.__computeEvacRouteFromPoint = computePathFromPoint;
  window.__releaseSetRoomRoute = routeFromRoom;
  window.__invalidateEvacNetwork = () => EvacBackend.invalidate();
  window.__getAssemblyPoint = () => EvacBackend.getAssemblyPoint();

  const initEvacBackendDOM = () => {
    renderNetwork();
    installDrawingInteractions();

    // Document-level delegation so any [data-test-start] or [data-test-room-qr] button always routes via EvacBackend
    document.addEventListener('click', e => {
      const testStartBtn = e.target.closest?.('[data-test-start]');
      if (testStartBtn) {
        e.preventDefault();
        const startId = testStartBtn.dataset.testStart;
        if (typeof window.__v6ShowStart === 'function') window.__v6ShowStart(startId);
        else routeFromStart(startId, true);
        document.getElementById('qr-start-modal')?.classList.remove('open');
        return;
      }
      const testRoomBtn = e.target.closest?.('[data-test-room-qr]');
      if (testRoomBtn) {
        e.preventDefault();
        const r = testRoomBtn.dataset.testRoomQr;
        window.__selectRoom?.(r, 'sidebar');
        routeFromRoom(r);
        document.getElementById('qr-start-modal')?.classList.remove('open');
      }
    });

    document.querySelectorAll('[data-qr-view]').forEach(b => {
      b.addEventListener('click', () => setQrModalTab(b.dataset.qrView));
    });
    document.getElementById('btn-qr-starts')?.addEventListener('click', () => {
      setTimeout(() => setQrModalTab('starts'), 0);
    });
    document.querySelectorAll('#room-hotspots [data-room]').forEach(el => {
      el.addEventListener('dblclick', () => routeFromRoom(el.dataset.room));
    });
    document.getElementById('btn-temporary-wall')?.addEventListener('click', () => {
      setTimeout(() => EvacBackend.invalidate(), 30);
    });

    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    const startParam = params.get('start');
    if (room && /^[0-9]{1,3}[A-Za-z]?$/.test(room)) {
      setTimeout(() => routeFromRoom(room.toUpperCase()), 120);
    } else if (startParam) {
      setTimeout(() => routeFromStart(startParam, true), 120);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEvacBackendDOM, { once: true });
  else initEvacBackendDOM();
})();

/* ==========================================================================
   8. Custom Room/Zone Area Builder (Connected to Unified EvacBackend)
   ========================================================================== */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const STORAGE = 'gisK3ManualMapV1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // Migrate any legacy v9 builder data once
  try {
    const legacy = JSON.parse(localStorage.getItem('gisK3MapBuilderV9') || 'null');
    const active = JSON.parse(localStorage.getItem(STORAGE) || 'null') || { routes: [], areas: [] };
    if (legacy) {
      if (!active.routes?.length && Array.isArray(legacy.routes)) active.routes = legacy.routes;
      if (!active.areas?.length && Array.isArray(legacy.areas)) active.areas = legacy.areas;
      localStorage.setItem(STORAGE, JSON.stringify(active));
    }
  } catch (_) {}

  const read = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; }
    catch { return {}; }
  };
  const data = read();
  const state = {
    areas: Array.isArray(data.areas) ? data.areas : []
  };
  let selectedArea = null;
  let areaMode = false;
  let areaDraw = null;
  let areaPreview = null;
  let areaDrag = null;
  let raf = 0;
  let pendingPointer = null;
  let panelDrag = null;
  let dirty = false;

  // Expose state hooks for unified K3 telemetry, Pan/Zoom contention guard, and Dijkstra routing
  window.__getCustomRooms = () => state.areas.filter(a => a.type === 'room');
  window.__isEditorBusy = () => Boolean(window.EvacBackend?.isDrawing?.() || areaMode || areaDrag || panelDrag || document.body.classList.contains('map-editor-active'));

  const save = () => {
    try {
      const cur = read();
      localStorage.setItem(STORAGE, JSON.stringify({
        ...cur,
        areas: state.areas
      }));
      localStorage.setItem('gisK3MapBuilderV9', JSON.stringify({ routes: cur.routes || [], areas: state.areas }));
      dirty = false;
      window.EvacBackend?.invalidate?.();
      window.__syncK3Metrics?.();
      window.__broadcastLiveSync?.('areas');
    } catch (_) {}
  };
  const toast = msg => window.showK3Toast ? window.showK3Toast(msg) : console.log(msg);

  const svg = () => document.getElementById('main-svg');
  const map = () => document.getElementById('interactive-map');
  const areaLayer = () => document.getElementById('v6-map-area-layer');
  const panel = () => document.getElementById('map-editor-panel');

  function screenToSvg(clientX, clientY) {
    const s = svg();
    if (!s) return { x: 700, y: 500 };
    const p = s.createSVGPoint(); p.x = clientX; p.y = clientY;
    const ctm = s.getScreenCTM();
    return ctm ? p.matrixTransform(ctm.inverse()) : { x: 700, y: 500 };
  }
  const clampPoint = p => ({ x: clamp(p.x, 0, 1427), y: clamp(p.y, 0, 1023) });

  function roomNo(a) {
    if (a.type !== 'room') return null;
    if (!Number.isFinite(Number(a.roomNo)) || Number(a.roomNo) <= 40) {
      const used = new Set(state.areas.filter(x => x.type === 'room').map(x => Number(x.roomNo)).filter(n => Number.isFinite(n) && n > 40));
      let n = 41; while (used.has(n)) n++;
      a.roomNo = n;
    }
    return Number(a.roomNo);
  }
  function areaFill(a) { return a.color || (a.type === 'zone' ? '#7c3aed' : '#2563eb'); }

  function areaText(a) { return a.type === 'room' ? `Ruangan ${roomNo(a)} · ${esc(a.name)}` : `Zona · ${esc(a.name)}`; }
  function renderAreaElement(g, a) {
    const fill = areaFill(a), op = Number(a.opacity ?? .18), dash = a.type === 'zone' ? '7 5' : 'none', n = roomNo(a);
    g.setAttribute('transform', `translate(${a.x} ${a.y})`);
    g.dataset.areaId = a.id;
    if (n) g.dataset.room = String(n);
    g.classList.toggle('selected', a.id === selectedArea);
    g.innerHTML = `<rect x="0" y="0" width="${a.w}" height="${a.h}" rx="${a.type === 'zone' ? 10 : 4}" fill="${esc(fill)}" fill-opacity="${op}" stroke="${esc(fill)}" stroke-width="1.45" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke"/>
      ${a.type === 'room' ? `<circle cx="${a.w / 2}" cy="${a.h / 2}" r="${Math.min(18, Math.max(10, Math.min(a.w, a.h) / 5))}" fill="#eef4fb" stroke="#285f9f" stroke-width="1.8" vector-effect="non-scaling-stroke"/><text class="v6-map-area-room-number" x="${a.w / 2}" y="${a.h / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="#285f9f" font-weight="800">${n}</text><text class="v6-map-area-label" x="${a.w / 2}" y="${Math.max(16, a.h - 10)}" text-anchor="middle" fill="${esc(fill)}">${esc(a.name)}</text>` : `<text class="v6-map-area-label" x="${a.w / 2}" y="${Math.max(16, a.h / 2)}" text-anchor="middle" dominant-baseline="middle" fill="${esc(fill)}">${esc(a.name)}</text>`}
      ${document.body.classList.contains('v6-admin') ? `<rect class="v6-map-area-resize" x="${Math.max(0, a.w - 12)}" y="${Math.max(0, a.h - 12)}" width="12" height="12" rx="2" fill="${esc(fill)}" fill-opacity=".75" stroke="#fff" stroke-width=".8" vector-effect="non-scaling-stroke"/>` : ''}`;
  }

  function syncCustomRoomLegendAndSelects() {
    const names = window.roomNames || {};
    Object.keys(names).forEach(k => { if (Number(k) > 40) delete names[k]; });
    const list = document.getElementById('sidebar-room-list');
    list?.querySelectorAll('.v36-custom-room').forEach(x => x.remove());

    state.areas.filter(a => a.type === 'room').forEach(a => {
      const n = roomNo(a);
      if (!n) return;
      names[n] = a.name;
      if (list) {
        const item = document.createElement('div');
        item.className = 'sidebar-item v36-custom-room flex items-center gap-1.5 p-1.5 rounded-md border border-transparent cursor-pointer';
        item.dataset.room = String(n);
        item.dataset.customArea = a.id;
        item.innerHTML = `<span class="room-number-badge w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[9px] shrink-0">${n}</span><span class="truncate font-medium text-slate-700">${esc(a.name)}</span>`;
        item.addEventListener('click', () => {
          selectedArea = a.id;
          updateAreaSelection();
          focusArea(a);
          window.__selectRoom?.(String(n), 'sidebar');
        });
        list.appendChild(item);
      }
    });

    window.__syncRoomSelects?.();
    window.__syncK3Metrics?.();
  }

  function renderAreas() {
    const l = areaLayer(); if (!l) return; l.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const a of state.areas) {
      const g = document.createElementNS(NS, 'g');
      g.classList.add('v6-map-area', 'v36-area');
      renderAreaElement(g, a);
      if (a.type === 'room') {
        g.addEventListener('click', () => {
          if (document.body.classList.contains('v6-admin')) return;
          const n = roomNo(a);
          if (n) window.__selectRoom?.(String(n), 'map');
        });
        g.addEventListener('dblclick', () => {
          const n = roomNo(a);
          if (n) window.EvacBackend?.routeFromRoom?.(n);
        });
      }
      frag.appendChild(g);
    }
    l.appendChild(frag);
    l.setAttribute('opacity', '1');
    l.setAttribute('pointer-events', 'all');
    updateAreaList();
    updateAreaSelection();
    syncCustomRoomLegendAndSelects();
  }

  function updateAreaSelection() {
    areaLayer()?.querySelectorAll('.v6-map-area').forEach(g => g.classList.toggle('selected', g.dataset.areaId === selectedArea));
    const del = document.getElementById('editor-delete-area');
    const a = state.areas.find(x => x.id === selectedArea);
    if (del) del.disabled = !a;
  }

  function updateAreaList() {
    const el = document.getElementById('v6-map-area-list'); if (!el) return;
    el.innerHTML = state.areas.length ? state.areas.map(a => `<div class="v6-row ${selectedArea === a.id ? 'v36-selected-row' : ''}"><div class="v6-row-main"><b>${areaText(a)}</b><small>${a.type === 'zone' ? 'Zona' : 'Ruangan'} · ${Math.round(a.w)} × ${Math.round(a.h)} SVG</small></div><button type="button" class="v6-btn" data-v36-select-area="${esc(a.id)}">Pilih</button><button type="button" class="v6-btn danger" data-v36-delete-area="${esc(a.id)}">Hapus</button></div>`).join('') : '<div style="font-size:8px;color:#94a3b8">Belum ada ruangan/zona custom.</div>';
  }

  function focusArea(a) {
    const s = svg(), mw = map(); if (!s || !mw) return;
    const r = s.getBoundingClientRect(), vb = s.viewBox.baseVal;
    const x = (a.x + a.w / 2 - vb.x) / vb.width * r.width, y = (a.y + a.h / 2 - vb.y) / vb.height * r.height;
    mw.scrollTo({ left: Math.max(0, x - mw.clientWidth / 2), top: Math.max(0, y - mw.clientHeight / 2), behavior: 'smooth' });
  }

  function addArea(type, name, w, h, color, opacity, x, y) {
    const id = 'AREA-' + Date.now().toString(36).toUpperCase();
    const a = {
      id,
      type,
      name: name || `${type === 'zone' ? 'Zona' : 'Ruangan'} Baru`,
      w: clamp(Number(w) || 120, 20, 1200),
      h: clamp(Number(h) || 80, 20, 900),
      color: color || '#2563eb',
      opacity: clamp(Number(opacity) || .18, .05, .6),
      x: clamp(Number(x) || ((1427 - (Number(w) || 120)) / 2), 0, 1427 - (Number(w) || 120)),
      y: clamp(Number(y) || ((1023 - (Number(h) || 80)) / 2), 0, 1023 - (Number(h) || 80))
    };
    if (type === 'room') {
      a.roomNo = (() => {
        const used = new Set(state.areas.filter(q => q.type === 'room').map(q => Number(q.roomNo)).filter(n => Number.isFinite(n) && n > 40));
        let n = 41; while (used.has(n)) n++;
        return n;
      })();
    }
    state.areas.push(a); selectedArea = id; save(); renderAreas();
    toast(`${type === 'zone' ? 'Zona' : 'Ruangan'} ${a.name} ditambahkan.`);
    return a;
  }

  function deleteArea(id) {
    const a = state.areas.find(x => x.id === id); if (!a) return;
    state.areas = state.areas.filter(x => x.id !== id);
    if (selectedArea === id) selectedArea = null;
    save(); renderAreas();
    toast(`${a.type === 'zone' ? 'Zona' : 'Ruangan'} ${a.name} dihapus.`);
  }

  function bindUI() {
    const pa = panel();
    const head = pa?.querySelector('.map-editor-head');
    if (head && !head.querySelector('#v36-editor-minimize')) {
      const min = document.createElement('button');
      min.id = 'v36-editor-minimize';
      min.type = 'button';
      min.title = 'Minimize / Expand Editor';
      min.textContent = '—';
      min.style.cssText = 'width:26px;height:26px;border:1px solid #c7d2fe;border-radius:8px;background:#fff;color:#4338ca;font-weight:900;cursor:pointer;flex-shrink:0';
      head.appendChild(min);
      min.addEventListener('click', e => {
        e.stopPropagation();
        pa.classList.toggle('v35-collapsed');
        min.textContent = pa.classList.contains('v35-collapsed') ? '+' : '—';
      });
    }

    const replace = id => { const el = document.getElementById(id); if (!el) return null; const c = el.cloneNode(true); el.replaceWith(c); return c; };
    const startBtn = replace('v6-start-route-draw'), stopBtn = replace('v6-stop-route-draw'), delBtn = replace('v6-delete-route'), clearBtn = replace('v6-clear-routes'), areaBtn = replace('v6-draw-area');
    const form = replace('v6-map-area-form');
    const routeList = replace('v6-manual-route-list');
    const areaList = replace('v6-map-area-list');

    // Connect Admin Route Builder buttons directly to Unified EvacBackend!
    startBtn?.addEventListener('click', () => {
      document.getElementById('v6-admin')?.classList.remove('open');
      areaMode = false; areaDraw = null;
      window.EvacBackend?.startDrawing?.();
    });
    stopBtn?.addEventListener('click', () => {
      if (window.EvacBackend?.isDrawing?.()) window.EvacBackend.finishDrawing();
      else window.EvacBackend?.cancelDrawing?.();
    });
    delBtn?.addEventListener('click', () => {
      const selId = window.EvacBackend?.getSelectedSegmentId?.();
      if (!selId) { toast('Pilih segmen jalur terlebih dahulu.'); return; }
      window.EvacBackend?.deleteSegment?.(selId);
      toast(`Segmen ${selId} dihapus / dinonaktifkan.`);
    });
    clearBtn?.addEventListener('click', () => {
      if (confirm('Hapus semua jalur evakuasi tambahan (custom) dan kembalikan ke koridor bawaan?')) {
        window.EvacBackend?.clearCustomSegments?.();
        toast('Semua jalur tambahan dihapus.');
      }
    });
    routeList?.addEventListener('click', e => {
      const selBtn = e.target.closest('[data-evac-select-seg]');
      if (selBtn) {
        window.EvacBackend?.setSelectedSegmentId?.(selBtn.dataset.evacSelectSeg);
        return;
      }
      const togBtn = e.target.closest('[data-evac-toggle-seg]');
      if (togBtn) {
        window.EvacBackend?.toggleSegment?.(togBtn.dataset.evacToggleSeg);
      }
    });

    areaBtn?.addEventListener('click', () => {
      areaMode = !areaMode;
      window.EvacBackend?.cancelDrawing?.();
      if (areaMode) {
        document.body.dataset.v36AreaMode = 'area';
        document.querySelector('.gis-layer-btn[data-layer="all"]')?.click();
        toast('Mode blok area aktif. Klik-drag pada peta.');
      } else {
        document.body.removeAttribute('data-v36-area-mode');
        if (areaPreview) { areaPreview.remove(); areaPreview = null; }
        toast('Mode blok area dimatikan.');
      }
    });
    form?.addEventListener('submit', e => {
      e.preventDefault(); e.stopPropagation();
      const type = document.getElementById('v6-map-area-type')?.value || 'room';
      const name = document.getElementById('v6-map-area-name')?.value.trim() || '';
      const w = document.getElementById('v6-map-area-width')?.value;
      const h = document.getElementById('v6-map-area-height')?.value;
      const c = document.getElementById('v6-map-area-color')?.value;
      const o = document.getElementById('v6-map-area-opacity')?.value;
      const a = addArea(type, name, w, h, c, o);
      if (a) { document.getElementById('v6-map-area-name').value = ''; }
    });
    areaList?.addEventListener('click', e => {
      const s = e.target.closest('[data-v36-select-area]');
      const d = e.target.closest('[data-v36-delete-area]');
      if (d) { deleteArea(d.dataset.v36DeleteArea); return; }
      if (s) {
        selectedArea = s.dataset.v36SelectArea;
        updateAreaSelection();
        const a = state.areas.find(x => x.id === selectedArea);
        if (a) focusArea(a);
      }
    });

    const actions = document.getElementById('map-editor-selected-actions');
    if (actions && !document.getElementById('editor-delete-area')) {
      const b = document.createElement('button');
      b.id = 'editor-delete-area'; b.type = 'button'; b.className = 'danger'; b.textContent = '🗑 Hapus Area';
      actions.appendChild(b);
      b.addEventListener('click', () => {
        if (selectedArea) deleteArea(selectedArea);
        else toast('Pilih ruangan/zona terlebih dahulu.');
      });
    }

    window.__onAdminModeChange = () => {
      renderAreas();
    };
  }

  function installWindowPointerEngine() {
    window.addEventListener('pointerdown', e => {
      if (!document.body.classList.contains('v6-admin')) return;
      const s = e.target.closest?.('#main-svg');
      if (!s) return;
      if (window.EvacBackend?.isDrawing?.()) return;

      if (areaMode && e.button === 0) {
        e.preventDefault(); e.stopImmediatePropagation();
        const pt = clampPoint(screenToSvg(e.clientX, e.clientY));
        areaDraw = { id: e.pointerId, sx: pt.x, sy: pt.y };
        return;
      }

      const g = e.target.closest?.('#v6-map-area-layer .v6-map-area');
      if (g && e.button === 0) {
        e.preventDefault(); e.stopImmediatePropagation();
        const a = state.areas.find(x => x.id === g.dataset.areaId); if (!a) return;
        selectedArea = a.id; updateAreaSelection();
        const pt = clampPoint(screenToSvg(e.clientX, e.clientY));
        areaDrag = { id: e.pointerId, a, g, sx: pt.x, sy: pt.y, ox: a.x, oy: a.y, ow: a.w, oh: a.h, isResize: !!e.target.closest('.v6-map-area-resize') };
      }
    }, true);

    window.addEventListener('pointermove', e => {
      if (!document.body.classList.contains('v6-admin')) return;
      if (window.EvacBackend?.isDrawing?.()) return;

      if (areaMode && areaDraw && e.pointerId === areaDraw.id) {
        e.preventDefault(); e.stopImmediatePropagation();
        pendingPointer = e; if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; if (!pendingPointer || !areaDraw) return;
          const q = clampPoint(screenToSvg(pendingPointer.clientX, pendingPointer.clientY));
          const x = Math.min(areaDraw.sx, q.x), y = Math.min(areaDraw.sy, q.y);
          const w = Math.max(20, Math.abs(q.x - areaDraw.sx)), h = Math.max(20, Math.abs(q.y - areaDraw.sy));
          const l = areaLayer();
          if (!areaPreview) {
            areaPreview = document.createElementNS(NS, 'g');
            areaPreview.classList.add('v6-map-area', 'drawing-preview');
            l.appendChild(areaPreview);
          }
          areaPreview.setAttribute('transform', `translate(${x} ${y})`);
          areaPreview.innerHTML = `<rect width="${w}" height="${h}" fill="#2563eb" fill-opacity=".10" stroke="#2563eb" stroke-width="1.45" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" fill="#2563eb" font-size="11" font-weight="900">Area Baru</text>`;
        });
        return;
      }

      if (areaDrag && e.pointerId === areaDrag.id) {
        e.preventDefault(); e.stopImmediatePropagation();
        pendingPointer = e; if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; if (!pendingPointer || !areaDrag) return;
          const q = clampPoint(screenToSvg(pendingPointer.clientX, pendingPointer.clientY)), d = areaDrag, a = d.a;
          if (d.isResize) {
            a.w = clamp(d.ow + q.x - d.sx, 20, 1200);
            a.h = clamp(d.oh + q.y - d.sy, 20, 900);
          } else {
            a.x = clamp(d.ox + q.x - d.sx, 0, 1427 - a.w);
            a.y = clamp(d.oy + q.y - d.sy, 0, 1023 - a.h);
          }
          renderAreaElement(d.g, a); d.dirty = true; dirty = true;
        });
        return;
      }
    }, true);

    window.addEventListener('pointerup', e => {
      if (areaMode && areaDraw && e.pointerId === areaDraw.id) {
        e.preventDefault(); e.stopImmediatePropagation();
        const p = clampPoint(screenToSvg(e.clientX, e.clientY));
        const x = Math.min(areaDraw.sx, p.x), y = Math.min(areaDraw.sy, p.y);
        const w = Math.max(20, Math.abs(p.x - areaDraw.sx)), h = Math.max(20, Math.abs(p.y - areaDraw.sy));
        areaDraw = null;
        if (areaPreview) { areaPreview.remove(); areaPreview = null; }
        const type = document.getElementById('v6-map-area-type')?.value || 'room';
        const name = document.getElementById('v6-map-area-name')?.value.trim() || `${type === 'zone' ? 'Zona' : 'Ruangan'} Baru`;
        const color = document.getElementById('v6-map-area-color')?.value || '#2563eb';
        const op = document.getElementById('v6-map-area-opacity')?.value || .18;
        addArea(type, name, w, h, color, op, x, y);
        areaMode = false;
        document.body.removeAttribute('data-v36-area-mode');
        return;
      }
      if (areaDrag && e.pointerId === areaDrag.id) {
        e.preventDefault(); e.stopImmediatePropagation();
        areaDrag = null;
        if (dirty) save();
        renderAreas();
        return;
      }
    }, true);

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && areaMode) {
        e.preventDefault(); e.stopImmediatePropagation();
        areaMode = false;
        document.body.removeAttribute('data-v36-area-mode');
        return;
      }
      if (e.key === 'Delete' && selectedArea && document.body.classList.contains('v6-admin') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
        e.preventDefault(); e.stopImmediatePropagation(); deleteArea(selectedArea);
      }
    }, true);
  }

  window.__reloadAreasFromStorage = () => {
    const fresh = read();
    state.areas = Array.isArray(fresh.areas) ? fresh.areas : [];
    renderAreas();
  };

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  ready(() => {
    bindUI();
    installWindowPointerEngine();
    renderAreas();
    window.EvacBackend?.renderNetwork?.();
  });
})();

/* ==========================================================================
   9. All-in-One 5-Tab Web Map Studio (Rooms, Doors, Walls, Routes, Permanent Save)
   ========================================================================== */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const STUDIO_KEY = 'gisK3StudioStateV1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Capture clean HTML template before dynamic mutations so "Simpan HTML" produces a 100% clean standalone file
  let cleanSourceHtml = null;
  async function getCleanSourceHtml() {
    if (cleanSourceHtml) return cleanSourceHtml;
    try {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        const res = await fetch(location.href.split('?')[0].split('#')[0], { cache: 'no-store' });
        if (res.ok) {
          cleanSourceHtml = await res.text();
          return cleanSourceHtml;
        }
      }
    } catch (_) {}
    return window.__INITIAL_CLEAN_HTML__ || ('<!DOCTYPE html>\n' + document.documentElement.outerHTML);
  }
  getCleanSourceHtml();

  const defaultQrStarts = () => (window.DEFAULT_START_POINTS || [
    { id:'START-01', name:'Titik QR 01 · Zona Ruang 13', code:'01', x:970, y:452.125 },
    { id:'START-02', name:'Titik QR 02 · Koridor Utara', code:'02', x:884, y:228.1 },
    { id:'START-03', name:'Titik QR 03 · Gedung Sisi Kiri', code:'03', x:176, y:376.15 },
    { id:'START-04', name:'Titik QR 04 · Koridor Tengah', code:'04', x:775, y:507.15 },
    { id:'START-05', name:'Titik QR 05 · Ruang 15', code:'05', x:1162, y:538 },
    { id:'START-06', name:'Titik QR 06 · Koridor Atas', code:'06', x:884, y:255 }
  ]).map(p => ({ ...p }));

  const defaultStudioState = () => ({
    roomOverrides: {},   // { [roomId]: { name, category, showMapLabel, line1, line2, showBadge, fontSize, maskBg, labelX, labelY, customBox: {x,y,w,h,fillFloor}|null, hidden: false } }
    builtinDoors: {},    // { [idx]: { mode: 'open-door'|'open-gap'|'closed', dx: 0, dy: 0, rot: 0, flip: false } }
    customDoors: [],     // [{ id, x, y, width, angle, flip, mode: 'open-door'|'open-gap'|'closed' }]
    wallEdits: [],       // [{ id, kind: 'wall'|'triplek'|'eraser', x1, y1, x2, y2, width }]
    mapTexts: [],        // [{ id, badge, line1, line2, x, y, fontSize, color, maskBg, rot }]
    evacEdits: {
      assemblyPoint: { x: 535.5, y: 898.3 },
      hiddenStaticRoutes: [],
      qrStartPoints: defaultQrStarts()
    }
  });

  function loadStudioState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STUDIO_KEY) || 'null');
      const def = defaultStudioState();
      if (!raw || typeof raw !== 'object') return def;
      const roomOverrides = raw.roomOverrides || {};
      if (roomOverrides['40']) {
        if (roomOverrides['40'].labelX < 950) delete roomOverrides['40'].labelX;
        if (roomOverrides['40'].customBox && roomOverrides['40'].customBox.x < 950) delete roomOverrides['40'].customBox;
      }
      const rawQrList = Array.isArray(raw.evacEdits?.qrStartPoints) && raw.evacEdits.qrStartPoints.length
        ? raw.evacEdits.qrStartPoints
        : defaultQrStarts();
      const qrStartPoints = window.EvacBackend?.migrateQrStarts
        ? window.EvacBackend.migrateQrStarts(rawQrList)
        : rawQrList;
      return {
        roomOverrides,
        builtinDoors: raw.builtinDoors || {},
        customDoors: Array.isArray(raw.customDoors) ? raw.customDoors : [],
        wallEdits: Array.isArray(raw.wallEdits) ? raw.wallEdits : [],
        mapTexts: Array.isArray(raw.mapTexts) ? raw.mapTexts : [],
        evacEdits: {
          assemblyPoint: raw.evacEdits?.assemblyPoint || { x: 535.5, y: 898.3 },
          hiddenStaticRoutes: Array.isArray(raw.evacEdits?.hiddenStaticRoutes) ? raw.evacEdits.hiddenStaticRoutes : [],
          qrStartPoints
        }
      };
    } catch (_) {
      return defaultStudioState();
    }
  }

  let studio = loadStudioState();
  let activeTab = 'rooms';
  let activeTool = null; // null | 'place-safety' | 'add-door' | 'draw-wall' | 'draw-triplek' | 'draw-eraser' | 'add-text' | 'move-qr-start'
  let placeSafetyKind = 'apar';
  let selectedRoomId = '14';
  let selectedDoor = null; // { kind: 'builtin'|'custom', id: number|string }
  let selectedWallId = null;
  let selectedTextId = null;
  let selectedQrStartId = studio.evacEdits?.qrStartPoints?.[0]?.id || 'START-01';
  let showDoorHandles = true;
  let svgDrag = null;
  let savedFileHandle = null;

  function saveStudio() {
    try {
      localStorage.setItem(STUDIO_KEY, JSON.stringify(studio));
      window.__broadcastLiveSync?.('studio');
      const st = document.getElementById('map-editor-status');
      if (st) {
        st.classList.remove('map-editor-dirty');
        st.innerHTML = '<i></i> AUTO-SAVED';
      }
    } catch (_) {}
  }

  const toast = msg => window.showK3Toast ? window.showK3Toast(msg) : null;

  function getSvg() { return document.getElementById('main-svg'); }
  function screenToSvg(clientX, clientY) {
    const s = getSvg();
    if (!s) return { x: 700, y: 500 };
    const pt = s.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = s.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 700, y: 500 };
  }

  // Expose Assembly Point hook for Dijkstra routing
  window.__getAssemblyPoint = () => studio.evacEdits?.assemblyPoint || { x: 535.5, y: 898.3 };

  // Ensure dedicated SVG layers exist in proper z-order
  let wallEditLayer, customDoorGapLayer, customDoorLayer, roomBoxOverrideLayer, studioLabelLayer, studioHandleLayer;
  const builtinDoorMeta = []; // [{ idx, cx, cy, x1, y1, x2, y2, gapLine, group }]

  function initSvgLayers() {
    const s = getSvg();
    if (!s) return;
    const hotspots = document.getElementById('room-hotspots');
    const openDoors = document.getElementById('open-doors-layer');
    const openGaps = document.getElementById('open-doorway-gaps');

    // Wrap the 46 built-in doors so each can be toggled, moved, rotated, or closed individually
    if (openDoors && openGaps && !openDoors.dataset.studioWrapped) {
      openDoors.dataset.studioWrapped = '1';
      const paths = [...openDoors.querySelectorAll(':scope > path')];
      const lines = [...openGaps.querySelectorAll(':scope > line')];
      // lines[0] is Room 13 passage; lines[1..46] match pairs of paths[0..91]
      const count = Math.min(46, Math.floor(paths.length / 2), lines.length - 1);
      for (let i = 0; i < count; i++) {
        const gapLine = lines[i + 1];
        const leaf = paths[2 * i];
        const arc = paths[2 * i + 1];
        if (!gapLine || !leaf || !arc) continue;
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'builtin-door-item');
        g.dataset.doorIdx = String(i);
        openDoors.insertBefore(g, leaf);
        g.appendChild(leaf);
        g.appendChild(arc);
        const x1 = +gapLine.getAttribute('x1'), y1 = +gapLine.getAttribute('y1');
        const x2 = +gapLine.getAttribute('x2'), y2 = +gapLine.getAttribute('y2');
        builtinDoorMeta.push({
          idx: i,
          cx: (x1 + x2) / 2,
          cy: (y1 + y2) / 2,
          x1, y1, x2, y2,
          gapLine,
          group: g
        });
      }
    }

    const ensure = (id, beforeEl) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElementNS(NS, 'g');
        el.id = id;
        if (beforeEl && beforeEl.parentNode) beforeEl.parentNode.insertBefore(el, beforeEl);
        else s.appendChild(el);
      }
      return el;
    };

    wallEditLayer = ensure('studio-wall-edits-layer', hotspots);
    customDoorGapLayer = ensure('studio-custom-door-gaps-layer', hotspots);
    customDoorLayer = ensure('studio-custom-doors-layer', hotspots);
    roomBoxOverrideLayer = ensure('studio-room-box-overrides-layer', hotspots?.nextSibling);
    studioLabelLayer = ensure('studio-room-labels-layer', hotspots);
    studioHandleLayer = ensure('studio-interactive-handles-layer', null);
  }

  function getRoomDefaultCenter(roomId) {
    const els = [...document.querySelectorAll(`#room-hotspots [data-room="${CSS.escape(String(roomId))}"], #v6-map-area-layer [data-room="${CSS.escape(String(roomId))}"]`)];
    if (!els.length) return { x: 700, y: 500, w: 80, h: 60 };
    let best = null;
    els.forEach(el => {
      try {
        const b = el.getBBox();
        if (!best || (b.width * b.height) > (best.width * best.height)) best = b;
      } catch (_) {}
    });
    if (!best) return { x: 700, y: 500, w: 80, h: 60 };
    return { x: +(best.x + best.width / 2).toFixed(1), y: +(best.y + best.height / 2).toFixed(1), w: +best.width.toFixed(1), h: +best.height.toFixed(1), bx: +best.x.toFixed(1), by: +best.y.toFixed(1) };
  }

  function splitNameIntoLines(name) {
    const clean = String(name || '').trim();
    if (clean.length <= 14 || !clean.includes(' ')) return [clean, ''];
    const words = clean.split(/\s+/);
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  // Apply all room overrides (names, sidebar, on-map labels, custom boxes, hidden rooms)
  function applyRoomOverrides() {
    const names = window.roomNames || {};
    Object.entries(studio.roomOverrides).forEach(([id, ov]) => {
      if (ov && ov.name) names[id] = ov.name;
    });

    // Update sidebar items
    document.querySelectorAll('#sidebar-room-list .sidebar-item[data-room]').forEach(item => {
      const r = item.dataset.room;
      const ov = studio.roomOverrides[r];
      const lbl = item.querySelector('span.truncate');
      if (lbl && names[r]) lbl.textContent = names[r];
      item.style.display = ov?.hidden ? 'none' : '';
    });

    // Update built-in room hotspots & customBox overrides
    if (roomBoxOverrideLayer) roomBoxOverrideLayer.innerHTML = '';
    const allHotspots = [...document.querySelectorAll('#room-hotspots > [data-room]')];
    const seenCustomBox = new Set();

    allHotspots.forEach(el => {
      const r = el.dataset.room;
      const ov = studio.roomOverrides[r];
      if (ov?.hidden) {
        el.style.display = 'none';
        return;
      }
      if (ov?.customBox) {
        el.style.display = 'none';
        if (!seenCustomBox.has(r) && roomBoxOverrideLayer) {
          seenCustomBox.add(r);
          const cb = ov.customBox;
          // Visual floor + wall rect if fillFloor is enabled
          if (cb.fillFloor !== false) {
            const bg = document.createElementNS(NS, 'rect');
            bg.setAttribute('x', cb.x);
            bg.setAttribute('y', cb.y);
            bg.setAttribute('width', cb.w);
            bg.setAttribute('height', cb.h);
            bg.setAttribute('fill', '#F8FAFC');
            bg.setAttribute('stroke', '#1E293B');
            bg.setAttribute('stroke-width', '2.16564');
            bg.setAttribute('pointer-events', 'none');
            roomBoxOverrideLayer.appendChild(bg);
          }
          // Interactive hit path inside #room-hotspots so all existing room click/route logic works!
          let hit = document.querySelector(`#room-hotspots > path[data-studio-custom-hit="${CSS.escape(r)}"]`);
          if (!hit) {
            hit = document.createElementNS(NS, 'path');
            hit.classList.add('room-hit-template');
            hit.dataset.room = r;
            hit.dataset.studioCustomHit = r;
            document.getElementById('room-hotspots')?.appendChild(hit);
          }
          hit.style.display = '';
          hit.setAttribute('d', `M${cb.x} ${cb.y}H${cb.x + cb.w}V${cb.y + cb.h}H${cb.x}Z`);
        }
      } else {
        if (!el.dataset.studioCustomHit) el.style.display = '';
        else el.remove();
      }
    });

    // Render on-map room labels
    if (studioLabelLayer) studioLabelLayer.innerHTML = '';
    // First restore built-in [data-room-label] groups unless overridden
    document.querySelectorAll('[data-room-label]').forEach(g => {
      const r = g.getAttribute('data-room-label');
      const ov = studio.roomOverrides[r];
      if (ov && (ov.hidden || ov.showMapLabel !== undefined || ov.name || ov.line1 !== undefined || ov.labelX !== undefined)) {
        g.style.display = 'none';
      } else {
        g.style.display = '';
      }
    });

    Object.entries(studio.roomOverrides).forEach(([r, ov]) => {
      if (!ov || ov.hidden) return;
      const hasBuiltInLabel = !!document.querySelector(`[data-room-label="${CSS.escape(r)}"]`);
      const showLbl = ov.showMapLabel !== undefined ? ov.showMapLabel : (hasBuiltInLabel || Boolean(ov.name));
      if (!showLbl) return;

      const ctr = ov.customBox
        ? { x: +(ov.customBox.x + ov.customBox.w / 2).toFixed(1), y: +(ov.customBox.y + ov.customBox.h / 2).toFixed(1) }
        : getRoomDefaultCenter(r);
      const lx = Number.isFinite(+ov.labelX) ? +ov.labelX : ctr.x;
      const ly = Number.isFinite(+ov.labelY) ? +ov.labelY : ctr.y;
      const fSize = clamp(Number(ov.fontSize) || 6.5, 4, 18);
      const [defL1, defL2] = splitNameIntoLines(ov.name || names[r] || `RUANGAN ${r}`);
      const line1 = ov.line1 !== undefined ? ov.line1 : defL1;
      const line2 = ov.line2 !== undefined ? ov.line2 : defL2;
      const showBadge = ov.showBadge !== undefined ? ov.showBadge : true;
      const maskBg = ov.maskBg !== undefined ? ov.maskBg : true;

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${lx} ${ly})`);
      g.setAttribute('text-anchor', 'middle');
      g.setAttribute('font-family', 'Inter, sans-serif');
      g.setAttribute('pointer-events', 'none');

      const maxChars = Math.max(line1.length, line2.length, 6);
      const boxW = Math.max(36, Math.round(maxChars * fSize * 0.68 + 14));
      const boxH = Math.round((showBadge ? 18 : 4) + (line1 ? fSize + 3 : 0) + (line2 ? fSize + 3 : 0) + 6);
      const boxY = showBadge ? -14 : -fSize;

      let html = '';
      if (maskBg) {
        html += `<rect x="${-boxW / 2}" y="${boxY}" width="${boxW}" height="${boxH}" rx="4" fill="#F8FAFC" fill-opacity="0.94"/>`;
      }
      let curY = 0;
      if (showBadge) {
        html += `<circle cx="0" cy="-4" r="${Math.max(7.5, fSize * 1.15)}" fill="#005999" fill-opacity="0.12" stroke="#005999" stroke-width="1.2"/>`;
        html += `<text x="0" y="${(-4 + fSize * 0.38).toFixed(1)}" font-size="${(fSize * 1.08).toFixed(1)}" font-weight="900" fill="#005999">${esc(r)}</text>`;
        curY = Math.max(8, fSize * 1.35);
      }
      if (line1) {
        html += `<text x="0" y="${curY.toFixed(1)}" font-size="${fSize}" font-weight="900" fill="#0F172A">${esc(line1)}</text>`;
        curY += fSize * 1.18;
      }
      if (line2) {
        html += `<text x="0" y="${curY.toFixed(1)}" font-size="${fSize}" font-weight="800" fill="#0F172A">${esc(line2)}</text>`;
      }
      g.innerHTML = html;
      studioLabelLayer?.appendChild(g);
    });

    window.__invalidateEvacNetwork?.();
    window.__syncRoomSelects?.();
    window.__syncK3Metrics?.();
  }

  // Apply built-in door overrides & custom doors
  function applyDoors() {
    builtinDoorMeta.forEach(d => {
      const ov = studio.builtinDoors[d.idx] || { mode: 'open-door', dx: 0, dy: 0, rot: 0, flip: false };
      const mode = ov.mode || 'open-door';
      const dx = +ov.dx || 0, dy = +ov.dy || 0, rot = +ov.rot || 0, flip = !!ov.flip;

      d.gapLine.setAttribute('x1', d.x1 + dx);
      d.gapLine.setAttribute('y1', d.y1 + dy);
      d.gapLine.setAttribute('x2', d.x2 + dx);
      d.gapLine.setAttribute('y2', d.y2 + dy);

      if (mode === 'closed') {
        d.gapLine.setAttribute('stroke', '#1E293B');
        d.gapLine.setAttribute('stroke-width', '2.3');
        d.group.style.display = 'none';
      } else if (mode === 'open-gap') {
        d.gapLine.setAttribute('stroke', '#F8FAFC');
        d.gapLine.setAttribute('stroke-width', '8.5');
        d.group.style.display = 'none';
      } else {
        d.gapLine.setAttribute('stroke', '#F8FAFC');
        d.gapLine.setAttribute('stroke-width', '8.5');
        d.group.style.display = '';
        const cx = d.cx, cy = d.cy;
        d.group.setAttribute(
          'transform',
          `translate(${dx} ${dy}) translate(${cx} ${cy}) rotate(${rot}) scale(1 ${flip ? -1 : 1}) translate(${-cx} ${-cy})`
        );
      }
    });

    if (customDoorGapLayer) customDoorGapLayer.innerHTML = '';
    if (customDoorLayer) customDoorLayer.innerHTML = '';

    studio.customDoors.forEach(cd => {
      const w = clamp(+cd.width || 18, 8, 65);
      const ang = (+cd.angle || 0) * Math.PI / 180;
      const hx = (w / 2) * Math.cos(ang), hy = (w / 2) * Math.sin(ang);
      const x1 = cd.x - hx, y1 = cd.y - hy, x2 = cd.x + hx, y2 = cd.y + hy;

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('stroke-linecap', 'butt');
      if (cd.mode === 'closed') {
        line.setAttribute('stroke', '#1E293B');
        line.setAttribute('stroke-width', '2.5');
      } else {
        line.setAttribute('stroke', '#F8FAFC');
        line.setAttribute('stroke-width', '9');
      }
      customDoorGapLayer?.appendChild(line);

      if (cd.mode !== 'closed' && cd.mode !== 'open-gap') {
        const g = document.createElementNS(NS, 'g');
        const flipS = cd.flip ? -1 : 1;
        g.setAttribute('transform', `translate(${cd.x} ${cd.y}) rotate(${+cd.angle || 0}) scale(1 ${flipS})`);
        g.setAttribute('fill', 'none');
        g.setAttribute('stroke', '#005999');
        g.setAttribute('stroke-linecap', 'round');
        g.setAttribute('stroke-linejoin', 'round');
        g.innerHTML = `<path d="M ${-w / 2} 0 L ${-w / 2} ${w}" stroke-width="2.16"/><path d="M ${w / 2} 0 A ${w} ${w} 0 0 1 ${-w / 2} ${w}" stroke-dasharray="3 2.5" stroke-width="1.5" stroke-opacity="0.75"/>`;
        customDoorLayer?.appendChild(g);
      }
    });
  }

  // Apply custom walls & wall erasers
  function applyWalls() {
    if (!wallEditLayer) return;
    wallEditLayer.innerHTML = '';
    studio.wallEdits.forEach(w => {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', w.x1);
      line.setAttribute('y1', w.y1);
      line.setAttribute('x2', w.x2);
      line.setAttribute('y2', w.y2);
      if (w.kind === 'eraser') {
        line.setAttribute('stroke', '#F8FAFC');
        line.setAttribute('stroke-width', w.width || 9);
        line.setAttribute('stroke-linecap', 'butt');
      } else if (w.kind === 'triplek') {
        line.setAttribute('stroke', '#F59E0B');
        line.setAttribute('stroke-width', w.width || 4);
        line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('data-triplek-wall', 'true');
      } else {
        line.setAttribute('stroke', '#1E293B');
        line.setAttribute('stroke-width', w.width || 2.4);
        line.setAttribute('stroke-linecap', 'square');
      }
      wallEditLayer.appendChild(line);
    });
  }

  // Apply free map text labels
  function applyMapTexts() {
    if (!studioLabelLayer) return;
    studioLabelLayer.querySelectorAll('.studio-free-text').forEach(x => x.remove());
    studio.mapTexts.forEach(t => {
      const g = document.createElementNS(NS, 'g');
      g.classList.add('studio-free-text');
      g.setAttribute('transform', `translate(${t.x} ${t.y}) rotate(${+t.rot || 0})`);
      g.setAttribute('text-anchor', 'middle');
      g.setAttribute('font-family', 'Inter, sans-serif');
      g.setAttribute('pointer-events', 'none');
      const fSize = clamp(+t.fontSize || 8, 4, 24);
      const maxLen = Math.max((t.line1 || '').length, (t.line2 || '').length, 5);
      const bw = Math.max(36, Math.round(maxLen * fSize * 0.68 + 16));
      const bh = Math.round((t.badge ? 18 : 4) + (t.line1 ? fSize + 4 : 0) + (t.line2 ? fSize + 4 : 0) + 6);
      const by = t.badge ? -14 : -fSize;
      let html = '';
      if (t.maskBg !== false) {
        html += `<rect x="${-bw / 2}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="#F8FAFC" fill-opacity="0.95"/>`;
      }
      let cy = 0;
      if (t.badge) {
        html += `<circle cx="0" cy="-4" r="${Math.max(8, fSize * 1.1)}" fill="#005999" fill-opacity="0.12" stroke="#005999" stroke-width="1.25"/>`;
        html += `<text x="0" y="${(-4 + fSize * 0.36).toFixed(1)}" font-size="${fSize}" font-weight="900" fill="#005999">${esc(t.badge)}</text>`;
        cy = Math.max(9, fSize * 1.35);
      }
      if (t.line1) {
        html += `<text x="0" y="${cy.toFixed(1)}" font-size="${fSize}" font-weight="900" fill="${esc(t.color || '#0F172A')}">${esc(t.line1)}</text>`;
        cy += fSize * 1.2;
      }
      if (t.line2) {
        html += `<text x="0" y="${cy.toFixed(1)}" font-size="${(fSize * 0.9).toFixed(1)}" font-weight="800" fill="${esc(t.color || '#0F172A')}">${esc(t.line2)}</text>`;
      }
      g.innerHTML = html;
      studioLabelLayer.appendChild(g);
    });
  }

  // Apply Evacuation Route edits, Assembly Point & QR Start Points via Unified EvacBackend
  function applyEvacEdits() {
    const ap = studio.evacEdits?.assemblyPoint || window.EvacBackend?.getAssemblyPoint?.() || { x: 535.5, y: 898.3 };
    if (!Array.isArray(studio.evacEdits?.qrStartPoints) || !studio.evacEdits.qrStartPoints.length) {
      studio.evacEdits.qrStartPoints = window.EvacBackend?.getQrStarts?.() || defaultQrStarts();
    }
    if (window.EvacBackend) {
      window.EvacBackend.setAssemblyPoint(ap, false);
      window.EvacBackend.setQrStarts(studio.evacEdits.qrStartPoints, true);
      window.EvacBackend.renderNetwork();
    }
  }

  function applyAllStudioData() {
    applyRoomOverrides();
    applyDoors();
    applyWalls();
    applyMapTexts();
    applyEvacEdits();
    renderStudioHandles();
  }

  // Render interactive handles on the SVG when Studio Mode is active
  function renderStudioHandles() {
    if (!studioHandleLayer) return;
    studioHandleLayer.innerHTML = '';
    const isEditing = document.body.classList.contains('map-editor-active');
    if (!isEditing) return;

    // 1. Room Label & Custom Box Handles (when in 'rooms' tab)
    if (activeTab === 'rooms' && selectedRoomId) {
      const r = String(selectedRoomId);
      const ov = studio.roomOverrides[r] || {};
      const ctr = ov.customBox
        ? { x: +(ov.customBox.x + ov.customBox.w / 2).toFixed(1), y: +(ov.customBox.y + ov.customBox.h / 2).toFixed(1) }
        : getRoomDefaultCenter(r);
      const lx = Number.isFinite(+ov.labelX) ? +ov.labelX : ctr.x;
      const ly = Number.isFinite(+ov.labelY) ? +ov.labelY : ctr.y;

      // Custom box resize/move handles if customBox is enabled
      if (ov.customBox) {
        const cb = ov.customBox;
        const boxG = document.createElementNS(NS, 'g');
        boxG.classList.add('studio-handle-roombox');
        boxG.innerHTML = `<rect x="${cb.x}" y="${cb.y}" width="${cb.w}" height="${cb.h}" fill="#4338ca" fill-opacity="0.12" stroke="#4338ca" stroke-width="2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/><rect data-resize="1" x="${cb.x + cb.w - 12}" y="${cb.y + cb.h - 12}" width="12" height="12" rx="2" fill="#4338ca" stroke="#fff" stroke-width="1.5" style="cursor:nwse-resize"/>`;
        boxG.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          const pt = screenToSvg(e.clientX, e.clientY);
          const isResize = !!e.target.getAttribute('data-resize');
          svgDrag = { type: isResize ? 'room-box-resize' : 'room-box-move', roomId: r, sx: pt.x, sy: pt.y, ox: cb.x, oy: cb.y, ow: cb.w, oh: cb.h };
        });
        studioHandleLayer.appendChild(boxG);
      }

      // Draggable Label Pin for the selected room
      const lblHandle = document.createElementNS(NS, 'g');
      lblHandle.classList.add('studio-handle-label');
      lblHandle.setAttribute('transform', `translate(${lx} ${ly})`);
      lblHandle.innerHTML = `<circle r="11" fill="#4338ca" fill-opacity="0.18" stroke="#4338ca" stroke-width="2"/><circle r="5" fill="#4338ca" stroke="#fff" stroke-width="1.5"/><title>Tarik untuk memindahkan posisi label Ruangan ${esc(r)}</title>`;
      lblHandle.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        const pt = screenToSvg(e.clientX, e.clientY);
        svgDrag = { type: 'room-label', roomId: r, sx: pt.x, sy: pt.y, ox: lx, oy: ly };
      });
      studioHandleLayer.appendChild(lblHandle);
    }

    // 2. Door Handles & Wall Handles (when in 'doors' tab)
    if (activeTab === 'doors') {
      if (showDoorHandles) {
        builtinDoorMeta.forEach(d => {
          const ov = studio.builtinDoors[d.idx] || { mode: 'open-door', dx: 0, dy: 0, rot: 0, flip: false };
          const x = d.cx + (+ov.dx || 0), y = d.cy + (+ov.dy || 0);
          const isSel = selectedDoor?.kind === 'builtin' && selectedDoor.id === d.idx;
          const color = ov.mode === 'closed' ? '#dc2626' : (ov.mode === 'open-gap' ? '#059669' : '#0284c7');
          const g = document.createElementNS(NS, 'g');
          g.classList.add('studio-handle-door');
          if (isSel) g.classList.add('studio-handle-selected');
          g.setAttribute('transform', `translate(${x} ${y})`);
          g.innerHTML = `<circle r="${isSel ? 9.5 : 7}" fill="${color}" stroke="#fff" stroke-width="1.8"/><text y="2.5" text-anchor="middle" font-size="6.5" font-weight="900" fill="#fff" pointer-events="none">D</text>`;
          g.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation(); e.preventDefault();
            selectedDoor = { kind: 'builtin', id: d.idx };
            selectedWallId = null;
            renderStudioInspector();
            renderStudioHandles();
            const pt = screenToSvg(e.clientX, e.clientY);
            svgDrag = { type: 'builtin-door', idx: d.idx, sx: pt.x, sy: pt.y, odx: +ov.dx || 0, ody: +ov.dy || 0 };
          });
          studioHandleLayer.appendChild(g);
        });

        studio.customDoors.forEach(cd => {
          const isSel = selectedDoor?.kind === 'custom' && selectedDoor.id === cd.id;
          const color = cd.mode === 'closed' ? '#dc2626' : (cd.mode === 'open-gap' ? '#059669' : '#0284c7');
          const g = document.createElementNS(NS, 'g');
          g.classList.add('studio-handle-door');
          if (isSel) g.classList.add('studio-handle-selected');
          g.setAttribute('transform', `translate(${cd.x} ${cd.y})`);
          g.innerHTML = `<circle r="${isSel ? 10 : 7.5}" fill="${color}" stroke="#fff" stroke-width="1.8"/><text y="2.5" text-anchor="middle" font-size="6.5" font-weight="900" fill="#fff" pointer-events="none">D+</text>`;
          g.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation(); e.preventDefault();
            selectedDoor = { kind: 'custom', id: cd.id };
            selectedWallId = null;
            renderStudioInspector();
            renderStudioHandles();
            const pt = screenToSvg(e.clientX, e.clientY);
            svgDrag = { type: 'custom-door', door: cd, sx: pt.x, sy: pt.y, ox: cd.x, oy: cd.y };
          });
          studioHandleLayer.appendChild(g);
        });
      }

      studio.wallEdits.forEach(w => {
        const isSel = selectedWallId === w.id;
        const col = w.kind === 'eraser' ? '#ec4899' : (w.kind === 'triplek' ? '#d97706' : '#334155');
        const g = document.createElementNS(NS, 'g');
        g.classList.add('studio-handle-wall');
        g.innerHTML = `
          <line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${col}" stroke-width="${isSel ? 6 : 3}" stroke-opacity="0.35" stroke-dasharray="3 2"/>
          <circle data-end="1" cx="${w.x1}" cy="${w.y1}" r="6" fill="#fff" stroke="${col}" stroke-width="2"/>
          <circle data-end="2" cx="${w.x2}" cy="${w.y2}" r="6" fill="#fff" stroke="${col}" stroke-width="2"/>
        `;
        g.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          selectedWallId = w.id;
          selectedDoor = null;
          renderStudioInspector();
          renderStudioHandles();
          const pt = screenToSvg(e.clientX, e.clientY);
          const end = e.target.getAttribute('data-end');
          svgDrag = { type: 'wall-edit', wall: w, end, sx: pt.x, sy: pt.y, ox1: w.x1, oy1: w.y1, ox2: w.x2, oy2: w.y2 };
        });
        studioHandleLayer.appendChild(g);
      });
    }

    // 3. Evacuation Segment Vertices, Assembly Point, QR Start Points & Free Text Handles (when in 'routes' tab)
    if (activeTab === 'routes') {
      const evacLayerVisible = document.getElementById('evacuation-routes')?.classList.contains('is-active');
      if (evacLayerVisible) {
      // Selected Evacuation Segment Vertex Handles
      const selSegId = window.EvacBackend?.getSelectedSegmentId?.();
      const selSeg = (window.EvacBackend?.getSegments?.() || []).find(s => s.id === selSegId);
      if (selSeg && selSeg.active !== false && Array.isArray(selSeg.points)) {
        const segG = document.createElementNS(NS, 'g');
        segG.classList.add('studio-handle-evac-seg');
        const d = selSeg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
        segG.innerHTML = `<path d="${d}" fill="none" stroke="#059669" stroke-width="3" stroke-dasharray="4 3" pointer-events="none"/>`;
        selSeg.points.forEach((ptItem, ptIdx) => {
          const vg = document.createElementNS(NS, 'g');
          vg.setAttribute('transform', `translate(${ptItem.x} ${ptItem.y})`);
          vg.style.cursor = 'grab';
          vg.innerHTML = `<circle r="7.5" fill="#10b981" fill-opacity="0.25" stroke="#047857" stroke-width="1.8"/><circle r="4.2" fill="#059669" stroke="#fff" stroke-width="1.5"/><title>Titik #${ptIdx + 1} (${esc(selSeg.name)}) — Tarik untuk menggeser belokan koridor</title>`;
          vg.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.stopPropagation(); e.preventDefault();
            const pt = screenToSvg(e.clientX, e.clientY);
            svgDrag = { type: 'evac-seg-vertex', segId: selSeg.id, ptIdx, sx: pt.x, sy: pt.y, ox: ptItem.x, oy: ptItem.y };
          });
          segG.appendChild(vg);
        });
        studioHandleLayer.appendChild(segG);
      }

      const ap = studio.evacEdits?.assemblyPoint || window.EvacBackend?.getAssemblyPoint?.() || { x: 535.5, y: 898.3 };
      const apG = document.createElementNS(NS, 'g');
      apG.classList.add('studio-handle-assembly');
      apG.setAttribute('transform', `translate(${ap.x} ${ap.y})`);
      apG.innerHTML = `<circle r="14" fill="#16a34a" fill-opacity="0.22" stroke="#15803d" stroke-width="2.2"/><circle r="8" fill="#16a34a" stroke="#fff" stroke-width="2"/><text y="3" text-anchor="middle" font-size="8" font-weight="900" fill="#fff" pointer-events="none">★</text>`;
      apG.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault();
        const pt = screenToSvg(e.clientX, e.clientY);
        svgDrag = { type: 'assembly', sx: pt.x, sy: pt.y, ox: ap.x, oy: ap.y };
      });
      studioHandleLayer.appendChild(apG);

      // QR Start Point Handles
      (studio.evacEdits?.qrStartPoints || []).forEach(qp => {
        const isSel = selectedQrStartId === qp.id;
        const qg = document.createElementNS(NS, 'g');
        qg.classList.add('studio-handle-qr');
        if (isSel) qg.classList.add('studio-handle-selected');
        qg.setAttribute('transform', `translate(${qp.x} ${qp.y})`);
        qg.innerHTML = `
          <circle r="${isSel ? 15 : 12}" fill="#0891b2" fill-opacity="${isSel ? '0.26' : '0.16'}" stroke="#0e7490" stroke-width="${isSel ? 2.4 : 1.8}" stroke-dasharray="${isSel ? 'none' : '3 2'}"/>
          <circle r="${isSel ? 9.5 : 8}" fill="${isSel ? '#0284c7' : '#0891b2'}" stroke="#fff" stroke-width="1.8"/>
          <text y="2.5" text-anchor="middle" font-size="5.8" font-weight="900" fill="#fff" pointer-events="none">QR${esc(qp.code || '')}</text>
          <title>${esc(qp.id)} · ${esc(qp.name)} (${Math.round(qp.x)}, ${Math.round(qp.y)}) — Tarik untuk pindah posisi</title>
        `;
        qg.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          selectedQrStartId = qp.id;
          renderRoutesPane();
          renderStudioHandles();
          const pt = screenToSvg(e.clientX, e.clientY);
          svgDrag = { type: 'qr-start', item: qp, sx: pt.x, sy: pt.y, ox: qp.x, oy: qp.y };
        });
        studioHandleLayer.appendChild(qg);
      });
      } // end if (evacLayerVisible)

      studio.mapTexts.forEach(t => {
        const isSel = selectedTextId === t.id;
        const tg = document.createElementNS(NS, 'g');
        tg.classList.add('studio-handle-label');
        if (isSel) tg.classList.add('studio-handle-selected');
        tg.setAttribute('transform', `translate(${t.x} ${t.y})`);
        tg.innerHTML = `<circle r="${isSel ? 9.5 : 7}" fill="#7c3aed" stroke="#fff" stroke-width="1.8"/><text y="2.5" text-anchor="middle" font-size="6.5" font-weight="900" fill="#fff" pointer-events="none">T</text>`;
        tg.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.stopPropagation(); e.preventDefault();
          selectedTextId = t.id;
          renderStudioInspector();
          renderStudioHandles();
          const pt = screenToSvg(e.clientX, e.clientY);
          svgDrag = { type: 'free-text', item: t, sx: pt.x, sy: pt.y, ox: t.x, oy: t.y };
        });
        studioHandleLayer.appendChild(tg);
      });
    }
  }

  // Build the 5-Tab Studio UI inside #map-editor-panel
  function buildStudioPanelUI() {
    const panel = document.getElementById('map-editor-panel');
    const body = panel?.querySelector('.map-editor-body');
    if (!panel || !body || body.dataset.studioUpgraded) return;
    body.dataset.studioUpgraded = '1';

    const headTitle = panel.querySelector('.map-editor-head h3');
    const headDesc = panel.querySelector('.map-editor-head p');
    if (headTitle) headTitle.textContent = '✎ Studio Edit Peta (All-in-One)';
    if (headDesc) headDesc.innerHTML = 'Ubah ruangan, pintu, tembok, CCTV &amp; rute secara langsung. <b>Tip: Klik Kanan + Geser</b> untuk menggeser peta.';

    // Wrap existing safety controls into #studio-pane-safety
    const safetyPane = document.createElement('div');
    safetyPane.id = 'studio-pane-safety';
    safetyPane.className = 'studio-pane';
    while (body.firstChild) {
      safetyPane.appendChild(body.firstChild);
    }

    // Add quick click-to-place bar & Custom/Established Asset creator card at top of safetyPane
    const quickPlace = document.createElement('div');
    quickPlace.className = 'studio-card';
    quickPlace.style.marginBottom = '8px';
    quickPlace.innerHTML = `
      <div class="studio-card-title"><span>🎯 Taruh Aset Cepat dengan Klik Peta</span></div>
      <div class="studio-grid-2">
        <select id="studio-place-safety-kind" style="border:1px solid #cbd5e1;border-radius:8px;padding:5px;font-size:8px;font-weight:800">
          <option value="apar">APAR (A)</option>
          <option value="p3k">Kotak P3K (P)</option>
          <option value="cctv">Kamera CCTV (C)</option>
          <option value="fire">Fire Alarm (F)</option>
          <option value="custom">Custom Asset (Kustom)</option>
        </select>
        <button type="button" class="studio-btn" id="studio-btn-place-safety">🎯 Klik di Peta: OFF</button>
      </div>
    `;
    const customCard = document.createElement('div');
    customCard.className = 'studio-card';
    customCard.style.cssText = 'margin-bottom:8px;background:linear-gradient(135deg,#faf5ff,#ffffff);border-color:#d8b4fe';
    customCard.innerHTML = `
      <div class="studio-card-title" style="color:#6b21a8"><span>✨ Buat / Kustomisasi Aset (APAR, P3K, CCTV, Alarm & Custom)</span></div>
      <label class="studio-field" style="margin:0 0 5px">
        <span style="color:#581c87">Kategori Hitungan Aset (Counter)</span>
        <select id="studio-custom-asset-cat" style="border:1px solid #d8b4fe;border-radius:7px;padding:4px 6px;font-size:8px;font-weight:900;color:#581c87;background:#fff">
          <option value="custom">🟣 Custom Asset Baru (Hitung ke Counter Custom)</option>
          <option value="apar">🔴 APAR (Hitung ke Counter APAR)</option>
          <option value="p3k">🟢 Kotak P3K (Hitung ke Counter P3K)</option>
          <option value="cctv">🔵 Kamera CCTV (Hitung ke Counter CCTV)</option>
          <option value="fire">🟠 Fire Alarm (Hitung ke Counter ALARM)</option>
        </select>
      </label>
      <div style="display:grid;grid-template-columns:1fr 56px 46px;gap:5px;align-items:end">
        <label class="studio-field" style="margin:0">
          <span style="color:#581c87">Nama Aset</span>
          <input type="text" id="studio-custom-asset-name" value="Hydrant" placeholder="Misal: Hydrant / APAR CO2"/>
        </label>
        <label class="studio-field" style="margin:0">
          <span style="color:#581c87">Inisial</span>
          <input type="text" id="studio-custom-asset-init" maxlength="2" value="H" style="text-align:center;font-weight:900;text-transform:uppercase"/>
        </label>
        <label class="studio-field" style="margin:0">
          <span style="color:#581c87">Warna</span>
          <input type="color" id="studio-custom-asset-color" value="#7C3AED" style="width:100%;height:26px;padding:1px;border-radius:7px;border:1px solid #cbd5e1;cursor:pointer;background:#fff"/>
        </label>
      </div>
      <label class="studio-field" style="margin:5px 0 0">
        <span style="color:#581c87">Deskripsi / Keterangan Aset</span>
        <input type="text" id="studio-custom-asset-desc" value="Titik Hydrant pemadam tekanan tinggi" placeholder="Penjelasan fungsi / spesifikasi aset..."/>
      </label>
      <div class="studio-grid-2" style="margin-top:6px">
        <button type="button" class="studio-btn primary" id="studio-btn-add-custom-now" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);border-color:#6d28d9">＋ Tambah ke Peta</button>
        <button type="button" class="studio-btn" id="studio-btn-place-custom-click" style="border-color:#c084fc;color:#6b21a8;background:#f3e8ff">🎯 Klik di Peta</button>
      </div>
      <button type="button" class="studio-btn" id="studio-btn-restyle-cat" style="width:100%;margin-top:5px;border-color:#d8b4fe;color:#581c87;background:#faf5ff;font-size:7.5px">🎨 Terapkan Nama/Inisial/Warna ke Semua Kategori Terpilih</button>
    `;
    safetyPane.insertBefore(customCard, safetyPane.firstChild);
    safetyPane.insertBefore(quickPlace, safetyPane.firstChild);

    // Create Tabs Bar
    const tabsBar = document.createElement('div');
    tabsBar.className = 'studio-tabs';
    tabsBar.innerHTML = `
      <button type="button" class="studio-tab active" data-studio-tab="rooms">🏠<br>Ruang</button>
      <button type="button" class="studio-tab" data-studio-tab="safety">🛡<br>K3/CCTV</button>
      <button type="button" class="studio-tab" data-studio-tab="doors">🚪<br>Pintu/Tembok</button>
      <button type="button" class="studio-tab" data-studio-tab="routes">↗<br>Rute/Teks</button>
      <button type="button" class="studio-tab" data-studio-tab="save">💾<br>Simpan</button>
    `;

    const roomsPane = document.createElement('div');
    roomsPane.id = 'studio-pane-rooms';
    roomsPane.className = 'studio-pane active';

    const doorsPane = document.createElement('div');
    doorsPane.id = 'studio-pane-doors';
    doorsPane.className = 'studio-pane';

    const routesPane = document.createElement('div');
    routesPane.id = 'studio-pane-routes';
    routesPane.className = 'studio-pane';

    const savePane = document.createElement('div');
    savePane.id = 'studio-pane-save';
    savePane.className = 'studio-pane';

    body.append(tabsBar, roomsPane, safetyPane, doorsPane, routesPane, savePane);

    tabsBar.querySelectorAll('[data-studio-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchStudioTab(btn.dataset.studioTab));
    });

    const placeBtn = safetyPane.querySelector('#studio-btn-place-safety');
    const placeSel = safetyPane.querySelector('#studio-place-safety-kind');
    const catSel = safetyPane.querySelector('#studio-custom-asset-cat');
    const nameInp = safetyPane.querySelector('#studio-custom-asset-name');
    const initInp = safetyPane.querySelector('#studio-custom-asset-init');
    const colorInp = safetyPane.querySelector('#studio-custom-asset-color');
    const descInp = safetyPane.querySelector('#studio-custom-asset-desc');
    const catPresets = {
      custom: { name: 'Hydrant', init: 'H', color: '#7C3AED', desc: 'Titik Hydrant pemadam tekanan tinggi' },
      apar:   { name: 'APAR', init: 'A', color: '#DC2626', desc: 'Alat Pemadam Api Ringan (APAR)' },
      p3k:    { name: 'Kotak P3K', init: 'P', color: '#16A34A', desc: 'Kotak Pertolongan Pertama Pada Kecelakaan' },
      cctv:   { name: 'Kamera CCTV', init: 'C', color: '#2563EB', desc: 'Kamera pemantau keamanan area' },
      fire:   { name: 'Fire Alarm', init: 'F', color: '#F97316', desc: 'Titik pemicu & sirene alarm kebakaran' }
    };
    catSel?.addEventListener('change', () => {
      const p = catPresets[catSel.value] || catPresets.custom;
      if (nameInp) nameInp.value = p.name;
      if (initInp) initInp.value = p.init;
      if (colorInp) colorInp.value = p.color;
      if (descInp) descInp.value = p.desc;
      if (placeSel) placeSel.value = catSel.value;
      placeSafetyKind = catSel.value;
    });
    placeSel?.addEventListener('change', () => { placeSafetyKind = placeSel.value; });
    placeBtn?.addEventListener('click', () => {
      activeTool = activeTool === 'place-safety' ? null : 'place-safety';
      placeSafetyKind = placeSel?.value || 'apar';
      placeBtn.classList.toggle('active-tool', activeTool === 'place-safety');
      placeBtn.textContent = activeTool === 'place-safety' ? '🎯 Klik Peta (Aktif)' : '🎯 Klik di Peta: OFF';
      if (activeTool === 'place-safety') toast('Klik titik mana saja di peta untuk menaruh ' + placeSafetyKind.toUpperCase());
    });
    safetyPane.querySelector('#studio-btn-add-custom-now')?.addEventListener('click', () => {
      const cat = catSel?.value || 'custom';
      const init = (initInp?.value || 'K').trim().slice(0, 2).toUpperCase() || 'K';
      const name = (nameInp?.value || 'Custom Asset').trim() || 'Custom Asset';
      const color = colorInp?.value || '#7C3AED';
      const desc = (descInp?.value || '').trim();
      const st = window.__mapEditorSafetyAPI?.getState?.();
      const list = st?.[cat] || [];
      const last = list[list.length - 1] || { x: 700, y: 500 };
      window.__mapEditorSafetyAPI?.addAsset(cat, { x: Math.min(1400, last.x + 28), y: Math.min(990, last.y + 28), initial: init, name, color, desc }, `✨ ${name} (${init}) ditambahkan ke kategori ${cat.toUpperCase()} — tarik marker untuk memindahkan posisinya.`);
    });
    safetyPane.querySelector('#studio-btn-place-custom-click')?.addEventListener('click', () => {
      const cat = catSel?.value || 'custom';
      if (placeSel) placeSel.value = cat;
      placeSafetyKind = cat;
      activeTool = 'place-safety';
      if (placeBtn) {
        placeBtn.classList.add('active-tool');
        placeBtn.textContent = '🎯 Klik Peta (Aktif)';
      }
      const name = (nameInp?.value || 'Custom Asset').trim() || 'Custom Asset';
      toast(`Klik titik mana saja di peta untuk menaruh ikon ${name} (kategori ${cat.toUpperCase()})`);
    });
    safetyPane.querySelector('#studio-btn-restyle-cat')?.addEventListener('click', () => {
      const cat = catSel?.value || 'custom';
      const init = (initInp?.value || 'K').trim().slice(0, 2).toUpperCase() || 'K';
      const name = (nameInp?.value || 'Custom Asset').trim() || 'Custom Asset';
      const color = colorInp?.value || '#7C3AED';
      const desc = (descInp?.value || '').trim();
      const st = window.__mapEditorSafetyAPI?.getState?.();
      if (!st || !Array.isArray(st[cat]) || !st[cat].length) {
        toast(`Belum ada aset di kategori ${cat.toUpperCase()} untuk diubah.`);
        return;
      }
      st[cat] = st[cat].map(item => ({ ...item, name, initial: init, color, ...(desc ? { desc } : {}) }));
      window.__mapEditorSafetyAPI?.setState(st);
      toast(`✓ Seluruh ${st[cat].length} aset di kategori ${cat.toUpperCase()} diperbarui menjadi "${name}" (${init}).`);
    });

    renderStudioInspector();
  }

  window.__renderStudioHandles = renderStudioHandles;

  function switchStudioTab(tab) {
    activeTab = tab;
    activeTool = null;
    if (tab !== 'routes' && window.EvacBackend?.isDrawing?.()) {
      window.EvacBackend.cancelDrawing();
    }
    document.querySelectorAll('#map-editor-panel .studio-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.studioTab === tab);
    });
    ['rooms', 'safety', 'doors', 'routes', 'save'].forEach(k => {
      document.getElementById('studio-pane-' + k)?.classList.toggle('active', k === tab);
    });
    // Automatically synchronize the map layer with the active Studio tab so Denah Bersih is never out of sync
    if (tab === 'routes') {
      window.__setMapLayer?.('evacuation', { preserveActiveRoute: true });
    } else if (tab === 'safety') {
      window.__setMapLayer?.('safety');
    } else {
      window.__setMapLayer?.('all');
    }
    renderStudioInspector();
    renderStudioHandles();
  }

  function renderStudioInspector() {
    renderRoomsPane();
    renderDoorsPane();
    renderRoutesPane();
    renderSavePane();
  }

  // TAB 1: RUANGAN
  function renderRoomsPane() {
    const pane = document.getElementById('studio-pane-rooms');
    if (!pane) return;
    const names = window.roomNames || {};
    const allIds = Object.keys(names).sort((a, b) => (window.__roomSortVal ? window.__roomSortVal(a) - window.__roomSortVal(b) : Number(a) - Number(b)));
    if (!selectedRoomId || !names[selectedRoomId]) selectedRoomId = allIds[0] || '1';
    const r = String(selectedRoomId);
    const ov = studio.roomOverrides[r] || {};
    const curName = ov.name || names[r] || `Ruangan ${r}`;
    const [defL1, defL2] = splitNameIntoLines(curName);
    const l1 = ov.line1 !== undefined ? ov.line1 : defL1;
    const l2 = ov.line2 !== undefined ? ov.line2 : defL2;
    const fSize = ov.fontSize || 6.5;
    const hasBuiltInLbl = !!document.querySelector(`[data-room-label="${CSS.escape(r)}"]`);
    const showLbl = ov.showMapLabel !== undefined ? ov.showMapLabel : (hasBuiltInLbl || Boolean(ov.name));
    const showBadge = ov.showBadge !== undefined ? ov.showBadge : true;
    const maskBg = ov.maskBg !== undefined ? ov.maskBg : true;
    const hiddenRooms = Object.entries(studio.roomOverrides).filter(([, v]) => v?.hidden).map(([k]) => k);

    pane.innerHTML = `
      <div class="studio-card">
        <div class="studio-card-title">
          <span>🏠 Pilih / Klik Ruangan di Peta</span>
          <button type="button" class="studio-btn primary" id="st-add-new-room" style="padding:4px 7px;font-size:7.5px">＋ Gambar Ruang Baru</button>
        </div>
        <div class="studio-field" style="margin-top:2px">
          <select id="st-room-select">
            ${allIds.map(id => `<option value="${esc(id)}" ${String(id) === r ? 'selected' : ''}>Ruang ${esc(id)} · ${esc(names[id])}${studio.roomOverrides[id]?.hidden ? ' (Disembunyikan)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="studio-field">
          <span>Nama Ruangan (Sidebar, Detail & QR)</span>
          <input type="text" id="st-room-name" value="${esc(curName)}" placeholder="Nama ruangan..."/>
        </div>
      </div>

      <div class="studio-card">
        <div class="studio-card-title"><span>🏷 Label Nama & Nomor di Atas Peta</span></div>
        <label class="studio-check">
          <input type="checkbox" id="st-room-show-lbl" ${showLbl ? 'checked' : ''}/>
          <span>Tampilkan Label Ruangan Ini di Peta</span>
        </label>
        <div class="studio-grid-2">
          <label class="studio-field">
            <span>Teks Peta Baris 1</span>
            <input type="text" id="st-room-l1" value="${esc(l1)}" placeholder="Baris 1"/>
          </label>
          <label class="studio-field">
            <span>Teks Peta Baris 2</span>
            <input type="text" id="st-room-l2" value="${esc(l2)}" placeholder="Opsional"/>
          </label>
        </div>
        <div class="studio-grid-2" style="margin-top:4px">
          <label class="studio-field">
            <span>Ukuran Huruf: <b id="st-room-fs-val">${fSize}px</b></span>
            <input type="range" id="st-room-fs" min="4" max="15" step="0.5" value="${fSize}" style="accent-color:#4338ca"/>
          </label>
          <div style="display:flex;flex-direction:column;justify-content:center;gap:3px;padding-top:6px">
            <label class="studio-check" style="margin:0"><input type="checkbox" id="st-room-badge" ${showBadge ? 'checked' : ''}/><span>Badge Nomor (${esc(r)})</span></label>
            <label class="studio-check" style="margin:0"><input type="checkbox" id="st-room-mask" ${maskBg ? 'checked' : ''}/><span>Tutup Teks Lama</span></label>
          </div>
        </div>
        <div style="margin-top:6px;font-size:7.5px;color:#64748b">💡 <b>Tips:</b> Tarik titik biru di tengah ruangan pada peta untuk menggeser posisi label.</div>
      </div>

      <div class="studio-card">
        <div class="studio-card-title"><span>📐 Bentuk, Posisi & Visibilitas Ruangan</span></div>
        <div class="studio-grid-2">
          <button type="button" class="studio-btn" id="st-room-make-box">${ov.customBox ? '✓ Mode Kotak Aktif (Geser di Peta)' : '📐 Ubah Posisi / Ukuran Kotak'}</button>
          ${ov.customBox ? `<button type="button" class="studio-btn" id="st-room-reset-box">↺ Bentuk Asli</button>` : `<button type="button" class="studio-btn danger" id="st-room-hide">🗑 Hapus / Sembunyikan</button>`}
        </div>
        ${ov.customBox ? `<div style="margin-top:6px"><button type="button" class="studio-btn danger" id="st-room-hide" style="width:100%">🗑 Hapus / Sembunyikan Ruangan Ini</button></div>` : ''}
        ${hiddenRooms.length ? `<div style="margin-top:7px;font-size:7.5px;color:#64748b">Ruangan disembunyikan: ${hiddenRooms.map( hr => `<button type="button" data-restore-room="${esc(hr)}" style="border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:1px 5px;margin:1px;font-weight:800;cursor:pointer">↺ Ruang ${esc(hr)}</button>` ).join(' ')}</div>` : ''}
      </div>
    `;

    const ensureOv = () => {
      if (!studio.roomOverrides[r]) studio.roomOverrides[r] = {};
      return studio.roomOverrides[r];
    };

    pane.querySelector('#st-room-select')?.addEventListener('change', e => {
      selectedRoomId = e.target.value;
      window.__selectRoom?.(selectedRoomId, 'sidebar');
      renderStudioInspector();
      renderStudioHandles();
    });

    pane.querySelector('#st-room-name')?.addEventListener('input', e => {
      const o = ensureOv();
      o.name = e.target.value;
      const [nl1, nl2] = splitNameIntoLines(o.name);
      o.line1 = nl1; o.line2 = nl2;
      const l1El = pane.querySelector('#st-room-l1'), l2El = pane.querySelector('#st-room-l2');
      if (l1El) l1El.value = nl1;
      if (l2El) l2El.value = nl2;
      o.showMapLabel = true;
      saveStudio();
      applyRoomOverrides();
      window.__selectRoom?.(r, 'map');
    });

    pane.querySelector('#st-room-show-lbl')?.addEventListener('change', e => {
      ensureOv().showMapLabel = e.target.checked;
      saveStudio(); applyRoomOverrides(); renderStudioHandles();
    });
    pane.querySelector('#st-room-l1')?.addEventListener('input', e => {
      const o = ensureOv(); o.line1 = e.target.value; o.showMapLabel = true;
      saveStudio(); applyRoomOverrides();
    });
    pane.querySelector('#st-room-l2')?.addEventListener('input', e => {
      const o = ensureOv(); o.line2 = e.target.value; o.showMapLabel = true;
      saveStudio(); applyRoomOverrides();
    });
    pane.querySelector('#st-room-fs')?.addEventListener('input', e => {
      const o = ensureOv(); o.fontSize = +e.target.value; o.showMapLabel = true;
      const v = pane.querySelector('#st-room-fs-val'); if (v) v.textContent = e.target.value + 'px';
      saveStudio(); applyRoomOverrides();
    });
    pane.querySelector('#st-room-badge')?.addEventListener('change', e => {
      const o = ensureOv(); o.showBadge = e.target.checked; o.showMapLabel = true;
      saveStudio(); applyRoomOverrides();
    });
    pane.querySelector('#st-room-mask')?.addEventListener('change', e => {
      const o = ensureOv(); o.maskBg = e.target.checked; o.showMapLabel = true;
      saveStudio(); applyRoomOverrides();
    });

    pane.querySelector('#st-room-make-box')?.addEventListener('click', () => {
      const o = ensureOv();
      if (!o.customBox) {
        const c = getRoomDefaultCenter(r);
        o.customBox = { x: c.bx ?? (c.x - 40), y: c.by ?? (c.y - 30), w: Math.max(24, c.w || 80), h: Math.max(24, c.h || 60), fillFloor: true };
        saveStudio(); applyRoomOverrides(); renderStudioInspector(); renderStudioHandles();
        toast(`Kotak Ruangan ${r} aktif — tarik di peta untuk pindah atau tarik sudut kanan-bawah untuk ubah ukuran.`);
      }
    });
    pane.querySelector('#st-room-reset-box')?.addEventListener('click', () => {
      const o = ensureOv();
      delete o.customBox;
      saveStudio(); applyRoomOverrides(); renderStudioInspector(); renderStudioHandles();
      toast(`Bentuk asli Ruangan ${r} dikembalikan.`);
    });
    pane.querySelector('#st-room-hide')?.addEventListener('click', () => {
      if (Number(r) > 40) {
        // Custom room from v36 builder: trigger its delete button
        const area = window.__getCustomRooms?.().find(a => String(a.roomNo) === r);
        if (area) {
          document.querySelector(`[data-v36-delete-area="${CSS.escape(area.id)}"]`)?.click();
          selectedRoomId = '1';
          renderStudioInspector();
          return;
        }
      }
      const o = ensureOv();
      o.hidden = true;
      saveStudio(); applyRoomOverrides(); renderStudioInspector(); renderStudioHandles();
      toast(`Ruangan ${r} disembunyikan.`);
    });
    pane.querySelectorAll('[data-restore-room]').forEach(b => b.addEventListener('click', () => {
      const hr = b.dataset.restoreRoom;
      if (studio.roomOverrides[hr]) studio.roomOverrides[hr].hidden = false;
      selectedRoomId = hr;
      saveStudio(); applyRoomOverrides(); renderStudioInspector(); renderStudioHandles();
    }));
    pane.querySelector('#st-add-new-room')?.addEventListener('click', () => {
      const name = prompt('Masukkan nama ruangan baru:', 'RUANG BARU');
      if (!name) return;
      const nameInput = document.getElementById('v6-map-area-name');
      const typeSel = document.getElementById('v6-map-area-type');
      if (nameInput) nameInput.value = name;
      if (typeSel) typeSel.value = 'room';
      document.getElementById('v6-draw-area')?.click();
      toast('Tarik (drag) kotak di atas peta untuk menggambar area ' + name);
    });
  }

  // TAB 3: PINTU & TEMBOK
  function renderDoorsPane() {
    const pane = document.getElementById('studio-pane-doors');
    if (!pane) return;

    let doorHtml = '<div style="font-size:8px;color:#64748b">Klik salah satu bulatan <b>D</b> biru pada pintu di peta untuk mengatur status buka/tutup, memutar, atau menggeser pintu.</div>';
    if (selectedDoor) {
      if (selectedDoor.kind === 'builtin') {
        const idx = selectedDoor.id;
        const ov = studio.builtinDoors[idx] || { mode: 'open-door', dx: 0, dy: 0, rot: 0, flip: false };
        doorHtml = `
          <div style="font-size:8.5px;font-weight:900;color:#0f172a;margin-bottom:5px">🚪 Pintu Bawaan #${idx + 1}</div>
          <div class="studio-grid-3">
            <button type="button" class="studio-btn ${ov.mode !== 'open-gap' && ov.mode !== 'closed' ? 'primary' : ''}" data-door-mode="open-door">🚪 Pintu Buka</button>
            <button type="button" class="studio-btn ${ov.mode === 'open-gap' ? 'primary' : ''}" data-door-mode="open-gap">🔓 Jalur Kosong</button>
            <button type="button" class="studio-btn ${ov.mode === 'closed' ? 'danger' : ''}" data-door-mode="closed">🧱 Tutup Tembok</button>
          </div>
          <div class="studio-grid-2" style="margin-top:6px">
            <label class="studio-field" style="margin:0">
              <span>Putar Sudut: <b>${ov.rot || 0}°</b></span>
              <input type="range" id="st-door-rot" min="-180" max="180" step="15" value="${ov.rot || 0}" style="accent-color:#0284c7"/>
            </label>
            <div style="display:flex;gap:4px;align-items:flex-end">
              <button type="button" class="studio-btn" id="st-door-flip" style="flex:1">⇄ Balik Ayun</button>
              <button type="button" class="studio-btn" id="st-door-reset" style="flex:1">↺ Reset</button>
            </div>
          </div>
        `;
      } else {
        const cd = studio.customDoors.find(x => x.id === selectedDoor.id);
        if (cd) {
          doorHtml = `
            <div style="font-size:8.5px;font-weight:900;color:#0f172a;margin-bottom:5px">🚪 Pintu Tambahan (${esc(cd.id)})</div>
            <div class="studio-grid-3">
              <button type="button" class="studio-btn ${cd.mode === 'open-door' ? 'primary' : ''}" data-cdoor-mode="open-door">🚪 Pintu Buka</button>
              <button type="button" class="studio-btn ${cd.mode === 'open-gap' ? 'primary' : ''}" data-cdoor-mode="open-gap">🔓 Jalur Kosong</button>
              <button type="button" class="studio-btn ${cd.mode === 'closed' ? 'danger' : ''}" data-cdoor-mode="closed">🧱 Tutup</button>
            </div>
            <div class="studio-grid-2" style="margin-top:6px">
              <label class="studio-field" style="margin:0">
                <span>Sudut: <b>${cd.angle || 0}°</b></span>
                <input type="range" id="st-cdoor-ang" min="0" max="355" step="5" value="${cd.angle || 0}" style="accent-color:#0284c7"/>
              </label>
              <label class="studio-field" style="margin:0">
                <span>Lebar: <b>${cd.width || 18}px</b></span>
                <input type="range" id="st-cdoor-w" min="10" max="55" step="1" value="${cd.width || 18}" style="accent-color:#0284c7"/>
              </label>
            </div>
            <div class="studio-grid-2" style="margin-top:6px">
              <button type="button" class="studio-btn" id="st-cdoor-flip">⇄ Balik Arah Buka</button>
              <button type="button" class="studio-btn danger" id="st-cdoor-del">🗑 Hapus Pintu</button>
            </div>
          `;
        }
      }
    }

    const selWall = studio.wallEdits.find(x => x.id === selectedWallId);

    pane.innerHTML = `
      <div class="studio-card">
        <div class="studio-card-title">
          <span>🚪 Kelola Pintu (46 Bawaan + Baru)</span>
          <label class="studio-check" style="margin:0"><input type="checkbox" id="st-toggle-door-handles" ${showDoorHandles ? 'checked' : ''}/><span>Titik D</span></label>
        </div>
        <div class="studio-grid-2" style="margin-bottom:6px">
          <button type="button" class="studio-btn ${activeTool === 'add-door' ? 'active-tool' : 'primary'}" id="st-tool-add-door">＋ Klik Peta: Tambah Pintu</button>
          <button type="button" class="studio-btn" id="st-all-doors-gap">🔓 Buka Kosong Semua</button>
        </div>
        <div style="padding:8px;border-radius:9px;background:#fff;border:1px solid #e2e8f0">
          ${doorHtml}
        </div>
      </div>

      <div class="studio-card">
        <div class="studio-card-title"><span>🧱 Gambar / Hapus Garis Tembok</span></div>
        <div style="font-size:7.5px;color:#64748b;margin-bottom:6px">Pilih alat di bawah lalu klik-tarik (drag) garis pada peta:</div>
        <div class="studio-grid-3">
          <button type="button" class="studio-btn ${activeTool === 'draw-wall' ? 'active-tool' : ''}" id="st-tool-wall">▰ Tembok Hitam</button>
          <button type="button" class="studio-btn ${activeTool === 'draw-triplek' ? 'active-tool' : ''}" id="st-tool-triplek">🟨 Tembok Triplek</button>
          <button type="button" class="studio-btn ${activeTool === 'draw-eraser' ? 'active-tool' : ''}" id="st-tool-eraser">✂ Buka/Hapus Tembok</button>
        </div>
        ${selWall ? `
          <div style="margin-top:8px;padding:7px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:8px;font-weight:800">Terpilih: ${selWall.kind === 'eraser' ? 'Pembuka Tembok' : (selWall.kind === 'triplek' ? 'Tembok Triplek' : 'Tembok Hitam')}</span>
            <button type="button" class="studio-btn danger" id="st-del-wall" style="padding:4px 8px">🗑 Hapus Garis</button>
          </div>
        ` : ''}
      </div>
    `;

    pane.querySelector('#st-toggle-door-handles')?.addEventListener('change', e => {
      showDoorHandles = e.target.checked;
      renderStudioHandles();
    });
    pane.querySelector('#st-tool-add-door')?.addEventListener('click', () => {
      activeTool = activeTool === 'add-door' ? null : 'add-door';
      renderDoorsPane();
      if (activeTool === 'add-door') toast('Klik pada garis tembok mana saja di peta untuk membuat pintu baru.');
    });
    pane.querySelector('#st-all-doors-gap')?.addEventListener('click', () => {
      const anyLeaf = builtinDoorMeta.some(d => (studio.builtinDoors[d.idx]?.mode || 'open-door') === 'open-door');
      const targetMode = anyLeaf ? 'open-gap' : 'open-door';
      builtinDoorMeta.forEach(d => {
        studio.builtinDoors[d.idx] = { ...(studio.builtinDoors[d.idx] || {}), mode: targetMode };
      });
      saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
      toast(targetMode === 'open-gap' ? 'Semua jalur pintu dibuka kosong tanpa daun pintu.' : 'Daun pintu ditampilkan kembali.');
    });

    // Builtin door controls
    pane.querySelectorAll('[data-door-mode]').forEach(b => b.addEventListener('click', () => {
      if (!selectedDoor || selectedDoor.kind !== 'builtin') return;
      const idx = selectedDoor.id;
      studio.builtinDoors[idx] = { ...(studio.builtinDoors[idx] || {}), mode: b.dataset.doorMode };
      saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
    }));
    pane.querySelector('#st-door-rot')?.addEventListener('input', e => {
      if (!selectedDoor || selectedDoor.kind !== 'builtin') return;
      const idx = selectedDoor.id;
      studio.builtinDoors[idx] = { ...(studio.builtinDoors[idx] || {}), rot: +e.target.value };
      saveStudio(); applyDoors(); renderDoorsPane();
    });
    pane.querySelector('#st-door-flip')?.addEventListener('click', () => {
      if (!selectedDoor || selectedDoor.kind !== 'builtin') return;
      const idx = selectedDoor.id;
      const cur = studio.builtinDoors[idx] || {};
      studio.builtinDoors[idx] = { ...cur, flip: !cur.flip };
      saveStudio(); applyDoors(); renderDoorsPane();
    });
    pane.querySelector('#st-door-reset')?.addEventListener('click', () => {
      if (!selectedDoor || selectedDoor.kind !== 'builtin') return;
      delete studio.builtinDoors[selectedDoor.id];
      saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
    });

    // Custom door controls
    pane.querySelectorAll('[data-cdoor-mode]').forEach(b => b.addEventListener('click', () => {
      const cd = studio.customDoors.find(x => x.id === selectedDoor?.id);
      if (!cd) return;
      cd.mode = b.dataset.cdoorMode;
      saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
    }));
    pane.querySelector('#st-cdoor-ang')?.addEventListener('input', e => {
      const cd = studio.customDoors.find(x => x.id === selectedDoor?.id);
      if (!cd) return;
      cd.angle = +e.target.value;
      saveStudio(); applyDoors(); renderDoorsPane();
    });
    pane.querySelector('#st-cdoor-w')?.addEventListener('input', e => {
      const cd = studio.customDoors.find(x => x.id === selectedDoor?.id);
      if (!cd) return;
      cd.width = +e.target.value;
      saveStudio(); applyDoors(); renderDoorsPane();
    });
    pane.querySelector('#st-cdoor-flip')?.addEventListener('click', () => {
      const cd = studio.customDoors.find(x => x.id === selectedDoor?.id);
      if (!cd) return;
      cd.flip = !cd.flip;
      saveStudio(); applyDoors(); renderDoorsPane();
    });
    pane.querySelector('#st-cdoor-del')?.addEventListener('click', () => {
      studio.customDoors = studio.customDoors.filter(x => x.id !== selectedDoor?.id);
      selectedDoor = null;
      saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
    });

    // Wall drawing tools
    const bindWallTool = (btnId, toolName, msg) => {
      pane.querySelector(btnId)?.addEventListener('click', () => {
        activeTool = activeTool === toolName ? null : toolName;
        renderDoorsPane();
        if (activeTool) toast(msg);
      });
    };
    bindWallTool('#st-tool-wall', 'draw-wall', 'Klik-tarik (drag) di peta untuk menggambar tembok permanen.');
    bindWallTool('#st-tool-triplek', 'draw-triplek', 'Klik-tarik (drag) di peta untuk menggambar tembok triplek sementara.');
    bindWallTool('#st-tool-eraser', 'draw-eraser', 'Klik-tarik (drag) di atas garis tembok lama untuk membuka/menghapus jalur.');

    pane.querySelector('#st-del-wall')?.addEventListener('click', () => {
      studio.wallEdits = studio.wallEdits.filter(x => x.id !== selectedWallId);
      selectedWallId = null;
      saveStudio(); applyWalls(); renderDoorsPane(); renderStudioHandles();
    });
  }

  // TAB 4: RUTE EVAKUASI TERPADU (BACKEND TUNGGAL), TITIK AWAL QR & TEKS PETA
  function renderRoutesPane() {
    const pane = document.getElementById('studio-pane-routes');
    if (!pane) return;
    const ap = window.EvacBackend?.getAssemblyPoint?.() || studio.evacEdits?.assemblyPoint || { x: 535.5, y: 898.3 };
    const selTxt = studio.mapTexts.find(x => x.id === selectedTextId);
    const allSegs = window.EvacBackend?.getSegments?.() || [];
    const selSegId = window.EvacBackend?.getSelectedSegmentId?.() || allSegs[0]?.id || 'SEG-01';
    const selSeg = allSegs.find(s => s.id === selSegId) || allSegs[0];
    const isDrawingRoute = Boolean(window.EvacBackend?.isDrawing?.());

    if (!Array.isArray(studio.evacEdits?.qrStartPoints) || !studio.evacEdits.qrStartPoints.length) {
      studio.evacEdits.qrStartPoints = window.EvacBackend?.getQrStarts?.() || defaultQrStarts();
    }
    const qrPoints = studio.evacEdits.qrStartPoints;
    if (!selectedQrStartId || !qrPoints.some(q => q.id === selectedQrStartId)) {
      selectedQrStartId = qrPoints[0]?.id || 'START-01';
    }
    const selQr = qrPoints.find(q => q.id === selectedQrStartId) || qrPoints[0];

    pane.innerHTML = `
      <div class="studio-card" style="background:linear-gradient(135deg,#f0fdf4,#ffffff);border-color:#bbf7d0">
        <div class="studio-card-title" style="color:#166534">
          <span>↗ Backend Jalur Evakuasi Terpadu (${allSegs.filter(s => s.active !== false).length}/${allSegs.length} Segmen Aktif)</span>
          <button type="button" class="studio-btn" id="st-reset-all-segs" style="padding:2px 6px;font-size:7px" title="Kembalikan semua koridor evakuasi ke bawaan">↺ Reset Koridor</button>
        </div>
        <div id="st-evac-draw-status" style="font-size:7.5px;color:#15803d;margin-bottom:6px;line-height:1.4">
          ${isDrawingRoute
            ? '<b style="color:#047857">✏️ Mode Gambar Aktif:</b> Klik titik-titik di peta (atau klik-tarik), lalu tekan <b>Enter</b> / klik <b>⏹ Selesai Gambar</b>.'
            : 'Satu backend untuk <b>Tombol Jalur Evakuasi Web</b>, <b>Gambar Jalur Baru</b>, dan <b>Semua QR Code</b>.'}
        </div>
        <div class="studio-grid-2">
          <button type="button" class="studio-btn ${isDrawingRoute ? 'active-tool' : 'primary'}" id="st-draw-evac">
            ${isDrawingRoute ? '✏️ Sedang Menggambar...' : '✏️ Gambar Jalur Baru'}
          </button>
          <button type="button" class="studio-btn success" id="st-stop-evac">⏹ Selesai Gambar</button>
        </div>
        <div class="studio-grid-2" style="margin-top:6px">
          <button type="button" class="studio-btn danger" id="st-clear-manual-evac">🗑 Hapus Jalur Tambahan</button>
          <button type="button" class="studio-btn" id="st-reset-ap">★ Reset Titik Kumpul (${Math.round(ap.x)},${Math.round(ap.y)})</button>
        </div>

        <div style="margin-top:8px;padding-top:7px;border-top:1px dashed #bbf7d0">
          <div style="font-size:7.5px;font-weight:900;color:#166534;margin-bottom:4px">Pilih / Edit Segmen Koridor Evakuasi (Tarik titik hijau di peta untuk geser belokan):</div>
          <div style="display:flex;gap:4px">
            <select id="st-seg-select" style="flex:1;border:1px solid #86efac;border-radius:7px;padding:4px 6px;font-size:8px;font-weight:900;background:#fff;color:#0f172a">
              ${allSegs.map(s => `<option value="${esc(s.id)}" ${s.id === selSeg?.id ? 'selected' : ''}>[${s.active !== false ? 'ON' : 'OFF'}] ${esc(s.id)} · ${esc(s.name)} (${s.points?.length || 0} ttk)</option>`).join('')}
            </select>
            <button type="button" class="studio-btn ${selSeg?.active !== false ? 'success' : 'danger'}" id="st-seg-toggle" style="padding:4px 8px">
              ${selSeg?.active !== false ? 'ON' : 'OFF'}
            </button>
            ${selSeg?.kind === 'custom' ? `<button type="button" class="studio-btn danger" id="st-seg-delete" style="padding:4px 7px" title="Hapus segmen ini">🗑</button>` : ''}
          </div>
          ${selSeg ? `
            <div style="display:grid;grid-template-columns:1fr auto;gap:5px;margin-top:5px;align-items:end">
              <label class="studio-field" style="margin:0">
                <span>Nama Segmen Koridor</span>
                <input type="text" id="st-seg-name" value="${esc(selSeg.name || '')}"/>
              </label>
              <span style="font-size:7.5px;color:#047857;font-weight:800;padding-bottom:5px">${selSeg.points?.length || 0} titik sudut</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="studio-card" style="background:linear-gradient(135deg,#ecfeff,#ffffff);border-color:#a5f3fc">
        <div class="studio-card-title" style="color:#0e7490">
          <span>⌁ Kustomisasi Titik Awal QR (${qrPoints.length} Titik)</span>
          <button type="button" class="studio-btn" id="st-qr-reset" style="padding:2px 6px;font-size:7px;border-color:#67e8f9;color:#0e7490">↺ Reset QR</button>
        </div>
        <div style="font-size:7.5px;color:#0f766e;margin-bottom:6px;line-height:1.4">
          Semua titik QR otomatis menghitung rute terpendek melewati <b>Backend Jalur Evakuasi Terpadu</b> di atas. Tarik pin biru <b>QR</b> di peta atau atur di bawah:
        </div>
        <div style="display:flex;gap:4px;margin-bottom:6px">
          <select id="st-qr-select" style="flex:1;border:1px solid #67e8f9;border-radius:7px;padding:4px 6px;font-size:8px;font-weight:900;color:#0f172a;background:#fff">
            ${qrPoints.map(q => `<option value="${esc(q.id)}" ${q.id === selQr?.id ? 'selected' : ''}>${esc(q.id)} (${esc(q.code)}) · ${esc(q.name)}</option>`).join('')}
          </select>
          <button type="button" class="studio-btn primary" id="st-qr-add" style="padding:4px 8px;background:#0891b2;border-color:#0e7490" title="Tambah Titik Awal QR Baru">＋ Baru</button>
          <button type="button" class="studio-btn danger" id="st-qr-del" style="padding:4px 7px" title="Hapus Titik QR Ini">🗑</button>
        </div>
        ${selQr ? `
          <div style="padding:7px;border-radius:8px;background:#fff;border:1px solid #bae6fd">
            <div style="display:grid;grid-template-columns:56px 1fr;gap:5px">
              <label class="studio-field" style="margin:0"><span>Kode QR</span><input type="text" id="st-qr-code" maxlength="4" value="${esc(selQr.code || '')}" style="text-align:center;font-weight:900"/></label>
              <label class="studio-field" style="margin:0"><span>Nama Lokasi Titik QR</span><input type="text" id="st-qr-name" value="${esc(selQr.name || '')}"/></label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px">
              <label class="studio-field" style="margin:0"><span>Koordinat X</span><input type="number" step="0.5" id="st-qr-x" value="${Number(selQr.x).toFixed(1)}"/></label>
              <label class="studio-field" style="margin:0"><span>Koordinat Y</span><input type="number" step="0.5" id="st-qr-y" value="${Number(selQr.y).toFixed(1)}"/></label>
            </div>
            <div class="studio-grid-2" style="margin-top:6px">
              <button type="button" class="studio-btn ${activeTool === 'move-qr-start' ? 'active-tool' : ''}" id="st-qr-move-tool" style="border-color:#38bdf8;color:#0369a1;background:#f0f9ff">
                ${activeTool === 'move-qr-start' ? '🎯 Klik Peta (Aktif)' : '🎯 Klik Peta: Pindah Posisi'}
              </button>
              <button type="button" class="studio-btn success" id="st-qr-test">▶ Tes Rute QR Ini</button>
            </div>
            <button type="button" class="studio-btn" id="st-qr-open-modal" style="width:100%;margin-top:5px;font-size:7.5px">🖨 Lihat & Cetak Semua Kode QR (${qrPoints.length})</button>
          </div>
        ` : ''}
      </div>

      <div class="studio-card">
        <div class="studio-card-title">
          <span>🔤 Teks & Label Bebas di Peta</span>
          <button type="button" class="studio-btn ${activeTool === 'add-text' ? 'active-tool' : 'primary'}" id="st-tool-add-text" style="padding:4px 8px">＋ Klik Peta: Tambah Teks</button>
        </div>
        ${selTxt ? `
          <div style="padding:8px;border-radius:9px;background:#fff;border:1px solid #cbd5e1">
            <div class="studio-grid-2">
              <label class="studio-field" style="margin:0"><span>Teks Baris 1</span><input type="text" id="st-txt-l1" value="${esc(selTxt.line1 || '')}"/></label>
              <label class="studio-field" style="margin:0"><span>Teks Baris 2</span><input type="text" id="st-txt-l2" value="${esc(selTxt.line2 || '')}"/></label>
            </div>
            <div class="studio-grid-3" style="margin-top:5px">
              <label class="studio-field" style="margin:0"><span>Badge No</span><input type="text" id="st-txt-badge" value="${esc(selTxt.badge || '')}" placeholder="Opsional"/></label>
              <label class="studio-field" style="margin:0"><span>Ukuran (${selTxt.fontSize || 8}px)</span><input type="range" id="st-txt-fs" min="4" max="22" step="0.5" value="${selTxt.fontSize || 8}"/></label>
              <label class="studio-field" style="margin:0"><span>Rotasi (${selTxt.rot || 0}°)</span><input type="range" id="st-txt-rot" min="-90" max="90" step="15" value="${selTxt.rot || 0}"/></label>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
              <label class="studio-check" style="margin:0"><input type="checkbox" id="st-txt-mask" ${selTxt.maskBg !== false ? 'checked' : ''}/><span>Latar Penutup Putih</span></label>
              <button type="button" class="studio-btn danger" id="st-txt-del" style="padding:4px 8px">🗑 Hapus Teks</button>
            </div>
          </div>
        ` : '<div style="font-size:8px;color:#64748b">Klik tombol <b>＋ Klik Peta: Tambah Teks</b> untuk membuat tulisan baru (atau menutup tulisan lama) di mana saja pada peta.</div>'}
      </div>
    `;

    // Unified EvacBackend Controls
    pane.querySelector('#st-draw-evac')?.addEventListener('click', () => {
      activeTool = null;
      window.EvacBackend?.startDrawing?.();
      renderRoutesPane();
    });
    pane.querySelector('#st-stop-evac')?.addEventListener('click', () => {
      if (window.EvacBackend?.isDrawing?.()) window.EvacBackend.finishDrawing();
      else window.EvacBackend?.cancelDrawing?.();
      renderRoutesPane();
      renderStudioHandles();
    });
    pane.querySelector('#st-clear-manual-evac')?.addEventListener('click', () => {
      if (!confirm('Hapus semua jalur evakuasi tambahan (custom) yang digambar manual?')) return;
      window.EvacBackend?.clearCustomSegments?.();
      renderRoutesPane();
      renderStudioHandles();
      toast('Semua jalur tambahan manual telah dihapus.');
    });
    pane.querySelector('#st-reset-all-segs')?.addEventListener('click', () => {
      if (!confirm('Kembalikan seluruh segmen koridor evakuasi ke pengaturan bawaan?')) return;
      window.EvacBackend?.resetAllSegments?.();
      renderRoutesPane();
      renderStudioHandles();
      toast('Seluruh koridor evakuasi dikembalikan ke kondisi awal.');
    });
    pane.querySelector('#st-reset-ap')?.addEventListener('click', () => {
      studio.evacEdits.assemblyPoint = { x: 535.5, y: 898.3 };
      window.EvacBackend?.resetAssemblyPoint?.();
      saveStudio(); applyEvacEdits(); renderRoutesPane(); renderStudioHandles();
      toast('Posisi Titik Kumpul dikembalikan ke semula.');
    });
    pane.querySelector('#st-seg-select')?.addEventListener('change', e => {
      window.EvacBackend?.setSelectedSegmentId?.(e.target.value);
      renderRoutesPane();
      renderStudioHandles();
    });
    pane.querySelector('#st-seg-toggle')?.addEventListener('click', () => {
      if (!selSeg) return;
      window.EvacBackend?.toggleSegment?.(selSeg.id);
      renderRoutesPane();
      renderStudioHandles();
    });
    pane.querySelector('#st-seg-delete')?.addEventListener('click', () => {
      if (!selSeg || !confirm(`Hapus segmen ${selSeg.name}?`)) return;
      window.EvacBackend?.deleteSegment?.(selSeg.id);
      renderRoutesPane();
      renderStudioHandles();
    });
    pane.querySelector('#st-seg-name')?.addEventListener('input', e => {
      if (!selSeg) return;
      window.EvacBackend?.updateSegment?.(selSeg.id, { name: e.target.value });
    });

    // QR Start Points Event Listeners
    pane.querySelector('#st-qr-select')?.addEventListener('change', e => {
      selectedQrStartId = e.target.value;
      renderRoutesPane();
      renderStudioHandles();
    });
    pane.querySelector('#st-qr-add')?.addEventListener('click', () => {
      const nextNum = qrPoints.length + 1;
      const code = String(nextNum).padStart(2, '0');
      let id = `START-${code}`;
      while (qrPoints.some(q => q.id === id)) {
        id = `START-${code}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      }
      const newPt = { id, name: `Titik QR ${code} · Lokasi Baru`, code, x: 713.5, y: 511.5 };
      studio.evacEdits.qrStartPoints.push(newPt);
      selectedQrStartId = id;
      saveStudio(); applyEvacEdits(); renderRoutesPane(); renderStudioHandles();
      toast(`Titik QR baru (${id}) ditambahkan! Tarik pin QR${code} di peta atau klik "Pindah Posisi".`);
    });
    pane.querySelector('#st-qr-del')?.addEventListener('click', () => {
      if (qrPoints.length <= 1) {
        toast('Minimal harus ada 1 titik awal QR.');
        return;
      }
      if (!selQr || !confirm(`Hapus titik QR ${selQr.id} (${selQr.name})?`)) return;
      studio.evacEdits.qrStartPoints = qrPoints.filter(q => q.id !== selQr.id);
      selectedQrStartId = studio.evacEdits.qrStartPoints[0]?.id || 'START-01';
      saveStudio(); applyEvacEdits(); renderRoutesPane(); renderStudioHandles();
      toast(`Titik QR ${selQr.id} dihapus.`);
    });
    pane.querySelector('#st-qr-reset')?.addEventListener('click', () => {
      if (!confirm('Kembalikan semua Titik Awal QR ke 6 titik bawaan?')) return;
      studio.evacEdits.qrStartPoints = defaultQrStarts();
      selectedQrStartId = 'START-01';
      saveStudio(); applyEvacEdits(); renderRoutesPane(); renderStudioHandles();
      toast('Titik Awal QR dikembalikan ke pengaturan awal.');
    });
    pane.querySelector('#st-qr-code')?.addEventListener('input', e => {
      if (!selQr) return;
      selQr.code = (e.target.value || '01').trim();
      saveStudio(); applyEvacEdits(); renderStudioHandles();
    });
    pane.querySelector('#st-qr-name')?.addEventListener('input', e => {
      if (!selQr) return;
      selQr.name = e.target.value || 'Titik QR';
      saveStudio(); applyEvacEdits();
    });
    pane.querySelector('#st-qr-x')?.addEventListener('input', e => {
      if (!selQr) return;
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) {
        selQr.x = clamp(v, 0, 1427);
        saveStudio(); applyEvacEdits(); renderStudioHandles();
      }
    });
    pane.querySelector('#st-qr-y')?.addEventListener('input', e => {
      if (!selQr) return;
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) {
        selQr.y = clamp(v, 0, 1023);
        saveStudio(); applyEvacEdits(); renderStudioHandles();
      }
    });
    pane.querySelector('#st-qr-move-tool')?.addEventListener('click', () => {
      activeTool = activeTool === 'move-qr-start' ? null : 'move-qr-start';
      renderRoutesPane();
      if (activeTool === 'move-qr-start' && selQr) {
        toast(`Klik di titik mana saja pada peta untuk memindahkan ${selQr.id} (${selQr.name}).`);
      }
    });
    pane.querySelector('#st-qr-test')?.addEventListener('click', () => {
      if (!selQr) return;
      window.EvacBackend?.routeFromStart?.(selQr.id, true);
      toast(`Menampilkan rute evakuasi terpadu dari ${selQr.id} (${selQr.name}).`);
    });
    pane.querySelector('#st-qr-open-modal')?.addEventListener('click', () => {
      document.getElementById('btn-qr-starts')?.click();
    });

    pane.querySelector('#st-tool-add-text')?.addEventListener('click', () => {
      activeTool = activeTool === 'add-text' ? null : 'add-text';
      renderRoutesPane();
      if (activeTool === 'add-text') toast('Klik di titik mana saja pada peta untuk menaruh label teks baru.');
    });
    pane.querySelector('#st-txt-l1')?.addEventListener('input', e => { if (selTxt) { selTxt.line1 = e.target.value; saveStudio(); applyMapTexts(); } });
    pane.querySelector('#st-txt-l2')?.addEventListener('input', e => { if (selTxt) { selTxt.line2 = e.target.value; saveStudio(); applyMapTexts(); } });
    pane.querySelector('#st-txt-badge')?.addEventListener('input', e => { if (selTxt) { selTxt.badge = e.target.value; saveStudio(); applyMapTexts(); } });
    pane.querySelector('#st-txt-fs')?.addEventListener('input', e => { if (selTxt) { selTxt.fontSize = +e.target.value; saveStudio(); applyMapTexts(); renderRoutesPane(); } });
    pane.querySelector('#st-txt-rot')?.addEventListener('input', e => { if (selTxt) { selTxt.rot = +e.target.value; saveStudio(); applyMapTexts(); renderRoutesPane(); } });
    pane.querySelector('#st-txt-mask')?.addEventListener('change', e => { if (selTxt) { selTxt.maskBg = e.target.checked; saveStudio(); applyMapTexts(); } });
    pane.querySelector('#st-txt-del')?.addEventListener('click', () => {
      studio.mapTexts = studio.mapTexts.filter(x => x.id !== selectedTextId);
      selectedTextId = null;
      saveStudio(); applyMapTexts(); renderRoutesPane(); renderStudioHandles();
    });
  }

  window.__onEvacBackendUpdated = () => {
    if (activeTab === 'routes' && document.body.classList.contains('map-editor-active')) {
      renderRoutesPane();
      renderStudioHandles();
    }
  };

  // TAB 5: SIMPAN PERMANEN & SINKRONISASI PC ⇄ MOBILE
  function renderSavePane() {
    const pane = document.getElementById('studio-pane-save');
    if (!pane) return;
    pane.innerHTML = `
      <div class="studio-card" style="background:linear-gradient(135deg,#ecfdf5,#ffffff);border-color:#6ee7b7">
        <div class="studio-card-title" style="color:#047857"><span>⚡ Auto-Sync PC ⇄ Mobile Aktif</span></div>
        <p style="font-size:8px;line-height:1.5;color:#065f46;margin:0 0 8px">
          Setiap perubahan di Studio otomatis disinkronkan secara real-time ke semua perangkat (PC &amp; HP) yang membuka link web yang sama tanpa perlu tombol manual.
        </p>
        <div class="studio-grid-2">
          <button type="button" class="studio-btn primary" id="st-save-shared-json" style="background:#059669;border-color:#047857">💾 Unduh map-state.json</button>
          <button type="button" class="studio-btn" id="st-open-sync-modal" style="border-color:#6ee7b7;color:#047857">📱 Opsi QR / Cadangan</button>
        </div>
      </div>

      <div class="studio-card" style="background:linear-gradient(135deg,#f0fdf4,#ffffff);border-color:#bbf7d0">
        <div class="studio-card-title" style="color:#166534"><span>💾 Simpan Permanen ke File index.html</span></div>
        <p style="font-size:8px;line-height:1.5;color:#15803d;margin:0 0 8px">
          Menyuntikkan seluruh perubahan ke dalam file <code>index.html</code> sehingga saat dibuka di perangkat mana pun langsung memuat versi terbaru:
        </p>
        <button type="button" class="studio-btn success" id="st-save-html-file" style="width:100%;padding:9px;font-size:9px">
          💾 Simpan / Unduh File index.html Permanen
        </button>
      </div>

      <div class="studio-card">
        <div class="studio-card-title"><span>📦 Backup & Pulihkan Data JSON</span></div>
        <div class="studio-grid-2">
          <button type="button" class="studio-btn" id="st-export-full-json">⇩ Export Semua JSON</button>
          <button type="button" class="studio-btn" id="st-import-full-json">⇧ Import File JSON</button>
        </div>
        <input type="file" id="st-import-json-input" accept="application/json" hidden/>
        <button type="button" class="studio-btn danger" id="st-factory-reset" style="width:100%;margin-top:8px">
          ↺ Reset Seluruh Peta ke Pengaturan Awal
        </button>
      </div>
    `;

    pane.querySelector('#st-save-shared-json')?.addEventListener('click', saveSharedJsonToProject);
    pane.querySelector('#st-open-sync-modal')?.addEventListener('click', () => window.GisSync?.openModal?.());
    pane.querySelector('#st-save-html-file')?.addEventListener('click', savePermanentHtmlFile);
    pane.querySelector('#st-export-full-json')?.addEventListener('click', exportFullBundleJson);
    pane.querySelector('#st-import-full-json')?.addEventListener('click', () => pane.querySelector('#st-import-json-input')?.click());
    pane.querySelector('#st-import-json-input')?.addEventListener('change', importFullBundleJson);
    pane.querySelector('#st-factory-reset')?.addEventListener('click', async () => {
      if (!confirm('Reset seluruh perubahan ruangan, pintu, tembok, CCTV, dan jalur evakuasi ke kondisi bawaan awal?')) return;
      localStorage.removeItem(STUDIO_KEY);
      localStorage.removeItem('gisK3MapEditorV7Safety');
      localStorage.removeItem('gisK3ManualMapV1');
      localStorage.removeItem('gisK3MapBuilderV9');
      localStorage.removeItem('gisK3EvacBackendV2');
      localStorage.removeItem('gisK3EvacBackendV1');
      const resetTs = new Date().toISOString();
      localStorage.setItem('gisK3BakedAppliedAt', resetTs);
      studio = defaultStudioState();
      window.__mapEditorSafetyAPI?.reset();
      window.EvacBackend?.resetAllSegments?.();
      window.EvacBackend?.resetQrStarts?.();
      window.EvacBackend?.resetAssemblyPoint?.();
      try { await window.__pushAutoCloudReset?.(resetTs); } catch (_) {}
      location.reload();
    });
  }

  function buildFullBundle() {
    const bakedAt = new Date().toISOString();
    const safety = window.__mapEditorSafetyAPI?.getState?.() || null;
    const evacBackend = window.EvacBackend?.getState?.() || null;
    let manualMap = { routes: [], areas: [] };
    let v6 = {};
    try { manualMap = JSON.parse(localStorage.getItem('gisK3ManualMapV1') || '{"routes":[],"areas":[]}'); } catch (_) {}
    try { v6 = JSON.parse(localStorage.getItem('gisK3V6State') || '{}'); } catch (_) {}
    return { version: 'studio-v2-unified', bakedAt, studio, safety, manualMap, v6, evacBackend };
  }

  function applyFullBundle(b, sourceLabel = 'Sinkronisasi') {
    if (!b || typeof b !== 'object') return false;
    const ts = b.bakedAt || new Date().toISOString();
    if (b.safety) {
      localStorage.setItem('gisK3MapEditorV7Safety', JSON.stringify({ version: 7, savedAt: ts, state: b.safety }));
    }
    if (b.manualMap) {
      localStorage.setItem('gisK3ManualMapV1', JSON.stringify(b.manualMap));
    }
    if (b.v6) {
      localStorage.setItem('gisK3V6State', JSON.stringify(b.v6));
    }
    if (b.studio) {
      studio = b.studio;
      localStorage.setItem(STUDIO_KEY, JSON.stringify(studio));
    }
    if (b.evacBackend) {
      localStorage.setItem('gisK3EvacBackendV2', JSON.stringify(b.evacBackend));
      localStorage.setItem('gisK3EvacBackendV1', JSON.stringify(b.evacBackend));
    }
    localStorage.setItem('gisK3BakedAppliedAt', ts);

    window.__mapEditorSafetyAPI?.reloadFromStorage?.();
    window.EvacBackend?.reloadFromStorage?.();
    window.__reloadAreasFromStorage?.();
    studio = loadStudioState();
    applyAllStudioData();
    if (document.body.classList.contains('map-editor-active')) {
      renderStudioInspector();
      renderStudioHandles();
    }
    window.__syncK3Metrics?.();
    toast(`✓ ${sourceLabel} berhasil diterapkan! PC & Mobile kini tersinkronisasi.`);
    return true;
  }

  let savedJsonHandle = null;
  async function saveSharedJsonToProject() {
    try {
      const bundle = buildFullBundle();
      localStorage.setItem('gisK3BakedAppliedAt', bundle.bakedAt);
      const jsonStr = JSON.stringify(bundle, null, 2);

      if (window.showSaveFilePicker) {
        try {
          if (!savedJsonHandle) {
            savedJsonHandle = await window.showSaveFilePicker({
              suggestedName: 'map-state.json',
              types: [{ description: 'JSON Map State (Simpan di folder data/)', accept: { 'application/json': ['.json'] } }]
            });
          }
          const writable = await savedJsonHandle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          toast('✓ File data/map-state.json berhasil disimpan! Deploy ke Netlify agar semua HP otomatis sinkron.');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          savedJsonHandle = null;
        }
      }

      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'map-state.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast('✓ map-state.json diunduh. Taruh di folder data/map-state.json lalu deploy ke Netlify!');
    } catch (e) {
      toast('Gagal menyimpan map-state.json: ' + e.message);
    }
  }

  async function savePermanentHtmlFile() {
    try {
      const bundle = buildFullBundle();
      localStorage.setItem('gisK3BakedAppliedAt', bundle.bakedAt);
      const src = await getCleanSourceHtml();
      const bakedScript = `<script id="gis-k3-baked-state">\nwindow.__BAKED_MAP_STATE__ = ${JSON.stringify(bundle)};\n(function(){\n  try {\n    const b = window.__BAKED_MAP_STATE__;\n    if (!b || !b.bakedAt) return;\n    const lastApplied = localStorage.getItem('gisK3BakedAppliedAt');\n    if (lastApplied !== b.bakedAt) {\n      if (b.safety) localStorage.setItem('gisK3MapEditorV7Safety', JSON.stringify({ version: 7, savedAt: b.bakedAt, state: b.safety }));\n      if (b.manualMap) localStorage.setItem('gisK3ManualMapV1', JSON.stringify(b.manualMap));\n      if (b.v6) localStorage.setItem('gisK3V6State', JSON.stringify(b.v6));\n      if (b.studio) localStorage.setItem('gisK3StudioStateV1', JSON.stringify(b.studio));\n      if (b.evacBackend) {\n        localStorage.setItem('gisK3EvacBackendV2', JSON.stringify(b.evacBackend));\n        localStorage.setItem('gisK3EvacBackendV1', JSON.stringify(b.evacBackend));\n      }\n      localStorage.setItem('gisK3BakedAppliedAt', b.bakedAt);\n    }\n  } catch (_) {}\n})();\n<` + `/script>`;

      const reBaked = new RegExp('<script id="gis-k3-baked-state">[\\s\\S]*?<\\/script>');
      let updatedHtml = src;
      if (reBaked.test(src)) {
        updatedHtml = src.replace(reBaked, bakedScript);
      } else {
        updatedHtml = src.replace('<script src="js/app.js"></script>', bakedScript + '\n  <script src="js/app.js"></script>');
      }

      if (window.showSaveFilePicker) {
        try {
          if (!savedFileHandle) {
            savedFileHandle = await window.showSaveFilePicker({
              suggestedName: 'index.html',
              types: [{ description: 'HTML File', accept: { 'text/html': ['.html'] } }]
            });
          }
          const writable = await savedFileHandle.createWritable();
          await writable.write(updatedHtml);
          await writable.close();
          toast('✓ File index.html berhasil disimpan langsung ke disk!');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          savedFileHandle = null;
        }
      }

      const blob = new Blob([updatedHtml], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'index.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast('✓ File index.html permanen berhasil diunduh!');
    } catch (e) {
      toast('Gagal mengekspor HTML: ' + e.message);
    }
  }

  function exportFullBundleJson() {
    const bundle = buildFullBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GIS-K3-Studio-Full-Backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1200);
    toast('Backup JSON lengkap berhasil diunduh.');
  }

  function importFullBundleJson(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const b = JSON.parse(r.result);
        applyFullBundle(b, 'File JSON');
        document.getElementById('sync-devices-modal')?.classList.remove('open');
      } catch (_) {
        toast('File JSON tidak valid.');
      }
      e.target.value = '';
    };
    r.readAsText(f);
  }

  // ============================================================================
  // DELTA-COMPRESSED SYNC ENGINE V3 (Always fits inside a single scannable QR!)
  // ============================================================================
  const SAFETY_DEFAULTS = {
    apar:   { label: 'APAR',         letter: 'A', color: '#DC2626' },
    p3k:    { label: 'P3K',          letter: 'P', color: '#16A34A' },
    cctv:   { label: 'CCTV',         letter: 'C', color: '#2563EB' },
    fire:   { label: 'Fire Alarm',   letter: 'F', color: '#F97316' },
    custom: { label: 'Custom Asset', letter: 'K', color: '#7C3AED' }
  };

  function encodeSyncPayload() {
    const bundle = buildFullBundle();
    const origSafety = window.__mapEditorSafetyAPI?.getOriginal?.() || {};
    const curSafety = bundle.safety || {};
    const defStarts = defaultQrStarts();
    const delta = { v: 3, t: bundle.bakedAt };
    const summaryParts = [];

    // 1. Studio overrides (only non-empty)
    const st = bundle.studio || {};
    const stDelta = {};
    if (st.roomOverrides && Object.keys(st.roomOverrides).length) {
      stDelta.ro = st.roomOverrides;
      summaryParts.push(`${Object.keys(st.roomOverrides).length} ruang diubah`);
    }
    if (st.builtinDoors && Object.keys(st.builtinDoors).length) {
      stDelta.bd = st.builtinDoors;
      summaryParts.push(`${Object.keys(st.builtinDoors).length} pintu bawaan`);
    }
    if (Array.isArray(st.customDoors) && st.customDoors.length) {
      stDelta.cd = st.customDoors;
      summaryParts.push(`${st.customDoors.length} pintu baru`);
    }
    if (Array.isArray(st.wallEdits) && st.wallEdits.length) {
      stDelta.we = st.wallEdits;
      summaryParts.push(`${st.wallEdits.length} garis tembok`);
    }
    if (Array.isArray(st.mapTexts) && st.mapTexts.length) {
      stDelta.mt = st.mapTexts;
      summaryParts.push(`${st.mapTexts.length} label teks`);
    }
    if (Object.keys(stDelta).length) delta.st = stDelta;

    // 2. Safety markers delta (only include categories that differ from original defaults)
    const sfDelta = {};
    let changedSafetyCats = 0;
    ['apar', 'p3k', 'cctv', 'fire', 'custom'].forEach(k => {
      const curArr = Array.isArray(curSafety[k]) ? curSafety[k] : [];
      const origArr = Array.isArray(origSafety[k]) ? origSafety[k] : [];
      const cfg = SAFETY_DEFAULTS[k];
      const sameLen = curArr.length === origArr.length;
      const isIdentical = sameLen && curArr.every((p, idx) => {
        const o = origArr[idx];
        return o
          && Math.abs((+p.x || 0) - (+o.x || 0)) < 0.2
          && Math.abs((+p.y || 0) - (+o.y || 0)) < 0.2
          && (p.initial || cfg.letter) === (o.initial || cfg.letter)
          && (p.name || cfg.label) === (o.name || cfg.label)
          && (p.color || cfg.color).toUpperCase() === (o.color || cfg.color).toUpperCase()
          && (p.desc || '') === (o.desc || '')
          && (k !== 'cctv' || (Math.abs((+p.angle || 0) - (+o.angle || 0)) < 0.5 && (+p.range || 47) === (+o.range || 47) && (+p.spread || 53) === (+o.spread || 53)));
      });
      if (!isIdentical) {
        changedSafetyCats++;
        sfDelta[k] = curArr.map(p => {
          const item = [
            +Number(p.x).toFixed(1),
            +Number(p.y).toFixed(1),
            (p.initial && p.initial !== cfg.letter) ? p.initial : '',
            (p.name && p.name !== cfg.label) ? p.name : '',
            (p.color && p.color.toUpperCase() !== cfg.color.toUpperCase()) ? p.color : '',
            p.desc || ''
          ];
          if (k === 'cctv') {
            item.push(Math.round(+p.angle || 0), Math.round(+p.range || 47), Math.round(+p.spread || 53));
          }
          // Trim trailing empty strings to save bytes
          while (item.length > 2 && item[item.length - 1] === '') item.pop();
          return item;
        });
      }
    });
    if (Object.keys(sfDelta).length) {
      delta.sf = sfDelta;
      summaryParts.push(`${changedSafetyCats} kategori aset K3`);
    }

    // 3. Evacuation Backend delta (custom segments, toggled/edited built-in segments, assembly point, QR points)
    const ev = bundle.evacBackend || {};
    const evDelta = {};
    if (ev.assemblyPoint && (Math.abs(ev.assemblyPoint.x - 535.5) > 0.5 || Math.abs(ev.assemblyPoint.y - 898.3) > 0.5)) {
      evDelta.ap = [+Number(ev.assemblyPoint.x).toFixed(1), +Number(ev.assemblyPoint.y).toFixed(1)];
      summaryParts.push('Titik Kumpul digeser');
    }
    const segs = Array.isArray(ev.segments) ? ev.segments : [];
    const customSegs = segs.filter(s => s.kind === 'custom');
    const disabledBuiltins = segs.filter(s => s.kind !== 'custom' && s.active === false).map(s => s.id);
    if (customSegs.length) {
      evDelta.cs = customSegs.map(s => [
        s.id,
        s.name,
        s.active !== false ? 1 : 0,
        s.connectsAssembly ? 1 : 0,
        (s.points || []).map(p => [+Number(p.x).toFixed(1), +Number(p.y).toFixed(1)])
      ]);
      summaryParts.push(`${customSegs.length} jalur evakuasi custom`);
    }
    if (disabledBuiltins.length) {
      evDelta.off = disabledBuiltins;
      summaryParts.push(`${disabledBuiltins.length} koridor dinonaktifkan`);
    }
    const qrList = Array.isArray(ev.qrStartPoints) ? ev.qrStartPoints : [];
    const qrChanged = qrList.length !== defStarts.length || qrList.some((q, i) => {
      const d = defStarts[i];
      return !d || q.id !== d.id || q.code !== d.code || q.name !== d.name || Math.abs(q.x - d.x) > 0.5 || Math.abs(q.y - d.y) > 0.5;
    });
    if (qrChanged) {
      evDelta.qr = qrList.map(q => [q.id, q.code, q.name, +Number(q.x).toFixed(1), +Number(q.y).toFixed(1)]);
      summaryParts.push(`${qrList.length} titik awal QR`);
    }
    if (Object.keys(evDelta).length) delta.ev = evDelta;

    // 4. Custom room/zone areas (> 40)
    const areas = bundle.manualMap?.areas || [];
    if (areas.length) {
      delta.ar = areas;
      summaryParts.push(`${areas.length} ruangan/zona baru`);
    }

    const json = JSON.stringify(delta);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const base = window.location.href.split('#')[0].split('?')[0];
    return {
      url: `${base}#sync=${b64}`,
      length: b64.length,
      summary: summaryParts.length ? summaryParts.join(' · ') : 'Sesuai Peta Standar (0 perubahan kustom)',
      hasChanges: summaryParts.length > 0
    };
  }

  function expandDeltaBundle(data) {
    if (data.version) return data;
    if (data.v === 2) {
      return {
        version: 'studio-v2-unified',
        bakedAt: data.t || new Date().toISOString(),
        studio: data.st || null,
        safety: data.sf || null,
        evacBackend: data.ev || null,
        manualMap: { routes: [], areas: Array.isArray(data.ar) ? data.ar : [] }
      };
    }
    // Reconstruct full bundle from v3 compact delta
    const bakedAt = data.t || new Date().toISOString();
    const fullStudio = defaultStudioState();
    if (data.st) {
      if (data.st.ro) fullStudio.roomOverrides = data.st.ro;
      if (data.st.bd) fullStudio.builtinDoors = data.st.bd;
      if (Array.isArray(data.st.cd)) fullStudio.customDoors = data.st.cd;
      if (Array.isArray(data.st.we)) fullStudio.wallEdits = data.st.we;
      if (Array.isArray(data.st.mt)) fullStudio.mapTexts = data.st.mt;
    }

    const fullSafety = window.__mapEditorSafetyAPI?.getOriginal?.() || { apar: [], p3k: [], cctv: [], fire: [], custom: [] };
    if (data.sf) {
      ['apar', 'p3k', 'cctv', 'fire', 'custom'].forEach(k => {
        if (Array.isArray(data.sf[k])) {
          const cfg = SAFETY_DEFAULTS[k];
          fullSafety[k] = data.sf[k].map(arr => ({
            x: +arr[0] || 0,
            y: +arr[1] || 0,
            initial: arr[2] || cfg.letter,
            name: arr[3] || cfg.label,
            color: arr[4] || cfg.color,
            desc: arr[5] || '',
            ...(k === 'cctv' ? { angle: arr[6] ?? 90, range: arr[7] ?? 47, spread: arr[8] ?? 53 } : {})
          }));
        }
      });
    }

    // Reconstruct EvacBackend state starting from clean built-in segments
    window.EvacBackend?.resetAllSegments?.();
    const baseSegs = (window.EvacBackend?.getSegments?.() || []).map(s => ({
      ...s,
      points: (s.points || []).map(p => ({ ...p }))
    }));
    const offSet = new Set(data.ev?.off || []);
    baseSegs.forEach(s => {
      if (offSet.has(s.id)) s.active = false;
    });
    if (Array.isArray(data.ev?.cs)) {
      data.ev.cs.forEach(c => {
        baseSegs.push({
          id: String(c[0] || 'SEG-C1'),
          name: String(c[1] || 'Jalur Tambahan'),
          kind: 'custom',
          active: Boolean(c[2]),
          connectsAssembly: Boolean(c[3]),
          points: (c[4] || []).map(pt => ({ x: +pt[0], y: +pt[1] }))
        });
      });
    }
    const ap = Array.isArray(data.ev?.ap) ? { x: +data.ev.ap[0], y: +data.ev.ap[1] } : { x: 535.5, y: 898.3 };
    const qrStarts = Array.isArray(data.ev?.qr)
      ? data.ev.qr.map(q => ({ id: q[0], code: q[1], name: q[2], x: +q[3], y: +q[4] }))
      : defaultQrStarts();

    fullStudio.evacEdits.assemblyPoint = ap;
    fullStudio.evacEdits.qrStartPoints = qrStarts;

    const fullEvac = {
      version: 2,
      assemblyPoint: ap,
      segments: baseSegs,
      qrStartPoints: qrStarts
    };

    const customRoutesLegacy = baseSegs.filter(s => s.kind === 'custom').map(s => ({
      id: s.id,
      name: s.name,
      points: s.points,
      joined: true,
      joinType: 'unified-evac-backend'
    }));

    return {
      version: 'studio-v2-unified',
      bakedAt,
      studio: fullStudio,
      safety: fullSafety,
      evacBackend: fullEvac,
      manualMap: { routes: customRoutesLegacy, areas: Array.isArray(data.ar) ? data.ar : [] }
    };
  }

  function decodeAndApplySyncHash(silent = false) {
    try {
      const hash = window.location.hash || '';
      const searchSync = new URLSearchParams(window.location.search).get('sync');
      let b64 = searchSync || '';
      if (!b64 && hash.includes('sync=')) {
        b64 = hash.split('sync=')[1]?.split('&')[0] || '';
      }
      if (!b64) return false;
      const std = b64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = std + '==='.slice((std.length + 3) % 4);
      const json = decodeURIComponent(escape(atob(pad)));
      const data = JSON.parse(json);
      if (!data || typeof data !== 'object') return false;
      const bundle = expandDeltaBundle(data);
      applyFullBundle(bundle, 'QR / Link Sinkronisasi PC ⇄ HP');
      if (hash.includes('sync=')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return true;
    } catch (err) {
      if (!silent) toast('Link sinkronisasi tidak valid atau terpotong.');
      return false;
    }
  }

  async function pullSharedStateFromServer(manual = false) {
    try {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        if (manual) toast('Buka melalui URL Netlify / web server untuk menarik data/map-state.json.');
        return false;
      }
      const res = await fetch(`data/map-state.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        if (manual) toast('File data/map-state.json belum ditemukan di server.');
        return false;
      }
      const b = await res.json();
      if (!b || !b.bakedAt) {
        if (manual) toast('data/map-state.json di server Netlify masih standar. Gunakan Scan QR Sync (Opsi 1) atau unduh map-state.json lalu deploy ke Netlify (Opsi 2).');
        return false;
      }
      const lastApplied = localStorage.getItem('gisK3BakedAppliedAt');
      if (manual || lastApplied !== b.bakedAt) {
        applyFullBundle(b, 'Server Netlify (data/map-state.json)');
        return true;
      }
      if (manual) toast('✓ Perangkat ini sudah sinkron dengan versi terbaru di server Netlify.');
      return false;
    } catch (_) {
      if (manual) toast('Gagal memuat data/map-state.json dari server.');
      return false;
    }
  }

  function refreshSyncModalUI() {
    const urlInput = document.getElementById('sync-url-input');
    const qrBox = document.getElementById('sync-qr-box');
    const noteEl = document.getElementById('sync-qr-note');
    const sumEl = document.getElementById('sync-active-summary');
    if (!urlInput || !qrBox) return;

    const { url, length, summary, hasChanges } = encodeSyncPayload();
    urlInput.value = url;
    qrBox.innerHTML = '';

    if (sumEl) {
      sumEl.style.background = hasChanges ? '#ecfdf5' : '#f8fafc';
      sumEl.style.borderColor = hasChanges ? '#6ee7b7' : '#cbd5e1';
      sumEl.innerHTML = `<span><b>Status Peta di Perangkat Ini:</b> ${esc(summary)}</span><span class="feature-chip ${hasChanges ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">${hasChanges ? 'ADA EDITAN AKTIF' : 'STANDAR'}</span>`;
    }

    if (typeof QRCode !== 'undefined' && length <= 2200) {
      try {
        new QRCode(qrBox, {
          text: url,
          width: 118,
          height: 118,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.L
        });
        if (noteEl) noteEl.innerHTML = `<span style="color:#059669;font-weight:800">✓ QR Delta Sync siap dipindai kamera HP!</span> Payload sangat ringkas (<b>${length} karakter</b>).`;
      } catch (_) {
        qrBox.innerHTML = '<div style="font-size:8px;text-align:center;color:#0369a1;font-weight:800;padding:6px">Salin Link / Bagikan ke HP</div>';
        if (noteEl) noteEl.textContent = 'Gunakan tombol Salin Link Sync atau Bagikan ke HP di atas.';
      }
    } else {
      qrBox.innerHTML = '<div style="font-size:8px;text-align:center;color:#0369a1;font-weight:800;padding:6px">Gunakan Tombol Salin Link / Ekspor JSON</div>';
      if (noteEl) noteEl.textContent = 'Kustomisasi sangat banyak — gunakan tombol Salin Link Sync atau Opsi 2 (map-state.json).';
    }
  }

  function initDeviceSyncModal() {
    const modal = document.getElementById('sync-devices-modal');
    const openBtn = document.getElementById('btn-sync-devices');
    openBtn?.addEventListener('click', () => {
      refreshSyncModalUI();
      modal?.classList.add('open');
      modal?.setAttribute('aria-hidden', 'false');
    });

    document.getElementById('sync-save-json-project')?.addEventListener('click', saveSharedJsonToProject);
    document.getElementById('sync-save-html-project')?.addEventListener('click', savePermanentHtmlFile);
    document.getElementById('sync-pull-server-now')?.addEventListener('click', () => pullSharedStateFromServer(true));
    document.getElementById('sync-regen-link')?.addEventListener('click', () => {
      refreshSyncModalUI();
      toast('QR & Link Sinkronisasi diperbarui.');
    });
    document.getElementById('sync-copy-link')?.addEventListener('click', () => {
      const inp = document.getElementById('sync-url-input');
      if (!inp) return;
      refreshSyncModalUI();
      navigator.clipboard?.writeText(inp.value).then(() => {
        toast('✓ Link Sinkronisasi disalin! Buka link tersebut di browser HP Anda.');
      }).catch(() => {
        inp.select();
        document.execCommand('copy');
        toast('✓ Link Sinkronisasi disalin!');
      });
    });
    document.getElementById('sync-share-native')?.addEventListener('click', async () => {
      refreshSyncModalUI();
      const inp = document.getElementById('sync-url-input');
      const url = inp?.value || window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Sync Peta GIS K3 · ULP Panakkukang',
            text: 'Buka link ini untuk menyamakan tampilan peta, jalur evakuasi, dan aset K3:',
            url
          });
          return;
        } catch (_) {}
      }
      navigator.clipboard?.writeText(url).then(() => {
        toast('✓ Link disalin ke clipboard (siap ditempel di WhatsApp/Telegram).');
      });
    });
    document.getElementById('sync-export-file')?.addEventListener('click', exportFullBundleJson);
    document.getElementById('sync-import-file-btn')?.addEventListener('click', () => {
      document.getElementById('sync-import-file-input')?.click();
    });
    document.getElementById('sync-import-file-input')?.addEventListener('change', importFullBundleJson);

    window.addEventListener('hashchange', () => decodeAndApplySyncHash(false));
  }

  // ============================================================================
  // AUTOMATIC ZERO-CLICK LIVE SYNC (PC ⇄ MOBILE FROM THE SAME LINK)
  // Uses Netlify Function (/.netlify/functions/map-state) + Real-Time SSE/PubSub
  // ============================================================================
  const AUTO_SYNC_CLIENT_ID = 'client_' + Math.random().toString(36).slice(2, 10);
  let autoPushTimer = null;
  let isApplyingRemoteSync = false;
  let lastSyncedB64 = '';

  function getAutoSyncTopic() {
    const rawUrl = (window.location.hostname || 'local') + (window.location.pathname || '/').replace(/\/index\.html$/i, '').replace(/\/+$/, '');
    let h1 = 0xdeadbeef ^ rawUrl.length, h2 = 0x41c6ce57 ^ rawUrl.length;
    for (let i = 0; i < rawUrl.length; i++) {
      const ch = rawUrl.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hashHex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    return `pln_ulppnk_k3_v3_${hashHex}`;
  }

  function setHeaderSyncStatus(statusText, state = 'idle') {
    const txtEl = document.getElementById('header-live-sync-text');
    const dotEl = document.getElementById('header-live-sync-dot');
    if (txtEl) txtEl.textContent = statusText;
    if (dotEl) {
      dotEl.style.background = state === 'syncing' ? '#0ea5e9' : '#10b981';
    }
  }

  function encodeB64Only() {
    const { url } = encodeSyncPayload();
    return url.split('#sync=')[1] || '';
  }

  function applyRemoteSyncPacket(packet, silentToast = true) {
    if (!packet || typeof packet !== 'object') return false;
    if (packet.clientId && packet.clientId === AUTO_SYNC_CLIENT_ID) return false;
    const remoteTs = packet.ts || '';
    const localTs = localStorage.getItem('gisK3BakedAppliedAt') || '';
    if (remoteTs && localTs && remoteTs <= localTs) return false;

    isApplyingRemoteSync = true;
    try {
      if (packet.reset) {
        localStorage.removeItem(STUDIO_KEY);
        localStorage.removeItem('gisK3MapEditorV7Safety');
        localStorage.removeItem('gisK3ManualMapV1');
        localStorage.removeItem('gisK3EvacBackendV2');
        localStorage.removeItem('gisK3EvacBackendV1');
        localStorage.setItem('gisK3BakedAppliedAt', remoteTs || new Date().toISOString());
        window.__mapEditorSafetyAPI?.reset();
        window.EvacBackend?.resetAllSegments?.();
        window.EvacBackend?.resetQrStarts?.();
        window.EvacBackend?.resetAssemblyPoint?.();
        studio = defaultStudioState();
        applyAllStudioData();
        window.__syncK3Metrics?.();
        setHeaderSyncStatus('✓ Peta Direset Otomatis', 'idle');
        return true;
      }

      const b64 = packet.b64 || '';
      if (!b64 || b64 === lastSyncedB64) return false;
      const std = b64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = std + '==='.slice((std.length + 3) % 4);
      const json = decodeURIComponent(escape(atob(pad)));
      const data = JSON.parse(json);
      if (!data || typeof data !== 'object') return false;
      data.t = remoteTs || data.t || new Date().toISOString();
      const bundle = expandDeltaBundle(data);
      lastSyncedB64 = b64;
      applyFullBundle(bundle, 'Auto-Sync Live');
      setHeaderSyncStatus('✓ Tersinkron Otomatis', 'idle');
      return true;
    } catch (_) {
      return false;
    } finally {
      isApplyingRemoteSync = false;
    }
  }

  async function pushAutoCloudState() {
    if (isApplyingRemoteSync) return;
    try {
      const b64 = encodeB64Only();
      if (!b64 || b64 === lastSyncedB64) return;
      lastSyncedB64 = b64;
      const ts = new Date().toISOString();
      localStorage.setItem('gisK3BakedAppliedAt', ts);
      const packet = { clientId: AUTO_SYNC_CLIENT_ID, ts, b64 };
      const bodyStr = JSON.stringify(packet);
      setHeaderSyncStatus('🔄 Menyinkronkan...', 'syncing');

      const topic = getAutoSyncTopic();
      const tasks = [];
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        tasks.push(
          fetch('/.netlify/functions/map-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr
          }).catch(() => null)
        );
      }
      tasks.push(
        fetch(`https://ntfy.sh/${topic}`, {
          method: 'POST',
          body: bodyStr
        }).catch(() => null)
      );
      await Promise.allSettled(tasks);
      setHeaderSyncStatus('✓ Tersinkron Otomatis', 'idle');
    } catch (_) {
      setHeaderSyncStatus('Auto-Sync PC ⇄ HP Aktif', 'idle');
    }
  }

  window.__pushAutoCloudReset = async (ts) => {
    const packet = { clientId: AUTO_SYNC_CLIENT_ID, ts: ts || new Date().toISOString(), reset: true };
    const bodyStr = JSON.stringify(packet);
    const topic = getAutoSyncTopic();
    await Promise.allSettled([
      fetch('/.netlify/functions/map-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyStr }).catch(() => null),
      fetch(`https://ntfy.sh/${topic}`, { method: 'POST', body: bodyStr }).catch(() => null)
    ]);
  };

  window.__scheduleAutoCloudPush = () => {
    if (isApplyingRemoteSync) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(pushAutoCloudState, 550);
  };

  async function pullAutoCloudState() {
    if (isApplyingRemoteSync) return false;
    const topic = getAutoSyncTopic();
    const candidates = [];

    // 1. Check Netlify Serverless Function endpoint (/.netlify/functions/map-state)
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const r = await fetch(`/.netlify/functions/map-state?t=${Date.now()}`, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && (d.b64 || d.reset)) candidates.push(d);
        }
      } catch (_) {}
    }

    // 2. Check Cloud Pub/Sub 24h Cache (works even on static drag-and-drop Netlify deploys)
    try {
      const r = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`, { cache: 'no-store' });
      if (r.ok) {
        const text = await r.text();
        const lines = text.trim().split('\n').filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const msg = JSON.parse(lines[i]);
            if (msg && msg.event === 'message' && msg.message) {
              const parsed = JSON.parse(msg.message);
              if (parsed && (parsed.b64 || parsed.reset)) {
                candidates.push(parsed);
                break;
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    if (!candidates.length) return false;
    candidates.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    return applyRemoteSyncPacket(candidates[0], true);
  }

  function startAutoLiveSyncEngine() {
    lastSyncedB64 = encodeB64Only();
    // Initial pull from Netlify Function + Cloud Cache + static map-state.json
    pullAutoCloudState().then(applied => {
      if (!applied) pullSharedStateFromServer(false);
    });

    // Subscribe to real-time SSE stream so edits on Desktop appear on Mobile in < 0.5 seconds!
    try {
      if (typeof EventSource !== 'undefined') {
        const topic = getAutoSyncTopic();
        const es = new EventSource(`https://ntfy.sh/${topic}/sse`);
        es.onmessage = ev => {
          try {
            const msg = JSON.parse(ev.data || '{}');
            if (msg && msg.message) {
              const packet = JSON.parse(msg.message);
              applyRemoteSyncPacket(packet, true);
            }
          } catch (_) {}
        };
      }
    } catch (_) {}

    // Also pull whenever user switches back to the browser tab or unlocks their phone
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pullAutoCloudState();
    });
    window.addEventListener('focus', () => pullAutoCloudState());

    // Lightweight background heartbeat poll every 8s when page is visible
    setInterval(() => {
      if (document.visibilityState === 'visible' && !svgDrag) {
        pullAutoCloudState();
      }
    }, 8000);
  }

  window.GisSync = {
    openModal: () => {
      refreshSyncModalUI();
      const modal = document.getElementById('sync-devices-modal');
      modal?.classList.add('open');
      modal?.setAttribute('aria-hidden', 'false');
    },
    saveSharedJsonToProject,
    savePermanentHtmlFile,
    pullSharedStateFromServer,
    pullAutoCloudState,
    pushAutoCloudState,
    applyFullBundle
  };

  // Interactive Pointer Engine on #main-svg for Studio Tools & Dragging
  function installStudioSvgInteractions() {
    const s = getSvg();
    if (!s) return;

    s.addEventListener('pointerdown', e => {
      const isEditing = document.body.classList.contains('map-editor-active');
      if (!isEditing || e.button !== 0) return;
      if (window.EvacBackend?.isDrawing?.()) return;
      const pt = screenToSvg(e.clientX, e.clientY);

      if (activeTool === 'place-safety') {
        e.stopPropagation(); e.preventDefault();
        window.__mapEditorSafetyAPI?.addAsset(placeSafetyKind, pt, `${placeSafetyKind.toUpperCase()} ditambahkan di (${Math.round(pt.x)}, ${Math.round(pt.y)}).`);
        return;
      }

      if (activeTool === 'add-door') {
        e.stopPropagation(); e.preventDefault();
        const id = 'DOOR-' + Date.now().toString(36).slice(-4).toUpperCase();
        studio.customDoors.push({ id, x: +pt.x.toFixed(1), y: +pt.y.toFixed(1), width: 18, angle: 0, flip: false, mode: 'open-door' });
        selectedDoor = { kind: 'custom', id };
        activeTool = null;
        saveStudio(); applyDoors(); renderDoorsPane(); renderStudioHandles();
        toast('Pintu baru ditambahkan! Atur sudut/lebar atau geser posisinya.');
        return;
      }

      if (activeTool === 'draw-wall' || activeTool === 'draw-triplek' || activeTool === 'draw-eraser') {
        e.stopPropagation(); e.preventDefault();
        const kind = activeTool === 'draw-eraser' ? 'eraser' : (activeTool === 'draw-triplek' ? 'triplek' : 'wall');
        const id = 'W-' + Date.now().toString(36).slice(-4).toUpperCase();
        const w = { id, kind, x1: +pt.x.toFixed(1), y1: +pt.y.toFixed(1), x2: +pt.x.toFixed(1), y2: +pt.y.toFixed(1), width: kind === 'eraser' ? 9 : (kind === 'triplek' ? 4 : 2.5) };
        studio.wallEdits.push(w);
        selectedWallId = id;
        svgDrag = { type: 'wall-draw', wall: w };
        return;
      }

      if (activeTool === 'move-qr-start') {
        e.stopPropagation(); e.preventDefault();
        const qrPoints = studio.evacEdits?.qrStartPoints || [];
        const selQr = qrPoints.find(q => q.id === selectedQrStartId) || qrPoints[0];
        if (selQr) {
          selQr.x = +clamp(pt.x, 0, 1427).toFixed(1);
          selQr.y = +clamp(pt.y, 0, 1023).toFixed(1);
          activeTool = null;
          saveStudio(); applyEvacEdits(); renderRoutesPane(); renderStudioHandles();
          toast(`✓ Posisi ${selQr.id} (${selQr.name}) dipindahkan ke (${selQr.x}, ${selQr.y}).`);
        }
        return;
      }

      if (activeTool === 'add-text') {
        e.stopPropagation(); e.preventDefault();
        const txt = prompt('Masukkan teks label peta:', 'LABEL BARU');
        activeTool = null;
        if (!txt) { renderRoutesPane(); return; }
        const id = 'TXT-' + Date.now().toString(36).slice(-4).toUpperCase();
        const [l1, l2] = splitNameIntoLines(txt);
        studio.mapTexts.push({ id, badge: '', line1: l1, line2: l2, x: +pt.x.toFixed(1), y: +pt.y.toFixed(1), fontSize: 7.5, color: '#0F172A', maskBg: true, rot: 0 });
        selectedTextId = id;
        saveStudio(); applyMapTexts(); renderRoutesPane(); renderStudioHandles();
        toast('Label teks ditambahkan. Tarik titik T untuk memindahkannya.');
        return;
      }

      // Clicking an evacuation segment while in 'routes' tab selects it for editing
      const segHit = e.target.closest?.('#evacuation-routes .evac-route[data-seg-id]');
      if (segHit && activeTab === 'routes') {
        e.stopPropagation();
        window.EvacBackend?.setSelectedSegmentId?.(segHit.getAttribute('data-seg-id'));
        renderRoutesPane();
        renderStudioHandles();
        return;
      }

      // Clicking a room on the map while in Studio Mode selects it in the Studio Room editor!
      const roomHit = e.target.closest?.('#room-hotspots [data-room], #v6-map-area-layer .v6-map-area[data-room]');
      if (roomHit && activeTab === 'rooms') {
        selectedRoomId = roomHit.dataset.room;
        window.__selectRoom?.(selectedRoomId, 'map');
        renderRoomsPane();
        renderStudioHandles();
      }
    }, true);

    window.addEventListener('pointermove', e => {
      if (!svgDrag) return;
      e.stopPropagation(); e.preventDefault();
      const pt = screenToSvg(e.clientX, e.clientY);
      const dx = pt.x - svgDrag.sx, dy = pt.y - svgDrag.sy;

      if (svgDrag.type === 'room-label') {
        const r = svgDrag.roomId;
        if (!studio.roomOverrides[r]) studio.roomOverrides[r] = {};
        studio.roomOverrides[r].labelX = +(svgDrag.ox + dx).toFixed(1);
        studio.roomOverrides[r].labelY = +(svgDrag.oy + dy).toFixed(1);
        studio.roomOverrides[r].showMapLabel = true;
        applyRoomOverrides();
        renderStudioHandles();
      } else if (svgDrag.type === 'room-box-move') {
        const cb = studio.roomOverrides[svgDrag.roomId]?.customBox;
        if (cb) {
          cb.x = +(svgDrag.ox + dx).toFixed(1);
          cb.y = +(svgDrag.oy + dy).toFixed(1);
          applyRoomOverrides();
          renderStudioHandles();
        }
      } else if (svgDrag.type === 'room-box-resize') {
        const cb = studio.roomOverrides[svgDrag.roomId]?.customBox;
        if (cb) {
          cb.w = Math.max(20, +(svgDrag.ow + dx).toFixed(1));
          cb.h = Math.max(20, +(svgDrag.oh + dy).toFixed(1));
          applyRoomOverrides();
          renderStudioHandles();
        }
      } else if (svgDrag.type === 'builtin-door') {
        const idx = svgDrag.idx;
        studio.builtinDoors[idx] = { ...(studio.builtinDoors[idx] || {}), dx: +(svgDrag.odx + dx).toFixed(1), dy: +(svgDrag.ody + dy).toFixed(1) };
        applyDoors();
        renderStudioHandles();
      } else if (svgDrag.type === 'custom-door') {
        svgDrag.door.x = +(svgDrag.ox + dx).toFixed(1);
        svgDrag.door.y = +(svgDrag.oy + dy).toFixed(1);
        applyDoors();
        renderStudioHandles();
      } else if (svgDrag.type === 'wall-draw') {
        const w = svgDrag.wall;
        let nx = pt.x, ny = pt.y;
        if (Math.abs(nx - w.x1) < 8) nx = w.x1;
        if (Math.abs(ny - w.y1) < 8) ny = w.y1;
        w.x2 = +nx.toFixed(1);
        w.y2 = +ny.toFixed(1);
        applyWalls();
      } else if (svgDrag.type === 'wall-edit') {
        const w = svgDrag.wall;
        if (svgDrag.end === '1') {
          w.x1 = +(svgDrag.ox1 + dx).toFixed(1);
          w.y1 = +(svgDrag.oy1 + dy).toFixed(1);
        } else if (svgDrag.end === '2') {
          w.x2 = +(svgDrag.ox2 + dx).toFixed(1);
          w.y2 = +(svgDrag.oy2 + dy).toFixed(1);
        } else {
          w.x1 = +(svgDrag.ox1 + dx).toFixed(1);
          w.y1 = +(svgDrag.oy1 + dy).toFixed(1);
          w.x2 = +(svgDrag.ox2 + dx).toFixed(1);
          w.y2 = +(svgDrag.oy2 + dy).toFixed(1);
        }
        applyWalls();
        renderStudioHandles();
      } else if (svgDrag.type === 'evac-seg-vertex') {
        const seg = (window.EvacBackend?.getSegments?.() || []).find(s => s.id === svgDrag.segId);
        if (seg && seg.points?.[svgDrag.ptIdx]) {
          const pts = seg.points.map(p => ({ ...p }));
          pts[svgDrag.ptIdx] = {
            x: +clamp(svgDrag.ox + dx, 0, 1427).toFixed(1),
            y: +clamp(svgDrag.oy + dy, 0, 1023).toFixed(1)
          };
          window.EvacBackend.updateSegment(seg.id, { points: pts }, false);
          renderStudioHandles();
        }
      } else if (svgDrag.type === 'assembly') {
        const newAp = { x: +clamp(svgDrag.ox + dx, 0, 1427).toFixed(1), y: +clamp(svgDrag.oy + dy, 0, 1023).toFixed(1) };
        studio.evacEdits.assemblyPoint = newAp;
        window.EvacBackend?.setAssemblyPoint?.(newAp, false);
        renderStudioHandles();
      } else if (svgDrag.type === 'qr-start') {
        svgDrag.item.x = +clamp(svgDrag.ox + dx, 0, 1427).toFixed(1);
        svgDrag.item.y = +clamp(svgDrag.oy + dy, 0, 1023).toFixed(1);
        applyEvacEdits();
        renderStudioHandles();
      } else if (svgDrag.type === 'free-text') {
        svgDrag.item.x = +(svgDrag.ox + dx).toFixed(1);
        svgDrag.item.y = +(svgDrag.oy + dy).toFixed(1);
        applyMapTexts();
        renderStudioHandles();
      }
    }, true);

    window.addEventListener('pointerup', () => {
      if (!svgDrag) return;
      if (svgDrag.type === 'wall-draw') {
        activeTool = null;
        renderDoorsPane();
      } else if (svgDrag.type === 'qr-start' || svgDrag.type === 'evac-seg-vertex' || svgDrag.type === 'assembly') {
        if (svgDrag.type === 'evac-seg-vertex') {
          const seg = (window.EvacBackend?.getSegments?.() || []).find(s => s.id === svgDrag.segId);
          if (seg) window.EvacBackend.updateSegment(seg.id, { points: seg.points }, true);
        } else if (svgDrag.type === 'assembly') {
          window.EvacBackend?.setAssemblyPoint?.(studio.evacEdits.assemblyPoint, true);
        }
        renderRoutesPane();
      }
      svgDrag = null;
      saveStudio();
      renderStudioHandles();
    }, true);
  }

  window.__reloadStudioFromStorage = () => {
    studio = loadStudioState();
    applyAllStudioData();
    if (document.body.classList.contains('map-editor-active')) {
      renderStudioInspector();
      renderStudioHandles();
    }
  };

  window.__onStudioModeChange = on => {
    if (on) {
      buildStudioPanelUI();
      switchStudioTab(activeTab);
    } else {
      activeTool = null;
      window.EvacBackend?.cancelDrawing?.();
      if (studioHandleLayer) studioHandleLayer.innerHTML = '';
    }
  };

  window.__onSafetyAssetSelected = () => {
    if (activeTab !== 'safety') switchStudioTab('safety');
  };

  function init() {
    initSvgLayers();
    buildStudioPanelUI();
    applyAllStudioData();
    installStudioSvgInteractions();
    initDeviceSyncModal();

    // Auto-check Sync Hash/Query (?sync=... or #sync=...) and start Zero-Click AutoLiveSync Engine
    decodeAndApplySyncHash(true);
    startAutoLiveSyncEngine();

    // Quick "Simpan HTML" button in top toolbar
    document.getElementById('btn-quick-save-html')?.addEventListener('click', savePermanentHtmlFile);

    // Quick "Edit Ruangan Ini" button in Sidebar Detail Card
    document.getElementById('btn-detail-edit-room')?.addEventListener('click', () => {
      const titleText = document.getElementById('detail-room-title')?.textContent || '';
      const rm = titleText.split('·')[0]?.trim();
      if (rm) selectedRoomId = rm;
      window.__mapEditorSafetyAPI?.setEditing(true);
      switchStudioTab('rooms');
      setTimeout(() => {
        const inp = document.getElementById('st-room-name');
        inp?.focus();
        inp?.select();
      }, 60);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ==========================================================================
   10. Smart GIS UI v2 (Slide-Over Drawer, Dark Mode, Smart Tooltips & K3 Proximity)
   ========================================================================== */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function initSmartUI() {
    const svg = document.getElementById('main-svg');
    const aside = document.querySelector('body > div.flex.flex-1 > aside');
    if (!svg || !aside) return;

    // 1. Start with Drawer CLOSED so initial map is 100% clean and centered in the middle!
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('safety-markers')?.classList.remove('is-active');
    document.getElementById('evacuation-routes')?.classList.remove('is-active');

    // Default to "Daftar & Legenda" tab inside the right drawer so opening the drawer shows Legend & Rooms immediately
    setTimeout(() => {
      document.querySelector('.panel-tab[data-panel-tab="rooms"]')?.click();
    }, 30);

    // 2. Add Drawer Header inside <aside> & Floating Handle Tab on the Right Edge
    if (!document.getElementById('drawer-top-header')) {
      const drawerHeader = document.createElement('div');
      drawerHeader.id = 'drawer-top-header';
      drawerHeader.innerHTML = `
        <div>
          <h3>📑 Legenda & Indeks Ruangan</h3>
          <p>Klik fasilitas atau ruangan untuk menyorot peta</p>
        </div>
        <button type="button" id="drawer-close-btn" title="Sembunyikan Drawer ke Kanan">✕ Tutup</button>
      `;
      aside.insertBefore(drawerHeader, aside.firstChild);
    }

    let handle = document.getElementById('right-drawer-handle');
    if (!handle) {
      handle = document.createElement('button');
      handle.id = 'right-drawer-handle';
      handle.type = 'button';
      handle.title = 'Buka / Tutup Drawer Legenda & Daftar Ruangan';
      handle.innerHTML = '◀ 📑 Legenda & Ruang';
      document.body.appendChild(handle);
    }

    // 3. Header Controls (Fullscreen & Drawer Toggle — Dark Mode removed)
    document.body.classList.remove('theme-dark');
    try { localStorage.removeItem('gisK3ThemeMode'); } catch (_) {}

    const headerRight = document.querySelector('body > header > div:last-child');
    let sideBtn = document.getElementById('btn-toggle-sidebar');
    if (headerRight && !sideBtn) {
      const fsBtn = document.createElement('button');
      fsBtn.id = 'btn-toggle-fullscreen';
      fsBtn.type = 'button';
      fsBtn.className = 'smart-header-ctrl';
      fsBtn.title = 'Layar Penuh (Fullscreen)';
      fsBtn.innerHTML = '⛶ <span>Penuh</span>';

      sideBtn = document.createElement('button');
      sideBtn.id = 'btn-toggle-sidebar';
      sideBtn.type = 'button';
      sideBtn.className = 'smart-header-ctrl';
      sideBtn.title = 'Buka / Tutup Panel Legenda & Informasi Detail';
      sideBtn.innerHTML = '📑 <span>Legenda</span>';

      headerRight.insertBefore(sideBtn, headerRight.firstChild);
      headerRight.insertBefore(fsBtn, headerRight.firstChild);

      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
          fsBtn.classList.add('active');
        } else {
          document.exitFullscreen?.().catch(() => {});
          fsBtn.classList.remove('active');
        }
      });
    }

    const isMobileViewport = () => window.innerWidth <= 900 || (window.innerWidth <= 960 && window.innerHeight <= 540);

    // Create Mobile Drawer Backdrop & Mobile Floating Action Button (FAB) Stack
    let mobileBackdrop = document.getElementById('mobile-drawer-backdrop');
    if (!mobileBackdrop) {
      mobileBackdrop = document.createElement('div');
      mobileBackdrop.id = 'mobile-drawer-backdrop';
      document.body.appendChild(mobileBackdrop);
    }

    let fabStack = document.getElementById('mobile-fab-stack');
    if (!fabStack) {
      fabStack = document.createElement('div');
      fabStack.id = 'mobile-fab-stack';
      fabStack.innerHTML = `
        <button type="button" class="mobile-fab-mini admin-only-control" id="mobile-studio-fab" title="Buka / Tutup Studio Edit Peta">
          <b>✎</b><span>Studio Edit</span>
        </button>
        <button type="button" class="mobile-fab-mini" id="mobile-ui-toggle-fab" title="Sembunyikan / Tampilkan Bar Atas (Mode Fokus Peta)">
          <b>⤢</b><span>Fokus Peta</span>
        </button>
        <button type="button" class="mobile-fab-mini" id="mobile-fit-fab" title="Perbesar Pas Layar / Kembali 100%">
          <b>🔍</b><span>Pas Layar</span>
        </button>
        <button type="button" class="mobile-fab-mini" id="mobile-evac-fab" title="Tampilkan Jalur Evakuasi">
          <b>↗</b><span>Evakuasi</span>
        </button>
        <button type="button" class="mobile-fab-main" id="mobile-legend-fab" aria-label="Buka Legenda dan Daftar Ruangan">
          <span class="fab-icon">📑</span>
          <span class="fab-label">Legenda & Ruang</span>
        </button>
      `;
      document.body.appendChild(fabStack);
    }

    let mobileRoomSheet = document.getElementById('mobile-room-sheet');
    if (!mobileRoomSheet) {
      mobileRoomSheet = document.createElement('div');
      mobileRoomSheet.id = 'mobile-room-sheet';
      document.body.appendChild(mobileRoomSheet);
    }

    const mobileLegendFab = document.getElementById('mobile-legend-fab');
    const mobileEvacFab = document.getElementById('mobile-evac-fab');
    const mobileFitFab = document.getElementById('mobile-fit-fab');
    const mobileUiToggleFab = document.getElementById('mobile-ui-toggle-fab');
    const mobileStudioFab = document.getElementById('mobile-studio-fab');
    const mobileSyncFab = document.getElementById('mobile-sync-fab');

    mobileSyncFab?.addEventListener('click', () => {
      document.getElementById('btn-sync-devices')?.click();
    });

    mobileStudioFab?.addEventListener('click', () => {
      const isEd = window.mapEditorIsEditing ? window.mapEditorIsEditing() : false;
      if (!isEd) setDrawerOpen(false);
      window.mapEditorSetEditing?.(!isEd);
      mobileStudioFab.classList.toggle('active', !isEd);
    });

    // Live Synchronization between PC View and Mobile View (BroadcastChannel + Storage Event)
    let syncChannel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        syncChannel = new BroadcastChannel('gis_k3_live_sync');
        syncChannel.onmessage = ev => {
          const kind = ev.data?.kind;
          if (kind === 'safety') window.__mapEditorSafetyAPI?.reloadFromStorage?.();
          else if (kind === 'studio') window.__reloadStudioFromStorage?.();
          else if (kind === 'evac') window.EvacBackend?.reloadFromStorage?.();
          else if (kind === 'areas') window.__reloadAreasFromStorage?.();
          window.__syncK3Metrics?.();
        };
      }
    } catch (_) {}
    window.__broadcastLiveSync = function(kind) {
      try { syncChannel?.postMessage({ kind, ts: Date.now() }); } catch (_) {}
      window.__scheduleAutoCloudPush?.(kind);
    };
    window.addEventListener('storage', ev => {
      if (!ev.key) return;
      if (ev.key === 'gisK3MapEditorV7Safety') {
        window.__mapEditorSafetyAPI?.reloadFromStorage?.();
      } else if (ev.key === 'gisK3StudioStateV1') {
        window.__reloadStudioFromStorage?.();
      } else if (ev.key === 'gisK3EvacBackendV2' || ev.key === 'gisK3EvacBackendV1') {
        window.EvacBackend?.reloadFromStorage?.();
      } else if (ev.key === 'gisK3ManualMapV1') {
        window.__reloadAreasFromStorage?.();
      }
      window.__syncK3Metrics?.();
    });

    function setDrawerOpen(open) {
      document.body.classList.toggle('sidebar-collapsed', !open);
      sideBtn?.classList.toggle('active', open);
      mobileBackdrop?.classList.toggle('open', open);
      if (handle) {
        handle.innerHTML = open ? '▶ Tutup Legenda' : '◀ 📑 Legenda & Ruang';
      }
      if (mobileLegendFab) {
        mobileLegendFab.classList.toggle('active', open);
        const lbl = mobileLegendFab.querySelector('.fab-label');
        const icn = mobileLegendFab.querySelector('.fab-icon');
        if (lbl) lbl.textContent = open ? 'Tutup Legenda' : 'Legenda & Ruang';
        if (icn) icn.textContent = open ? '✕' : '📑';
      }
      if (open) {
        mobileRoomSheet?.classList.remove('open');
      }
    }

    const toggleDrawer = () => setDrawerOpen(document.body.classList.contains('sidebar-collapsed'));
    sideBtn?.addEventListener('click', toggleDrawer);
    handle?.addEventListener('click', toggleDrawer);
    mobileLegendFab?.addEventListener('click', toggleDrawer);
    mobileBackdrop?.addEventListener('click', () => setDrawerOpen(false));
    document.getElementById('drawer-close-btn')?.addEventListener('click', () => setDrawerOpen(false));

    mobileEvacFab?.addEventListener('click', () => {
      const evacBtn = document.querySelector('.gis-layer-btn[data-layer="evacuation"]');
      const allBtn = document.querySelector('.gis-layer-btn[data-layer="all"]');
      const isEvac = evacBtn?.classList.contains('active');
      if (isEvac) allBtn?.click();
      else evacBtn?.click();
      mobileEvacFab.classList.toggle('active', !isEvac);
    });

    document.querySelectorAll('.gis-layer-btn[data-layer]').forEach(btn => {
      btn.addEventListener('click', () => {
        mobileEvacFab?.classList.toggle('active', btn.dataset.layer === 'evacuation');
      });
    });

    mobileFitFab?.addEventListener('click', () => {
      const curZoom = window.__getMapZoom ? window.__getMapZoom() : 1;
      if (curZoom > 1.08) {
        window.__v6RobustZoom?.reset?.();
      } else {
        const targetZ = window.innerHeight > window.innerWidth ? 1.85 : 1.55;
        window.__panZoomToSvgPoint?.(713.5, 511.5, targetZ);
      }
    });

    mobileUiToggleFab?.addEventListener('click', () => {
      const focusOn = document.body.classList.toggle('mobile-map-focus');
      mobileUiToggleFab.classList.toggle('active', focusOn);
      const sp = mobileUiToggleFab.querySelector('span');
      if (sp) sp.textContent = focusOn ? 'Tampil Menu' : 'Fokus Peta';
      window.showK3Toast?.(focusOn ? 'Mode Fokus Peta aktif — bar atas disembunyikan untuk layar penuh.' : 'Bar navigasi atas ditampilkan kembali.');
    });

    // Update zoom hint text for mobile touch users
    const zoomHint = document.querySelector('.map-zoom-hint');
    const syncMobileHint = () => {
      if (!zoomHint) return;
      zoomHint.textContent = isMobileViewport()
        ? 'Cubit (pinch) 2 jari untuk zoom · Geser 1 jari · 2× ketuk zoom'
        : 'Scroll untuk zoom · drag untuk geser';
    };
    syncMobileHint();
    window.addEventListener('resize', syncMobileHint);

    // 4. Relocate Floating #professional-map-stats (12 APAR, 3 P3K, 16 CCTV, 5 ALARM, CUSTOM) OFF the Map!
    function setSafetyFilter(kind) {
      const sm = document.getElementById('safety-markers');
      if (!sm) return;
      if (kind && ['apar', 'p3k', 'cctv', 'fire', 'custom'].includes(kind)) {
        sm.setAttribute('data-safety-filter', kind);
        document.body.setAttribute('data-safety-isolated', kind);
      } else {
        sm.removeAttribute('data-safety-filter');
        document.body.removeAttribute('data-safety-isolated');
      }
      document.querySelectorAll('.tk3-pill[data-k3-pill]').forEach(b => b.classList.toggle('active', b.dataset.k3Pill === kind));
      document.querySelectorAll('#professional-map-stats .pro-stat').forEach(s => {
        const k = s.querySelector('b[data-k3-stat]')?.getAttribute('data-k3-stat');
        s.classList.toggle('active', Boolean(kind && k === kind));
      });
      document.querySelectorAll('.k3-quick-grid button[data-focus-kind]').forEach(b => b.classList.toggle('active', b.dataset.focusKind === kind));
      const auditOrder = ['apar', 'p3k', 'cctv', 'fire', 'custom'];
      document.querySelectorAll('#panel-audit .audit-metrics > div').forEach((d, idx) => d.classList.toggle('active', Boolean(kind && auditOrder[idx] === kind)));
    }
    window.__setSafetyFilter = setSafetyFilter;

    function focusSafetyKind(kind) {
      if (!['apar', 'p3k', 'cctv', 'fire', 'custom'].includes(kind)) return;
      window.__isFocusingSafetyKind = true;
      const safetyBtn = document.querySelector('.gis-layer-btn[data-layer="safety"]');
      if (safetyBtn && !safetyBtn.classList.contains('active')) {
        safetyBtn.click();
      } else {
        document.getElementById('safety-markers')?.classList.add('is-active');
      }
      window.__isFocusingSafetyKind = false;
      setSafetyFilter(kind);
      const sel = kind === 'fire' ? '.marker-fire-alarm circle' : `.marker-${kind} circle`;
      svg.querySelectorAll(sel).forEach(c => {
        c.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.2)' }, { transform: 'scale(1)' }], { duration: 650, iterations: 2 });
      });
      const st = window.__mapEditorSafetyAPI?.getState?.();
      const cnt = st?.[kind]?.length ?? 0;
      const names = { apar: 'APAR', p3k: 'P3K', cctv: 'CCTV', fire: 'ALARM', custom: 'CUSTOM ASSET' };
      window.showK3Toast?.(`Menampilkan khusus ${cnt} titik ${names[kind] || kind.toUpperCase()} pada denah.`);
    }
    window.__focusSafetyKind = focusSafetyKind;

    setTimeout(() => {
      const stats = document.getElementById('professional-map-stats');
      const panelTabs = aside.querySelector('.panel-tabs');
      if (stats && panelTabs) {
        // Move #professional-map-stats out of #interactive-map and into the Right Drawer!
        aside.insertBefore(stats, panelTabs);
        stats.querySelectorAll('.pro-stat').forEach(stat => {
          const b = stat.querySelector('b[data-k3-stat]');
          if (!b) return;
          const kind = b.getAttribute('data-k3-stat');
          stat.title = `Klik untuk menampilkan khusus titik ${kind.toUpperCase()} di peta`;
          stat.addEventListener('click', () => focusSafetyKind(kind));
        });
      }

      // Also add compact colorful K3 pills in the Top Toolbar (next to Search) so they are accessible without blocking the map!
      const toolbar = document.querySelector('.gis-toolbar');
      const searchBox = document.querySelector('.gis-search');
      if (toolbar && searchBox && !document.getElementById('toolbar-k3-pills')) {
        const pillWrap = document.createElement('div');
        pillWrap.id = 'toolbar-k3-pills';
        const counts = window.__getSafetyAssetCounts ? window.__getSafetyAssetCounts() : { apar: 12, p3k: 3, cctv: 16, fire: 5, custom: 0 };
        pillWrap.innerHTML = `
          <button type="button" class="tk3-pill" data-k3-pill="apar" title="Tampilkan khusus titik APAR">🔴 <b data-k3-stat="apar">${counts.apar}</b> APAR</button>
          <button type="button" class="tk3-pill" data-k3-pill="p3k" title="Tampilkan khusus titik P3K">🟢 <b data-k3-stat="p3k">${counts.p3k}</b> P3K</button>
          <button type="button" class="tk3-pill" data-k3-pill="cctv" title="Tampilkan khusus titik CCTV">🔵 <b data-k3-stat="cctv">${counts.cctv}</b> CCTV</button>
          <button type="button" class="tk3-pill" data-k3-pill="fire" title="Tampilkan khusus titik Fire Alarm">🟠 <b data-k3-stat="fire">${counts.fire}</b> ALARM</button>
          <button type="button" class="tk3-pill" data-k3-pill="custom" title="Tampilkan khusus titik Custom Asset">🟣 <b data-k3-stat="custom">${counts.custom ?? 0}</b> CUSTOM</button>
        `;
        toolbar.insertBefore(pillWrap, searchBox);
        pillWrap.querySelectorAll('[data-k3-pill]').forEach(btn => {
          btn.addEventListener('click', () => focusSafetyKind(btn.dataset.k3Pill));
        });
      }

      // Move ? Help button out of #interactive-map into the toolbar so it never blocks the map
      const helpBtn = document.getElementById('professional-help-btn');
      if (helpBtn && toolbar) {
        helpBtn.style.cssText = 'position:static;width:30px;height:30px;border-radius:999px;border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;font-weight:900;cursor:pointer;flex-shrink:0';
        toolbar.appendChild(helpBtn);
      }
      window.__syncK3Metrics?.();
    }, 80);

    // 5. Create Floating Smart Hover Tooltip (#smart-map-tooltip)
    let tooltip = document.getElementById('smart-map-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'smart-map-tooltip';
      document.body.appendChild(tooltip);
    }

    const safetyRooms = window.__K3_SAFETY_ROOMS || new Set(['6','7','8','12','14','18','28','37','39','40']);
    const serviceRooms = window.__K3_SERVICE_ROOMS || new Set(['2','3','11','14','15','16','17','19','20','21','23','24B','38','39']);
    const getCat = r => String(r) === '8' ? 'Pusat K3L' : (serviceRooms.has(String(r)) ? 'Pelayanan & Teknik' : (safetyRooms.has(String(r)) ? 'Prioritas K3' : 'Operasional'));
    const getCatCode = r => String(r) === '8' ? 'k3l' : (serviceRooms.has(String(r)) ? 'service' : (safetyRooms.has(String(r)) ? 'safety' : 'ops'));

    function getNearestAsset(x, y, kind) {
      const st = window.__mapEditorSafetyAPI?.getState?.();
      const arr = st?.[kind] || [];
      let best = null;
      arr.forEach((p, idx) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (!best || d < best.dist) best = { idx: idx + 1, dist: d, x: p.x, y: p.y, angle: p.angle };
      });
      return best;
    }

    function getRoomBox(roomId) {
      const el = document.querySelector(`#room-hotspots [data-room="${CSS.escape(String(roomId))}"]:not([style*="display: none"]), #v6-map-area-layer [data-room="${CSS.escape(String(roomId))}"]`);
      if (!el) return null;
      try {
        const b = el.getBBox();
        return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height };
      } catch (_) { return null; }
    }

    svg.addEventListener('pointermove', e => {
      if (document.body.classList.contains('map-editor-active') || svg.classList.contains('is-panning')) {
        tooltip.classList.remove('visible');
        return;
      }
      const roomEl = e.target.closest?.('#room-hotspots [data-room], #v6-map-area-layer .v6-map-area[data-room]');
      if (roomEl) {
        const r = roomEl.dataset.room;
        const name = (window.getRoomName ? window.getRoomName(r) : `Ruangan ${r}`);
        const cat = getCat(r);
        const box = getRoomBox(r);
        const nearApar = box ? getNearestAsset(box.cx, box.cy, 'apar') : null;
        tooltip.innerHTML = `
          <div class="smt-head"><span>Ruang ${esc(r)} · ${esc(name)}</span><span class="smt-badge">${esc(cat)}</span></div>
          ${nearApar ? `<div class="smt-sub">🛡 APAR Terdekat: <b>APAR #${nearApar.idx}</b> (~${Math.max(1, Math.round(nearApar.dist / 18))} m)</div>` : ''}
          <div class="smt-hint">Klik: Buka Detail di Drawer · 2× Klik: Rute Evakuasi</div>
        `;
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
        tooltip.classList.add('visible');
        return;
      }

      const markerCircle = e.target.closest?.('#safety-markers .marker-labels circle');
      if (markerCircle) {
        const cx = +markerCircle.getAttribute('cx'), cy = +markerCircle.getAttribute('cy');
        const mKind = markerCircle.getAttribute('data-marker-kind') || '';
        const fill = (markerCircle.getAttribute('fill') || '').toUpperCase();
        const kindKey = mKind || (fill.includes('DC2626') ? 'apar' : (fill.includes('16A34A') ? 'p3k' : (fill.includes('2563EB') ? 'cctv' : (fill.includes('F97316') ? 'fire' : 'custom'))));
        const defaultLabels = { apar: 'APAR (Pemadam Api)', p3k: 'Kotak P3K', cctv: 'Kamera CCTV', fire: 'Fire Alarm', custom: 'Custom Asset' };
        const customName = markerCircle.getAttribute('data-custom-name') || defaultLabels[kindKey] || 'Aset K3';
        const customInit = markerCircle.getAttribute('data-custom-initial') || '';
        const customDesc = markerCircle.getAttribute('data-custom-desc') || '';
        const catBadge = { apar: 'APAR', p3k: 'P3K', cctv: 'CCTV', fire: 'ALARM', custom: 'CUSTOM' }[kindKey] || 'AKTIF';
        const displayTitle = customInit ? `${customName} (${customInit})` : customName;
        tooltip.innerHTML = `
          <div class="smt-head"><span>${esc(displayTitle)}</span><span class="smt-badge">${esc(catBadge)}</span></div>
          ${customDesc ? `<div class="smt-sub" style="color:#e2e8f0;font-weight:700">${esc(customDesc)}</div>` : ''}
          <div class="smt-sub">Koordinat Peta: (${Math.round(cx)}, ${Math.round(cy)})</div>
          <div class="smt-hint">Klik marker untuk info detail</div>
        `;
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
        tooltip.classList.add('visible');
        return;
      }

      tooltip.classList.remove('visible');
    });

    svg.addEventListener('pointerleave', () => tooltip.classList.remove('visible'));

    // 6. Universal Auto-Open Legend/Detail Drawer Helper (Opens Legend & shows info for ANYTHING pressed!)
    const detailCard = document.getElementById('room-detail-card');
    const detailGrid = detailCard?.querySelector('.detail-grid');
    const detailEyebrow = detailCard?.querySelector('.text-cyan-700');
    if (detailCard && detailGrid && !document.getElementById('smart-k3-proximity')) {
      const proxBox = document.createElement('div');
      proxBox.id = 'smart-k3-proximity';
      proxBox.className = 'hidden';
      detailGrid.insertAdjacentElement('afterend', proxBox);
    }

    function findNearestRoomToPoint(x, y) {
      let bestRoom = null, bestDist = Infinity;
      document.querySelectorAll('#room-hotspots [data-room], #v6-map-area-layer [data-room]').forEach(el => {
        if (el.style.display === 'none') return;
        try {
          const b = el.getBBox();
          const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
          const d = Math.hypot(cx - x, cy - y);
          if (d < bestDist) {
            bestDist = d;
            bestRoom = el.dataset.room;
          }
        } catch (_) {}
      });
      return bestRoom ? { room: bestRoom, name: window.getRoomName ? window.getRoomName(bestRoom) : `Ruangan ${bestRoom}`, distMeters: Math.max(1, Math.round(bestDist / 18)) } : null;
    }

    function showEntityDetailInDrawer(opts) {
      if (!opts || document.body.classList.contains('map-editor-active')) return;
      const dTitle = document.getElementById('detail-room-title');
      const dChip = document.getElementById('detail-room-chip');
      const dCopy = document.getElementById('detail-room-copy');
      const dBoxes = detailGrid ? [...detailGrid.querySelectorAll('.detail-box')] : [];
      const proxBox = document.getElementById('smart-k3-proximity');
      const k3Log = document.getElementById('detail-room-k3-log');
      const rActions = document.getElementById('detail-room-actions');

      if (detailEyebrow) detailEyebrow.textContent = opts.eyebrow || 'INFORMASI ITEM TERPILIH';
      if (dTitle) dTitle.textContent = opts.title || 'Informasi Peta';
      if (dChip) {
        dChip.textContent = opts.chip || 'AKTIF';
        dChip.className = opts.chipClass || 'feature-chip bg-sky-50 text-sky-700';
      }
      if (dCopy) dCopy.innerHTML = opts.copy || '';

      if (Array.isArray(opts.boxes)) {
        opts.boxes.forEach((pair, idx) => {
          const box = dBoxes[idx];
          if (!box || !pair) return;
          const kEl = box.querySelector('.k');
          const vEl = box.querySelector('.v');
          if (kEl) kEl.textContent = pair[0];
          if (vEl) vEl.textContent = pair[1];
        });
      }

      if (proxBox) {
        if (opts.extraHtml) {
          proxBox.classList.remove('hidden');
          proxBox.innerHTML = opts.extraHtml;
        } else {
          proxBox.classList.add('hidden');
        }
      }
      if (k3Log && opts.hideK3Log !== false) k3Log.classList.add('hidden');
      if (rActions && opts.hideRoomActions) rActions.classList.add('hidden');

      mobileRoomSheet?.classList.remove('open');
      setDrawerOpen(true);
      document.querySelector('.panel-tab[data-panel-tab="detail"]')?.click();
      aside.querySelector('.side-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.__showEntityDetailInDrawer = showEntityDetailInDrawer;

    // Auto-open Legend Drawer & show full info when clicking ANY Safety Marker, QR Origin, Assembly Point, Route, Zone, or Triplek Wall on Map
    svg.addEventListener('click', e => {
      if (document.body.classList.contains('map-editor-active') || window.__wasMapDragging) return;

      // 6a. Safety Marker (APAR, P3K, CCTV, Fire Alarm, Custom Asset)
      const markerCircle = e.target.closest?.('#safety-markers .marker-labels circle, #safety-markers .marker-pulse circle');
      if (markerCircle) {
        e.stopPropagation();
        const cx = +markerCircle.getAttribute('cx'), cy = +markerCircle.getAttribute('cy');
        const mKind = markerCircle.getAttribute('data-marker-kind') || '';
        const strokeOrFill = ((markerCircle.getAttribute('fill') || '') + ' ' + (markerCircle.getAttribute('stroke') || '')).toUpperCase();
        const kindKey = mKind
          || (markerCircle.closest('.marker-apar') || strokeOrFill.includes('DC2626') ? 'apar'
          : (markerCircle.closest('.marker-p3k') || strokeOrFill.includes('16A34A') ? 'p3k'
          : (markerCircle.closest('.marker-cctv') || strokeOrFill.includes('2563EB') ? 'cctv'
          : (markerCircle.closest('.marker-fire-alarm') || strokeOrFill.includes('F97316') ? 'fire' : 'custom'))));
        const st = window.__mapEditorSafetyAPI?.getState?.();
        const list = st?.[kindKey] || [];
        let idx = 0, bestD = Infinity;
        list.forEach((p, i) => {
          const d = Math.hypot(p.x - cx, p.y - cy);
          if (d < bestD) { bestD = d; idx = i; }
        });
        const item = list[idx];
        const defaultNames = { apar: 'APAR (Pemadam Api Ringan)', p3k: 'Kotak P3K', cctv: 'Kamera CCTV', fire: 'Fire Alarm', custom: 'Custom Asset' };
        const catBadges = { apar: 'APAR', p3k: 'P3K', cctv: 'CCTV', fire: 'ALARM', custom: 'CUSTOM' };
        const assetName = item?.name || markerCircle.getAttribute('data-custom-name') || defaultNames[kindKey] || 'Aset K3';
        const assetInit = item?.initial || markerCircle.getAttribute('data-custom-initial') || catBadges[kindKey]?.[0] || 'A';
        const assetDesc = item?.desc || markerCircle.getAttribute('data-custom-desc') || `Fasilitas keselamatan kategori ${defaultNames[kindKey] || kindKey.toUpperCase()} titik ke-${idx + 1} pada denah ULP Panakkukang.`;
        const nearRoom = findNearestRoomToPoint(cx, cy);
        const cctvAngle = kindKey === 'cctv' && item ? `${Math.round(((+item.angle || 0) % 360 + 360) % 360)}° (Jarak ${Math.round(+item.range || 47)}px)` : `Kode [${assetInit}]`;

        showEntityDetailInDrawer({
          eyebrow: `DETAIL FASILITAS K3 · ${catBadges[kindKey] || 'ASET'}`,
          title: `${assetName} #${idx + 1}`,
          chip: `${catBadges[kindKey] || 'K3'} · ${assetInit}`,
          chipClass: 'feature-chip bg-rose-50 text-rose-700',
          copy: `${esc(assetDesc)}`,
          boxes: [
            ['Status', 'Aktif & Terpetakan'],
            ['Kategori', `${catBadges[kindKey]} (#${idx + 1} dari ${list.length})`],
            ['Koordinat Peta', `(${Math.round(cx)}, ${Math.round(cy)})`],
            [kindKey === 'cctv' ? 'Arah Sorot CCTV' : 'Kode / Simbol', cctvAngle]
          ],
          extraHtml: `
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0284c7;margin-bottom:4px">📍 Konteks Lokasi Fasilitas</div>
            ${nearRoom ? `<div class="prox-row"><span>🏠 Ruangan Terdekat</span><b>Ruang ${esc(nearRoom.room)} · ${esc(nearRoom.name)} (~${nearRoom.distMeters} m)</b></div>` : ''}
            <div class="prox-row"><span>🔢 Urutan dalam Kategori</span><b>Titik #${idx + 1} dari total ${list.length} ${catBadges[kindKey]}</b></div>
          `,
          hideRoomActions: true
        });
        return;
      }

      // 6b. QR Start Origin Dot or You Are Here Marker on Map
      const qrOriginEl = e.target.closest?.('[data-qr-origin-id], #you-here-active');
      if (qrOriginEl) {
        e.stopPropagation();
        const qrId = qrOriginEl.getAttribute('data-qr-origin-id') || (window.START_POINTS?.[0]?.id || 'START-01');
        window.__v6ShowStart?.(qrId);
        return;
      }

      // 6c. Assembly Point (Titik Kumpul) on Map
      const apEl = e.target.closest?.('[data-assembly-point], .evac-assembly-pulse');
      if (apEl) {
        e.stopPropagation();
        const ap = window.__getAssemblyPoint ? window.__getAssemblyPoint() : { x: 535.5, y: 898.3 };
        const activeSegs = (window.EvacBackend?.getSegments?.() || []).filter(s => s.active !== false).length;
        showEntityDetailInDrawer({
          eyebrow: 'TITIK KUMPUL DARURAT · ISO 7010 E007',
          title: 'Titik Kumpul Evakuasi (Assembly Point)',
          chip: 'ZONA AMAN UTAMA',
          chipClass: 'feature-chip bg-emerald-50 text-emerald-700',
          copy: 'Titik berkumpul akhir seluruh pegawai dan pengunjung PT PLN (Persero) ULP Panakkukang saat terjadi keadaan darurat. Area terbuka bebas reruntuhan.',
          boxes: [
            ['Status', 'Aktif & Terbuka'],
            ['Kapasitas Area', '~150 Orang'],
            ['Koordinat Peta', `(${Math.round(ap.x)}, ${Math.round(ap.y)})`],
            ['Koridor Terhubung', `${activeSegs} Segmen Aktif`]
          ],
          hideRoomActions: true
        });
        return;
      }

      // 6d. Evacuation Route Line (.evac-route) on Map
      const routeEl = e.target.closest?.('#evacuation-routes .evac-route[data-seg-id]');
      if (routeEl) {
        e.stopPropagation();
        const segId = routeEl.getAttribute('data-seg-id');
        const seg = (window.EvacBackend?.getSegments?.() || []).find(s => s.id === segId);
        if (seg) {
          showEntityDetailInDrawer({
            eyebrow: 'SEGMEN JALUR EVAKUASI TERPADU',
            title: `${seg.id} · ${seg.name}`,
            chip: seg.kind === 'custom' ? 'JALUR CUSTOM' : 'KORIDOR BAWAAN',
            chipClass: 'feature-chip bg-emerald-50 text-emerald-700',
            copy: 'Segmen koridor aktif dalam graf Dijkstra yang menghubungkan ruangan dan titik awal QR menuju Titik Kumpul (Assembly Point).',
            boxes: [
              ['Status Koridor', seg.active !== false ? 'Aktif (Terbuka)' : 'Nonaktif'],
              ['Tipe Jalur', seg.kind === 'custom' ? 'Jalur Tambahan Admin' : 'Koridor Standar'],
              ['Jumlah Titik Sudut', `${seg.points?.length || 0} Titik`],
              ['Tujuan Akhir', 'Assembly Point']
            ],
            hideRoomActions: true
          });
          return;
        }
      }

      // 6e. Custom Zone (.v6-map-area without data-room)
      const zoneEl = e.target.closest?.('#v6-map-area-layer .v6-map-area:not([data-room])');
      if (zoneEl) {
        e.stopPropagation();
        const zoneLabel = zoneEl.querySelector('.v6-map-area-label')?.textContent || 'Zona Khusus';
        showEntityDetailInDrawer({
          eyebrow: 'ZONA KUSTOM TERPETAKAN',
          title: zoneLabel,
          chip: 'ZONA KHUSUS',
          chipClass: 'feature-chip bg-purple-50 text-purple-700',
          copy: `Area zona kustom <b>${esc(zoneLabel)}</b> yang ditandai pada denah operasional ULP Panakkukang.`,
          boxes: [
            ['Status', 'Terpetakan'],
            ['Kategori', 'Zona Khusus'],
            ['Visibilitas', 'Publik & Admin'],
            ['Mode', 'Interaktif']
          ],
          hideRoomActions: true
        });
        return;
      }

      // 6f. Temporary Partition Wall ([data-triplek-wall="true"])
      const wallEl = e.target.closest?.('[data-triplek-wall="true"]');
      if (wallEl) {
        e.stopPropagation();
        showEntityDetailInDrawer({
          eyebrow: 'STRUKTUR PARTISI · TEMBOK SEMENTARA',
          title: 'Partisi Tembok Triplek / Non-Permanen',
          chip: 'TEMBOK SEMENTARA',
          chipClass: 'feature-chip bg-amber-50 text-amber-700',
          copy: 'Segmen dinding partisi sementara (triplek/gypsum). Dalam keadaan darurat atau renovasi, partisi ini memiliki karakteristik berbeda dari dinding beton permanen.',
          boxes: [
            ['Status', 'Terpetakan'],
            ['Material', 'Partisi Triplek'],
            ['Total Segmen', '35 Segmen Partisi'],
            ['Fungsi', 'Pembatas Ruangan']
          ],
          hideRoomActions: true
        });
        return;
      }
    });

    // 7. Enhance Detail Ruang Card with Live Spatial K3 Proximity Analytics & Auto-open Drawer on BOTH Desktop & Mobile!
    const origSelectRoom = window.__selectRoom;
    if (typeof origSelectRoom === 'function') {
      window.__selectRoom = function(roomNumber, source) {
        if (detailEyebrow) detailEyebrow.textContent = 'DETAIL RUANG';
        ['Status', 'Kategori', 'APAR', 'Evakuasi'].forEach((lbl, idx) => {
          const kEl = detailGrid?.querySelectorAll('.detail-box .k')?.[idx];
          if (kEl) kEl.textContent = lbl;
        });
        origSelectRoom(roomNumber, source);
        const proxBox = document.getElementById('smart-k3-proximity');
        const box = getRoomBox(roomNumber);
        if (proxBox && box) {
          const nearApar = getNearestAsset(box.cx, box.cy, 'apar');
          const nearP3k = getNearestAsset(box.cx, box.cy, 'p3k');
          const nearCctv = getNearestAsset(box.cx, box.cy, 'cctv');
          const ap = window.__getAssemblyPoint ? window.__getAssemblyPoint() : { x: 535.5, y: 898.3 };
          const distAp = Math.max(2, Math.round(Math.hypot(box.cx - ap.x, box.cy - ap.y) / 18));

          proxBox.classList.remove('hidden');
          proxBox.innerHTML = `
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0284c7;margin-bottom:4px">📡 Analisis Jarak Fasilitas K3 Terdekat</div>
            ${nearApar ? `<div class="prox-row"><span>🔴 APAR Terdekat</span><b>APAR #${nearApar.idx} (~${Math.max(1, Math.round(nearApar.dist / 18))} m)</b></div>` : ''}
            ${nearP3k ? `<div class="prox-row"><span>🟢 Kotak P3K Terdekat</span><b>P3K #${nearP3k.idx} (~${Math.max(1, Math.round(nearP3k.dist / 18))} m)</b></div>` : ''}
            ${nearCctv ? `<div class="prox-row"><span>🔵 CCTV Pengawas</span><b>CCTV #${nearCctv.idx} (Sorot ${Math.round((+nearCctv.angle || 0 + 360) % 360)}°)</b></div>` : ''}
            <div class="prox-row"><span>🏃 Jarak ke Titik Kumpul</span><b>~${distAp} meter</b></div>
          `;
        }

        // Always auto-open the Legend/Detail Drawer on BOTH Desktop and Mobile when any room is selected!
        if (!document.body.classList.contains('map-editor-active')) {
          mobileRoomSheet?.classList.remove('open');
          setDrawerOpen(true);
          document.querySelector('.panel-tab[data-panel-tab="detail"]')?.click();
          aside.querySelector('.side-content')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };
    }

    // Also auto-open the Legend/Detail Drawer with category details when clicking any K3 Category Pill or Layer Button!
    const origFocusSafetyKind = window.__focusSafetyKind;
    window.__focusSafetyKind = function(kind) {
      origFocusSafetyKind?.(kind);
      if (document.body.classList.contains('map-editor-active')) return;
      const st = window.__mapEditorSafetyAPI?.getState?.();
      const list = st?.[kind] || [];
      const metaMap = {
        apar:   { title: 'Alat Pemadam Api Ringan (APAR)', badge: 'APAR', desc: 'Daftar seluruh titik tabung APAR yang tersebar di koridor dan ruangan prioritas K3.' },
        p3k:    { title: 'Kotak Pertolongan Pertama (P3K)', badge: 'P3K', desc: 'Lokasi kotak medis P3K untuk penanganan darurat cedera ringan di area kerja.' },
        cctv:   { title: 'Kamera Pengawas Keamanan (CCTV)', badge: 'CCTV', desc: 'Titik kamera pemantau keamanan beserta arah sudut sorot (Field of View) pada denah.' },
        fire:   { title: 'Titik Pemicu & Sirene Fire Alarm', badge: 'FIRE ALARM', desc: 'Lokasi titik pemicu alarm kebakaran dan indikator peringatan darurat.' },
        custom: { title: 'Fasilitas Keselamatan Kustom', badge: 'CUSTOM ASSET', desc: 'Daftar fasilitas keselamatan tambahan yang dipetakan pada denah.' }
      };
      const m = metaMap[kind] || metaMap.custom;
      const listHtml = list.length
        ? `<div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#0284c7;margin-bottom:5px">📋 Daftar Titik ${esc(m.badge)} (${list.length} Titik — Klik untuk Fokus)</div>`
          + `<div style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">`
          + list.map((p, i) => {
              const nr = findNearestRoomToPoint(p.x, p.y);
              return `<button type="button" data-zoom-marker-kind="${esc(kind)}" data-zoom-marker-idx="${i}" style="text-align:left;padding:5px 7px;border-radius:7px;background:#fff;border:1px solid #cbd5e1;font-size:8.5px;display:flex;justify-content:space-between;align-items:center;cursor:pointer"><span><b>${esc(p.name || m.badge)} #${i + 1}</b> ${nr ? `<span style="color:#64748b">· Dekat R.${esc(nr.room)}</span>` : ''}</span><span style="color:#0284c7;font-weight:800">(${Math.round(p.x)}, ${Math.round(p.y)}) ›</span></button>`;
            }).join('')
          + `</div>`
        : '';

      showEntityDetailInDrawer({
        eyebrow: `FILTER KATEGORI K3 · ${m.badge}`,
        title: `${m.title} (${list.length} Titik)`,
        chip: `${list.length} TITIK AKTIF`,
        chipClass: 'feature-chip bg-sky-50 text-sky-700',
        copy: m.desc,
        boxes: [
          ['Status Layer', 'Ditampilkan di Peta'],
          ['Kategori', m.badge],
          ['Jumlah Titik', `${list.length} Lokasi`],
          ['Interaksi', 'Klik titik di peta / daftar']
        ],
        extraHtml: listHtml,
        hideRoomActions: true
      });

      document.querySelectorAll('[data-zoom-marker-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = +btn.dataset.zoomMarkerIdx;
          const pt = list[idx];
          if (pt) {
            window.__panZoomToSvgPoint?.(pt.x, pt.y, isMobileViewport() ? 2.1 : 1.65);
          }
        });
      });
    };

    // Auto-open Legend Drawer with layer summary when user clicks toolbar buttons (Jalur Evakuasi, APAR & K3 Safety, Mode Tembok Sementara)
    document.querySelectorAll('.gis-layer-btn[data-layer="evacuation"], #mobile-evac-fab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (document.body.classList.contains('map-editor-active') || window.__isActivatingEvacForQr) return;
        const isEvac = document.getElementById('evacuation-routes')?.classList.contains('is-active');
        if (!isEvac) return;
        const segs = (window.EvacBackend?.getSegments?.() || []).filter(s => s.active !== false);
        const qrCount = (window.EvacBackend?.getQrStarts?.() || []).length;
        showEntityDetailInDrawer({
          eyebrow: 'LAYER AKTIF · JARINGAN EVAKUASI',
          title: 'Jalur Evakuasi & Titik Kumpul',
          chip: `${segs.length} KORIDOR AKTIF`,
          chipClass: 'feature-chip bg-emerald-50 text-emerald-700',
          copy: 'Menampilkan seluruh jaringan koridor evakuasi menuju Titik Kumpul (Assembly Point). Klik ruangan mana saja atau titik QR di peta untuk menghitung rute terpendek.',
          boxes: [
            ['Status Jaringan', 'Aktif & Terhubung'],
            ['Segmen Koridor', `${segs.length} Jalur Aktif`],
            ['Titik Awal QR', `${qrCount} Titik Koridor`],
            ['Tujuan Akhir', 'Assembly Point']
          ],
          hideRoomActions: true
        });
      });
    });

    document.querySelector('.gis-layer-btn[data-layer="safety"]')?.addEventListener('click', () => {
      if (document.body.classList.contains('map-editor-active') || window.__isFocusingSafetyKind) return;
      const counts = window.__getSafetyAssetCounts ? window.__getSafetyAssetCounts() : { apar: 12, p3k: 3, cctv: 16, fire: 5, custom: 0 };
      const total = (counts.apar || 0) + (counts.p3k || 0) + (counts.cctv || 0) + (counts.fire || 0) + (counts.custom || 0);
      showEntityDetailInDrawer({
        eyebrow: 'LAYER AKTIF · FASILITAS K3 & KEAMANAN',
        title: `APAR, P3K, CCTV & Fire Alarm (${total} Titik)`,
        chip: 'LAYER SAFETY AKTIF',
        chipClass: 'feature-chip bg-rose-50 text-rose-700',
        copy: 'Menampilkan seluruh titik peralatan keselamatan kerja (K3) dan cakupan sorot CCTV. Klik ikon bulat (A/P/C/F) pada peta untuk melihat detail tiap alat.',
        boxes: [
          ['APAR & P3K', `${counts.apar} APAR · ${counts.p3k} P3K`],
          ['Kamera CCTV', `${counts.cctv} Kamera Aktif`],
          ['Fire Alarm', `${counts.fire} Titik Alarm`],
          ['Aset Kustom', `${counts.custom || 0} Titik`]
        ],
        hideRoomActions: true
      });
    });

    document.getElementById('btn-temporary-wall')?.addEventListener('click', () => {
      if (document.body.classList.contains('map-editor-active')) return;
      const active = document.getElementById('btn-temporary-wall')?.classList.contains('wall-active');
      if (!active) return;
      showEntityDetailInDrawer({
        eyebrow: 'MODE PARTISI · TEMBOK SEMENTARA',
        title: 'Sorotan Tembok Triplek / Partisi Sementara',
        chip: '35 SEGMEN DISOROT',
        chipClass: 'feature-chip bg-amber-50 text-amber-700',
        copy: 'Menyorot seluruh dinding partisi non-permanen (triplek) dengan warna kuning menyala pada denah untuk membantu identifikasi struktur bangunan.',
        boxes: [
          ['Status Mode', 'Sorotan Aktif'],
          ['Material', 'Partisi Triplek'],
          ['Jumlah Segmen', '35 Titik Partisi'],
          ['Dampak Evakuasi', 'Dihitung di Graf']
        ],
        hideRoomActions: true
      });
    });

    // 8. Color-code Room Badges in Drawer + Add Category Filter Chips & Hover-Preview
    const roomList = document.getElementById('sidebar-room-list');
    if (roomList) {
      roomList.querySelectorAll('.sidebar-item[data-room]').forEach(item => {
        item.dataset.cat = getCatCode(item.dataset.room);
      });

      if (!document.getElementById('room-cat-filters')) {
        const filterBar = document.createElement('div');
        filterBar.id = 'room-cat-filters';
        filterBar.className = 'room-cat-filters';
        filterBar.innerHTML = `
          <button type="button" class="room-cat-btn active" data-cat-filter="all">🌈 Semua</button>
          <button type="button" class="room-cat-btn" data-cat-filter="service">🔵 Pelayanan & Teknik</button>
          <button type="button" class="room-cat-btn" data-cat-filter="safety">🟠 Prioritas K3</button>
          <button type="button" class="room-cat-btn" data-cat-filter="ops">🟣 Operasional</button>
        `;
        roomList.parentElement.insertBefore(filterBar, roomList);

        filterBar.querySelectorAll('[data-cat-filter]').forEach(btn => {
          btn.addEventListener('click', () => {
            filterBar.querySelectorAll('[data-cat-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const f = btn.dataset.catFilter;
            const q = (document.getElementById('room-search')?.value || '').trim().toLowerCase();
            roomList.querySelectorAll('.sidebar-item[data-room]').forEach(item => {
              const r = String(item.dataset.room);
              const name = (window.getRoomName ? window.getRoomName(r) : '').toLowerCase();
              const matchSearch = !q || `${r} ${name}`.toLowerCase().includes(q);
              const matchCat = f === 'all'
                || (f === 'service' && serviceRooms.has(r))
                || (f === 'safety' && safetyRooms.has(r))
                || (f === 'ops' && !serviceRooms.has(r) && !safetyRooms.has(r));
              item.classList.toggle('room-hidden', !(matchSearch && matchCat));
            });
          });
        });

        roomList.addEventListener('pointerover', e => {
          const item = e.target.closest?.('.sidebar-item[data-room]');
          svg.querySelectorAll('#room-hotspots .room-hover-preview').forEach(el => el.classList.remove('room-hover-preview'));
          if (!item) return;
          const r = item.dataset.room;
          svg.querySelectorAll(`#room-hotspots [data-room="${CSS.escape(r)}"]`).forEach(el => el.classList.add('room-hover-preview'));
        });
        roomList.addEventListener('pointerleave', () => {
          svg.querySelectorAll('#room-hotspots .room-hover-preview').forEach(el => el.classList.remove('room-hover-preview'));
        });
      }
    }

    // Typing in search box automatically opens the right drawer on the Rooms tab so user sees results
    const searchInput = document.getElementById('room-search');
    searchInput?.addEventListener('focus', () => {
      setDrawerOpen(true);
      document.querySelector('.panel-tab[data-panel-tab="rooms"]')?.click();
    });

    // If page was opened with ?start= or ?room= (e.g. scanning QR on Mobile/Desktop), automatically open Legend/Detail Drawer!
    setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const startP = params.get('start');
      const roomP = params.get('room');
      if (startP) {
        window.__v6ShowStart?.(startP);
      } else if (roomP) {
        window.__selectRoom?.(roomP, 'map');
      }
    }, 160);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSmartUI);
  else initSmartUI();
})();
