1. Create virtual env
```bash
cd /Users/jeffshen/Workflow_Engine
python3 -m venv .venv
source ../.venv/bin/activate
```
2. Install requirements
```bash
pip install -r requirements.txt
```
3. Run API Server
```bash
python -m uvicorn api.server:app --reload --port 8000
```
4. Install and Run frontend
```bash
cd /Users/jeffshen/Workflow_Engine/frontend
npm install
```
```bash
cd /Users/jeffshen/Workflow_Engine/frontend
npm run dev
```
