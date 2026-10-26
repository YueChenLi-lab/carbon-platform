# 碳循景 · 建筑固废循环利用数字化平台 + Agent Layer（Demo）

建筑固废资源化利用 → 再生材料 → 低碳产品 → 碳减排量化 → 产品碳身份证 → 个人碳账户 → 企业 ESG 数据
**+ 基于 LangGraph + DeepSeek 的多智能体决策层（新增）**

## 本次升级做了什么 / 没做什么

**保留不变**：现有 Flask 后端、全部原有 API、SQLite 表结构（`products` / `map_projects` /
`carbon_ledger`）、全部原有前端页面。原有系统作为独立可运行的 CRUD + Dashboard 完全不受影响。

**新增**：一个独立的 Python + LangGraph **Agent 服务**（`/agent`），通过 Flask 新增的
`/api/agent/*` 代理路由接入现有系统；前端新增一个「Agent 助手」页面（`#/agent`）。数据库只新增了
一张 `memory_store` 表，没有修改任何现有表。

架构选择说明：选择**保留 Flask 不动，把 Agent 能力做成旁挂的独立 Python 服务**，而不是把整个后端重写成 Java —— 后者风险和
工作量都大得多，也更容易在迁移过程中破坏现有功能。如果后续确实需要 SpringBoot，可以在这个
Agent 服务稳定之后，作为独立的第二阶段迁移单独进行。

```
React (frontend/app.js, 新增 #/agent 页面)
        │  同源 fetch("/api/...")
        ▼
Flask (backend/app.py, 原有 API 保持不变)
        │  新增：/api/agent/* 代理转发
        ▼
Agent Gateway — FastAPI (agent/api/main.py, 独立进程, 默认 8100 端口)
        │
        ▼
LangGraph Workflow (agent/graph/workflow.py)
   Planner → Material → Carbon → Market → ESG → Policy → Report
        │                                              │
        ▼                                              ▼
   Shared State (CarbonState)              memory_store 长期记忆 + FAISS 语义召回
        │
        ▼
   LLMService (agent/llm/service.py) ── 唯一允许调用 DeepSeek API 的地方
        │
        ▼
   DeepSeek Chat API
```

## 目录结构

```
carbon-platform/
├── backend/                  # 原有 Flask 后端（未删除任何功能，新增 agent 代理路由）
│   ├── app.py
│   ├── seed.py
│   ├── requirements.txt      # 新增 requests 依赖（用于代理转发）
│   └── carbon.db
├── frontend/                  # 原有前端（新增 Agent 助手页面 + 导航入口）
│   ├── index.html            # 新增 marked.js / DOMPurify（渲染 Agent 报告 Markdown）
│   ├── app.js
│   └── style.css
└── agent/                     # 新增：Agent Layer，独立 Python 服务
    ├── graph/                 # LangGraph 工作流编排
    ├── agents/                # 7 个独立 Agent 文件（每个 Agent 单独一个文件）
    ├── memory/                 # memory_store 长期记忆 + 语义召回
    ├── rag/                   # 知识库（4 类）+ Embedding + FAISS 索引
    │   └── knowledge/          # 建筑垃圾 / 碳核算 / ESG / 政策 知识库 markdown 原文
    ├── llm/                    # LLMService — 唯一允许调用 DeepSeek 的地方
    ├── tools/                  # Agent 可用的只读数据库工具（不改动现有表）
    ├── api/                    # FastAPI Agent Gateway
    ├── models/                 # CarbonState 共享记忆 schema
    ├── requirements.txt
    ├── .env.example
    └── run.py
```

## 启动方式

### 1. 原有后端（不受影响，照常启动）

```bash
cd backend
pip install -r requirements.txt
python app.py
```
浏览器打开 http://localhost:8000 —— 原有全部页面和 API 完全照常工作，即使 Agent 服务没启动。

### 2. 新增：Agent 服务

```bash
cd agent
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY（不要提交到代码仓库）
cd ..                                  # 回到 carbon-platform/ 根目录 —— 很重要，见下方说明
pip install -r agent/requirements.txt
python -m agent.run                    # 默认监听 8100 端口
```

> **为什么要从根目录启动**：`agent/` 下所有模块都用绝对导入（如
> `from agent.llm.service import llm_service`），必须让 `carbon-platform/` 在
> Python 路径里，所以用 `python -m agent.run`（或 `uvicorn agent.api.main:app`）
> 从根目录启动，而不是 `cd agent && python run.py`。

Flask 通过 `AGENT_SERVICE_URL` 环境变量（默认 `http://localhost:8100`）转发
`/api/agent/*` 请求到这个服务，所以启动顺序是：先起 Agent 服务，再起（或保持）Flask。
Agent 服务没启动时，`/api/agent/*` 会返回 503 而不是报错崩溃，其余原有页面/API 不受影响。

### 关于 Embedding 模型（bge-large-zh）

`agent/rag/embeddings.py` 优先加载 `sentence-transformers` + `BAAI/bge-large-zh`；如果
环境没装这个依赖或没有网络下载模型权重（**本沙箱环境本身就没有出网权限**，代码已经过
语法检查但未在真实网络环境下端到端跑通），会自动降级为一个确定性的哈希向量兜底方案，
保证 RAG 检索和长期记忆召回在离线环境下依然可运行，只是语义效果会明显弱一些。生产环境
请安装 `sentence-transformers` 并确保能下载模型权重（或换成本地已有的 BCE Embedding）。

### 新增 API（经 Flask 代理，前端只需要请求这些同源路径）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/agent/chat` | Agent 聊天入口，`{session_id, message}` |
| POST | `/api/agent/report` | 生成完整 Markdown 报告，`{session_id, message}` |
| POST | `/api/agent/project-analysis` | 针对某个循环地图项目生成分析报告，`{session_id, project_id}` |
| GET | `/api/agent/history?session_id=` | 查询该会话的历史记录（含语义召回用的 memory_store） |

### 前端新增页面

`#/agent` —— 「聊天 / 项目分析 / 综合报告 / 历史记录」四个标签页，全部通过上面这几个
API 驱动，报告以 Markdown 渲染。导航栏已加入入口。

## 已知限制

- 所有代码经过了 Python 语法检查 （`py_compile` / `ast.parse` 全部通过）和 JS 括号平衡检查，但**没有**安装
  `langgraph` / `faiss` / `sentence-transformers` 等依赖做端到端联调，真实的deepseek的API橱窗者已跑通但现在已删除。
- 第一次本地启动时如果报依赖缺失或接口签名问题（比如 LangGraph 版本升级导致的 API 变化），属于正常情况， 请对照报错调整。
- 碳核算公式（`agent/agents/carbon_agent.py` 里的三个系数）是演示用途的经验区间， 不是核证减排量，已在多处文案里注明。
- Report Agent 目前只输出 Markdown，PDF 导出留作后续（可以直接接现有的 `pdf` 技能/工具链）。
- 政策 / ESG 知识库是精简摘要，不是官方原文全文，正式使用前需要替换成完整、可追溯来源的文档。

