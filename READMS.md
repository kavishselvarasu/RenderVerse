# Render Verse 🌌

Render Verse is a decentralized GPU computing node designed to process heavy workloads. Currently functioning as a distributed 3D rendering farm for Blender (Cycles & Eevee), the platform is actively expanding to support distributed Machine Learning training (PyTorch, TensorFlow, etc.) using isolated Docker containers.

## Features
- **Decentralized Rendering**: Upload `.blend` files or zipped project folders containing textures.
- **Dynamic Workload Routing**: FastAPI backend automatically handles queueing and GPU locking.
- **Isolated Environments**: Executes tasks inside secure Docker containers (`nytimes/blender` and `linuxserver/ffmpeg`).
- **Flexible Outputs**: Receive rendered results as single images (`.png`), video sequences (`.mp4`), or raw frame archives (`.zip`).
- **Live Terminal**: Real-time WebSocket updates of the render/training progress directly in the browser.

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:
- **[Python 3.8+](https://www.python.org/downloads/)**
- **[Node.js (v16+)](https://nodejs.org/)**
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Make sure WSL2 integration is enabled if you are on Windows).
- **NVIDIA GPU** with the latest drivers and [CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit) installed.
- **NVIDIA Container Toolkit** (Allows Docker to utilize your GPU).

---

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd <your-repo-directory>
2. Backend Setup (FastAPI)
Open a terminal and navigate to the backend folder:

Bash
cd backend
Create and activate a Python virtual environment:

Bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
Install the required Python packages:

Bash
pip install fastapi uvicorn sqlalchemy python-multipart websockets
Pull the required Docker images for rendering and video encoding:

Bash
docker pull nytimes/blender:3.6.0-ubuntu-cb63ca52f3
docker pull linuxserver/ffmpeg
3. Frontend Setup (React/Vite)
Open a new terminal and navigate to the frontend folder:

Bash
cd frontend
Install the Node dependencies:

Bash
npm install
💻 Running the Application
You need to run both the backend and frontend servers simultaneously in separate terminal windows.

Start the Backend
From the backend directory (ensure your virtual environment is activated):

Bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
The API will be available at http://localhost:8000 or your local IP address.

Start the Frontend
From the frontend directory:

Bash
npm run dev
Vite will provide a localhost URL (usually http://localhost:5173). Open this in your browser to access the Render Verse UI.

ใช้งาน How to Use
Open the web interface.

Drag and drop a .blend file (or a .zip folder if your project requires external textures).

Specify your Render Engine (Cycles or Eevee) and Sample Count.

Set the Start Frame and End Frame. (Note: Setting Start and End to the same number will output a single image).

Select your desired Output Format (MP4 or ZIP).

Click Start Render. You can monitor the process in the Live Terminal on the screen. The file will automatically download upon completion.

⚠️ Troubleshooting & Notes
Docker & Windows nvidia-smi: If you are running Docker via WSL2 on Windows, running nvidia-smi in your Windows command prompt will not show the Docker processes in the process list. This is normal. You can verify the GPU is being used by looking at the Memory-Usage spike in nvidia-smi or monitoring the Live Terminal in the Web UI for the DEVICE_LOG: Found... message.

Out of Memory (OOM) Errors: If your container instantly crashes without rendering, your scene (e.g., dense particle hair or high-res textures) may exceed your GPU's VRAM capacity. Try lowering the sample count, reducing texture sizes, or switching to Eevee.

Network Access: If accessing from another device on your network, ensure the React app's fetch and WebSocket URLs are pointing to the Host machine's local IP address (e.g., 100.x.x.x:8000) instead of localhost.