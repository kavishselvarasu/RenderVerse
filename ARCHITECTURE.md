# Render Verse: Technical Design Document

## 1. System Overview
Render Verse is a decentralized compute network that leverages idle consumer GPUs (NVIDIA via CUDA) to execute heavy workloads. Initially built as a 3D rendering farm, its modular container architecture allows dynamic routing of Machine Learning training tasks (PyTorch/TensorFlow).

## 2. Core Architecture

### Frontend (Client)
*   **Framework:** React (Vite).
*   **Responsibilities:** Handles `.blend` or `.zip` file ingestion, user configuration (engine, samples, framework), and visualizes real-time terminal output via WebSockets.

### Backend (Orchestration Node)
*   **Framework:** Python / FastAPI.
*   **Database:** SQLite via SQLAlchemy (Tracks `client_id`, `filename`, `status`, `timestamp`).
*   **Concurrency:** `asyncio.Lock()` ensures the host GPU is not overwhelmed by parallel execution requests, strictly queuing jobs 1-by-1.
*   **Responsibilities:** Receives payloads, extracts archives, generates dynamic execution scripts (`enable_gpu.py`), and manages Docker subprocesses.

### Execution Layer (Compute Node)
*   **Framework:** Docker Engine with NVIDIA Container Toolkit.
*   **Hardware Passthrough:** `--gpus all` strictly enforces CUDA availability inside the container.
*   **Volume Mapping:** Mounts the host's staging directory to `/app` inside the container for zero-latency file access.

## 3. Workload Execution Flow

```text
[ User / Frontend ]
       │
       ▼ (HTTP POST /render)
[ FastAPI Backend ] ──(Write metadata)──> [ SQLite Database ]
       │
       ▼ (Extracts ZIP & Writes Python Execution Script)
[ Staging Directory ]
       │
       ▼ (Subprocess: docker run --gpus all)
[ Docker Container ] ──(Executes Blender / PyTorch)──> [ NVIDIA RTX GPU ]
       │
       ▼ (WebSocket Stream)
[ Live Terminal UI ] <──(Reads stdout)
       │
       ▼ (Task Complete)
[ Post-Processing ] ──(FFmpeg encoding or ZIP archiving)
       │
       ▼ (HTTP FileResponse)
[ User Downloads Final Artifact / Weights ]
```

## 4. Containerization Strategy
To ensure "zero-configuration" setup and prevent dependency conflicts (e.g., CUDA 11 vs CUDA 12), all execution logic is containerized.

*   **Blender Rendering:** `nytimes/blender:3.6.0-ubuntu-cb63ca52f3` (Specific tagged image to avoid runtime breakage).
*   **Video Encoding:** `linuxserver/ffmpeg`.
*   **Future ML:** Dedicated images like `pytorch/pytorch:latest` with explicit version tagging will be pulled dynamically based on user selection.

## 5. Data Flow & Persistence

1.  **Upload:** User uploads `.blend` or `.zip` (max 100MB) via React.
2.  **Extraction:** Backend extracts contents to a temporary folder on the host (e.g., `/tmp/render_123`).
3.  **Execution:** Docker mounts this folder. The container runs the render command.
4.  **Cleanup:** Upon completion (success or failure), the backend deletes the host folder to free disk space.
5.  **Output:** Results are either streamed live or downloaded via HTTP Response (FastAPI `FileResponse`).