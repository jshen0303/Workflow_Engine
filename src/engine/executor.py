from typing import Dict
from uuid import UUID

from api.db import (
    create_run,
    update_run_status,
    create_node_run,
    update_node_run,
    list_nodes,
    list_edges,
)
from engine.worker import run_node
from concurrent.futures import ThreadPoolExecutor, as_completed



def execute_workflow(workflow_id, trigger_input):
    #ccreate run following the api.db method
    run = create_run(workflow_id)
    run_id = run["id"]

    update_run_status(run_id, "running")

    #add to exec context, this will build w nodes
    context = {
        "input": trigger_input
    }

    nodes = list_nodes(workflow_id)
    edges = list_edges(workflow_id)

    id_to_name = {node["id"]: node["name"] for node in nodes}

    parents = {}
    for e in edges:
        parents.setdefault(e["to_node"], set()).add(e["from_node"]) #C: {A,B}

    completed = set()

    try:
        while True:
            runnable = []

            for node in nodes:
                nid = node["id"]
                if nid in completed:
                    continue

                parent_ids = parents.get(nid, set())
                if parent_ids.issubset(completed):
                    runnable.append(node)

            if not runnable:
                break

            # snapshot context for concurrency
            context_snapshot = dict(context)

            futures = {}

            with ThreadPoolExecutor(max_workers=len(runnable)) as executor: # we use max workers as len of runnable so all processes can run at same time
                for node in runnable:
                    node_id = node["id"]

                    node_run = create_node_run(
                        run_id=run_id,
                        node_id=node_id,
                        input=context_snapshot
                    )

                    update_node_run(
                        node_run_id=node_run["id"],
                        status="running"
                    )

                    future = executor.submit(run_node, node, context_snapshot)
                    futures[future] = (node, node_run)
                    

                for future in as_completed(futures):
                    node, node_run = futures[future]
                    node_id = node["id"]

                    output = future.result()

                    update_node_run(
                        node_run_id=node_run["id"],
                        status="success",
                        output=output
                    )

                    node_name = id_to_name[node_id]
                    context[node_name] = output
                    completed.add(node_id)


        update_run_status(run_id, "success")
        return context

    except Exception as e:
        update_run_status(run_id, "failed")
        raise
