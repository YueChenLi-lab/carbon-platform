# -*- coding: utf-8 -*-
"""
Market Agent — 供需匹配。
Input: state["materials"] / user_input
Output written to state["market_result"]: recommended_buyers, recommended_projects,
                                            distance_note, estimated_revenue_note

Data source: the EXISTING products / map_projects tables (via tools/db_tools.py) —
this agent doesn't invent buyers, it matches against what's actually in the DB.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.tools import db_tools
from agent.models.state import CarbonState

logger = logging.getLogger("agent.market")

SYSTEM_PROMPT = """你是"碳循景"平台的 Market Agent，负责供需匹配建议。
你会收到用户问题、资源化分析结果，以及平台数据库中真实存在的再生产品与项目列表。
请基于这些真实数据给出匹配建议，不要编造数据库中不存在的项目或产品。

只输出 JSON，不要输出其他文字，格式：
{
  "recommended_products": ["数据库中匹配度高的产品名称，最多3个"],
  "recommended_projects": ["数据库中可对接的项目名称，最多3个"],
  "match_reasoning": "2-3句话说明匹配依据",
  "estimated_revenue_note": "基于产品定价的粗略收益说明（演示性质，非报价）"
}
"""


def market_node(state: CarbonState) -> dict:
    if not state.get("task_plan", {}).get("needs_market"):
        return {}

    products = db_tools.list_products()
    projects = db_tools.top_projects_by_recycled_material(limit=6)

    try:
        result = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"用户问题：{state['user_input']}\n"
                    f"资源化分析结果：{state.get('materials', {})}\n"
                    f"数据库中现有产品：{products}\n"
                    f"数据库中现有项目（按再生材料用量排序）：{projects}"
                )},
            ],
            temperature=0.3,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("market LLM call failed (%s) — returning raw DB matches", e)
        result = {
            "recommended_products": [p["name"] for p in products[:3]],
            "recommended_projects": [p["name"] for p in projects[:3]],
            "match_reasoning": "DeepSeek 不可用，直接返回数据库中排名靠前的产品与项目。",
            "estimated_revenue_note": "需人工核实，此处未计算。",
        }

    return {"market_result": result}
