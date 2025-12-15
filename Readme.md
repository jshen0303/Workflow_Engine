1. Create virtual env
cd /Users/jeffshen/Workflow_Engine
python3 -m venv .venv
source ../.venv/bin/activate

2. Install requirements
pip install -r requirements.txt

3. Run API Server
python -m uvicorn api.server:app --reload --port 8000

4. Install and Run frontend
cd /Users/jeffshen/Workflow_Engine/frontend
npm install

cd /Users/jeffshen/Workflow_Engine/frontend
npm run dev