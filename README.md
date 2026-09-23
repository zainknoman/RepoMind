# Codebase Workbench

Local-first developer intelligence workbench: scan, search, inspect, combine/split files, generate documentation, and export a project report.

## Requirements
- Python 3.11+
- Node.js 20+

## Run

### Windows PowerShell
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In another terminal:
```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## CLI-style API
The UI calls the local FastAPI backend. A project is scanned from an absolute local path.

This is an MVP foundation. It deliberately avoids destructive filesystem writes; combine/split/download operations are generated in memory.
