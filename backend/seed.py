# -*- coding: utf-8 -*-
"""Seed the SQLite database with realistic demo data."""
import os
import sqlite3
import time
import json
import uuid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "carbon.db")

from app import init_db  # noqa: E402  (reuse schema definition)


def make_carbon_id(seed):
    return f"LS-2026-{(uuid.uuid5(uuid.NAMESPACE_DNS, seed).int % 1000000):06d}"


PRODUCTS = [
    dict(
        name="城市再生",
        subtitle="建筑固废再生微景观",
        description="以废弃混凝土与砖块破碎筛分而成的再生骨料为基底，搭配耐候钢与本地苔藓，还原城市拆除现场的肌理。",
        story="这件作品的原料来自杨浦区一处始建于1980年代的老厂房拆除现场。混凝土与砖块经过三级破碎与筛分，"
        "重新成为可用的再生骨料，再由本地工坊手工塑形，成为一件可以放在案头的城市记忆。",
        price=129,
        waste_used=1.82,
        recycled_aggregate=1.31,
        natural_replaced=0.51,
        recycled_ratio=72,
        carbon_reduction=1.03,
        source_project="杨浦区厂房更新项目",
    ),
    dict(
        name="海派记忆",
        subtitle="石库门砖瓦再生摆件",
        description="选用石库门里弄改造中拆除的老青砖，保留原始纹理与包浆，以再生工艺重新赋形。",
        story="每一块砖都编号可溯源，来自静安区一处石库门里弄的保护性拆除。我们没有磨去岁月留下的痕迹，"
        "而是让它们成为这件摆件最珍贵的部分。",
        price=169,
        waste_used=1.46,
        recycled_aggregate=1.02,
        natural_replaced=0.44,
        recycled_ratio=68,
        carbon_reduction=0.87,
        source_project="静安区商业空间改造项目",
    ),
    dict(
        name="砖语",
        subtitle="模块化再生砖书立",
        description="以再生骨料压制成型的模块化砖块，可自由拼接成书立、花器底座或桌面隔断。",
        story="砖语是一次关于'重新组合'的实验 — 同一块再生砖，可以是书立，也可以是花盆的基座。"
        "我们希望材料的第二次生命，比第一次更自由。",
        price=99,
        waste_used=1.08,
        recycled_aggregate=0.79,
        natural_replaced=0.31,
        recycled_ratio=65,
        carbon_reduction=0.61,
        source_project="闵行区建筑拆除项目",
    ),
    dict(
        name="循环花园",
        subtitle="再生骨料种植花器",
        description="透水混凝土配方结合再生骨料制成的户外花器，兼顾结构强度与雨水渗透性能。",
        story="循环花园最初为浦东一处口袋公园设计，透水配方让雨水能够重新回到土壤，"
        "如同建筑固废重新回到城市的生态循环之中。",
        price=219,
        waste_used=2.64,
        recycled_aggregate=1.94,
        natural_replaced=0.78,
        recycled_ratio=74,
        carbon_reduction=1.52,
        source_project="浦东新区建筑更新项目",
    ),
    dict(
        name="再生之境",
        subtitle="再生骨料桌面微地形",
        description="以多层次再生骨料还原城市地形肌理的桌面装置，呈现从拆除到重生的完整叙事。",
        story="'再生之境'尝试用材料本身讲述一个故事：底层是最粗粝的再生骨料，象征拆除；"
        "表层经过精细打磨，象征城市更新之后的从容。",
        price=259,
        waste_used=3.05,
        recycled_aggregate=2.21,
        natural_replaced=0.92,
        recycled_ratio=76,
        carbon_reduction=1.78,
        source_project="临港循环材料项目",
    ),
]

TIMELINE_TEMPLATE = [
    {"date": "2026.05.12", "title": "建筑拆除", "desc": "项目现场产生废弃混凝土、砖块与砂浆等建筑固废。"},
    {"date": "2026.05.15", "title": "固废收集", "desc": "固废经分类装车，运往指定资源化处理场地。"},
    {"date": "2026.05.18", "title": "破碎筛分", "desc": "通过多级破碎与筛分工艺，去除杂质并按粒径分级。"},
    {"date": "2026.05.22", "title": "再生骨料生产", "desc": "分级后的骨料检测合格，进入再生材料产线。"},
    {"date": "2026.06.01", "title": "产品制作", "desc": "再生骨料结合工艺配方，制作成低碳产品。"},
    {"date": "2026.06.03", "title": "碳减排核算", "desc": "依据材料替代与运输数据，完成碳减排核算。"},
    {"date": "2026.06.05", "title": "产品交付", "desc": "产品完成质检，附带碳身份证正式交付。"},
]

