# TRACE — deterministic routing core (teaser demo, zero ML)

Pipeline demonstrated: **PCG constraint graph → A* routing solver → parametric sweep → STEP**

- `schemas.py` — Piping Constraint Graph (Pydantic): components, ports (DN, standard,
  position, departure normal), tube-run specs (bend radius, clearance), zones, provenance.
- `router.py` — A* on a 25 mm voxel grid: orthogonal moves, obstacle inflation by the
  clearance requirement (60 mm), bend penalty, enforced straight stubs along port normals,
  arrival direction opposing the target port normal. Deterministic: same input, same route.
- `geometry.py` — waypoints → wire with bend fillets (R75) → swept DN50 tube (CadQuery/OCCT)
  → `out/TR-07_tube.step` + teaser render `out/trace_teaser.png`.

Run: `python3 router.py && python3 geometry.py`

## Web demo (GitHub Pages)

The browser demo in `docs/` runs the A* router live (v1 + v2) with a Three.js 3D viewer.
Pre-generated PNG renders and STEP files are included for download.

```bash
./scripts/build_web.sh          # regenerate assets into docs/assets/
cd docs && python3 -m http.server 8765   # local preview
```

Push to GitHub — the workflow in `.github/workflows/pages.yml` builds CAD outputs and deploys
`docs/` to GitHub Pages automatically. Enable Pages under repo Settings → Pages → Source: GitHub Actions.

This is the geometry layer LLM agents will *call* in TRACE — they compile documents into
the PCG; this solver constructs the pipe. No model can hallucinate a tube through a vessel.

## v2 — representative compressor package (demo2.py, render2.py)
8 assets (filter, compressor, motor, aftercooler, separator, receiver, drain header,
cable tray) and 5 tube runs (DN80 suction, 3x DN50 process, DN25 drain) routed
SEQUENTIALLY: each routed tube is inflated (40 mm tube-vs-tube clearance) and becomes
an obstacle for the next. Metrics printed per run + totals (length, bends, envelope) —
the seed of the KPI2 compactness objective. Outputs: `out/trace_teaser_v2.png`,
`out/package_piping_v2.step` (multi-tube STEP assembly), `out/pcg_v2.json`.
Note: representative geometry — actual SIAD assets are NDA-gated until the Advance phase.

## v3 — component-in-assembly synthesis (demo3.py)
The challenge's general-component case (Objective 3): housing with a machined opening
and an 8-bolt pattern -> pose registration from the hole pattern (rigid transform) ->
constraint-solved parameters (plate OD from bolt circle + edge margin, coverage vs.
seal land, thickness from DN table, nozzle length bounded by the maintenance-access
envelope) -> parametric CadQuery adapter flange -> deterministic compliance report
(HOLE-ALIGN / COVERAGE / ENVELOPE / PATTERN, each with measured evidence and PCG
provenance) -> STEP assembly. Outputs: `out/trace_teaser_v3_component.png`,
`out/component_in_assembly.step`. Zero ML; this is architecture node N5b.
