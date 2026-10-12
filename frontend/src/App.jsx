import React, { useState, useRef } from 'react';

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);

  // Settings State 
  const [engine, setEngine] = useState("CYCLES");
  const [samples, setSamples] = useState(64);
  const [startFrame, setStartFrame] = useState(1);
  const [endFrame, setEndFrame] = useState(1);
  const [outputFormat, setOutputFormat] = useState("ZIP");

  // History State
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');

  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    setRenderResult(null);

    const file = e.dataTransfer.files[0];
    validateAndSetFile(file);
  };

  const handleFileSelect = (e) => {
    setError(null);
    setRenderResult(null);

    const file = e.target.files[0];
    validateAndSetFile(file);

    e.target.value = null;
  };

  const validateAndSetFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.blend') && !file.name.endsWith('.zip')) {
      setError("Invalid file type. Please upload a .blend file.");
      return;
    }
    setSelectedFile(file);
  };

  const handleZoneClick = () => {
    if (!isRendering && !selectedFile && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleStartRender = async () => {
    if (selectedFile) {
      await sendToProviderNode(selectedFile);
    }
  };

  const sendToProviderNode = async (file) => {
    setIsRendering(true);
    setProgress("Connecting to GPU node...");

    const clientId = Math.random().toString(36).substring(2, 10);
    const ws = new WebSocket(`ws://100.81.83.34:8000/ws/${clientId}`);

    ws.onmessage = (event) => {
      setProgress(event.data);
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("client_id", clientId);
    formData.append("engine", engine);
    formData.append("samples", samples);
    formData.append("start_frame", startFrame);
    formData.append("end_frame", endFrame);
    formData.append("output_format", outputFormat);

    try {
      const response = await fetch("http://100.81.83.34:8000/render", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type");

      // Check for JSON errors from backend
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || "Render failed in the container.");
      }

      if (!response.ok) {
        throw new Error("The provider node rejected the file or crashed.");
      }

      const fileBlob = await response.blob();
      const fileUrl = URL.createObjectURL(fileBlob);

      // Determine actual format based on headers returned
      let actualFormat = outputFormat;
      if (contentType.includes("image/png")) {
        actualFormat = "PNG";
      } else if (contentType.includes("video/mp4")) {
        actualFormat = "MP4";
      } else {
        actualFormat = "ZIP";
      }

      setRenderResult({ url: fileUrl, format: actualFormat });

      // Automatically trigger the download
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = `render_verse_output.${actualFormat.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      const newHistoryItem = {
        id: clientId,
        filename: file.name,
        url: fileUrl,
        format: actualFormat,
        timestamp: new Date().toLocaleString()
      };
      setHistory((prev) => [newHistoryItem, ...prev]);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsRendering(false);
      setSelectedFile(null);
      if (!renderResult) setProgress("");
      ws.close();
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F8F9FA", padding: "3rem 1rem", fontFamily: "'Inter', system-ui, sans-serif", color: "#202124" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>

        <header style={{ marginBottom: "2.5rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: "600", margin: "0 0 0.5rem 0", color: "#1A73E8" }}>Render Verse</h1>
          <p style={{ margin: "0", color: "#5F6368", fontSize: "1rem" }}>Decentralized GPU Rendering Node</p>
        </header>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid #E8EAED", paddingBottom: "0.5rem" }}>
          <button
            onClick={() => setActiveTab('upload')}
            style={{ background: "none", border: "none", fontSize: "1rem", fontWeight: activeTab === 'upload' ? "600" : "400", color: activeTab === 'upload' ? "#1A73E8" : "#5F6368", cursor: "pointer", borderBottom: activeTab === 'upload' ? "2px solid #1A73E8" : "none", paddingBottom: "0.5rem" }}
          >
            New Render
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{ background: "none", border: "none", fontSize: "1rem", fontWeight: activeTab === 'history' ? "600" : "400", color: activeTab === 'history' ? "#1A73E8" : "#5F6368", cursor: "pointer", borderBottom: activeTab === 'history' ? "2px solid #1A73E8" : "none", paddingBottom: "0.5rem" }}
          >
            History ({history.length})
          </button>
        </div>

        {activeTab === 'upload' && (
          <>
            {/* Render Settings Panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "2rem", backgroundColor: "#FFFFFF", padding: "1.5rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", gap: "1.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.5rem", color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Render Engine
                  </label>
                  <select
                    value={engine}
                    onChange={(e) => setEngine(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid #DADCE0", fontSize: "1rem", backgroundColor: "#F8F9FA", color: "#202124", outline: "none", cursor: "pointer" }}
                  >
                    <option value="CYCLES">Cycles (GPU Raytraced)</option>
                    <option value="BLENDER_EEVEE">Eevee (Real-time)</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.5rem", color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Sample Count
                  </label>
                  <input
                    type="number"
                    value={samples}
                    onChange={(e) => setSamples(e.target.value)}
                    min="1" max="1024"
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid #DADCE0", fontSize: "1rem", backgroundColor: "#F8F9FA", color: "#202124", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.5rem", color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Start Frame
                  </label>
                  <input
                    type="number"
                    value={startFrame}
                    onChange={(e) => setStartFrame(e.target.value)}
                    min="1"
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid #DADCE0", fontSize: "1rem", backgroundColor: "#F8F9FA", color: "#202124", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.5rem", color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    End Frame
                  </label>
                  <input
                    type="number"
                    value={endFrame}
                    onChange={(e) => setEndFrame(e.target.value)}
                    min="1"
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid #DADCE0", fontSize: "1rem", backgroundColor: "#F8F9FA", color: "#202124", outline: "none", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.5rem", color: "#5F6368", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Output Format
                  </label>
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "6px", border: "1px solid #DADCE0", fontSize: "1rem", backgroundColor: "#F8F9FA", color: "#202124", outline: "none", cursor: "pointer" }}
                  >
                    <option value="ZIP">Image Sequence (.zip)</option>
                    <option value="MP4">Video (.mp4)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              padding: "2.5rem",
              marginBottom: "2rem"
            }}>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".blend,.zip"
                style={{ display: "none" }}
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleZoneClick}
                style={{
                  border: isDragging ? "2px solid #1A73E8" : "2px dashed #DADCE0",
                  backgroundColor: isDragging ? "#E8F0FE" : "#F8F9FA",
                  padding: "4rem 2rem",
                  textAlign: "center",
                  borderRadius: "8px",
                  cursor: (!selectedFile && !isRendering) ? "pointer" : "default",
                  transition: "all 0.2s ease"
                }}
              >
                {isRendering ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                    <div style={{
                      width: "40px", height: "40px",
                      border: "3px solid #E8F0FE", borderTop: "3px solid #1A73E8",
                      borderRadius: "50%", animation: "spin 1s linear infinite"
                    }} />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <p style={{ margin: 0, fontWeight: "500", color: "#1A73E8" }}>GPU Allocated</p>
                  </div>
                ) : selectedFile ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
                    <div style={{ backgroundColor: "#FFFFFF", padding: "1rem 2rem", borderRadius: "8px", border: "1px solid #DADCE0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                      <p style={{ margin: "0 0 0.25rem 0", fontWeight: "600", color: "#202124", fontSize: "1.1rem" }}>{selectedFile.name}</p>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#5F6368" }}>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        style={{ padding: "0.6rem 1.5rem", borderRadius: "6px", border: "1px solid #DADCE0", backgroundColor: "#FFFFFF", color: "#5F6368", fontWeight: "600", cursor: "pointer", transition: "all 0.2s" }}
                        onMouseOver={(e) => e.target.style.backgroundColor = "#F8F9FA"}
                        onMouseOut={(e) => e.target.style.backgroundColor = "#FFFFFF"}
                      >
                        Change File
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartRender(); }}
                        style={{ padding: "0.6rem 1.5rem", borderRadius: "6px", border: "none", backgroundColor: "#1A73E8", color: "#FFFFFF", fontWeight: "600", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", transition: "all 0.2s" }}
                        onMouseOver={(e) => e.target.style.backgroundColor = "#1557B0"}
                        onMouseOut={(e) => e.target.style.backgroundColor = "#1A73E8"}
                      >
                        Start Render
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "1rem" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p style={{ margin: 0, fontSize: "1.1rem" }}>Drag and drop or <strong>click to upload</strong></p>
                    <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.9rem", color: "#80868B" }}>Upload a .blend file or a .zip project folder</p>
                  </div>
                )}
              </div>

              {progress && (
                <div style={{ marginTop: "2rem", backgroundColor: "#202124", borderRadius: "8px", padding: "1rem", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", borderBottom: "1px solid #3C4043", paddingBottom: "0.5rem" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#34A853" }}></div>
                    <span style={{ color: "#9AA0A6", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Live Terminal</span>
                  </div>
                  <p style={{ margin: 0, color: "#34A853", fontSize: "0.9rem", fontFamily: "'Fira Code', monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    &gt; {progress}
                  </p>
                </div>
              )}

              {error && (
                <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "#FCE8E6", color: "#D93025", borderRadius: "6px", fontSize: "0.95rem" }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
            </div>

            {renderResult && (
              <div style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "12px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                padding: "2rem",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
              }}>
                <h3 style={{ margin: "0 0 1.5rem 0", color: "#202124" }}>Render Complete</h3>

                {/* Dynamically render Image, Video, or ZIP placeholder */}
                {renderResult.format === 'PNG' ? (
                  <img
                    src={renderResult.url}
                    alt="Rendered Frame"
                    style={{ maxWidth: "100%", borderRadius: "8px", marginBottom: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                  />
                ) : renderResult.format === 'MP4' ? (
                  <video
                    src={renderResult.url}
                    controls
                    style={{ maxWidth: "100%", borderRadius: "8px", marginBottom: "1.5rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                  />
                ) : (
                  <div style={{ backgroundColor: "#F8F9FA", border: "1px solid #DADCE0", borderRadius: "8px", padding: "2rem", marginBottom: "1.5rem", width: "100%", maxWidth: "300px" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "1rem" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <p style={{ margin: 0, fontWeight: "500", color: "#202124" }}>Frames Archived</p>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#5F6368" }}>.zip file generated</p>
                  </div>
                )}

                <a
                  href={renderResult.url}
                  download={`render_verse_output.${renderResult.format.toLowerCase()}`}
                  style={{
                    display: "inline-block",
                    backgroundColor: "#1A73E8",
                    color: "#FFFFFF",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "6px",
                    textDecoration: "none",
                    fontWeight: "500",
                    fontSize: "1rem",
                    transition: "background-color 0.2s"
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = "#1557B0"}
                  onMouseOut={(e) => e.target.style.backgroundColor = "#1A73E8"}
                >
                  Download .{renderResult.format.toLowerCase()}
                </a>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <div style={{ backgroundColor: "#FFFFFF", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", padding: "2.5rem" }}>
            <h2 style={{ margin: "0 0 1.5rem 0", color: "#202124", fontSize: "1.5rem" }}>Recent Renders</h2>
            {history.length === 0 ? (
              <p style={{ color: "#5F6368", textAlign: "center", padding: "2rem 0" }}>No renders yet. Upload a file to get started.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1.5rem" }}>
                {history.map((item) => (
                  <div key={item.id} style={{ border: "1px solid #E8EAED", borderRadius: "8px", overflow: "hidden" }}>

                    <div style={{ width: "100%", height: "150px", backgroundColor: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #E8EAED" }}>
                      {item.format === 'PNG' ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      ) : item.format === 'MP4' ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      )}
                      <span style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#5F6368", fontWeight: "500" }}>
                        {item.format === 'PNG' ? 'Image File' : item.format === 'MP4' ? 'Video File' : 'ZIP Archive'}
                      </span>
                    </div>

                    <div style={{ padding: "1rem", backgroundColor: "#FFFFFF" }}>
                      <p style={{ margin: "0 0 0.5rem 0", fontWeight: "500", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.filename}>{item.filename}</p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "#80868B" }}>{item.timestamp}</p>
                      <a href={item.url} download={`render_${item.filename}.${item.format.toLowerCase()}`} style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem", color: "#1A73E8", textDecoration: "none", fontWeight: "500" }}>Download .{item.format.toLowerCase()}</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}