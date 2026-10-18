# -*- coding: utf-8 -*-
"""
Carbon Agent — 碳减排核算。
Input: state["materials"] (Material Agent's output)
Output written to state["carbon_result"]: co2_reduction_tons, factors_used, green_points

Per spec: "所有公式独立封装，后续可替换真实核算模型" — every numeric formula
lives in `formulas.py`-style functions below, isolated from the LLM call,
so swapping in a certified carbon accounting model later means editing
only this file's calculation functions, not the agent's control flow.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.rag.knowledge_base import KnowledgeBase
from agent.models.state import CarbonState

logger = logging.getLogger("agent.carbon")

# ---------------------------------------------------------------------------
# Isolated, swappable calculation functions (demo coefficients — see
# rag/knowledge/carbon_accounting.md for the reference ranges these use).
# Replace these with a certified model's formulas without touching the rest
# of this file.
# ---------------------------------------------------------------------------
NATURAL_AGGREGATE_FACTOR = 0.005   # tCO2e / ton (extraction + transport)
CEMENT_CLINKER_FACTOR = 0.75       # tCO2e / ton
RECYCLED_PRODUCTION_FACTOR = 0.0015  # tCO2e / ton (crushing/screening energy)
POINTS_PER_TON_CO2 = 100


def estimate_co2_reduction(estimated_quantity_tons: float, recoverable_rate_mid: float = 0.65) -> float:
    """Very simplified substitution-method estimate:
    recovered_tons * (natural_aggregate_factor - recycled_production_factor)."""
    if not estimated_quantity_tons or estimated_quantity_tons <= 0:
        return 0.0
    recovered = estimated_quantity_tons * recoverable_rate_mid
    return round(recovered * (NATURAL_AGGREGATE_FACTOR - RECYCLED_PRODUCTION_FACTOR), 3)


def to_green_points(co2_tons: float) -> int:
    return int(round(co2_tons * POINTS_PER_TON_CO2))


SYSTEM_PROMPT = """你是"碳循景"平台的 Carbon Agent，负责碳减排核算讲解。
你会收到 Material Agent 的资源化分析结果、一个已经用固定公式算出的 CO2 减排估算值，
以及知识库参考资料（碳核算方法学）。你的任务不是重新计算数值，而是：
1. 用清晰的语言解释这个估算值是如何构成的（材料替代/运输优化/避免填埋，能覆盖到的部分）
2. 指出这只是演示性估算，实际核算应参考知识库中的方法学与更精确的项目数据

只输出 JSON，不要输出其他文字，格式：
{"explanation": "2-4句话的核算说明", "caveats": "1-2句话的局限性说明"}
"""


def carbon_node(state: CarbonState) -> dict:
    if not state.get("task_plan", {}).get("needs_carbon"):
        return {}

    materials = state.get("materials", {})
    qty = materials.get("estimated_quantity_tons") or 0

    co2 = estimate_co2_reduction(float(qty) if qty else 0.0)
    points = to_green_points(co2)

    kb_chunks = KnowledgeBase.instance().search(state["user_input"], k=3, category="carbon")
    context = "\n\n".join(f"[{c.source}] {c.text}" for c in kb_chunks) or "（未检索到相关资料）"

    try:
        narrative = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"资源化分析结果：{materials}\n"
                    f"估算 CO2 减排量：{co2} tCO2e（对应 {points} 绿色积分）\n"
                    f"知识库参考资料：\n{context}"
                )},
            ],
            temperature=0.2,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("carbon LLM call failed (%s) — returning formula-only result", e)
        narrative = {
            "explanation": "已根据固定公式（天然骨料因子 - 再生生产因子）× 回收吨数完成估算，模型讲解暂不可用。",
            "caveats": "此估算为演示用途，非官方核证减排量。",
        }

    return {
        "carbon_result": {
            "co2_reduction_tons": co2,
            "green_points": points,
            "factors_used": {
                "natural_aggregate_factor": NATURAL_AGGREGATE_FACTOR,
                "cement_clinker_factor": CEMENT_CLINKER_FACTOR,
                "recycled_production_factor": RECYCLED_PRODUCTION_FACTOR,
            },
            **narrative,
        }
    }
