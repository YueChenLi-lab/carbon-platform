# -*- coding: utf-8 -*-
"""
碳循景 (Carbon Circularity Platform) — Backend
Flask + SQLite. Serves the API, handles image uploads, and serves the
built frontend as static files (same-origin, so no CORS needed).
"""
import os
import sqlite3
import time
import uuid
import json
import requests
from flask import Flask, request, jsonify, g, send_from_directory, abort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "carbon.db")
UPLOAD_ROOT = os.path.join(BASE_DIR, "uploads")
PRODUCT_UPLOAD_DIR = os.path.join(UPLOAD_ROOT, "products")
MAP_UPLOAD_DIR = os.path.join(UPLOAD_ROOT, "map")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif", "svg"}

# Agent Gateway (Python + LangGraph, its own process — see /agent). Flask
# proxies to it so the frontend keeps a single same-origin API surface;
# this backend never imports LangGraph/DeepSeek code directly.
AGENT_SERVICE_URL = os.environ.get("AGENT_SERVICE_URL", "http://localhost:8100")

for d in (PRODUCT_UPLOAD_DIR, MAP_UPLOAD_DIR):
    os.makedirs(d, exist_ok=True)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB uploads


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subtitle TEXT,
            description TEXT,
            story TEXT,
            price REAL DEFAULT 0,
            image_url TEXT,
            waste_used REAL DEFAULT 0,
            recycled_aggregate REAL DEFAULT 0,
            natural_replaced REAL DEFAULT 0,
            recycled_ratio REAL DEFAULT 0,
            carbon_reduction REAL DEFAULT 0,
            carbon_id TEXT UNIQUE,
            source_project TEXT,
            timeline_json TEXT,
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS map_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            district TEXT,
            address TEXT,
            description TEXT,
            lat REAL,
            lng REAL,
            status TEXT DEFAULT '进行中',
            waste_amount REAL DEFAULT 0,
            recycled_amount REAL DEFAULT 0,
            recycled_material REAL DEFAULT 0,
            carbon_reduction REAL DEFAULT 0,
            image_url TEXT,
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS carbon_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            product_name TEXT,
            carbon_reduction REAL,
            green_points INTEGER,
            created_at INTEGER,
            FOREIGN KEY (product_id) REFERENCES products (id)
        );

        -- Added for the Agent Layer's long-term memory / RAG recall
        -- (see agent/memory/store.py). Purely additive: no existing
        -- table is touched, and the agent service also creates this
        -- idempotently on its own if this backend hasn't run yet.
        CREATE TABLE IF NOT EXISTS memory_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            content TEXT,
            embedding BLOB,
            kind TEXT DEFAULT 'chat',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_store(session_id);
        """
    )
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Small utils
# ---------------------------------------------------------------------------
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def save_upload(file_storage, subdir):
    if not file_storage or file_storage.filename == "":
        return None
    if not allowed_file(file_storage.filename):
        abort(400, description="不支持的图片格式")
    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    fname = f"{uuid.uuid4().hex}.{ext}"
    target_dir = PRODUCT_UPLOAD_DIR if subdir == "products" else MAP_UPLOAD_DIR
    path = os.path.join(target_dir, fname)
    file_storage.save(path)
    return f"/uploads/{subdir}/{fname}"


def row_to_dict(row):
    d = dict(row)
    if d.get("timeline_json"):
        try:
            d["timeline"] = json.loads(d["timeline_json"])
        except Exception:
            d["timeline"] = []
        del d["timeline_json"]
    return d


def make_carbon_id():
    return f"LS-2026-{uuid.uuid4().int % 1000000:06d}"


# ---------------------------------------------------------------------------
# Static file serving (frontend)
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def serve_frontend_files(filename):
    full = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, filename)
    # SPA fallback for client-side routes (hash routing means this is rarely hit)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/uploads/<subdir>/<path:filename>")
def serve_uploads(subdir, filename):
    if subdir not in ("products", "map"):
        abort(404)
    directory = PRODUCT_UPLOAD_DIR if subdir == "products" else MAP_UPLOAD_DIR
    return send_from_directory(directory, filename)


# ---------------------------------------------------------------------------
# Home / platform stats
# ---------------------------------------------------------------------------
@app.route("/api/stats")
def api_stats():
    db = get_db()
    p = db.execute(
        "SELECT COALESCE(SUM(waste_used),0) w, COALESCE(SUM(carbon_reduction),0) c, COUNT(*) n FROM products"
    ).fetchone()
    mp = db.execute(
        "SELECT COALESCE(SUM(waste_amount),0) w, COALESCE(SUM(recycled_amount),0) r, "
        "COALESCE(SUM(carbon_reduction),0) c, COUNT(*) n FROM map_projects"
    ).fetchone()
    return jsonify(
        {
            "waste_processed": round(mp["w"] + p["w"] * 100, 1),
            "recycled_material": round(mp["r"] + p["w"] * 60, 1),
            "carbon_reduction": round(mp["c"] + p["c"] * 100, 1),
            "low_carbon_projects": mp["n"] * 6 + p["n"] * 14,
        }
    )


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@app.route("/api/products", methods=["GET"])
def list_products():
    db = get_db()
    rows = db.execute("SELECT * FROM products ORDER BY id ASC").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/products/<int:pid>", methods=["GET"])
def get_product(pid):
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not row:
        abort(404, description="产品不存在")
    return jsonify(row_to_dict(row))


@app.route("/api/products", methods=["POST"])
def create_product():
    db = get_db()
    form = request.form
    image_url = None
    if "image" in request.files:
        image_url = save_upload(request.files["image"], "products")

    carbon_id = make_carbon_id()
    timeline = [
        {"date": "拆除阶段", "title": "建筑拆除", "desc": "项目现场产生废弃混凝土、砖块与砂浆等建筑固废。"},
        {"date": "收集阶段", "title": "固废收集", "desc": "固废经分类装车，运往指定资源化处理场地。"},
        {"date": "处理阶段", "title": "破碎筛分", "desc": "通过多级破碎与筛分工艺，去除杂质并按粒径分级。"},
        {"date": "生产阶段", "title": "再生骨料生产", "desc": "分级后的骨料检测合格，进入再生材料产线。"},
        {"date": "制作阶段", "title": "产品制作", "desc": "再生骨料结合工艺配方，制作成低碳产品。"},
        {"date": "核算阶段", "title": "碳减排核算", "desc": "依据材料替代与运输数据，完成碳减排核算。"},
    ]
    cur = db.execute(
        """INSERT INTO products
        (name, subtitle, description, story, price, image_url, waste_used,
         recycled_aggregate, natural_replaced, recycled_ratio, carbon_reduction,
         carbon_id, source_project, timeline_json, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            form.get("name", "未命名产品"),
            form.get("subtitle", ""),
            form.get("description", ""),
            form.get("story", ""),
            float(form.get("price", 0) or 0),
            image_url,
            float(form.get("waste_used", 0) or 0),
            float(form.get("recycled_aggregate", 0) or 0),
            float(form.get("natural_replaced", 0) or 0),
            float(form.get("recycled_ratio", 0) or 0),
            float(form.get("carbon_reduction", 0) or 0),
            carbon_id,
            form.get("source_project", "上海建筑更新项目"),
            json.dumps(timeline, ensure_ascii=False),
            int(time.time()),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/products/<int:pid>", methods=["PUT"])
def update_product(pid):
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not row:
        abort(404, description="产品不存在")

    if request.content_type and "multipart/form-data" in request.content_type:
        data = request.form
        image_url = row["image_url"]
        if "image" in request.files and request.files["image"].filename:
            image_url = save_upload(request.files["image"], "products")
    else:
        data = request.get_json(force=True, silent=True) or {}
        image_url = data.get("image_url", row["image_url"])

    def pick(key, cast, default):
        val = data.get(key, default)
        try:
            return cast(val)
        except (TypeError, ValueError):
            return default

    db.execute(
        """UPDATE products SET name=?, subtitle=?, description=?, story=?, price=?,
           image_url=?, waste_used=?, recycled_aggregate=?, natural_replaced=?,
           recycled_ratio=?, carbon_reduction=? WHERE id=?""",
        (
            pick("name", str, row["name"]),
            pick("subtitle", str, row["subtitle"]),
            pick("description", str, row["description"]),
            pick("story", str, row["story"]),
            pick("price", float, row["price"]),
            image_url,
            pick("waste_used", float, row["waste_used"]),
            pick("recycled_aggregate", float, row["recycled_aggregate"]),
            pick("natural_replaced", float, row["natural_replaced"]),
            pick("recycled_ratio", float, row["recycled_ratio"]),
            pick("carbon_reduction", float, row["carbon_reduction"]),
            pid,
        ),
    )
    db.commit()
    updated = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    return jsonify(row_to_dict(updated))


# ---------------------------------------------------------------------------
# Map projects
# ---------------------------------------------------------------------------
@app.route("/api/map/projects", methods=["GET"])
def list_map_projects():
    db = get_db()
    rows = db.execute("SELECT * FROM map_projects ORDER BY id ASC").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/map/projects/<int:pid>", methods=["GET"])
def get_map_project(pid):
    db = get_db()
    row = db.execute("SELECT * FROM map_projects WHERE id=?", (pid,)).fetchone()
    if not row:
        abort(404, description="项目不存在")
    return jsonify(row_to_dict(row))


@app.route("/api/map/projects", methods=["POST"])
def create_map_project():
    db = get_db()
    form = request.form
    image_url = None
    if "image" in request.files:
        image_url = save_upload(request.files["image"], "map")

    cur = db.execute(
        """INSERT INTO map_projects
        (name, district, address, description, lat, lng, status, waste_amount,
         recycled_amount, recycled_material, carbon_reduction, image_url, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            form.get("name", "未命名项目"),
            form.get("district", ""),
            form.get("address", ""),
            form.get("description", ""),
            float(form.get("lat", 0) or 0),
            float(form.get("lng", 0) or 0),
            form.get("status", "进行中"),
            float(form.get("waste_amount", 0) or 0),
            float(form.get("recycled_amount", 0) or 0),
            float(form.get("recycled_material", 0) or 0),
            float(form.get("carbon_reduction", 0) or 0),
            image_url,
            int(time.time()),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM map_projects WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


# ---------------------------------------------------------------------------
# Carbon ID lookup
# ---------------------------------------------------------------------------
@app.route("/api/carbon/<carbon_id>")
def get_carbon_record(carbon_id):
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE carbon_id=?", (carbon_id,)).fetchone()
    if not row:
        abort(404, description="未找到该碳身份证")
    return jsonify(row_to_dict(row))


# ---------------------------------------------------------------------------
# Standalone upload endpoints (per spec section 24)
# ---------------------------------------------------------------------------
@app.route("/api/upload/product-image", methods=["POST"])
def upload_product_image():
    if "image" not in request.files:
        abort(400, description="缺少 image 字段")
    url = save_upload(request.files["image"], "products")
    return jsonify({"image_url": url})


@app.route("/api/upload/map-image", methods=["POST"])
def upload_map_image():
    if "image" not in request.files:
        abort(400, description="缺少 image 字段")
    url = save_upload(request.files["image"], "map")
    return jsonify({"image_url": url})


# ---------------------------------------------------------------------------
# Personal carbon account (demo data, still served through a real API)
# ---------------------------------------------------------------------------
@app.route("/api/account")
def api_account():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM carbon_ledger ORDER BY created_at DESC"
    ).fetchall()
    ledger = [dict(r) for r in rows]
    total_carbon = sum(r["carbon_reduction"] for r in ledger) if ledger else 12.36
    total_points = sum(r["green_points"] for r in ledger) if ledger else 1236
    return jsonify(
        {
            "user": "Demo User",
            "total_carbon_reduction": round(total_carbon, 2),
            "green_points": int(total_points),
            "waste_recycled": 18.5,
            "ledger": ledger
            if ledger
            else [
                {"product_name": "城市再生 · 微景观", "carbon_reduction": 1.03, "green_points": 100},
                {"product_name": "海派记忆", "carbon_reduction": 0.87, "green_points": 80},
                {"product_name": "低碳 DIY 活动", "carbon_reduction": 0.56, "green_points": 50},
            ],
        }
    )


@app.route("/api/account/claim", methods=["POST"])
def claim_carbon():
    """Add a product to the demo user's carbon account (e.g. from a product page)."""
    db = get_db()
    data = request.get_json(force=True, silent=True) or {}
    product_id = data.get("product_id")
    product_name = data.get("product_name", "低碳产品")
    carbon_reduction = float(data.get("carbon_reduction", 0) or 0)
    green_points = int(round(carbon_reduction * 100))
    db.execute(
        "INSERT INTO carbon_ledger (product_id, product_name, carbon_reduction, green_points, created_at) "
        "VALUES (?,?,?,?,?)",
        (product_id, product_name, carbon_reduction, green_points, int(time.time())),
    )
    db.commit()
    return jsonify({"ok": True, "green_points": green_points})


# ---------------------------------------------------------------------------
# Enterprise ESG (demo data)
# ---------------------------------------------------------------------------
@app.route("/api/esg")
def api_esg():
    return jsonify(
        {
            "company": "国投维尔利马桥（上海）再生资源有限公司",
            "year": 2026,
            "is_demo": True,
            "waste_recycled": 2836,
            "recycled_material": 1962,
            "carbon_reduction": 1268,
            "low_carbon_projects": 18,
            "yearly_trend": [
                {"year": "2023", "carbon_reduction": 412},
                {"year": "2024", "carbon_reduction": 678},
                {"year": "2025", "carbon_reduction": 951},
                {"year": "2026", "carbon_reduction": 1268},
            ],
            "reduction_sources": [
                {"name": "天然骨料替代", "value": 41},
                {"name": "传统材料替代", "value": 28},
                {"name": "运输优化", "value": 17},
                {"name": "材料碳化", "value": 14},
            ],
            "projects": [
                {"name": "上海 浦东新区建筑更新项目", "status": "已完成", "carbon_reduction": 86.4},
                {"name": "浦东 拆除项目", "status": "进行中", "carbon_reduction": 42.8},
                {"name": "杨浦 循环利用项目", "status": "已完成", "carbon_reduction": 31.6},
                {"name": "徐汇 城市更新项目", "status": "已完成", "carbon_reduction": 58.2},
                {"name": "闵行 建筑拆除项目", "status": "进行中", "carbon_reduction": 24.1},
                {"name": "静安 商业空间改造项目", "status": "规划中", "carbon_reduction": 0},
            ],
        }
    )


# ---------------------------------------------------------------------------
# Agent Layer proxy (new) — forwards to the LangGraph Agent Gateway.
# This backend stays a pure proxy here: no LangGraph/DeepSeek imports,
# no business logic. If the agent service is down, callers get a clear
# 503 instead of a confusing connection-refused stack trace.
# ---------------------------------------------------------------------------
def _proxy_to_agent(method, path, **kwargs):
    try:
        resp = requests.request(method, f"{AGENT_SERVICE_URL}{path}", timeout=60, **kwargs)
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Agent 服务不可用: {e}"}), 503


@app.route("/api/agent/chat", methods=["POST"])
def agent_chat():
    return _proxy_to_agent("POST", "/chat", json=request.get_json(force=True, silent=True) or {})


@app.route("/api/agent/report", methods=["POST"])
def agent_report():
    return _proxy_to_agent("POST", "/report", json=request.get_json(force=True, silent=True) or {})


@app.route("/api/agent/project-analysis", methods=["POST"])
def agent_project_analysis():
    return _proxy_to_agent("POST", "/project-analysis", json=request.get_json(force=True, silent=True) or {})


@app.route("/api/agent/history", methods=["GET"])
def agent_history():
    session_id = request.args.get("session_id", "")
    return _proxy_to_agent("GET", "/history", params={"session_id": session_id})


# ---------------------------------------------------------------------------
# Error handling -> JSON
# ---------------------------------------------------------------------------
@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(500)
def handle_error(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", str(e))}), getattr(e, "code", 500)
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        init_db()
    else:
        init_db()  # idempotent, CREATE TABLE IF NOT EXISTS
    app.run(host="0.0.0.0", port=8000, debug=False)
