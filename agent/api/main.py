# -*- coding: utf-8 -*-
"""
Agent Gateway — FastAPI service exposing the four endpoints the spec asks
for. Runs as its OWN process (separate from the Flask backend, per the
"Flask stays as-is, Agent Service sits alongside it" decision), default
port 8100. The Flask app proxies /api/agent/* to this service so the
frontend still only ever talks to one origin (see backend/app.py).

Run:  uvicorn agent.api.main:app --host 0.0.0.0 --port 8100
"""
import logging
import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agent.api.schemas import (
    ChatRequest, ChatResponse,
    ReportRequest, ReportResponse,
    ProjectAnalysisRequest, ProjectAnalysisResponse,
    HistoryResponse, HistoryItem,
)
from agent.graph.workflow import run_workflow
from agent.memory.store import MemoryStore
from agent.tools.db_tools import DB_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent.api")

app = FastAPI(title="碳循景 Agent Gateway", version="1.0.0")

# The Flask backend proxies requests same-origin, but CORS is left open here
# too so the agent service can also be hit directly during development.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

memory = MemoryStore()


def _find_project(project_id=None, project_name=None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if project_id is not None:
            row = conn.execute("SELECT * FROM map_projects WHERE id=?", (project_id,)).fetchone()
        elif project_name:
            row = conn.execute(
                "SELECT * FROM map_projects WHERE name LIKE ? LIMIT 1", (f"%{project_name}%",)
            ).fetchone()
        else:
            row = None
        return dict(row) if row else None
    finally:
        conn.close()


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    history = [{"role": h.get("role"), "content": h.get("content")} for h in _history_as_chat(req.session_id)]
    state = run_workflow(req.session_id, req.message, chat_history=history, want_report=False)

    # a short conversational reply, not the full report — the full report
    # lives behind /report for when the user actually wants one
    reply_parts = []
    if state.get("materials"):
        reply_parts.append(f"资源化建议：{state['materials'].get('resourcing_plan', '')}")
    if state.get("carbon_result"):
        cr = state["carbon_result"]
        reply_parts.append(f"预估碳减排：约 {cr.get('co2_reduction_tons')} tCO2e（{cr.get('green_points')} 绿色积分）。")
    if state.get("policy_result"):
        reply_parts.append(state["policy_result"].get("possible_subsidies", ""))
    reply = "\n".join(p for p in reply_parts if p) or "已收到问题，但未能生成具体分析，请换一种方式描述你的问题。"

    memory.write(req.session_id, f"用户: {req.message}", kind="chat")
    memory.write(req.session_id, f"助手: {reply}", kind="chat")

    return ChatResponse(
        session_id=req.session_id,
        reply=reply,
        task_plan=state.get("task_plan", {}),
        materials=state.get("materials", {}),
        carbon_result=state.get("carbon_result", {}),
        market_result=state.get("market_result", {}),
        esg_result=state.get("esg_result", {}),
        policy_result=state.get("policy_result", {}),
    )


@app.post("/report", response_model=ReportResponse)
def report(req: ReportRequest):
    state = run_workflow(req.session_id, req.message, want_report=True)
    memory.write(req.session_id, f"报告请求: {req.message}\n\n{state['final_report']}", kind="report")
    return ReportResponse(session_id=req.session_id, report_markdown=state["final_report"])


@app.post("/project-analysis", response_model=ProjectAnalysisResponse)
def project_analysis(req: ProjectAnalysisRequest):
    project = _find_project(req.project_id, req.project_name)
    if not project:
        raise HTTPException(status_code=404, detail="未在数据库中找到该项目")

    question = req.question or (
        f"请分析项目「{project['name']}」（{project.get('district', '')}）的资源化利用情况、"
        f"碳减排表现与后续建议，该项目已处理固废 {project.get('waste_amount', 0)} 吨，"
        f"再生材料 {project.get('recycled_material', 0)} 吨，已产生碳减排 {project.get('carbon_reduction', 0)} tCO2e。"
    )
    state = run_workflow(req.session_id, question, want_report=True)
    memory.write(req.session_id, f"项目分析: {project['name']}\n\n{state['final_report']}", kind="project_analysis")

    return ProjectAnalysisResponse(
        session_id=req.session_id, project=project, report_markdown=state["final_report"]
    )


@app.get("/history", response_model=HistoryResponse)
def history(session_id: str):
    records = memory.history(session_id)
    return HistoryResponse(
        session_id=session_id,
        items=[
            HistoryItem(id=r.id, session_id=r.session_id, content=r.content, kind=r.kind, created_at=str(r.created_at))
            for r in records
        ],
    )


def _history_as_chat(session_id: str, limit: int = 10):
    records = memory.history(session_id, limit=limit)
    out = []
    for r in records:
        if r.kind != "chat":
            continue
        role = "user" if r.content.startswith("用户:") else "assistant"
        out.append({"role": role, "content": r.content.split(":", 1)[-1].strip()})
    return out


@app.get("/health")
def health():
    return {"status": "ok"}
