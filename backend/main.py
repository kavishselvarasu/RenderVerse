import os
import asyncio
import shutil
import zipfile
import glob
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base

# --- 1. Database Setup ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./renderverse.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class RenderLog(Base):
    __tablename__ = "render_logs"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True)
    filename = Column(String)
    status = Column(String, default="Queued")
    timestamp = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- 2. FastAPI & Queue Setup ---
app = FastAPI(title="Distributed Renderer Node")
gpu_lock = asyncio.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_progress(self, message: str, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_text(message)

manager = ConnectionManager()

def cleanup_files(file_paths, dir_paths):
    for path in file_paths:
        if os.path.exists(path):
            os.remove(path)
    for path in dir_paths:
        if os.path.exists(path) and os.path.isdir(path):
            shutil.rmtree(path)

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id)

@app.post("/render")
async def render_blend(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    client_id: str = Form(...),
    engine: str = Form("CYCLES"),
    samples: int = Form(64),
    start_frame: int = Form(1),
    end_frame: int = Form(1),
    output_format: str = Form("ZIP")
):
    db = SessionLocal()
    job = RenderLog(client_id=client_id, filename=file.filename, status="Queued")
    db.add(job)
    db.commit()
    db.refresh(job)

    # --- 3. Staging & Extraction Logic ---
    abs_path = os.path.abspath(os.getcwd())
    staging_dir = f"staging_{client_id}"
    os.makedirs(staging_dir, exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    uploaded_path = os.path.join(staging_dir, file.filename)
    
    with open(uploaded_path, "wb") as f:
        f.write(await file.read())

    blend_file_path = uploaded_path

    if file_ext == ".zip":
        await manager.send_progress("Extracting ZIP project folder...", client_id)
        try:
            with zipfile.ZipFile(uploaded_path, 'r') as zip_ref:
                zip_ref.extractall(staging_dir)
            
            blend_files = glob.glob(os.path.join(staging_dir, "**/*.blend"), recursive=True)
            if not blend_files:
                job.status = "Failed"
                db.commit()
                return {"error": "No .blend file found inside the ZIP archive."}
            
            blend_file_path = blend_files[0]
            await manager.send_progress(f"Found project file: {os.path.basename(blend_file_path)}", client_id)
            
        except zipfile.BadZipFile:
            return {"error": "Uploaded file is not a valid ZIP archive."}
    
    container_blend_path = f"/app/{blend_file_path.replace(os.sep, '/')}"

    # Python script to force CUDA and inject render settings, with added diagnostic logging
    gpu_script = (
        "import bpy\n"
        "prefs = bpy.context.preferences.addons['cycles'].preferences\n"
        "prefs.get_devices()\n"
        "prefs.compute_device_type = 'CUDA'\n" 
        "gpu_found = False\n"
        "for d in prefs.devices:\n"
        "    print(f'DEVICE_LOG: Found {d.name} (Type: {d.type})')\n"
        "    if d.type == 'CUDA':\n"
        "        d.use = True\n"
        "        gpu_found = True\n"
        "    else:\n"
        "        d.use = False\n"
        "if not gpu_found:\n"
        "    print('DEVICE_LOG: CRITICAL WARNING - No CUDA GPU detected inside container!')\n"
        f"bpy.context.scene.render.engine = '{engine}'\n"
        f"bpy.context.scene.cycles.samples = {samples}\n"
        f"bpy.context.scene.eevee.taa_render_samples = {samples}\n"
        "bpy.context.scene.cycles.device = 'GPU'\n"
    )

    with open("enable_gpu.py", "w") as f:
        f.write(gpu_script)
    
    output_dir = f"frames_{client_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    await manager.send_progress("Queued: Waiting for GPU availability...", client_id)
    
    async with gpu_lock:
        job.status = "Rendering"
        db.commit()
        await manager.send_progress(f"GPU Acquired! Rendering frames {start_frame} to {end_frame}...", client_id)

        docker_cmd = [
            "docker", "run", "--rm", "--gpus", "all",
            "-v", f"{abs_path}:/app",
            "renderverse-node:5.2",
            "blender", "-b", container_blend_path,
            "-P", "/app/enable_gpu.py", 
            "-E", engine,             
            "-o", f"/app/{output_dir}/frame_####", 
            "-s", str(start_frame),
            "-e", str(end_frame),
            "-a" 
        ]
        
        process = await asyncio.create_subprocess_exec(
            *docker_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            decoded_line = line.decode('utf-8').strip()
            
            # Print everything to your backend terminal so you can read the raw logs
            print(decoded_line) 
            
            # Send important logs to the frontend UI
            if any(k in decoded_line for k in ["Rendered", "Fra:", "Saved:", "DEVICE_LOG"]):
                await manager.send_progress(decoded_line, client_id)

        await process.wait()
        
        if process.returncode != 0:
            job.status = "Failed"
            db.commit()
            db.close()
            stderr_data = await process.stderr.read()
            background_tasks.add_task(cleanup_files, ["enable_gpu.py"], [output_dir, staging_dir])
            return {"error": "Render failed", "details": stderr_data.decode('utf-8')}
        
        # --- Single Image Handling ---
        if start_frame == end_frame:
            await manager.send_progress("Rendering complete. Sending image...", client_id)
            
            rendered_images = glob.glob(os.path.join(output_dir, "*.png"))
            if not rendered_images:
                job.status = "Failed"
                db.commit()
                db.close()
                return {"error": "No rendered image found."}
                
            image_path = rendered_images[0]
            final_image_name = f"render_{client_id}.png"
            shutil.copy(image_path, final_image_name)
            
            job.status = "Completed"
            db.commit()
            db.close()
            
            background_tasks.add_task(cleanup_files, ["enable_gpu.py", final_image_name], [output_dir, staging_dir])
            return FileResponse(final_image_name, media_type="image/png", filename=final_image_name)

        # --- FFmpeg Video Generation ---
        elif output_format == "MP4":
            await manager.send_progress("Rendering complete. Encoding to MP4 via FFmpeg...", client_id)
            mp4_filename = f"render_{client_id}.mp4"
            
            ffmpeg_cmd = [
                "docker", "run", "--rm",
                "-v", f"{abs_path}:/app",
                "linuxserver/ffmpeg",
                "-y", "-framerate", "24",
                "-i", f"/app/{output_dir}/frame_%04d.png",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                f"/app/{mp4_filename}"
            ]
            
            ffmpeg_proc = await asyncio.create_subprocess_exec(
                *ffmpeg_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await ffmpeg_proc.wait()
            
            job.status = "Completed"
            db.commit()
            db.close()
            
            background_tasks.add_task(cleanup_files, ["enable_gpu.py", mp4_filename], [output_dir, staging_dir])
            return FileResponse(mp4_filename, media_type="video/mp4", filename=mp4_filename)
        
        # --- Standard ZIP Generation ---
        else:
            await manager.send_progress("Rendering complete. Compressing frames into ZIP...", client_id)
            shutil.make_archive(f"render_{client_id}", 'zip', output_dir)
            zip_filename = f"render_{client_id}.zip"
            
            job.status = "Completed"
            db.commit()
            db.close()

            background_tasks.add_task(cleanup_files, ["enable_gpu.py", zip_filename], [output_dir, staging_dir])
            return FileResponse(zip_filename, media_type="application/zip", filename=zip_filename)