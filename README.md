# Codebase Workbench

Local-first developer intelligence workbench for analyzing, searching, inspecting, transforming, and understanding codebases.

## Included in this version

- Project scanner and file explorer
- LineFind-style full-project search with line numbers
- Highlighted search matches
- Case-sensitive search option
- Viewer with numbered lines
- Previous / Next occurrence navigation within the currently opened file
- Markdown rendering based on the MDFV renderer approach
- Markdown `Rendered` / `Raw` modes
- Copy and Download actions for viewed files
- ReCodeX-style consolidation
- Copy and Download actions for consolidated output
- Reverse split for consolidated files

## Run

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Viewer behavior

- `.md` files open in **Rendered** mode using `marked` + DOMPurify.
- **Raw** mode shows line numbers and search highlights.
- When a search is active, **Previous** and **Next** move through every occurrence in the current file and keep the active occurrence visually emphasized.
- Search result rows show the matching file and line number.

## Source inspirations

- ReCodeX: consolidation, split, copy/download workflow.
- MDFV: Markdown presentation and typography.
- LineFind: file search, line-numbered results, highlighted matches, and file-level navigation.
