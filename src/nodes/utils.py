import re

VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def resolve(value, context):
    if isinstance(value, str):
        def replacer(match):
            path = match.group(1).split(".")
            cur = context
            for p in path:
                cur = cur[p]
            return str(cur)

        return VAR_PATTERN.sub(replacer, value)

    if isinstance(value, dict):
        return {k: resolve(v, context) for k, v in value.items()}

    if isinstance(value, list):
        return [resolve(v, context) for v in value]

    return value
