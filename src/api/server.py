from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from uuid import UUID
from datetime import datetime
import sys
from pathlib import Path

from engine.executor import execute_workflow
from engine.process import ingest_workflow
from engine.process import ingest_workflow_file
from api.db import (
    list_node_runs,
    list_nodes,
)
from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

class ExecuteRequest(BaseModel):
    workflow: str
    input: Dict[str, Any]


class ExecuteResponse(BaseModel):
    execution_id: UUID
    workflow_id: UUID
    status: str
    started_at: datetime

SRC_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(SRC_ROOT))
jobs = []


@app.post("/execute", status_code=202, response_model=ExecuteResponse)
def execute_workflow_api(req: ExecuteRequest, background_tasks: BackgroundTasks):
    #ingest
    s = req.workflow
    workflow_path = SRC_ROOT / "workflows" / f"{s}.json"
    ingest_result = ingest_workflow_file(str(workflow_path))
    workflow_id = ingest_result["workflow_id"]

    #create run
    run = supabase.table("runs").insert({"workflow_id": str(workflow_id), "status": "pending"}).execute().data[0]
    
    #execute
    background_tasks.add_task(
        execute_workflow,
        workflow_id=workflow_id,
        trigger_input=req.input,
        run_id=run["id"],
    )

    return {
        "execution_id": run["id"],
        "workflow_id": workflow_id,
        "status": run["status"],
        "started_at": run["created_at"],
    }

@app.get("/executions/{execution_id}")
def get_execution(execution_id: UUID):
    run_res = supabase.table("runs").select("*").eq("id", str(execution_id)).single().execute()

    if not run_res.data:
        raise HTTPException(status_code=404, detail="Execution not found")

    run = run_res.data

    node_runs = list_node_runs(execution_id)
    nodes = list_nodes(run["workflow_id"])

    node_id_to_name = {n["id"]: n["name"] for n in nodes}

    node_results = {}

    for nr in node_runs:
        name = node_id_to_name[nr["node_id"]]

        node_results[name] = {
            "status": nr["status"],
            "attempts": nr["retries"] + 1,
            "output": nr["output"] if nr["status"] == "success" else None,
            "error": nr["output"].get("error") if nr["status"] == "failed" else None,
        }

    statuses = {nr["status"] for nr in node_runs}
    if "running" in statuses or "pending" in statuses:
        overall = "running"
    elif "failed" in statuses:
        overall = "partial"
    else:
        overall = "completed"

    return {
        "execution_id": run["id"],
        "workflow_id": run["workflow_id"],
        "status": overall,
        "started_at": run["created_at"],
        "completed_at": run.get("finished_at"),
        "nodes": node_results,
    }

@app.get("/health")
def health():
    active = supabase.table("runs").select("id", count="exact").eq("status", "running").execute().count
    

    return {
        "status": "healthy",
        "active_executions": active,
    }




