import { routeOne, routeAll } from "./router.js";
import { TraceViewer } from "./viewer.js";

const BASE = document.querySelector("meta[name=base-path]")?.content || "";

async function loadJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function fmtMm(n) { return `${Math.round(n)} mm`; }

function renderMetricsTable(container, routes) {
  let html = `<table><thead><tr><th>Run</th><th>DN</th><th>Length</th><th>Bends</th></tr></thead><tbody>`;
  let totL = 0, totB = 0;
  for (const [id, r] of Object.entries(routes)) {
    html += `<tr><td>${id}</td><td>${r.dn}</td><td>${fmtMm(r.length_mm)}</td><td>${r.bends}</td></tr>`;
    totL += r.length_mm; totB += r.bends;
  }
  html += `<tr><td>TOTAL</td><td></td><td>${fmtMm(totL)}</td><td>${totB}</td></tr></tbody></table>`;
  container.innerHTML = html;
}

function log(el, msg) {
  el.textContent = (el.textContent ? el.textContent + "\n" : "") + msg;
  el.scrollTop = el.scrollHeight;
}

let pcgV1, pcgV2, viewerV1, viewerV2;

async function initV1() {
  const logEl = document.getElementById("log-v1");
  const metricsEl = document.getElementById("metrics-v1");
  pcgV1 = await loadJson("assets/pcg.json");
  viewerV1 = new TraceViewer(document.getElementById("viewer-v1"));

  async function run() {
    logEl.textContent = "";
    const btn = document.getElementById("run-v1");
    btn.disabled = true;
    try {
      const t0 = performance.now();
      const spec = pcgV1.tube_runs[0];
      const result = routeOne(pcgV1, spec);
      const ms = (performance.now() - t0).toFixed(1);
      const routes = { [spec.id]: result };
      viewerV1.showPcg(pcgV1, routes);
      renderMetricsTable(metricsEl, routes);
      log(logEl, `routed ${spec.id}: ${result.waypoints.length} waypoints, ${result.bends} bends, ${fmtMm(result.length_mm)}`);
      log(logEl, `computed in ${ms} ms (browser A*, deterministic)`);
      for (const w of result.waypoints)
        log(logEl, `  (${w.map(v => Math.round(v)).join(", ")})`);
    } catch (e) {
      log(logEl, `ERROR: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById("run-v1").addEventListener("click", run);
  run();
}

async function initV2() {
  const logEl = document.getElementById("log-v2");
  const metricsEl = document.getElementById("metrics-v2");
  pcgV2 = await loadJson("assets/pcg_v2.json");
  viewerV2 = new TraceViewer(document.getElementById("viewer-v2"));

  async function run() {
    logEl.textContent = "";
    const btn = document.getElementById("run-v2");
    btn.disabled = true;
    try {
      const t0 = performance.now();
      const routes = routeAll(pcgV2);
      const ms = (performance.now() - t0).toFixed(1);
      viewerV2.showPcg(pcgV2, routes);
      renderMetricsTable(metricsEl, routes);
      log(logEl, `5 tube runs routed sequentially (${ms} ms)`);
      for (const [id, r] of Object.entries(routes))
        log(logEl, `${id} DN${r.dn} ${fmtMm(r.length_mm)} ${r.bends} bends`);
    } catch (e) {
      log(logEl, `ERROR: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById("run-v2").addEventListener("click", run);
  run();
}

function initTabs() {
  const tabs = document.querySelectorAll(".nav-item");
  const panels = document.querySelectorAll(".panel");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.panel).classList.add("active");
      requestAnimationFrame(() => {
        if (tab.dataset.panel === "panel-v1") viewerV1?.resize();
        if (tab.dataset.panel === "panel-v2") viewerV2?.resize();
      });
    });
  });
}

initTabs();
initV1();
initV2();
