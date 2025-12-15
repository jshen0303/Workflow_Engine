from nodes.utils import resolve



def run(config, context):
    url = resolve(config["url"], context)
    method = config.get("method", "GET")
    body = resolve(config.get("body", {}), context)

    return {
        "status": "ok",
        "score": 0.87
    }
