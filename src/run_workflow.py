import sys
from pathlib import Path


SRC_ROOT = Path(__file__).resolve().parent
sys.path.append(str(SRC_ROOT))
from engine.process import ingest_workflow_file
from engine.executor import execute_workflow

def main():
    workflow_path = SRC_ROOT / "workflows" / "parallel.json"

    print("\n==============================")
    print("🚀 START WORKFLOW RUN")
    print("==============================\n")

    print("📥 INGESTING WORKFLOW")
    print(f"   Path: {workflow_path}\n")

    ingest_result = ingest_workflow_file(str(workflow_path))
    workflow_id = ingest_result["workflow_id"]

    print("✅ Workflow ingested")
    print(f"   workflow_id = {workflow_id}")
    print(f"   nodes = {ingest_result['nodes']}\n")

 
    print("⚙️  EXECUTING WORKFLOW\n")

    trigger_input = {
        "user_id": 42
    }

    print(f"➡️  Trigger input: {trigger_input}\n")

    final_context = execute_workflow(
        workflow_id=workflow_id,
        trigger_input=trigger_input
    )

    print("\n==============================")
    print("✅ WORKFLOW COMPLETE")
    print("==============================\n")

    print("🧠 FINAL CONTEXT:")
    for k, v in final_context.items():
        print(f"  {k}: {v}")

    print("\n🎉 End-to-end run successful")

if __name__ == "__main__":
    main()
