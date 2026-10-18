# -*- coding: utf-8 -*-
"""
ESG Agent — ESG 贡献评估。
Output written to state["esg_result"]: esg_score, sdg_mapping, esg_summary
Grounded in the `esg` RAG category, and cross-checks against the platform's
real aggregate figures (esg_summary from db_tools) so the score isn't
disconnected from actual project data.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.rag.knowledge_base import KnowledgeBase
from agent.tools import db_tools
from agent.models.state import CarbonState

logger = logging.getLogger("agent.esg")

SYSTEM_PROMPT = """你是"碳循景"平台的 ESG Agent，负责 ESG 贡献评估。
你会收到用户问题、资源化与碳核算结果、平台真实的累计数据，以及知识库参考资料
（ESG 标准与 SDG 映射）。

只输出 JSON，不要输出其他文字，格式：
{
  "esg_score": 0-100 的整数,
  "score_breakdown": {"environmental": 数字, "social": 数字, "governance": 数字},
  "sdg_mapping": ["SDG 9", "SDG 11", "SDG 12", "SDG 13"],
  "esg_summary": "3-5句话的 ESG 贡献摘要，用于对外披露参考"
}
评分说明：环境40% + 社会30% + 治理30%，此为平台演示性打分逻辑，非第三方认证评级，
请在 esg_summary 中说明这一点。
"""


def esg_node(state: CarbonState) -> dict:
    if not state.get("task_plan", {}).get("needs_esg"):
        return {}

    kb_chunks = KnowledgeBase.instance().search(state["user_input"], k=3, category="esg")
    context = "\n\n".join(f"[{c.source}] {c.text}" for c in kb_chunks) or "（未检索到相关资料）"
    platform_stats = db_tools.esg_summary()

    try:
        result = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"用户问题：{state['user_input']}\n"
                    f"资源化分析：{state.get('materials', {})}\n"
                    f"碳核算结果：{state.get('carbon_result', {})}\n"
                    f"平台累计真实数据：{platform_stats}\n"
                    f"知识库参考资料：\n{context}"
                )},
            ],
            temperature=0.3,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("esg LLM call failed (%s) — returning conservative default", e)
        result = {
            "esg_score": 60,
            "score_breakdown": {"environmental": 60, "social": 60, "governance": 60},
            "sdg_mapping": ["SDG 11", "SDG 12", "SDG 13"],
            "esg_summary": "DeepSeek 不可用，返回保守默认评分，建议稍后重试以获得基于实际数据的评估。",
        }

    return {"esg_result": result}
