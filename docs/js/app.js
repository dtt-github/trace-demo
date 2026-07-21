import { routeOne, routeAll } from "./router.js";
import { TraceViewer } from "./viewer.js";

const BASE = document.querySelector("meta[name=base-path]")?.content || "";

async function loadJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function fmtMm(n) {
  return `${Math.round(n)}`;
}

function setKpi(container, values) {
  const nodes = container.querySelectorAll(".kpi");
  values.forEach((v, i) => {
    const el = nodes[i]?.querySelector(".kpi-value");
    if (el) {
      el.textContent = v;
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  });
}

function renderMetricsTable(container, routes) {
  let html = `<table><thead><tr><th>Run</th><th>DN</th><th>Len</th><th>Bends</th></tr></thead><tbody>`;
  let totL = 0;
  let totB = 0;
  for (const [id, r] of Object.entries(routes)) {
    html += `<tr><td>${id}</td><td>${r.dn}</td><td>${fmtMm(r.length_mm)}</td><td>${r.bends}</td></tr>`;
    totL += r.length_mm;
    totB += r.bends;
  }
  html += `<tr><td>Total</td><td></td><td>${fmtMm(totL)}</td><td>${totB}</td></tr></tbody></table>`;
  container.innerHTML = html;
  return { totL, totB };
}

function log(el, msg) {
  el.textContent = (el.textContent ? `${el.textContent}\n` : "") + msg;
  el.scrollTop = el.scrollHeight;
}

let pcgV1;
let pcgV2;
let viewerV1;
let viewerV2;

async function initV1() {
  const logEl = document.getElementById("log-v1");
  const metricsEl = document.getElementById("metrics-v1");
  const kpiEl = document.getElementById("kpi-v1");
  pcgV1 = await loadJson("assets/pcg.json");
  viewerV1 = new TraceViewer(document.getElementById("viewer-v1"));

  async function run() {
    logEl.textContent = "";
    const btn = document.getElementById("run-v1");
    btn.disabled = true;
    btn.textContent = "Routing…";
    try {
      // Show empty skid first so the re-run is obvious
      viewerV1.drawScene(pcgV1);
      setKpi(kpiEl, ["…", "…", "50", "…"]);

      const t0 = performance.now();
      const spec = pcgV1.tube_runs[0];
      const result = routeOne(pcgV1, spec);
      const ms = Math.round(performance.now() - t0);
      const routes = { [spec.id]: result };

      await viewerV1.playRoutes(pcgV1, routes, { stepMs: 110 });

      renderMetricsTable(metricsEl, routes);
      setKpi(kpiEl, [
        `${fmtMm(result.length_mm)} mm`,
        String(result.bends),
        String(result.dn),
        `${ms} ms`,
      ]);
      log(logEl, `A* solved ${spec.id} in the browser`);
      log(logEl, `${result.waypoints.length} waypoints · ${result.bends} bends · ${fmtMm(result.length_mm)} mm`);
      log(logEl, `compute time ${ms} ms · same input → same path (deterministic)`);
      for (const w of result.waypoints) {
        log(logEl, `  (${w.map((v) => Math.round(v)).join(", ")})`);
      }
    } catch (e) {
      log(logEl, `ERROR: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Re-run routing";
    }
  }

  document.getElementById("run-v1").addEventListener("click", run);
  document.getElementById("fit-v1").addEventListener("click", () => viewerV1?.refit());
  await run();
}

async function initV2() {
  const logEl = document.getElementById("log-v2");
  const metricsEl = document.getElementById("metrics-v2");
  const kpiEl = document.getElementById("kpi-v2");
  pcgV2 = await loadJson("assets/pcg_v2.json");
  viewerV2 = new TraceViewer(document.getElementById("viewer-v2"));

  async function run() {
    logEl.textContent = "";
    const btn = document.getElementById("run-v2");
    btn.disabled = true;
    btn.textContent = "Routing…";
    try {
      viewerV2.drawScene(pcgV2);
      setKpi(kpiEl, ["…", "…", "5", "…"]);

      const t0 = performance.now();
      const routes = routeAll(pcgV2);
      const ms = Math.round(performance.now() - t0);

      await viewerV2.playRoutes(pcgV2, routes, { stepMs: 70 });

      const { totL, totB } = renderMetricsTable(metricsEl, routes);
      setKpi(kpiEl, [
        `${fmtMm(totL)} mm`,
        String(totB),
        String(Object.keys(routes).length),
        `${ms} ms`,
      ]);
      log(logEl, `A* solved 5 runs sequentially in the browser (${ms} ms)`);
      log(logEl, `each finished tube becomes an obstacle for the next`);
      for (const [id, r] of Object.entries(routes)) {
        log(logEl, `${id}  DN${r.dn}  ${fmtMm(r.length_mm)} mm  ${r.bends} bends`);
      }
    } catch (e) {
      log(logEl, `ERROR: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Re-run all routes";
    }
  }

  document.getElementById("run-v2").addEventListener("click", run);
  document.getElementById("fit-v2").addEventListener("click", () => viewerV2?.refit());
  await run();
}

function initTabs() {
  const tabs = document.querySelectorAll(".segment-btn");
  const panels = document.querySelectorAll(".stage");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach((p) => {
        p.classList.remove("active");
        p.hidden = true;
      });

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const panel = document.getElementById(tab.dataset.panel);
      panel.classList.add("active");
      panel.hidden = false;

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
