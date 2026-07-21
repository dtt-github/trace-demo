"""TRACE demo v2 — representative compressor package, multi-tube routing.

8 assets, 5 tube runs (DN80 suction, DN50 process x3, DN25 drain), routed
sequentially: each routed tube is inflated and becomes an obstacle for the
next (tube-vs-tube clearance 40 mm). Still zero ML.
"""
from __future__ import annotations
import numpy as np, heapq, json, pathlib
from schemas import PCG, Component, Port, TubeRunSpec, Vec3, Zone, Provenance

RES = 25.0
MOVES = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
BEND_PENALTY = 8.0
STUB = 3

P = lambda s: [Provenance(source=s)]

def demo_package() -> PCG:
    comps = [
        Component(id="F1", cls="vessel",      bbox_min=Vec3(x=100,  y=800, z=0),   bbox_max=Vec3(x=300,  y=1000, z=500), provenance=P("step:pkg:F1")),
        Component(id="C1", cls="compressor",  bbox_min=Vec3(x=400,  y=300, z=0),   bbox_max=Vec3(x=1100, y=900,  z=700), provenance=P("step:pkg:C1")),
        Component(id="M1", cls="vessel",      bbox_min=Vec3(x=1150, y=550, z=0),   bbox_max=Vec3(x=1500, y=900,  z=600), provenance=P("step:pkg:M1")),
        Component(id="A1", cls="aftercooler", bbox_min=Vec3(x=1600, y=700, z=0),   bbox_max=Vec3(x=2100, y=1000, z=500), provenance=P("step:pkg:A1")),
        Component(id="V1", cls="vessel",      bbox_min=Vec3(x=1700, y=150, z=0),   bbox_max=Vec3(x=1950, y=450,  z=900), provenance=P("step:pkg:V1")),
        Component(id="R1", cls="vessel",      bbox_min=Vec3(x=300,  y=100, z=0),   bbox_max=Vec3(x=700,  y=450,  z=1000),provenance=P("step:pkg:R1")),
        Component(id="DH", cls="vessel",      bbox_min=Vec3(x=2300, y=60,  z=0),   bbox_max=Vec3(x=2400, y=140,  z=200), provenance=P("step:pkg:DH")),
        Component(id="CT", cls="frame",       bbox_min=Vec3(x=0,    y=560, z=950), bbox_max=Vec3(x=2400, y=640,  z=1050),provenance=P("step:pkg:cable-tray")),
    ]
    ports = [
        Port(id="F1.OUT",  parent="F1", dn_mm=80, position=Vec3(x=200,  y=900, z=500), normal=Vec3(x=0,  y=0,  z=1), provenance=P("drawing:PID-01:(102,64)")),
        Port(id="C1.IN",   parent="C1", dn_mm=80, position=Vec3(x=550,  y=800, z=700), normal=Vec3(x=0,  y=0,  z=1), provenance=P("drawing:PID-01:(141,63)")),
        Port(id="C1.N2",   parent="C1", dn_mm=50, position=Vec3(x=1100, y=600, z=650), normal=Vec3(x=1,  y=0,  z=0), provenance=P("drawing:PID-01:(198,71)")),
        Port(id="A1.IN",   parent="A1", dn_mm=50, position=Vec3(x=1700, y=850, z=500), normal=Vec3(x=0,  y=0,  z=1), provenance=P("drawing:PID-01:(244,58)")),
        Port(id="A1.OUT",  parent="A1", dn_mm=50, position=Vec3(x=1850, y=700, z=100), normal=Vec3(x=0,  y=-1, z=0), provenance=P("drawing:PID-01:(251,90)")),
        Port(id="V1.IN",   parent="V1", dn_mm=50, position=Vec3(x=1825, y=450, z=700), normal=Vec3(x=0,  y=1,  z=0), provenance=P("drawing:PID-01:(255,118)")),
        Port(id="V1.OUT",  parent="V1", dn_mm=50, position=Vec3(x=1825, y=300, z=900), normal=Vec3(x=0,  y=0,  z=1), provenance=P("drawing:PID-01:(255,131)")),
        Port(id="R1.IN",   parent="R1", dn_mm=50, position=Vec3(x=700,  y=275, z=800), normal=Vec3(x=1,  y=0,  z=0), provenance=P("drawing:PID-01:(88,140)")),
        Port(id="V1.DRAIN",parent="V1", dn_mm=25, position=Vec3(x=1825, y=150, z=100), normal=Vec3(x=0,  y=-1, z=0), provenance=P("drawing:PID-01:(255,150)")),
        Port(id="DH.IN",   parent="DH", dn_mm=25, position=Vec3(x=2300, y=100, z=100), normal=Vec3(x=-1, y=0,  z=0), provenance=P("drawing:PID-01:(310,152)")),
    ]
    runs = [
        TubeRunSpec(id="TR-01", from_port="F1.OUT",   to_port="C1.IN",  dn_mm=80, min_bend_radius_mm=120, clearance_mm=60, provenance=P("nl:req-1:'suction line filter to compressor'")),
        TubeRunSpec(id="TR-02", from_port="C1.N2",    to_port="A1.IN",  dn_mm=50, min_bend_radius_mm=75,  clearance_mm=60, provenance=P("nl:req-2:'discharge to aftercooler'")),
        TubeRunSpec(id="TR-03", from_port="A1.OUT",   to_port="V1.IN",  dn_mm=50, min_bend_radius_mm=75,  clearance_mm=60, provenance=P("nl:req-3:'cooler outlet to separator'")),
        TubeRunSpec(id="TR-04", from_port="V1.OUT",   to_port="R1.IN",  dn_mm=50, min_bend_radius_mm=75,  clearance_mm=60, provenance=P("nl:req-4:'separator to receiver'")),
        TubeRunSpec(id="TR-05", from_port="V1.DRAIN", to_port="DH.IN",  dn_mm=25, min_bend_radius_mm=40,  clearance_mm=50, provenance=P("nl:req-5:'condensate drain to header'")),
    ]
    env = Zone(id="SKID", kind="skid_envelope", bbox_min=Vec3(x=0, y=0, z=0), bbox_max=Vec3(x=2400, y=1200, z=1400))
    return PCG(components=comps, ports=ports, tube_runs=runs, zones=[env])


