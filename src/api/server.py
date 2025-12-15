from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List
from uuid import UUID
from datetime import datetime
import sys
import json
from pathlib import Path

from engine.executor import execute_workflow
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/workflows")
def list_workflows_api():
    #get the workflows
    workflows_dir = SRC_ROOT / "workflows"
    workflows = []
    
    for f in workflows_dir.glob("*.json"):
        with open(f) as file:
            data = json.load(file)
            workflows.append({
                "name": f.stem,
                "workflow_id": data.get("workflow_id", f.stem),
                "node_count": len(data.get("nodes", {})),
                "edge_count": len(data.get("edges", []))
            })
    
    return {"workflows": workflows}


@app.get("/workflows/{workflow_name}")
def get_workflow_api(workflow_name: str): #get workflow def w nodes and edges
    
    workflow_path = SRC_ROOT / "workflows" / f"{workflow_name}.json"
    
    if not workflow_path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    with open(workflow_path) as f:
        data = json.load(f)
    
    return {
        "name": workflow_name,
        "workflow_id": data.get("workflow_id", workflow_name),
        "nodes": data.get("nodes", {}),
        "edges": data.get("edges", [])
    }


class CreateWorkflowRequest(BaseModel):
    name: str
    workflow: Dict[str, Any]


@app.post("/workflows", status_code=201)
def create_workflow_api(req: CreateWorkflowRequest):
    #validate name
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Workflow name is required")
    
    name = req.name.strip().replace(" ", "_").lower()
    workflow_path = SRC_ROOT / "workflows" / f"{name}.json"
    
    if workflow_path.exists():
        raise HTTPException(status_code=400, detail="Workflow with this name already exists")
    
    #validate workflow has nodes+edges
    if "nodes" not in req.workflow:
        raise HTTPException(status_code=400, detail="Workflow must have 'nodes'")
    if "edges" not in req.workflow:
        raise HTTPException(status_code=400, detail="Workflow must have 'edges'")
    
    workflow_data = req.workflow.copy()
    if "workflow_id" not in workflow_data:
        workflow_data["workflow_id"] = name
    
    #save to file
    with open(workflow_path, "w") as f:
        json.dump(workflow_data, f, indent=2)
    
    return {
        "name": name,
        "workflow_id": workflow_data["workflow_id"],
        "node_count": len(workflow_data.get("nodes", {})),
        "edge_count": len(workflow_data.get("edges", []))
    }
