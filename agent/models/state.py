# -*- coding: utf-8 -*-
"""
Shared LangGraph state — every agent node reads/writes this single object.
No agent should keep private context outside of this TypedDict; that's
what "共享记忆 / 不要使用独立上下文" in the spec means in practice.
"""
from typing import TypedDict, List, Dict, Any, Optional


class TaskPlan(TypedDict, total=False):
    needs_material: bool
    needs_carbon: bool
    needs_market: bool
    needs_esg: bool
    needs_policy: bool
    reasoning: str


class CarbonState(TypedDict, total=False):
    session_id: str
    user_input: str

    task_plan: TaskPlan
    materials: Dict[str, Any]
    carbon_result: Dict[str, Any]
    market_result: Dict[str, Any]
    esg_result: Dict[str, Any]
    policy_result: Dict[str, Any]

    final_report: str
    chat_history: List[Dict[str, str]]  # [{"role": "user"/"assistant", "content": "..."}]

    # internal bookkeeping (not part of the original spec's minimal schema,
    # but needed so nodes can short-circuit / the graph can route)
    errors: List[str]


def new_state(session_id: str, user_input: str, chat_history: Optional[List[Dict[str, str]]] = None) -> CarbonState:
    return CarbonState(
        session_id=session_id,
        user_input=user_input,
        task_plan={},
        materials={},
        carbon_result={},
        market_result={},
        esg_result={},
        policy_result={},
        final_report="",
        chat_history=chat_history or [],
        errors=[],
    )
