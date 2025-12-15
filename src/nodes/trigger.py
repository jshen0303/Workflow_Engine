def run(config, context):
    print("[Trigger] workflow started")
    return context.get("input", {})