def base_grid(pcg: PCG, clearance_mm: float):
    env = pcg.zones[0]
    lo = np.array(env.bbox_min.tuple()); hi = np.array(env.bbox_max.tuple())
    shape = tuple(((hi - lo) / RES).astype(int) + 1)
    occ = np.zeros(shape, dtype=bool)
    for c in pcg.components:
        a = np.clip(((np.array(c.bbox_min.tuple()) - clearance_mm - lo) / RES).astype(int), 0, np.array(shape)-1)
        b = np.clip(((np.array(c.bbox_max.tuple()) + clearance_mm - lo) / RES).astype(int), 0, np.array(shape)-1)
        occ[a[0]:b[0]+1, a[1]:b[1]+1, a[2]:b[2]+1] = True
    return occ, lo


def mark_tube(occ, lo, cells, tube_clear_mm):
    r = int(np.ceil(tube_clear_mm / RES))
    for c in cells:
        a = np.clip(np.array(c) - r, 0, np.array(occ.shape) - 1)
        b = np.clip(np.array(c) + r, 0, np.array(occ.shape) - 1)
        occ[a[0]:b[0]+1, a[1]:b[1]+1, a[2]:b[2]+1] = True


def astar(occ, lo, pcg, spec):
    pa, pb = pcg.port(spec.from_port), pcg.port(spec.to_port)
    na = tuple(int(v) for v in pa.normal.tuple()); nb = tuple(int(v) for v in pb.normal.tuple())
    a0 = tuple(((np.array(pa.position.tuple()) - lo) / RES).round().astype(int))
    b0 = tuple(((np.array(pb.position.tuple()) - lo) / RES).round().astype(int))
    start = tuple(np.array(a0) + np.array(na) * STUB)
    goal  = tuple(np.array(b0) + np.array(nb) * STUB)
    for base, n in ((a0, na), (b0, nb)):
        for i in range(STUB + 1):
            occ[tuple(np.array(base) + np.array(n) * i)] = False
    h = lambda c: sum(abs(np.array(c) - np.array(goal)))
    openq = [(h(start), 0.0, start, na)]; best = {(start, na): 0.0}; parent = {}
    while openq:
        _, g, cur, d = heapq.heappop(openq)
        if cur == goal and d == tuple(-np.array(nb)):
            cells = [cur]; k = (cur, d)
            while k in parent:
                k = parent[k]; cells.append(k[0])
            cells.reverse()
            return [a0] + cells + [b0]
        for m in MOVES:
            nxt = tuple(np.array(cur) + np.array(m))
            if any(v < 0 for v in nxt) or any(nxt[i] >= occ.shape[i] for i in range(3)): continue
            if occ[nxt]: continue
            ng = g + 1 + (BEND_PENALTY if m != d else 0)
            if ng < best.get((nxt, m), 1e18):
                best[(nxt, m)] = ng; parent[(nxt, m)] = (cur, d)
                heapq.heappush(openq, (ng + h(nxt), ng, nxt, m))
    raise RuntimeError(f"no route for {spec.id}")


def simplify_mm(cells, lo):
    pts = [np.array(c, float) * RES + lo for c in cells]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        if np.linalg.norm(np.cross(pts[i] - out[-1], pts[i+1] - pts[i])) > 1e-6:
            out.append(pts[i])
    out.append(pts[-1])
    return [tuple(p) for p in out]


def route_all(pcg: PCG, tube_tube_clear_mm=40.0):
    results = {}
    # per-run grids share component obstacles; routed tubes accumulate
    routed_cells = []
    for spec in pcg.tube_runs:
        occ, lo = base_grid(pcg, spec.clearance_mm)
        for cells in routed_cells:
            mark_tube(occ, lo, cells, tube_tube_clear_mm)
        cells = astar(occ, lo, pcg, spec)
        routed_cells.append(cells)
        wps = simplify_mm(cells, lo)
        L = sum(np.linalg.norm(np.array(wps[i+1]) - np.array(wps[i])) for i in range(len(wps)-1))
        results[spec.id] = dict(waypoints=wps, length_mm=L, bends=len(wps)-2, dn=spec.dn_mm,
                                bend_r=spec.min_bend_radius_mm)
    return results


if __name__ == "__main__":
    pcg = demo_package()
    res = route_all(pcg)
    tot_L = sum(r["length_mm"] for r in res.values())
    tot_B = sum(r["bends"] for r in res.values())
    allpts = np.array([p for r in res.values() for p in r["waypoints"]])
    bb = allpts.max(axis=0) - allpts.min(axis=0)
    print(f"{'run':6s} {'DN':>4s} {'len mm':>8s} {'bends':>5s}")
    for k, r in res.items():
        print(f"{k:6s} {r['dn']:4.0f} {r['length_mm']:8.0f} {r['bends']:5d}")
    print(f"TOTAL piping {tot_L:.0f} mm, {tot_B} bends; routing envelope {bb[0]:.0f}x{bb[1]:.0f}x{bb[2]:.0f} mm")
    pathlib.Path("out").mkdir(exist_ok=True)
    pathlib.Path("out/pcg_v2.json").write_text(pcg.model_dump_json(indent=2))
    pathlib.Path("out/routes_v2.json").write_text(json.dumps(res, indent=2, default=list))
