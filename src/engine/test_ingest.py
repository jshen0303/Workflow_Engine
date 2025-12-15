import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from engine.process import ingest_workflow_file

workflow_path = Path(__file__).resolve().parents[1] / "workflows" / "test_workflow.json"

result = ingest_workflow_file(str(workflow_path))
print(result)
