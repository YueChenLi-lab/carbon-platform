# -*- coding: utf-8 -*-
"""
Read-only helpers over the existing `products` / `map_projects` tables.
Agents (mainly Market Agent) call these instead of writing raw SQL inline,
and — critically — nothing here ever INSERTs/UPDATEs/DELETEs the existing
schema, per the spec's "保留现有数据库结构 / 保留现有 API" requirement.
"""
import os
import sqlite3
from typing import List, Dict, Any

DB_PATH = os.environ.get(
    "CARBON_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "backend", "carbon.db"),
)


def _rows(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(query, params).fetchall()]
    finally:
        conn.close()


def list_products() -> List[Dict[str, Any]]:
    return _rows("SELECT id, name, subtitle, price, recycled_ratio, carbon_reduction, source_project FROM products")


def list_map_projects(status: str = None) -> List[Dict[str, Any]]:
    if status:
        return _rows(
            "SELECT id, name, district, status, waste_amount, recycled_amount, "
            "recycled_material, carbon_reduction FROM map_projects WHERE status=?",
            (status,),
        )
    return _rows(
        "SELECT id, name, district, status, waste_amount, recycled_amount, "
        "recycled_material, carbon_reduction FROM map_projects"
    )


def top_projects_by_recycled_material(limit: int = 5) -> List[Dict[str, Any]]:
    return _rows(
        "SELECT name, district, status, recycled_material, carbon_reduction FROM map_projects "
        "ORDER BY recycled_material DESC LIMIT ?",
        (limit,),
    )


def esg_summary() -> Dict[str, Any]:
    """Aggregate figures matching what /api/esg reports, reused so Market/ESG
    agents reason over the same numbers the dashboard shows."""
    rows = _rows(
        "SELECT COALESCE(SUM(waste_amount),0) w, COALESCE(SUM(recycled_amount),0) r, "
        "COALESCE(SUM(recycled_material),0) m, COALESCE(SUM(carbon_reduction),0) c, "
        "COUNT(*) n FROM map_projects"
    )
    return rows[0] if rows else {"w": 0, "r": 0, "m": 0, "c": 0, "n": 0}
