# -*- coding: utf-8 -*-
"""
LangGraph workflow. Sequential edges (Carbon needs Material's output, Report
needs everything), but each node after Planner checks its own flag in
state["task_plan"] and no-ops (returns {}) if the Planner decided it isn't
needed — so an unnecessary agent still "runs" (cheap, no LLM call) but
contributes nothing to state or latency-heavy work.

Graph:
    planner -> material -> carbon -> market -> esg -> policy -> report -> END
"""
import logging
from langgraph.graph import StateGraph, END

from agent.models.state import CarbonState, new_state
from agent.agents.planner_agent import planner_node
from agent.agents.material_agent import material_node
from agent.agents.carbon_agent import carbon_node
from agent.agents.market_agent import market_node
from agent.agents.esg_agent import esg_node
from agent.agents.policy_agent import policy_node
from agent.agents.report_agent import report_node

logger = logging.getLogger("agent.graph")


def build_graph():
    graph = StateGraph(CarbonState)

    graph.add_node("planner", planner_node)
    graph.add_node("material", material_node)
    graph.add_node("carbon", carbon_node)
    graph.add_node("market", market_node)
    graph.add_node("esg", esg_node)
    graph.add_node("policy", policy_node)
    graph.add_node("report", report_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "material")
    graph.add_edge("material", "carbon")
    graph.add_edge("carbon", "market")
    graph.add_edge("market", "esg")
    graph.add_edge("esg", "policy")
    graph.add_edge("policy", "report")
    graph.add_edge("report", END)

    return graph.compile()


_compiled_graph = None


def get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph


def run_workflow(session_id: str, user_input: str, chat_history=None, want_report: bool = True) -> CarbonState:
    state = new_state(session_id=session_id, user_input=user_input, chat_history=chat_history)
    result = get_graph().invoke(state)
    if not want_report:
        result["final_report"] = ""
    return result
