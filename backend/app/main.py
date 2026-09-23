from pathlib import Path
from typing import Optional
import fnmatch
import json
import re
import zipfile
import io

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

app = FastAPI(title="Codebase Workbench API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

TEXT_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".vue", ".py", ".java", ".kt", ".go", ".rs", ".php", ".cs", ".cpp", ".c", ".h", ".html", ".css", ".scss", ".json", ".md", ".txt", ".xml", ".yaml", ".yml", ".sql", ".sh", ".bat", ".ps1", ".env"}
IGNORE_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".idea", ".vscode"}

class ScanRequest(BaseModel):
    root: str

class SearchRequest(BaseModel):
    root: str
    query: str
    regex: bool = False
    case_sensitive: bool = False
    extensions: list[str] = []
    max_results: int = 200

class CompileRequest(BaseModel):
    files: list[dict]

class SplitRequest(BaseModel):
    content: str


def safe_path(root: str, rel: str) -> Path:
    base = Path(root).resolve()
    target = (base / rel).resolve()
    if base != target and base not in target.parents:
        raise HTTPException(400, "Path escapes project root")
    return target


def iter_files(root: Path):
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, f"Project directory does not exist: {root}")
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in IGNORE_DIRS for part in p.parts):
            continue
        yield p


def is_text(p: Path):
    return p.suffix.lower() in TEXT_EXTENSIONS or p.name in {"Dockerfile", "Makefile", ".gitignore"}

@app.get("/health")
def health():
    return {"status": "ok", "product": "Codebase Workbench"}

@app.post("/scan")
def scan(req: ScanRequest):
    root = Path(req.root).expanduser().resolve()
    files = []
    languages = {}
    total_bytes = 0
    for p in iter_files(root):
        try:
            size = p.stat().st_size
        except OSError:
            continue
        rel = str(p.relative_to(root)).replace("\\", "/")
        ext = p.suffix.lower() or "[no extension]"
        total_bytes += size
        languages[ext] = languages.get(ext, 0) + 1
        files.append({"path": rel, "size": size, "extension": ext, "text": is_text(p)})
    return {"project": {"name": root.name, "root": str(root)}, "files": files, "statistics": {"files": len(files), "bytes": total_bytes, "extensions": languages}}

@app.get("/file")
def read_file(root: str, path: str):
    p = safe_path(root, path)
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "File not found")
    if not is_text(p):
        raise HTTPException(415, "Binary or unsupported file type")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        raise HTTPException(500, str(e))
    return {"path": path, "content": content}

@app.post("/search")
def search(req: SearchRequest):
    root = Path(req.root).expanduser().resolve()
    flags = 0 if req.case_sensitive else re.IGNORECASE
    try:
        pattern = re.compile(req.query, flags) if req.regex else None
    except re.error as e:
        raise HTTPException(400, f"Invalid regex: {e}")
    wanted = {x.lower() if x.startswith('.') else '.' + x.lower() for x in req.extensions}
    results = []
    for p in iter_files(root):
        if not is_text(p) or (wanted and p.suffix.lower() not in wanted):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            hit = bool(pattern.search(line)) if pattern else ((req.query in line) if req.case_sensitive else (req.query.lower() in line.lower()))
            if hit:
                results.append({"path": str(p.relative_to(root)).replace("\\", "/"), "line": n, "text": line[:1000]})
                if len(results) >= req.max_results:
                    return {"results": results, "truncated": True}
    return {"results": results, "truncated": False}

@app.post("/compile")
def compile_files(req: CompileRequest):
    chunks = []
    for item in req.files:
        name = str(item.get("name", "unnamed"))
        content = str(item.get("content", ""))
        chunks.append(f"/* --- Start of file: {name} --- */\n{content}\n/* --- End of file: {name} --- */")
    return {"content": "\n\n".join(chunks)}

@app.post("/split")
def split_files(req: SplitRequest):
    pattern = re.compile(r"/\* --- Start of file: (.*?) --- \*/\n(.*?)\n/\* --- End of file: \\1 --- \*/", re.S)
    matches = pattern.findall(req.content)
    return {"files": [{"name": name, "content": content} for name, content in matches], "count": len(matches)}

@app.post("/export/zip")
def export_zip(req: CompileRequest):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for item in req.files:
            z.writestr(str(item.get("name", "unnamed")), str(item.get("content", "")))
        compiled = "\n\n".join(f"/* --- Start of file: {i.get('name','unnamed')} --- */\n{i.get('content','')}\n/* --- End of file: {i.get('name','unnamed')} --- */" for i in req.files)
        z.writestr("compiled_output.txt", compiled)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=codebase-workbench-export.zip"})

@app.post("/report")
def report(req: ScanRequest):
    data = scan(req)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Codebase Workbench Report</title><style>body{{font:14px system-ui;max-width:1100px;margin:40px auto;padding:0 20px}}pre{{background:#f5f5f5;padding:16px;overflow:auto}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:8px;text-align:left}}</style></head><body><h1>{data['project']['name']}</h1><p>Generated by Codebase Workbench.</p><h2>Statistics</h2><pre id="stats"></pre><h2>Files</h2><table><thead><tr><th>Path</th><th>Size</th><th>Type</th></tr></thead><tbody id="files"></tbody></table><script>const data={payload};document.querySelector('#stats').textContent=JSON.stringify(data.statistics,null,2);document.querySelector('#files').innerHTML=data.files.map(f=>`<tr><td>${f.path}</td><td>${f.size}</td><td>${f.extension}</td></tr>`).join('')</script></body></html>'''
    return Response(content=html, media_type="text/html")
