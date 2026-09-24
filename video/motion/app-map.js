// build-app-map.mjs가 frontend/src/views/map에서 만든다. 직접 고치지 않는다.
"use strict";
var AppMap = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // video/motion/src/app-map.entry.ts
  var app_map_entry_exports = {};
  __export(app_map_entry_exports, {
    DOT_RADIUS: () => DOT_RADIUS,
    DOT_RADIUS_MAX: () => DOT_RADIUS_MAX,
    DOT_RADIUS_TOP: () => DOT_RADIUS_TOP,
    DOT_SCALE_MAX: () => DOT_SCALE_MAX,
    DOT_SCALE_ZOOM: () => DOT_SCALE_ZOOM,
    HALO_GAP: () => HALO_GAP,
    HALO_MIN: () => HALO_MIN,
    HOVER_DIM: () => HOVER_DIM,
    LABEL_FADE_MS: () => LABEL_FADE_MS,
    LINK_FADE_PX: () => LINK_FADE_PX,
    LINK_FAR: () => LINK_FAR,
    LINK_FAR_WIDTH: () => LINK_FAR_WIDTH,
    LINK_IN: () => LINK_IN,
    LINK_OUT: () => LINK_OUT,
    LINK_SPEED: () => LINK_SPEED,
    LINK_WIDTH: () => LINK_WIDTH,
    MAX_ROWS: () => MAX_ROWS,
    PAPER_LABEL_ZOOM: () => PAPER_LABEL_ZOOM,
    SHOW_REGION_BLOBS: () => SHOW_REGION_BLOBS,
    TITLE_FONT_SIZE: () => TITLE_FONT_SIZE,
    TITLE_GAP_X: () => TITLE_GAP_X,
    TITLE_HEIGHT: () => TITLE_HEIGHT,
    TITLE_MARGIN_X: () => TITLE_MARGIN_X,
    TITLE_MARGIN_Y: () => TITLE_MARGIN_Y,
    TITLE_MAX_WIDTH: () => TITLE_MAX_WIDTH,
    TITLE_OFFSET_X: () => TITLE_OFFSET_X,
    TITLE_PADDING: () => TITLE_PADDING,
    TITLE_TILE: () => TITLE_TILE,
    TITLE_TRACKING: () => TITLE_TRACKING,
    TITLE_ZOOM_STEP: () => TITLE_ZOOM_STEP,
    TOP_CITED_QUANTILE: () => TOP_CITED_QUANTILE,
    VALUE_GAP: () => VALUE_GAP,
    ZOOM_RANGE: () => ZOOM_RANGE,
    citationIndex: () => citationIndex,
    clampRegionLabel: () => clampRegionLabel,
    clusterColor: () => clusterColor,
    degreeOf: () => degreeOf,
    descendants: () => descendants,
    dotScale: () => dotScale,
    fitCamera: () => fitCamera,
    homeCamera: () => homeCamera,
    labelLevel: () => labelLevel,
    labelOpacity: () => labelOpacity,
    linksOf: () => linksOf,
    localGraph: () => localGraph,
    ordinal: () => ordinal,
    ordinalColor: () => ordinalColor,
    paperLabelOpacity: () => paperLabelOpacity,
    paperTitleOpacity: () => paperTitleOpacity,
    placeRegionLabels: () => placeRegionLabels,
    regionBlobs: () => regionBlobs,
    regionLabels: () => regionLabels,
    regionRadii: () => regionRadii,
    revealZooms: () => revealZooms,
    spectrum: () => spectrum,
    titleCharacterSet: () => titleCharacterSet,
    titleFontRenderer: () => titleFontRenderer,
    titleMeasure: () => titleMeasure,
    titleMetrics: () => titleMetrics,
    titleTypography: () => titleTypography,
    truncateTitle: () => truncateTitle,
    wrapTitle: () => wrapTitle
  });

  // frontend/src/views/map/labels.ts
  var PAPER_LABEL_ZOOM = 5;
  function labelLevel(relativeZoom) {
    return relativeZoom < 1 ? "field" : relativeZoom < PAPER_LABEL_ZOOM ? "topic" : "paper";
  }
  function descendants(tree, id) {
    const out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), byId = new Map(tree?.nodes.map((n) => [n.id, n]) ?? []), stack = [id];
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      const n = byId.get(i);
      if (!n) continue;
      if (n.cluster_id !== null) out.add(n.cluster_id);
      if (n.left !== null) stack.push(n.left);
      if (n.right !== null) stack.push(n.right);
    }
    return out;
  }
  function regionLabels(tree, clusters, level) {
    if (!tree)
      return clusters.map((c) => ({
        id: `c${c.cluster_id}`,
        label: c.label,
        x: c.x,
        y: c.y,
        cluster: c.cluster_id,
        node: void 0,
        size: c.size
      }));
    const ids = new Set(tree.levels[String(level)] ?? []);
    return tree.nodes.filter((n) => ids.has(n.id)).map((n) => ({
      id: `n${n.id}`,
      label: n.label,
      x: n.x,
      y: n.y,
      cluster: n.cluster_id ?? void 0,
      node: n.id,
      size: n.size
    }));
  }
  function homeCamera(map, width, height) {
    const xs = map.x.filter(Number.isFinite), ys = map.y.filter(Number.isFinite);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
      zoom: Math.log2(
        Math.min(
          Math.max(160, width - 120) / Math.max(1, maxX - minX),
          Math.max(160, height - 130) / Math.max(1, maxY - minY)
        )
      )
    };
  }
  function fitCamera(xs, ys, width, height, padding, zoomMin, zoomMax) {
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const zoom = Math.log2(
      Math.min(
        Math.max(1, width - 2 * padding) / Math.max(1e-6, maxX - minX),
        Math.max(1, height - 2 * padding) / Math.max(1e-6, maxY - minY)
      )
    );
    return {
      target: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
      zoom: Math.min(zoomMax, Math.max(zoomMin, zoom))
    };
  }
  function regionRadii(map, tree, clusters) {
    const byCluster = /* @__PURE__ */ new Map();
    for (let i = 0; i < map.n; i++) {
      const c = map.cluster[i];
      if (c < 0 || !Number.isFinite(map.x[i]) || !Number.isFinite(map.y[i]))
        continue;
      let arr = byCluster.get(c);
      if (!arr) byCluster.set(c, arr = []);
      arr.push(i);
    }
    const radius = (ids, cx, cy) => {
      const d = [];
      for (const c of ids)
        for (const i of byCluster.get(c) ?? [])
          d.push(Math.hypot(map.x[i] - cx, map.y[i] - cy));
      if (!d.length) return 0;
      d.sort((a, b) => a - b);
      return d[Math.min(d.length - 1, Math.floor(d.length * 0.9))];
    };
    const out = /* @__PURE__ */ new Map();
    for (const c of clusters)
      if (c.x !== null && c.y !== null)
        out.set(`c${c.cluster_id}`, radius([c.cluster_id], c.x, c.y));
    for (const n of tree?.nodes ?? [])
      if (n.x !== null && n.y !== null)
        out.set(`n${n.id}`, radius(descendants(tree, n.id), n.x, n.y));
    return out;
  }
  function labelOpacity(zoom, reveal, floor) {
    return Math.min(1, Math.max(0, zoom - Math.max(reveal, floor)));
  }
  function paperLabelOpacity(relativeZoom) {
    return labelOpacity(relativeZoom, -Infinity, PAPER_LABEL_ZOOM - 0.5);
  }
  function paperTitleOpacity(zoom, reveal, floor, regionless) {
    const hard = labelOpacity(zoom, reveal, floor);
    return regionless > 0 ? hard + (labelOpacity(zoom, reveal, -Infinity) - hard) * regionless : hard;
  }
  function truncateTitle(measure, text, maxWidth) {
    const full = measure(text);
    if (full <= maxWidth) return text;
    const chars = Array.from(text);
    const cut = (n2) => chars.slice(0, n2).join("").trimEnd() + "\u2026";
    let n = Math.min(
      chars.length - 1,
      Math.floor(chars.length * maxWidth / full)
    );
    while (n > 0 && measure(cut(n)) > maxWidth) n--;
    while (n < chars.length - 1 && measure(cut(n + 1)) <= maxWidth) n++;
    return cut(n);
  }
  function wrapTitle(measure, text, maxWidth) {
    const lines = [];
    let line = "";
    const pushWord = (word) => {
      const joined = line ? line + " " + word : word;
      if (measure(joined) <= maxWidth) {
        line = joined;
        return;
      }
      if (line) lines.push(line);
      line = "";
      if (measure(word) <= maxWidth) {
        line = word;
        return;
      }
      for (const ch of word) {
        if (line && measure(line + ch) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    };
    for (const word of text.split(/\s+/)) if (word) pushWord(word);
    if (line) lines.push(line);
    return lines;
  }
  var MAX_ROWS = 4;
  function revealZooms(boxes, floor, height, maxZoom = Infinity) {
    const n = boxes.length, out = {
      zoom: new Float64Array(n).fill(-Infinity),
      row: new Uint8Array(n),
      unresolved: 0
    }, floorScale = 2 ** floor, fullScale = 2 ** maxZoom, maxScale = fullScale / 2;
    if (!n) return out;
    const rank = new Int32Array(n);
    Array.from({ length: n }, (_, i) => i).sort((a, b) => boxes[b].priority - boxes[a].priority).forEach((i, r) => rank[i] = r);
    let maxW = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      if (b.width > maxW) maxW = b.width;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x > maxX) maxX = b.x;
      if (b.y > maxY) maxY = b.y;
    }
    const cellW = maxW / floorScale / 2, cellH = height / floorScale / 2, ncx = Math.floor((maxX - minX) / cellW) + 1, ncy = Math.floor((maxY - minY) / cellH) + 1, grid0 = new Array(ncx * ncy), gridS = new Array(ncx * ncy), cxOf = (i) => Math.floor((boxes[i].x - minX) / cellW), cyOf = (i) => Math.floor((boxes[i].y - minY) / cellH);
    const raise = (i, j, dr, m) => {
      const b = boxes[i], o = boxes[j], wx = (b.width + o.width) / 2, adx = Math.abs(b.x - o.x);
      if (wx <= m * adx) return m;
      const dy = b.y - o.y;
      let sy;
      if (dy === 0) sy = dr === 0 ? Infinity : 0;
      else {
        const ady = Math.abs(dy), k = dy > 0 ? -dr : dr, hiNum = height * (1 + k), loNum = height * (k - 1);
        sy = hiNum <= floorScale * ady || loNum >= fullScale * ady || hiNum <= m * ady ? 0 : hiNum / ady;
      }
      if (sy <= m) return m;
      return Math.min(wx / adx, sy);
    };
    const stamp = new Int32Array(n);
    let admitted = 0;
    const need = (i, r, seen, m) => {
      const cx = cxOf(i), cy = cyOf(i), rx = Math.ceil(2 * floorScale / m), x0 = Math.max(0, cx - rx), x1 = Math.min(ncx - 1, cx + rx), ry = Math.ceil(2 * (1 + r) * floorScale / m), y0 = Math.max(0, r === 0 ? cy - ry : cy), y1 = Math.min(ncy - 1, cy + ry), ryS = Math.ceil(2 * (1 + MAX_ROWS) * floorScale / m), yS0 = Math.max(0, cy - ryS), yS1 = Math.min(ncy - 1, cy + ryS);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const cell = grid0[x * ncy + y];
          if (!cell) continue;
          for (let t = cell.length - 1; t >= 0 && stamp[cell[t]] >= seen; t--)
            m = raise(i, cell[t], r, m);
        }
        for (let y = yS0; y <= yS1; y++) {
          const cell = gridS[x * ncy + y];
          if (!cell) continue;
          for (let t = cell.length - 1; t >= 0 && stamp[cell[t]] >= seen; t--)
            m = raise(i, cell[t], r - out.row[cell[t]], m);
        }
      }
      return m;
    };
    const chooseRow = (i, from, row, m) => {
      for (let r = from; r <= MAX_ROWS; r++)
        if (need(i, r, 0, maxScale) <= maxScale)
          return [r, need(i, r, 0, floorScale)];
      for (let r = from; r <= MAX_ROWS; r++) {
        const mr = need(i, r, 0, floorScale);
        if (mr < m) [row, m] = [r, mr];
      }
      return [row, m];
    };
    const admit = (i, r, scale) => {
      if (scale > floorScale) out.zoom[i] = Math.log2(scale);
      out.row[i] = r;
      if (scale > maxScale || scale === Infinity) out.unresolved++;
      if (scale === Infinity) return;
      stamp[i] = admitted++;
      const grid = r === 0 ? grid0 : gridS, k = cxOf(i) * ncy + cyOf(i), cell = grid[k];
      if (cell) cell.push(i);
      else grid[k] = [i];
    };
    const hz = [], hi = [], hr = [], hs = [];
    const before = (a, b) => hz[a] < hz[b] || hz[a] === hz[b] && rank[hi[a]] < rank[hi[b]];
    const swap = (a, b) => {
      [hz[a], hz[b]] = [hz[b], hz[a]];
      [hi[a], hi[b]] = [hi[b], hi[a]];
      [hr[a], hr[b]] = [hr[b], hr[a]];
      [hs[a], hs[b]] = [hs[b], hs[a]];
    };
    const push = (i, r, z) => {
      hz.push(z);
      hi.push(i);
      hr.push(r);
      hs.push(admitted);
      for (let c = hz.length - 1; c > 0; ) {
        const p = c - 1 >> 1;
        if (!before(c, p)) break;
        swap(c, p);
        c = p;
      }
    };
    const pop = () => {
      const top = [hz[0], hi[0], hr[0], hs[0]];
      const z = hz.pop(), i = hi.pop(), r = hr.pop(), seen = hs.pop();
      if (hz.length) {
        hz[0] = z;
        hi[0] = i;
        hr[0] = r;
        hs[0] = seen;
        for (let c = 0; ; ) {
          const l = 2 * c + 1, rr = l + 1;
          let m = c;
          if (l < hz.length && before(l, m)) m = l;
          if (rr < hz.length && before(rr, m)) m = rr;
          if (m === c) break;
          swap(c, m);
          c = m;
        }
      }
      return top;
    };
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => rank[a] - rank[b]
    );
    for (const i of order) {
      let r = 0, m = need(i, 0, 0, floorScale);
      if (m > maxScale) [r, m] = chooseRow(i, 1, 0, m);
      if (m <= floorScale) admit(i, r, floorScale);
      else push(i, r, m);
    }
    while (hz.length) {
      let [z, i, r, seen] = pop();
      const m = need(i, r, seen, z);
      if (m <= z) {
        admit(i, r, z);
        continue;
      }
      if (m > maxScale && r < MAX_ROWS) [r, z] = chooseRow(i, r + 1, r, m);
      else z = m;
      push(i, r, z);
    }
    return out;
  }
  function clampRegionLabel(x, y, w, h, width, height) {
    return [
      Math.min(Math.max(x, w / 2 + 16), width - w / 2 - 16),
      Math.min(Math.max(y, 55 + h / 2), height - 75 - h / 2)
    ];
  }
  function placeRegionLabels(items, viewport, size, radii, alive, relativeZoom) {
    const boxes = [];
    const out = /* @__PURE__ */ new Map();
    if (relativeZoom >= PAPER_LABEL_ZOOM + 0.5) return out;
    const [cx, cy] = viewport.unproject([size.width / 2, size.height / 2]);
    for (const n of [...items].sort((a, b) => b.size - a.size)) {
      if (!alive.has(n.id)) continue;
      let [x, y] = viewport.project([n.x, n.y, 0]);
      const w = Math.min(205, n.label.length * 10), h = Math.ceil(n.label.length / 20) * 23;
      const inside = x > w / 2 && x < size.width - w / 2 && y > 55 + h / 2 && y < size.height - 75 - h / 2;
      const covering = Math.hypot(cx - n.x, cy - n.y) <= (radii.get(n.id) ?? 0);
      if (!inside && !covering) continue;
      if (!inside) [x, y] = clampRegionLabel(x, y, w, h, size.width, size.height);
      if (boxes.some(
        (b) => Math.abs(x - b.x) < (w + b.w) / 2 + 12 && Math.abs(y - b.y) < (h + b.h) / 2 + 10
      ))
        continue;
      boxes.push({ x, y, w, h });
      out.set(n.id, [x, y]);
    }
    return out;
  }

  // frontend/src/views/map/regions.ts
  var spectrum = [
    [96, 214, 96],
    [232, 196, 88],
    [126, 178, 214],
    [236, 142, 46],
    [230, 72, 62],
    [178, 150, 255]
  ];
  var ordinal = [
    [96, 214, 96],
    [232, 196, 88],
    [126, 178, 214],
    [236, 142, 46],
    [230, 72, 62]
  ];
  function ordinalColor(v) {
    const t = Math.min(1, Math.max(0, v)) * (ordinal.length - 1), k = Math.min(ordinal.length - 2, Math.floor(t)), f = t - k;
    return ordinal[k].map(
      (c, i) => Math.round(c + (ordinal[k + 1][i] - c) * f)
    );
  }
  function clusterColor(id) {
    return id < 0 ? [130, 131, 142] : spectrum[id % spectrum.length];
  }
  function regionBlobs(map, clusters) {
    return clusters.map((c) => {
      let sum = 0, n = 0;
      for (let i = 0; i < map.n; i++)
        if (map.cluster[i] === c.cluster_id) {
          sum += (map.x[i] - c.x) ** 2 + (map.y[i] - c.y) ** 2;
          n++;
        }
      return {
        id: c.cluster_id,
        position: [c.x, c.y],
        radius: Math.max(0.6, Math.sqrt(sum / Math.max(1, n)) * 1.7),
        color: clusterColor(c.cluster_id)
      };
    });
  }

  // frontend/src/views/map/edges.ts
  function citationIndex(n, citing, cited) {
    const e = citing.length;
    if (cited.length !== e) return null;
    const degree = new Uint32Array(n + 1);
    for (let k = 0; k < e; k++) {
      const a = citing[k], b = cited[k];
      if (!(a >= 0 && a < n && b >= 0 && b < n) || a === b) return null;
      degree[a + 1]++;
      degree[b + 1]++;
    }
    const offsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i + 1];
    const neighbors = new Uint32Array(offsets[n]), incoming = new Uint8Array(offsets[n]), fill = new Uint32Array(n);
    for (let k = 0; k < e; k++) {
      const a = citing[k], b = cited[k];
      const ka = offsets[a] + fill[a]++, kb = offsets[b] + fill[b]++;
      neighbors[ka] = b;
      neighbors[kb] = a;
      incoming[kb] = 1;
    }
    return { offsets, neighbors, incoming };
  }
  function degreeOf(index, i) {
    return index.offsets[i + 1] - index.offsets[i];
  }
  function linksOf(index, i) {
    const out = [];
    for (let k = index.offsets[i]; k < index.offsets[i + 1]; k++)
      out.push({ j: index.neighbors[k], incoming: index.incoming[k] === 1 });
    return out;
  }
  var DOT_SCALE_MAX = 3;
  var DOT_SCALE_ZOOM = 5;
  function dotScale(relativeZoom) {
    const t = Math.min(1, Math.max(0, relativeZoom / DOT_SCALE_ZOOM));
    return 1 + (DOT_SCALE_MAX - 1) * t;
  }
  function localGraph(index, i, hops = 2) {
    const depth = /* @__PURE__ */ new Map([[i, 0]]);
    let frontier = [i];
    for (let d = 1; d <= hops; d++) {
      const next = [];
      for (const u of frontier)
        for (let k = index.offsets[u]; k < index.offsets[u + 1]; k++) {
          const v = index.neighbors[k];
          if (!depth.has(v)) {
            depth.set(v, d);
            next.push(v);
          }
        }
      frontier = next;
    }
    const nodes = [...depth.keys()];
    const links = [];
    for (const u of nodes)
      for (let k = index.offsets[u]; k < index.offsets[u + 1]; k++) {
        const v = index.neighbors[k];
        if (index.incoming[k] === 1 || !depth.has(v)) continue;
        links.push({ a: u, b: v, seed: u === i || v === i });
      }
    return { nodes, links };
  }

  // frontend/src/views/map/style.ts
  var LABEL_FADE_MS = 240;
  var DOT_RADIUS_MAX = 7;
  var HALO_GAP = 5;
  var HALO_MIN = 10;
  var SHOW_REGION_BLOBS = true;
  var DOT_RADIUS = 1.5;
  var DOT_RADIUS_TOP = 3;
  var TOP_CITED_QUANTILE = 0.98;
  var LINK_OUT = [57, 135, 229];
  var LINK_IN = [230, 103, 103];
  var LINK_WIDTH = 2;
  var HOVER_DIM = 0.5;
  var LINK_FAR = [147, 163, 180, 110];
  var LINK_FAR_WIDTH = 1;
  var LINK_SPEED = 1200;
  var LINK_FADE_PX = LINK_SPEED * LABEL_FADE_MS / 1e3;
  var TITLE_FONT_SIZE = 10;
  var TITLE_TRACKING = 0.8;
  var TITLE_MAX_WIDTH = 240;
  var TITLE_PADDING = 8;
  var TITLE_GAP_X = 8;
  var TITLE_HEIGHT = 16;
  var TITLE_OFFSET_X = DOT_RADIUS_MAX + 6;
  var VALUE_GAP = 5;
  var TITLE_MARGIN_X = TITLE_OFFSET_X + TITLE_MAX_WIDTH + 60;
  var TITLE_MARGIN_Y = TITLE_HEIGHT * (MAX_ROWS + 1);
  var TITLE_TILE = 240;
  var TITLE_ZOOM_STEP = 0.5;
  var ZOOM_RANGE = 8;
  function titleTypography() {
    const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    const fallback = {
      fontFamily: "monospace",
      color: [232, 232, 236],
      measureChar: () => 6 + TITLE_TRACKING
    };
    if (!ctx) return fallback;
    const style = getComputedStyle(document.body);
    const mono = style.getPropertyValue("--font-mono").trim() || "monospace";
    const rgb = (css, or) => {
      ctx.fillStyle = css;
      const hex = ctx.fillStyle;
      return /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : or;
    };
    ctx.font = `${TITLE_FONT_SIZE}px ${mono}`;
    return {
      fontFamily: mono,
      color: rgb(style.color, fallback.color),
      measureChar: (char) => ctx.measureText(char).width + TITLE_TRACKING
    };
  }
  function titleFontRenderer(fontFamily, dpr) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const style = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${TITLE_FONT_SIZE}px ${fontFamily}`;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.textRendering = "geometricPrecision";
      ctx.fillStyle = "#fff";
    };
    style();
    const measure = (char) => {
      const m = ctx.measureText(char ?? "A");
      return char === void 0 ? {
        advance: 0,
        width: 0,
        ascent: Math.ceil(m.fontBoundingBoxAscent * dpr),
        descent: Math.ceil(m.fontBoundingBoxDescent * dpr)
      } : {
        advance: (m.width + TITLE_TRACKING) * dpr,
        width: Math.ceil(
          (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * dpr
        ),
        ascent: Math.ceil(m.actualBoundingBoxAscent * dpr),
        descent: Math.ceil(m.actualBoundingBoxDescent * dpr)
      };
    };
    return {
      measure,
      draw(char) {
        const g = measure(char), left = ctx.measureText(char).actualBoundingBoxLeft, pad = Math.ceil(dpr);
        canvas.width = g.width + pad * 2;
        canvas.height = g.ascent + g.descent + pad * 2;
        style();
        ctx.fillText(char, pad / dpr + left, (pad + g.ascent) / dpr);
        return {
          data: ctx.getImageData(0, 0, canvas.width, canvas.height),
          left: pad,
          top: pad
        };
      }
    };
  }

  // frontend/src/views/map/titles.ts
  function titleCharacterSet(map) {
    return [...new Set(map.title.join("").toUpperCase() + "0123456789\u2026")].join(
      ""
    );
  }
  function titleMeasure(characterSet, typo) {
    const table = /* @__PURE__ */ new Map();
    for (const ch of characterSet) table.set(ch, typo.measureChar(ch));
    const missing = typo.measureChar("M");
    return (text) => {
      let w = 0;
      for (const ch of text) w += table.get(ch) ?? missing;
      return w;
    };
  }
  function titleMetrics(map, measure) {
    const displays = map.title.map(
      (t) => truncateTitle(measure, t.toUpperCase(), TITLE_MAX_WIDTH - TITLE_PADDING)
    );
    const values = map.year.map((y) => y === null ? "" : String(y));
    const valueDx = displays.map((d) => TITLE_OFFSET_X + measure(d) + VALUE_GAP);
    const widths = displays.map(
      (_, i) => 2 * (valueDx[i] + measure(values[i]) + TITLE_PADDING / 2) + TITLE_GAP_X
    );
    return { displays, values, valueDx, widths };
  }
  return __toCommonJS(app_map_entry_exports);
})();
