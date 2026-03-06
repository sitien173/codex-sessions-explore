# Codex Session Explorer --- System Design

## Overview

The **Codex Session Explorer** is a lightweight developer tool that
allows users to browse and inspect recorded Codex coding agent sessions
stored as JSONL archives.

The system provides:

-   Session browsing
-   Session filtering
-   Full-text search across sessions
-   Session event timeline viewer
-   Optional live updates

The design prioritizes:

-   simplicity
-   fast UI
-   minimal infrastructure
-   easy deployment

No database is required.

------------------------------------------------------------------------

# Architecture

    Codex Session Logs (JSONL)
            │
            ▼
    Index Builder Script
            │
            ├── sessions.json
            └── search_index.json
            │
            ▼
    Session Explorer UI (React)
            │
            ├── Filter sessions
            ├── Full-text search
            └── View session events

Optional live update system:

    JSONL logs
        │
        ▼
    File Watcher
        │
        ▼
    WebSocket Server
        │
        ▼
    Frontend UI auto refresh

------------------------------------------------------------------------

# Data Source

## JSONL Session Logs

Each session is stored as a **JSONL file**.

Example structure:

    logs/
      2026/
        03/
          02/
            rollout-2026-03-02T14-50-22.jsonl

Each line represents an event.

Example event:

``` json
{
  "timestamp": "2026-03-02T14:50:23Z",
  "type": "user",
  "content": "Fix docker build"
}
```

Event types may include:

-   user
-   assistant
-   tool
-   patch
-   result
-   error

------------------------------------------------------------------------

# Index Builder

To avoid parsing all JSONL files in the browser, a small script scans
logs and generates metadata indexes.

Example command:

``` bash
npm run build-index
```

or

``` bash
cargo run index
```

The script scans:

    logs/**/*.jsonl

and generates metadata files.

------------------------------------------------------------------------

# sessions.json

`sessions.json` contains metadata for each session.

Example:

``` json
[
  {
    "id": "019cad92",
    "project": "uploady-app",
    "created_at": "2026-03-02T15:03:00",
    "last_message": "2026-03-02T15:05:00",
    "entries": 8,
    "duration_sec": 120,
    "file": "logs/2026/03/02/rollout-2026-03-02T14-50-22.jsonl"
  }
]
```

Fields:

  Field          Description
  -------------- ----------------------------
  id             session id
  project        project name
  created_at     session start time
  last_message   timestamp of last event
  entries        number of events
  duration_sec   session duration
  file           path to JSONL session file

Purpose:

-   session explorer
-   filtering
-   sorting

------------------------------------------------------------------------

# search_index.json

Used for **full-text search across sessions**.

Example:

``` json
[
  {
    "session_id": "019cad92",
    "text": "task 3 persistence CoreData implementation apply_patch"
  },
  {
    "session_id": "019cad86",
    "text": "fix docker build error"
  }
]
```

Searchable fields may include:

-   user prompts
-   assistant responses
-   tool commands
-   file names
-   error messages

The UI loads this file and builds an in-memory search index.

Recommended library:

    MiniSearch

Search latency is typically **\<5ms** for thousands of sessions.

------------------------------------------------------------------------

# Frontend Application

The Session Explorer UI is built using:

    React
    Vite
    TailwindCSS

Optional UI components:

    shadcn/ui

------------------------------------------------------------------------

# UI Pages

## Session Explorer

Main dashboard displaying session cards.

Example card:

    Project: uploady-app
    Created: Mar 2 15:03
    Last message: Mar 2 15:05
    Entries: 8

Features:

-   filter sessions
-   search sessions
-   sort sessions
-   open session viewer

------------------------------------------------------------------------

## Filters

Supported filters:

  Filter          Description
  --------------- -----------------------
  Project         filter by project
  Creation date   filter by date range
  Last message    sort by last activity
  Entry count     filter large sessions

Example UI:

    Project [ uploady-app ▼ ]
    Created [ Mar 1 → Mar 6 ]
    Sort by [ Last message ▼ ]

------------------------------------------------------------------------

## Full-Text Search

Search across sessions using the search index.

Example:

    Search: docker build

Matching sessions are returned instantly.

Search queries may match:

-   prompts
-   tool commands
-   file names
-   assistant messages

------------------------------------------------------------------------

# Session Viewer

When a session is selected, the UI loads the session JSONL file and
renders the timeline.

Example:

    Session: 019cad92

    [14:50:23] USER
    Fix docker build

    [14:50:25] ASSISTANT
    Let's inspect Dockerfile

    [14:50:26] TOOL
    grep Dockerfile

Optional feature:

    ▶ Replay session

Events appear sequentially to simulate the agent workflow.

------------------------------------------------------------------------

# Performance Strategy

Important design rule:

**Do not parse all JSONL files in the browser.**

Instead:

    sessions.json → loaded first
    JSONL → loaded only when opening session

Typical sizes:

    260 sessions ≈ 200 KB metadata

Result:

-   fast startup
-   low memory usage
-   minimal CPU load

------------------------------------------------------------------------

# Optional Live Updates

To support real-time updates when session files change, a file watcher
can be added.

Architecture:

    JSONL logs
       │
       ▼
    File watcher
       │
       ▼
    WebSocket server
       │
       ▼
    Frontend updates session card

Example update event:

``` json
{
  "type": "session_updated",
  "session_id": "019cad92",
  "entries": 9
}
```

The UI updates the session metadata automatically.

------------------------------------------------------------------------

# Project Structure

Example repository layout:

    codex-session-explorer/

    logs/
      2026/
        03/
          02/
            rollout-xxx.jsonl

    scripts/
      build-index.ts
      build-search-index.ts

    public/
      sessions.json
      search_index.json

    frontend/
      src/
        pages/
          SessionExplorer.tsx
          SessionViewer.tsx
        components/
          SessionCard.tsx
          SearchBar.tsx

------------------------------------------------------------------------

# End-to-End Workflow

    Agent session
          │
          ▼
    JSONL logs written
          │
          ▼
    Index builder scans logs
          │
          ├── sessions.json
          └── search_index.json
          │
          ▼
    Session Explorer UI loads
          │
          ├── filter sessions
          ├── search sessions
          └── open session
                  │
                  ▼
              load JSONL

Optional extension:

    File watcher → WebSocket → UI updates

------------------------------------------------------------------------

# Key Benefits

This design provides:

-   Simple architecture
-   No database required
-   Fast UI performance
-   Full-text search
-   Easy deployment as static site
-   Scalable to thousands of sessions

The system can later be extended with analytics, live telemetry, or
advanced visualization if needed.
