import json
from typing import Dict, Any
from collections import defaultdict
import re
from api.db import create_workflow, create_node, create_edge

VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def extract_vars(config):
    vars_found = set()

    def walk(value):
        if isinstance(value, str):
            for match in VAR_PATTERN.findall(value):
                vars_found.add(match)

        elif isinstance(value, dict):
            for v in value.values():
                walk(v)

        elif isinstance(value, list):
            for v in value:
                walk(v)

    walk(config)
    return sorted(vars_found)



def ingest_workflow(definition):

    # create workflow
    workflow = create_workflow(definition["workflow_id"])
    workflow_id = workflow["id"]

    # create nodes
    node_name_to_id = {}

    for name, node in definition["nodes"].items():
        config = node.get("config", {})
        var_list = extract_vars(config)

        created = create_node(
            workflow_id=workflow_id,
            name=name,             
            node_type=node["type"],
            config=config,
            var_list=var_list
        )


        node_name_to_id[name] = created["id"]

    # create edges
    for edge in definition.get("edges", []):
        create_edge(
            workflow_id=workflow_id,
            from_node=node_name_to_id[edge["from"]],
            to_node=node_name_to_id[edge["to"]]
        )

    return {
        "workflow_id": workflow_id,
        "nodes": node_name_to_id
    }


def ingest_workflow_file(path):
    with open(path) as f:
        return ingest_workflow(json.load(f))
