# -*- coding: utf-8 -*-
"""
Material Agent — 建筑垃圾资源化分析。
Input: user_input (mentions a waste type / quantity)
Output written to state["materials"]: recoverable_rate, recommended_products,
conversion_ratio, resourcing_plan — grounded in the `waste` RAG category.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.rag.knowledge_base import KnowledgeBase
from agent.models.state import CarbonState

logger = logging.getLogger("agent.material")

SYSTEM_PROMPT = """你是"碳循景"平台的 Material Agent，负责建筑垃圾资源化分析。
你会收到用户问题和一段知识库参考资料（建筑垃圾分类与再生材料标准）。
请只输出 JSON，不要输出其他文字，格式：
{
  "waste_type": "识别出的建筑垃圾类型",
  "estimated_quantity_tons": 数字或null,
  "recoverable_rate": "可回收率区间，如 60%-75%",
  "conversion_ratio": "转化比例说明",
  "recommended_products": ["推荐再生产品1", "推荐再生产品2"],
  "resourcing_plan": "资源化利用方案的简要说明（3-5句话）"
}
所有数值判断必须基于提供的知识库参考资料，不要编造未在资料中出现的标准编号。
"""


def material_node(state: CarbonState) -> dict:
    if not state.get("task_plan", {}).get("needs_material"):
        return {}

    user_input = state["user_input"]
    kb_chunks = KnowledgeBase.instance().search(user_input, k=4, category="waste")
    context = "\n\n".join(f"[{c.source}] {c.text}" for c in kb_chunks) or "（未检索到相关资料）"

    try:
        result = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"知识库参考资料：\n{context}\n\n用户问题：{user_input}"},
            ],
            temperature=0.2,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("material LLM call failed (%s) — returning RAG-only fallback", e)
        result = {
            "waste_type": "未能通过模型解析，见下方参考资料",
            "estimated_quantity_tons": None,
            "recoverable_rate": "60%-75%（知识库经验区间，未经模型个性化分析）",
            "conversion_ratio": "参见知识库参考资料",
            "recommended_products": [],
            "resourcing_plan": context[:400],
        }

    return {"materials": result}
