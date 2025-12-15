from nodes.utils import resolve



def run(config, context):
    to = resolve(config["to"], context)
    subject = config["subject"]
    template = config["template"]

    return {
        "sent": True
    }
