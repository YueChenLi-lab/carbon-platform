# -*- coding: utf-8 -*-
"""
Policy Agent — 政策匹配。
Grounded strictly in the `policy` RAG category (双碳政策 / 建筑垃圾资源化政策 /
上海地方政策). Output written to state["policy_result"]: matched_policies,
possible_subsidies, possible_credits, compliance_notes.
"""
import logging
from agent.llm.service import llm_service, LLMServiceError
from agent.rag.knowledge_base import KnowledgeBase
from agent.models.state import CarbonState

logger = logging.getLogger("agent.policy")

SYSTEM_PROMPT = """你是"碳循景"平台的 Policy Agent，负责政策匹配。
你只能基于提供的知识库参考资料回答，不要编造资料中没有的具体政策文号或补贴金额。
如果资料不足以支撑某个具体判断，请明确说明"需以官方最新文件为准"。

只输出 JSON，不要输出其他文字，格式：
{
  "matched_policies": ["匹配到的政策方向1", "匹配到的政策方向2"],
  "possible_subsidies": "可能涉及的补贴/减免方向说明（非确定金额）",
  "possible_credits": "可能涉及的积分/认定说明",
  "compliance_notes": "1-2句话的合规提示，强调需以官方文件为准"
}
"""


def policy_node(state: CarbonState) -> dict:
    if not state.get("task_plan", {}).get("needs_policy"):
        return {}

    kb_chunks = KnowledgeBase.instance().search(state["user_input"], k=4, category="policy")
    context = "\n\n".join(f"[{c.source}] {c.text}" for c in kb_chunks) or "（未检索到相关资料）"

    try:
        result = llm_service.chat_json(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"用户问题：{state['user_input']}\n知识库参考资料：\n{context}"},
            ],
            temperature=0.2,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("policy LLM call failed (%s) — returning RAG passthrough", e)
        result = {
            "matched_policies": [c.text[:60] for c in kb_chunks[:2]],
            "possible_subsidies": "DeepSeek 不可用，请参考上方知识库摘要自行判断，并以官方文件为准。",
            "possible_credits": "同上。",
            "compliance_notes": "本结果为知识库原文摘要，非模型个性化分析，正式申报前请核实最新政策。",
        }

    return {"policy_result": result}