MAP_PROJECTS = [
    dict(
        name="浦东新区建筑更新项目",
        district="浦东新区",
        address="上海市浦东新区民生路 XX 号",
        description="老旧办公楼拆除更新项目，产生的建筑固废经现场分拣后，运往闵行再生材料基地处理。",
        lat=31.2304, lng=121.5449, status="已完成",
        waste_amount=328, recycled_amount=217, recycled_material=156, carbon_reduction=86.4,
    ),
    dict(
        name="杨浦区厂房更新项目",
        district="杨浦区",
        address="上海市杨浦区大连路 XX 号",
        description="1980年代老厂房拆除改造项目，废弃混凝土与钢筋分别回收，进入不同再生产线。",
        lat=31.2646, lng=121.5252, status="进行中",
        waste_amount=452, recycled_amount=298, recycled_material=201, carbon_reduction=112.6,
    ),
    dict(
        name="徐汇区城市更新项目",
        district="徐汇区",
        address="上海市徐汇区caoxi路 XX 号",
        description="滨江地块城市更新项目，固废资源化率达到项目考核指标的领先水平。",
        lat=31.1786, lng=121.4370, status="已完成",
        waste_amount=276, recycled_amount=198, recycled_material=142, carbon_reduction=71.3,
    ),
    dict(
        name="闵行区建筑拆除项目",
        district="闵行区",
        address="上海市闵行区莘庄工业区",
        description="工业厂房拆除项目，同时也是本平台核心再生材料处理基地所在地。",
        lat=31.1122, lng=121.3814, status="进行中",
        waste_amount=389, recycled_amount=241, recycled_material=178, carbon_reduction=64.5,
    ),
    dict(
        name="静安区商业空间改造项目",
        district="静安区",
        address="上海市静安区石门二路 XX 弄",
        description="石库门里弄保护性拆除项目，老青砖等材料经过特殊工艺实现高价值再利用。",
        lat=31.2304, lng=121.4581, status="已完成",
        waste_amount=164, recycled_amount=121, recycled_material=93, carbon_reduction=38.9,
    ),
    dict(
        name="临港循环材料项目",
        district="临港新片区",
        address="上海市浦东新区临港产业区",
        description="低碳产品规模化生产基地，承接全市多个拆除项目的再生骨料并转化为终端产品。",
        lat=30.8916, lng=121.9345, status="进行中",
        waste_amount=612, recycled_amount=467, recycled_material=352, carbon_reduction=203.7,
    ),
]


def seed():
    init_db()
    db = sqlite3.connect(DB_PATH)
    cur = db.execute("SELECT COUNT(*) FROM products")
    if cur.fetchone()[0] > 0:
        print("Database already seeded — skipping (delete carbon.db to reseed).")
        db.close()
        return

    now = int(time.time())
    for p in PRODUCTS:
        db.execute(
            """INSERT INTO products
            (name, subtitle, description, story, price, image_url, waste_used,
             recycled_aggregate, natural_replaced, recycled_ratio, carbon_reduction,
             carbon_id, source_project, timeline_json, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p["name"], p["subtitle"], p["description"], p["story"], p["price"],
                None, p["waste_used"], p["recycled_aggregate"], p["natural_replaced"],
                p["recycled_ratio"], p["carbon_reduction"],
                make_carbon_id(p["name"]), p["source_project"],
                json.dumps(TIMELINE_TEMPLATE, ensure_ascii=False), now,
            ),
        )

    for m in MAP_PROJECTS:
        db.execute(
            """INSERT INTO map_projects
            (name, district, address, description, lat, lng, status, waste_amount,
             recycled_amount, recycled_material, carbon_reduction, image_url, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                m["name"], m["district"], m["address"], m["description"], m["lat"], m["lng"],
                m["status"], m["waste_amount"], m["recycled_amount"], m["recycled_material"],
                m["carbon_reduction"], None, now,
            ),
        )

    db.commit()
    db.close()
    print(f"Seeded {len(PRODUCTS)} products and {len(MAP_PROJECTS)} map projects into {DB_PATH}")


if __name__ == "__main__":
    seed()
