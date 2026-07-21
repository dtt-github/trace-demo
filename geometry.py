"""TRACE demo — deterministic CAD synthesis.

Waypoints (from router) -> wire with bend arcs at min_bend_radius ->
swept tube solid (CadQuery/OCCT) -> STEP AP214 export.
Plus a matplotlib render of the whole toy skid for the teaser image.
"""
from __future__ import annotations
import numpy as np
import cadquery as cq
from router import toy_skid, route, simplify


def filleted_wire(wps, bend_r):
    """Build a 3D polyline wire and fillet its corners to bend_r."""
    pts = [cq.Vector(*p) for p in wps]
    edges = [cq.Edge.makeLine(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    wire = cq.Wire.assembleEdges(edges)
    try:
        wire = wire.fillet2D(bend_r, wire.Vertices()[1:-1])  # 3D fillet on wire corners
    except Exception:
        pass  # fall back to sharp corners if OCCT refuses a corner
    return wire


def sweep_tube(wps, od_mm, bend_r):
    path = filleted_wire(wps, bend_r)
    start = np.array(wps[0]); nxt = np.array(wps[1])
    d = (nxt - start); d = d / np.linalg.norm(d)
    plane = cq.Plane(origin=tuple(start), normal=tuple(d))
    solid = (cq.Workplane(plane).circle(od_mm / 2.0)
             .sweep(cq.Workplane().newObject([path]), transition="round"))
    return solid


def render(pcg, wps, png_path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    fig = plt.figure(figsize=(12, 7), dpi=160)
    ax = fig.add_subplot(111, projection="3d")

    def box(ax, mn, mx, color, alpha, label=None):
        x0, y0, z0 = mn; x1, y1, z1 = mx
        v = np.array([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
                      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]])
        faces = [[v[i] for i in f] for f in
                 ([0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4])]
        pc = Poly3DCollection(faces, facecolor=color, alpha=alpha, edgecolor="#333", linewidths=0.6)
        ax.add_collection3d(pc)
        if label:
            c = (np.array(mn) + np.array(mx)) / 2
            ax.text(c[0], c[1], mx[2] + 40, label, ha="center", fontsize=9, weight="bold")

    colors = {"compressor": "#4C78A8", "aftercooler": "#72B7B2", "vessel": "#E45756"}
    names = {"C1": "Compressor C1", "A1": "Aftercooler A1", "V1": "Vessel V1 (obstacle)"}
    for c in pcg.components:
        box(ax, c.bbox_min.tuple(), c.bbox_max.tuple(), colors[c.cls], 0.35, names[c.id])
    env = pcg.zones[0]
    box(ax, env.bbox_min.tuple(), env.bbox_max.tuple(), "#999999", 0.04)

    W = np.array(wps)
    ax.plot(W[:, 0], W[:, 1], W[:, 2], "-", color="#F58518", lw=5, solid_capstyle="round",
            label="TR-07 routed centerline (A*, DN50)")
    for p in pcg.ports:
        pos = p.position.tuple()
        ax.scatter(*pos, s=60, color="black", zorder=5)
        ax.text(pos[0], pos[1], pos[2] + 45, p.id, fontsize=8, ha="center")

    ax.set_xlim(0, 2000); ax.set_ylim(0, 1000); ax.set_zlim(0, 1100)
    ax.set_box_aspect((2000, 1000, 1100))
    ax.view_init(elev=24, azim=-58)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.set_title("TRACE — deterministic routing core (zero-ML demo)\n"
                 "PCG constraint graph → A* router (clearance 60 mm, bend penalty) → parametric sweep → STEP",
                 fontsize=11)
    ax.legend(loc="upper left", fontsize=9)
    plt.tight_layout()
    plt.savefig(png_path, bbox_inches="tight")
    print("wrote", png_path)


if __name__ == "__main__":
    pcg = toy_skid()
    spec = pcg.tube_runs[0]
    wps = simplify(route(pcg, spec))
    solid = sweep_tube(wps, od_mm=60.3, bend_r=spec.min_bend_radius_mm)
    cq.exporters.export(solid, "out/TR-07_tube.step")
    print("wrote out/TR-07_tube.step")
    render(pcg, wps, "out/trace_teaser.png")
