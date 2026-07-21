"""TRACE demo — Piping Constraint Graph (PCG) schema (minimal subset).

LLMs never emit coordinates: they would emit THIS structure. Here the toy
skid is defined directly in the schema to demonstrate the deterministic
pipeline: PCG -> routing solver -> parametric sweep -> STEP.
"""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class Vec3(BaseModel):
    x: float
    y: float
    z: float

    def tuple(self):
        return (self.x, self.y, self.z)


class Provenance(BaseModel):
    source: str  # e.g. "drawing:P-1042:(x1,y1,x2,y2)" | "nl:req-3:s2" | "assumption:a1"


class Port(BaseModel):
    id: str
    parent: str
    dn_mm: float = Field(description="nominal diameter")
    standard: str = "EN 1092-1 PN16"
    position: Vec3
    normal: Vec3  # departure direction (unit, axis-aligned in demo)
    provenance: list[Provenance] = []


class Component(BaseModel):
    id: str
    cls: Literal["compressor", "aftercooler", "vessel", "frame"]
    bbox_min: Vec3
    bbox_max: Vec3
    provenance: list[Provenance] = []


class TubeRunSpec(BaseModel):
    id: str
    from_port: str
    to_port: str
    dn_mm: float
    min_bend_radius_mm: float
    clearance_mm: float
    provenance: list[Provenance] = []


class Zone(BaseModel):
    id: str
    kind: Literal["keepout", "skid_envelope"]
    bbox_min: Vec3
    bbox_max: Vec3


class PCG(BaseModel):
    components: list[Component]
    ports: list[Port]
    tube_runs: list[TubeRunSpec]
    zones: list[Zone]

    def port(self, pid: str) -> Port:
        return next(p for p in self.ports if p.id == pid)
