# RepoMind

RepoMind is a **local-first developer workspace**. Like MDFV, LineFind and ReCodeX, open the web app, choose a local folder, and work directly with its files in the browser.

## Features

- **Open Folder** using the browser File System Access API
- No repository upload for the core workflow
- Project Intelligence dashboard: file count and file-type composition
- Explorer with file filtering
- LineFind-style search with line numbers
- **Built-in Editor** with line numbers, editing and Save
- **Find/Search foundation** for the editor workflow
- **Developer Tools Hub**: text cleanup, JSON formatter, Base64, regex tester, JWT decoder, UUID and Unix timestamp
- **Diff & Compare** for local text files
- ReCodeX-style combine and reverse split
- Copy/download workflows

## Local development

cd frontend
npm install
npm run dev

Use a current Chrome or Edge browser and click **Open Folder**.

## Deployment direction

The frontend is designed to become a static GitHub Pages application. The Vite build uses the `/RepoMind/` base path.

The FastAPI backend remains available in `backend/` for future optional server-side capabilities. The current browser-first workflow does not require it.

## Privacy model

The selected folder is accessed through the browser's native folder permission. Core scanning, searching and editing happen locally in the browser. Saving requires write permission and browser support for the File System Access API.

## Product direction

**Analyze → Search → Edit → Transform → Compare → Understand → Export**
