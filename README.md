# Lorekeep

Lorekeep is a tool I built to manage my worldbuilding projects and technical notes. It is designed to keep everything in one place with a simple dark interface.

## Features
* **World Atlas**: A map editor to draw and manage world coordinates.
* **Hybrid Sync**: Local-first data with Firebase backup.
* **Electron**: Runs as a desktop application.
* **AI Support**: Integrated with Ollama for local AI help.

## Tech Stack
* React + TypeScript + Vite
* Electron
* Firebase (Firestore)
* Tailwind CSS

## How to run
1. Install dependencies: `npm install`
2. Configuration: Copy `.env.example` to `.env.local` and add your Firebase keys.
3. Run development: `npm run electron:dev`