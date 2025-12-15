from nodes.trigger import run as trigger_run
from nodes.data_fetch import run as data_fetch_run
from nodes.api_request import run as api_request_run
from nodes.send_email import run as send_email_run


NODE_EXECUTORS = {
    "trigger": trigger_run,
    "data_fetch": data_fetch_run,
    "api_request": api_request_run,
    "send_email": send_email_run,
}


def run_node(node, context):
    node_type = node["type"]
    config = node["config"]

    if node_type not in NODE_EXECUTORS:
        raise ValueError(f"Unknown node type {node_type}")

    return NODE_EXECUTORS[node_type](config, context)
