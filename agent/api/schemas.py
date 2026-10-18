# -*- coding: utf-8 -*-
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    task_plan: Dict[str, Any]
    materials: Dict[str, Any] = {}
    carbon_result: Dict[str, Any] = {}
    market_result: Dict[str, Any] = {}
    esg_result: Dict[str, Any] = {}
    policy_result: Dict[str, Any] = {}


class ReportRequest(BaseModel):
    session_id: str
    message: str


class ReportResponse(BaseModel):
    session_id: str
    report_markdown: str


class ProjectAnalysisRequest(BaseModel):
    session_id: str
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    question: Optional[str] = None


class ProjectAnalysisResponse(BaseModel):
    session_id: str
    project: Dict[str, Any]
    report_markdown: str


class HistoryItem(BaseModel):
    id: int
    session_id: str
    content: str
    kind: str
    created_at: str


class HistoryResponse(BaseModel):
    session_id: str
    items: List[HistoryItem]
