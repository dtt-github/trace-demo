"""TRACE demo v2 — render (iso + plan view) and multi-tube STEP export."""
from __future__ import annotations
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import cadquery as cq
from demo2 import demo_package, route_all

CCOL = {"F1": "#B279A2", "C1": "#4C78A8", "M1": "#9D755D", "A1": "#72B7B2",
        "V1": "#E45756", "R1": "#F2CF5B", "DH": "#7F7F7F", "CT": "#BAB0AC"}
CNAME = {"F1": "Filter F1", "C1": "Compressor C1", "M1": "Motor M1", "A1": "Aftercooler A1",
         "V1": "Separator V1", "R1": "Receiver R1", "DH": "Drain hdr", "CT": "Cable tray"}
TCOL = {"TR-01": "#F58518", "TR-02": "#E45756", "TR-03": "#54A24B",
        "TR-04": "#4C78A8", "TR-05": "#B279A2"}


def draw_box(ax, mn, mx, color, alpha, lw=0.5):
    x0, y0, z0 = mn; x1, y1, z1 = mx
    v = np.array([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
                  [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]])
    faces = [[v[i] for i in f] for f in
             ([0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[0,3,7,4])]
    ax.add_collection3d(Poly3DCollection(faces, facecolor=color, alpha=alpha,
                                         edgecolor="#333", linewidths=lw))


def scene(ax, pcg, res, elev, azim, label_boxes):
    for c in pcg.components:
        draw_box(ax, c.bbox_min.tuple(), c.bbox_max.tuple(), CCOL[c.id], 0.32)
        if label_boxes:
            m = (np.array(c.bbox_min.tuple()) + np.array(c.bbox_max.tuple())) / 2
            ax.text(m[0], m[1], c.bbox_max.z + 30, CNAME[c.id], ha="center", fontsize=7.5, weight="bold")
    env = pcg.zones[0]
    draw_box(ax, env.bbox_min.tuple(), env.bbox_max.tuple(), "#999999", 0.03)
    for rid, r in res.items():
        W = np.array(r["waypoints"])
        lw = 2.0 + r["dn"] / 18
        ax.plot(W[:,0], W[:,1], W[:,2], "-", color=TCOL[rid], lw=lw,
                solid_capstyle="round", label=f"{rid} DN{r['dn']:.0f}  {r['length_mm']:.0f} mm / {r['bends']} bends")
    for p in pcg.ports:
        ax.scatter(*p.position.tuple(), s=18, color="black", zorder=6)
    ax.set_xlim(0, 2400); ax.set_ylim(0, 1200); ax.set_zlim(0, 1400)
    ax.set_box_aspect((2400, 1200, 1400))
    ax.view_init(elev=elev, azim=azim)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])


def render(pcg, res, png):
    fig = plt.figure(figsize=(15, 7), dpi=170)
    ax1 = fig.add_subplot(121, projection="3d")
    scene(ax1, pcg, res, elev=23, azim=-62, label_boxes=True)
    ax1.set_title("Isometric", fontsize=10)
    ax2 = fig.add_subplot(122, projection="3d")
    scene(ax2, pcg, res, elev=89, azim=-90, label_boxes=False)
    ax2.set_title("Plan view (routing drawing)", fontsize=10)
    tot = sum(r["length_mm"] for r in res.values()); bends = sum(r["bends"] for r in res.values())
    fig.suptitle("TRACE — multi-tube routing on a representative compressor package (zero-ML demo)\n"
                 f"8 assets · 5 tube runs routed sequentially with tube-vs-tube clearance · "
                 f"total piping {tot:.0f} mm, {bends} bends", fontsize=12)
    ax1.legend(loc="upper left", fontsize=7.5, framealpha=0.9)
    plt.tight_layout()
    plt.savefig(png, bbox_inches="tight")
    print("wrote", png)


def wire_of(wps, bend_r):
    pts = [cq.Vector(*p) for p in wps]
    edges = [cq.Edge.makeLine(pts[i], pts[i+1]) for i in range(len(pts)-1)]
    w = cq.Wire.assembleEdges(edges)
    try:
        w = w.fillet2D(bend_r, w.Vertices()[1:-1])
    except Exception:
        pass
    return w


def export_step(res, path):
    asm = cq.Assembly(name="TRACE_pkg_piping")
    OD = {80: 88.9, 50: 60.3, 25: 33.7}
    for rid, r in res.items():
        wps = [np.array(p) for p in r["waypoints"]]
        w = wire_of(r["waypoints"], r["bend_r"])
        d = wps[1] - wps[0]; d = d / np.linalg.norm(d)
        plane = cq.Plane(origin=tuple(wps[0]), normal=tuple(d))
        solid = (cq.Workplane(plane).circle(OD[int(r["dn"])] / 2)
                 .sweep(cq.Workplane().newObject([w]), transition="round"))
        asm.add(solid, name=rid)
    asm.save(path)
    print("wrote", path)


if __name__ == "__main__":
    pcg = demo_package()
    res = route_all(pcg)
    render(pcg, res, "out/trace_teaser_v2.png")
    export_step(res, "out/package_piping_v2.step")
