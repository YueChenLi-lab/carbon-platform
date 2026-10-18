# -*- coding: utf-8 -*-
"""
Entrypoint for the Agent Gateway.

Run from the carbon-platform/ REPO ROOT (not from inside agent/), because
every module here does absolute imports like `from agent.llm.service import
...` -- that only resolves if `carbon-platform/` is on the Python path,
which is what running it as `agent.run` (or `agent.api.main`) from the
root gives you for free.

    cd carbon-platform
    python -m agent.run
    # or directly:
    uvicorn agent.api.main:app --host 0.0.0.0 --port 8100 --reload

Loads .env (copy agent/.env.example -> agent/.env first) if python-dotenv
is installed; otherwise export the variables manually before running.
"""
import os

try:
    from dotenv import load_dotenv  # noqa: WPS433
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent.api.main:app", host="0.0.0.0", port=int(os.environ.get("AGENT_PORT", 8100)), reload=False)
