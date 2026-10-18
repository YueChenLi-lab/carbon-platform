# -*- coding: utf-8 -*-
"""
Planner Agent — reads user_input, decides which of Material / Carbon /
Market / ESG / Policy agents this question actually needs, and writes
that decision into state["task_plan"]. Every other agent node checks its
own flag in task_plan before doing (expensive) work.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.models.state import CarbonState

logger = logging.getLogger("agent.planner")

SYSTEM_PROMPT = """你是"碳循景"平台的 Planner Agent，负责理解用户关于建筑固废资源化 /
碳减排的问题，并判断完成这个问题需要调用哪些下游 Agent。

下游 Agent 及职责：
- material: 建筑垃圾资源化分析（可回收率、推荐再生产品、转化比例、资源化方案）
- carbon: 碳减排核算（CO2减排量、减排因子、碳积分）
- market: 供需匹配（推荐采购方/项目、距离、预估收益）
- esg: ESG贡献评估（ESG评分、SDG映射、摘要）
- policy: 政策匹配（双碳/建筑垃圾资源化/上海地方政策、可申请补贴、合规建议）

只输出 JSON，不要输出其他文字，格式：
{"needs_material": bool, "needs_carbon": bool, "needs_market": bool,
 "needs_esg": bool, "needs_policy": bool, "reasoning": "一句话说明判断依据"}

判断原则：
- 提到具体材料/吨数/如何处理 → needs_material = true
- 提到碳减排/CO2/碳积分/核算 → needs_carbon = true
- 提到卖/采购/项目匹配/收益 → needs_market = true
- 提到ESG/SDG/企业社会责任/可持续披露 → needs_esg = true
- 提到政策/补贴/合规/双碳政策 → needs_policy = true
- 一个笼统的问题（如"1200吨混凝土如何资源化利用？"）通常至少需要 material 和 carbon，
  如果问题看起来需要完整报告（用户提到"报告"/"综合分析"/"完整方案"），把相关的都设为 true。
"""


def planner_node(state: CarbonState) -> dict:
    user_input = state["user_input"]
    try:
        plan = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_input},
            ],
            temperature=0.1,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("planner LLM call failed (%s) — falling back to heuristic plan", e)
        plan = _heuristic_plan(user_input)

    # normalize / guard against a malformed LLM response
    normalized = {
        "needs_material": bool(plan.get("needs_material", True)),
        "needs_carbon": bool(plan.get("needs_carbon", True)),
        "needs_market": bool(plan.get("needs_market", False)),
        "needs_esg": bool(plan.get("needs_esg", False)),
        "needs_policy": bool(plan.get("needs_policy", False)),
        "reasoning": plan.get("reasoning", ""),
    }
    return {"task_plan": normalized}


def _heuristic_plan(text: str) -> dict:
    """Offline fallback if DeepSeek is unreachable — simple keyword routing
    so the graph still produces a usable (if less nuanced) result."""
    t = text or ""
    return {
        "needs_material": any(k in t for k in ["吨", "混凝土", "砖", "废料", "资源化", "回收"]),
        "needs_carbon": any(k in t for k in ["碳", "co2", "CO2", "减排", "积分"]),
        "needs_market": any(k in t for k in ["卖", "采购", "匹配", "收益", "买家"]),
        "needs_esg": any(k in t for k in ["esg", "ESG", "sdg", "SDG", "可持续披露"]),
        "needs_policy": any(k in t for k in ["政策", "补贴", "合规", "双碳"]),
        "reasoning": "DeepSeek 不可用，使用关键词兜底规则判断任务需求。",
    }
