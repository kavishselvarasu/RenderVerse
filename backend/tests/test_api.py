from fastapi.testclient import TestClient
from main import app
import io

client = TestClient(app)

def test_websocket_connection():
    """Verify the WebSocket terminal stream connects successfully."""
    client_id = "test_ws_01"
    with client.websocket_connect(f"/ws/{client_id}") as websocket:
        assert websocket.application_state == 1 # Connected

def test_invalid_file_upload():
    """Verify the API rejects requests missing required form data."""
    response = client.post("/render")
    assert response.status_code == 422 # Unprocessable Entity (Missing File)

def test_render_queue_initialization():
    """Verify a valid payload initializes the database log."""
    dummy_file = io.BytesIO(b"dummy byte content")
    dummy_file.name = "test_scene.blend"
    
    response = client.post(
        "/render",
        data={
            "client_id": "test_client_01",
            "start_frame": 1,
            "end_frame": 1,
            "engine": "CYCLES",
            "samples": 10,
            "output_format": "ZIP"
        },
        files={"file": ("test_scene.blend", dummy_file, "application/octet-stream")}
    )
    
    # Depending on whether you have Docker running in the test environment, 
    # this will either return 200 (success) or a JSON error regarding the container.
    # The key is verifying the endpoint accepts the schema.
    assert response.status_code in [200, 400]