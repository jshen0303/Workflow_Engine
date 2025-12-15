from nodes.utils import resolve



def run(config, context):
    to = resolve(config["to"], context)
    subject = config["subject"]
    template = config["template"]

    print("[SendEmail]")
    print(f"  to={to}")
    print(f"  subject={subject}")
    print(f"  template={template}")

    return {
        "sent": True
    }
