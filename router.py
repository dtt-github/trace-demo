"""TRACE demo — deterministic routing core.

A* on a voxel grid of the skid volume: orthogonal moves, obstacle clearance
by inflation, bend penalty, enforced departure/arrival stubs along port
normals. Output: waypoint polyline (mm) simplified to straight runs.
Zero ML anywhere in this file — that is the point.
"""
from __future__ import annotations
import heapq
import numpy as np
from schemas import PCG, Component, Port, TubeRunSpec, Vec3, Zone, Provenance

RES = 25.0  # mm per voxel

# ---------------------------------------------------------------- toy skid
def toy_skid() -> PCG:
    prov = lambda s: [Provenance(source=s)]
    comp = Component(
        id="C1", cls="compressor",
        bbox_min=Vec3(x=150, y=150, z=0), bbox_max=Vec3(x=750, y=650, z=600),
        provenance=prov("step:skid.step:C1"))
    cooler = Component(
        id="A1", cls="aftercooler",
        bbox_min=Vec3(x=1300, y=200, z=0), bbox_max=Vec3(x=1800, y=500, z=450),
        provenance=prov("step:skid.step:A1"))
    vessel = Component(
        id="V1", cls="vessel",
        bbox_min=Vec3(x=950, y=450, z=0), bbox_max=Vec3(x=1200, y=750, z=800),
        provenance=prov("step:skid.step:V1"))
    p_out = Port(id="C1.N2", parent="C1", dn_mm=50,
                 position=Vec3(x=750, y=400, z=500), normal=Vec3(x=1, y=0, z=0),
                 provenance=prov("drawing:P-1042:(412,318,441,335)"))
    p_in = Port(id="A1.IN", parent="A1", dn_mm=50,
                position=Vec3(x=1550, y=200, z=450), normal=Vec3(x=0, y=-1, z=0),
                provenance=prov("drawing:P-1042:(602,410,631,428)"))
    run = TubeRunSpec(id="TR-07", from_port="C1.N2", to_port="A1.IN",
                      dn_mm=50, min_bend_radius_mm=75, clearance_mm=60,
                      provenance=prov("nl:req-3:'route discharge line N2 to aftercooler inlet'"))
    env = Zone(id="SKID", kind="skid_envelope",
               bbox_min=Vec3(x=0, y=0, z=0), bbox_max=Vec3(x=2000, y=1000, z=1100))
    return PCG(components=[comp, cooler, vessel], ports=[p_out, p_in],
               tube_runs=[run], zones=[env])


# ---------------------------------------------------------------- occupancy
def build_grid(pcg: PCG, clearance_mm: float):
    env = next(z for z in pcg.zones if z.kind == "skid_envelope")
    lo = np.array(env.bbox_min.tuple()); hi = np.array(env.bbox_max.tuple())
    shape = tuple(((hi - lo) / RES).astype(int) + 1)
    occ = np.zeros(shape, dtype=bool)
    infl = clearance_mm
    for c in pcg.components:
        a = ((np.array(c.bbox_min.tuple()) - infl - lo) / RES).astype(int)
        b = ((np.array(c.bbox_max.tuple()) + infl - lo) / RES).astype(int)
        a = np.clip(a, 0, np.array(shape) - 1); b = np.clip(b, 0, np.array(shape) - 1)
        occ[a[0]:b[0] + 1, a[1]:b[1] + 1, a[2]:b[2] + 1] = True
    return occ, lo


def to_cell(p, lo):  return tuple(((np.array(p) - lo) / RES).round().astype(int))
def to_mm(c, lo):    return tuple(np.array(c) * RES + lo)

MOVES = [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
BEND_PENALTY = 8.0     # in voxel-lengths; discourages zig-zag
STUB = 3               # voxels of enforced straight departure/arrival


def route(pcg: PCG, spec: TubeRunSpec):
    occ, lo = build_grid(pcg, spec.clearance_mm)
    pa, pb = pcg.port(spec.from_port), pcg.port(spec.to_port)
    na = tuple(int(v) for v in pa.normal.tuple())
    nb = tuple(int(v) for v in pb.normal.tuple())
    a0 = to_cell(pa.position.tuple(), lo)
    b0 = to_cell(pb.position.tuple(), lo)
    # stub cells outside the component (ports sit on inflated-occupied faces)
    start = tuple(np.array(a0) + np.array(na) * STUB)
    goal  = tuple(np.array(b0) + np.array(nb) * STUB)
    for cells in (
        [tuple(np.array(a0) + np.array(na) * i) for i in range(STUB + 1)],
        [tuple(np.array(b0) + np.array(nb) * i) for i in range(STUB + 1)],
    ):
        for c in cells:
            occ[c] = False  # carve the stub corridor

    h = lambda c: sum(abs(np.array(c) - np.array(goal)))
    openq = [(h(start), 0.0, start, na)]
    best = {(start, na): 0.0}
    parent = {}
    while openq:
        _, g, cur, d = heapq.heappop(openq)
        if cur == goal:
            # arrival direction must oppose the goal port normal
            if d == tuple(-np.array(nb)):
                path_cells = [cur]
                k = (cur, d)
                while k in parent:
                    k = parent[k]
                    path_cells.append(k[0])
                path_cells.reverse()
                full = ([a0] + path_cells + [b0])
                return [to_mm(c, lo) for c in full]
            continue
        for m in MOVES:
            nxt = tuple(np.array(cur) + np.array(m))
            if any(v < 0 for v in nxt) or any(nxt[i] >= occ.shape[i] for i in range(3)):
                continue
            if occ[nxt]:
                continue
            ng = g + 1 + (BEND_PENALTY if m != d else 0)
            key = (nxt, m)
            if ng < best.get(key, 1e18):
                best[key] = ng
                parent[key] = (cur, d)
                heapq.heappush(openq, (ng + h(nxt), ng, nxt, m))
    raise RuntimeError("no route found")


def simplify(path):
    """Merge collinear voxel steps into straight runs (waypoints in mm)."""
    pts = [np.array(p, float) for p in path]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        d1 = pts[i] - out[-1]; d2 = pts[i + 1] - pts[i]
        if np.linalg.norm(np.cross(d1, d2)) > 1e-6:
            out.append(pts[i])
    out.append(pts[-1])
    return [tuple(p) for p in out]


if __name__ == "__main__":
    pcg = toy_skid()
    spec = pcg.tube_runs[0]
    wps = simplify(route(pcg, spec))
    total = sum(np.linalg.norm(np.array(wps[i+1]) - np.array(wps[i])) for i in range(len(wps)-1))
    print(f"routed {spec.id}: {len(wps)} waypoints, {len(wps)-2} bends, length {total:.0f} mm")
    for w in wps:
        print("  ", tuple(round(v) for v in w))
    import json, pathlib
    pathlib.Path("out").mkdir(exist_ok=True)
    pathlib.Path("out/pcg.json").write_text(pcg.model_dump_json(indent=2))
    pathlib.Path("out/route_TR-07.json").write_text(json.dumps(wps, indent=2))
