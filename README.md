## **# Lorekeep**

A personal archive for managing worldbuilding projects and technical manifests. One interface, no distractions.

---

### **## Features**
*   **World Atlas**: Map editor for coordinate management.
*   **Hybrid Sync**: Local-first logic with Firebase cloud backup.
*   **Desktop Core**: Runs as a dedicated desktop environment via Electron.
*   **Neural Shards**: Local AI assistance powered by Ollama integration.

### **## The Engine (Tech Stack)**
*   **Frontend**: React + TypeScript + Vite.
*   **Shell**: Electron.
*   **Archive**: Firebase Firestore.
*   **Style**: Tailwind CSS.

---

### **## How to run**

1.  **Initialize**: Install the dependencies.
    `npm install`
2.  **Bind**: Clone `.env.example` to `.env.local` and inject your Firebase keys.
3.  **Launch**: Run the development engine.
    `npm run electron-dev`