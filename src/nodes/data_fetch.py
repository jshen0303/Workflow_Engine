from nodes.utils import resolve
from api.db import supabase



def run(config, context):
    query = resolve(config["query"], context)

    res = supabase.rpc("execute_sql", {"query": query}).execute()
    return {
        "id": context["input"]["user_id"],
        "email": f"{res.data}@gmail.com",
        "name":res.data
    }

