from nodes.utils import resolve



def run(config, context):
    url = resolve(config["url"], context)
    method = config.get("method", "GET")
    body = resolve(config.get("body", {}), context)

    print(f"[APIRequest] {method} {url}")
    print(f"[APIRequest] body = {body}")

    return {
        "status": "ok",
        "score": 0.87
    }
