from nodes.utils import resolve



def run(config, context):
    query = resolve(config["query"], context)

    print(f"[DataFetch] executing query:")
    print(query)

    return {
        "id": 123,
        "email": "user@example.com",
        "name": "Test User"
    }
