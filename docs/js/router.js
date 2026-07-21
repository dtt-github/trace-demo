/** TRACE A* router — browser port of router.py / demo2.py (deterministic, zero ML). */
export const RES = 25;
export const MOVES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const BEND_PENALTY = 8;
export const STUB = 3;

function vec3(o) { return [o.x, o.y, o.z]; }

function buildGrid(pcg, clearanceMm) {
  const env = pcg.zones.find(z => z.kind === "skid_envelope") || pcg.zones[0];
  const lo = vec3(env.bbox_min);
  const hi = vec3(env.bbox_max);
  const shape = hi.map((v, i) => Math.floor((v - lo[i]) / RES) + 1);
  const occ = new Uint8Array(shape[0] * shape[1] * shape[2]);
  const idx = (x, y, z) => x + shape[0] * (y + shape[1] * z);
  const setBox = (mn, mx) => {
    const a = mn.map((v, i) => Math.max(0, Math.floor((v - clearanceMm - lo[i]) / RES)));
    const b = mx.map((v, i) => Math.min(shape[i] - 1, Math.floor((v + clearanceMm - lo[i]) / RES)));
    for (let x = a[0]; x <= b[0]; x++)
      for (let y = a[1]; y <= b[1]; y++)
        for (let z = a[2]; z <= b[2]; z++)
          occ[idx(x, y, z)] = 1;
  };
  for (const c of pcg.components) setBox(vec3(c.bbox_min), vec3(c.bbox_max));
  return { occ, lo, shape, idx };
}

function toCell(p, lo) {
  return p.map((v, i) => Math.round((v - lo[i]) / RES));
}

function toMm(c, lo) {
  return c.map((v, i) => v * RES + lo[i]);
}

function h(c, goal) {
  return c.reduce((s, v, i) => s + Math.abs(v - goal[i]), 0);
}

function keyCell(c, d) {
  return `${c.join(",")}|${d.join(",")}`;
}

function astar(occ, lo, shape, idx, pcg, spec) {
  const pa = pcg.ports.find(p => p.id === spec.from_port);
  const pb = pcg.ports.find(p => p.id === spec.to_port);
  const na = vec3(pa.normal).map(v => Math.round(v));
  const nb = vec3(pb.normal).map(v => Math.round(v));
  const a0 = toCell(vec3(pa.position), lo);
  const b0 = toCell(vec3(pb.position), lo);
  const start = a0.map((v, i) => v + na[i] * STUB);
  const goal = b0.map((v, i) => v + nb[i] * STUB);

  for (const [base, n] of [[a0, na], [b0, nb]]) {
    for (let i = 0; i <= STUB; i++) {
      const c = base.map((v, j) => v + n[j] * i);
      if (c.every((v, j) => v >= 0 && v < shape[j]))
        occ[idx(c[0], c[1], c[2])] = 0;
    }
  }

  const openq = [[h(start, goal), 0, start, na]];
  const best = new Map();
  best.set(keyCell(start, na), 0);
  const parent = new Map();

  while (openq.length) {
    openq.sort((a, b) => a[0] - b[0]);
    const [, g, cur, d] = openq.shift();
    const negNb = nb.map(v => -v);
    if (cur.every((v, i) => v === goal[i]) && d.every((v, i) => v === negNb[i])) {
      const cells = [cur];
      let k = keyCell(cur, d);
      while (parent.has(k)) {
        const p = parent.get(k);
        k = keyCell(p.cur, p.d);
        cells.push(p.cur);
      }
      cells.reverse();
      return [a0, ...cells, b0];
    }
    for (const m of MOVES) {
      const nxt = cur.map((v, i) => v + m[i]);
      if (nxt.some((v, i) => v < 0 || v >= shape[i])) continue;
      if (occ[idx(nxt[0], nxt[1], nxt[2])]) continue;
      const ng = g + 1 + (m.every((v, i) => v === d[i]) ? 0 : BEND_PENALTY);
      const k = keyCell(nxt, m);
      if (ng < (best.get(k) ?? 1e18)) {
        best.set(k, ng);
        parent.set(k, { cur, d });
        openq.push([ng + h(nxt, goal), ng, nxt, m]);
      }
    }
  }
  throw new Error(`no route for ${spec.id}`);
}

export function simplify(cells, lo) {
  const pts = cells.map(c => toMm(c, lo));
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const d1 = pts[i].map((v, j) => v - out[out.length - 1][j]);
    const d2 = pts[i + 1].map((v, j) => v - pts[i][j]);
    const cross = [
      d1[1] * d2[2] - d1[2] * d2[1],
      d1[2] * d2[0] - d1[0] * d2[2],
      d1[0] * d2[1] - d1[1] * d2[0],
    ];
    if (Math.hypot(...cross) > 1e-6) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function routeOne(pcg, spec) {
  const { occ, lo, shape, idx } = buildGrid(pcg, spec.clearance_mm);
  const cells = astar(occ, lo, shape, idx, pcg, spec);
  const wps = simplify(cells, lo);
  let length = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const dx = wps[i + 1].map((v, j) => v - wps[i][j]);
    length += Math.hypot(...dx);
  }
  return { waypoints: wps, length_mm: length, bends: wps.length - 2, dn: spec.dn_mm };
}

function markTube(occ, lo, shape, idx, cells, tubeClearMm) {
  const r = Math.ceil(tubeClearMm / RES);
  for (const c of cells) {
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const x = c[0] + dx, y = c[1] + dy, z = c[2] + dz;
          if (x >= 0 && y >= 0 && z >= 0 && x < shape[0] && y < shape[1] && z < shape[2])
            occ[idx(x, y, z)] = 1;
        }
  }
}

export function routeAll(pcg, tubeTubeClearMm = 40) {
  const results = {};
  const routedCells = [];
  for (const spec of pcg.tube_runs) {
    const { occ, lo, shape, idx } = buildGrid(pcg, spec.clearance_mm);
    for (const cells of routedCells)
      markTube(occ, lo, shape, idx, cells, tubeTubeClearMm);
    const cells = astar(occ, lo, shape, idx, pcg, spec);
    routedCells.push(cells);
    const wps = simplify(cells, lo);
    let length = 0;
    for (let i = 0; i < wps.length - 1; i++) {
      const dx = wps[i + 1].map((v, j) => v - wps[i][j]);
      length += Math.hypot(...dx);
    }
    results[spec.id] = {
      waypoints: wps,
      length_mm: length,
      bends: wps.length - 2,
      dn: spec.dn_mm,
      bend_r: spec.min_bend_radius_mm,
    };
  }
  return results;
}
