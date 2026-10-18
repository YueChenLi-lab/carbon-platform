# -*- coding: utf-8 -*-
"""
Report Agent — 整合所有 Agent 结果，输出标准化 Markdown 报告。
Always runs last in the graph. Reads whatever sub-results exist in state
(agents that weren't needed per task_plan simply left their slot empty)
and writes state["final_report"].

PDF export (mentioned in spec as a follow-up) is intentionally left as a
TODO — see README — Markdown is produced here and can be piped through
any md->pdf tool (e.g. the platform's existing `pdf` skill) later without
changing this agent.
"""
import logging
from datetime import datetime
from agent.llm.service import llm_service, LLMServiceError
from agent.models.state import CarbonState

logger = logging.getLogger("agent.report")

SYSTEM_PROMPT = """你是"碳循景"平台的 Report Agent，负责把多个 Agent 的分析结果整合成
一份结构清晰的 Markdown 报告，供用户直接阅读或导出。

要求：
- 使用 Markdown 标题分节：仅包含实际提供了数据的部分（不要为空数据编造内容）
- 语言专业、简洁，避免重复输入数据的原始 JSON 结构
- 结尾统一加一句：所有数据与核算结果均为演示用途，正式决策请以专业核算与官方政策为准。
直接输出 Markdown 正文，不要输出代码块围栏、不要输出额外说明。
"""


def report_node(state: CarbonState) -> dict:
    sections = {
        "用户问题": state.get("user_input", ""),
        "任务规划": state.get("task_plan", {}),
        "建筑垃圾资源化分析": state.get("materials") or None,
        "碳减排核算": state.get("carbon_result") or None,
        "供需匹配": state.get("market_result") or None,
        "ESG 评估": state.get("esg_result") or None,
        "政策匹配": state.get("policy_result") or None,
    }
    populated = {k: v for k, v in sections.items() if v}

    try:
        report_md = llm_service.chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"以下是各 Agent 的分析结果，请整合为报告：\n{populated}"},
            ],
            temperature=0.3,
            max_tokens=2000,
        )
    except (LLMServiceError, Exception) as e:  # noqa: BLE001
        logger.warning("report LLM call failed (%s) — assembling report without narrative polish", e)
        report_md = _fallback_markdown(populated)

    stamped = report_md.strip() + f"\n\n---\n*生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}*"
    return {"final_report": stamped}


def _fallback_markdown(populated: dict) -> str:
    lines = ["# 建筑固废资源化与碳减排分析报告\n"]
    for title, content in populated.items():
        if title in ("用户问题", "任务规划"):
            continue
        lines.append(f"## {title}\n")
        if isinstance(content, dict):
            for k, v in content.items():
                lines.append(f"- **{k}**：{v}")
        else:
            lines.append(str(content))
        lines.append("")
    lines.append("*注：DeepSeek 不可用，本报告为结构化拼接结果，未经模型润色整合。*")
    lines.append("*所有数据与核算结果均为演示用途，正式决策请以专业核算与官方政策为准。*")
    return "\n".join(lines)
