import os
from uuid import UUID
from typing import Dict, Any, List
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("add to .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

#workflow

def create_workflow(name):
    res = supabase.table("workflows").insert({"name": name}).execute()
    return res.data[0]


def get_workflow(workflow_id):
    res = supabase.table("workflows").select("*").eq("id", str(workflow_id)).single().execute()
    return res.data


def list_workflows():
    return supabase.table("workflows").select("*").execute().data

#nodes

def create_node(workflow_id, name, node_type, config, var_list):
    res = supabase.table("nodes").insert({
        "workflow_id": str(workflow_id),
        "name": name,
        "type": node_type,
        "config": config,
        "var_list": var_list
    }).execute()
    return res.data[0]



def list_nodes(workflow_id):
    return supabase.table("nodes").select("*").eq("workflow_id", str(workflow_id)).execute().data
    

#edges

def create_edge(workflow_id,from_node,to_node):
    res = supabase.table("edges").insert({
        "workflow_id": str(workflow_id),
        "from_node": str(from_node),
        "to_node": str(to_node)
    }).execute()
    return res.data[0]


def list_edges(workflow_id):
    return supabase.table("edges").select("*").eq("workflow_id", str(workflow_id)).execute().data
    

#runs

def create_run(workflow_id):
    res = supabase.table("runs").insert({"workflow_id": str(workflow_id),"status": "pending"}).execute()
    return res.data[0]


def update_run_status(run_id, status):
    supabase.table("runs").update({"status": status}).eq("id", str(run_id)).execute()

def update_run_status(run_id, finished_at):
    supabase.table("runs").update({"finished_at": finished_at}).eq("id", str(run_id)).execute()

# node runs

def create_node_run(run_id,node_id,input):
    res = supabase.table("node_runs").insert({
        "run_id": str(run_id),
        "node_id": str(node_id),
        "input": input,
        "status": "pending"
    }).execute()
    return res.data[0]


def update_node_run(node_run_id: UUID,status: str,output: Dict[str, Any] = {},retries: int = None):
    payload = {"status": status, "output": output}
    if retries is not None:
        payload["retries"] = retries

    supabase.table("node_runs").update(payload).eq("id", str(node_run_id)).execute()


def list_node_runs(run_id):
    return supabase.table("node_runs").select("*").eq("run_id", str(run_id)).execute().data
