#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import time
import json
import asyncio
import argparse
from contextlib import asynccontextmanager

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    print("[ERROR] Missing dependencies. Run: pip install fastapi uvicorn websockets")
    sys.exit(1)

# ------------------------------------------------------------------------------
# Global Telemetry State
# ------------------------------------------------------------------------------
current_telemetry = {
    "ecg": None,
    "leadOff": False,
    "hr": None,
    "connected": True,
    "port": "ESP8266 Wi-Fi",
    "packetCount": 0,
    "lastUpdate": 0
}

class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        msg = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(msg)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# ------------------------------------------------------------------------------
# FastAPI Setup
# ------------------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def index():
    return {"status": "Server running", "endpoint": "/api/telemetry"}

@app.get("/api/vitals")
def get_vitals():
    return current_telemetry

@app.post("/api/telemetry")
async def receive_telemetry(request: Request):
    # อ่านข้อมูลดิบที่ส่งเข้ามาทั้งหมดเพื่อดูหน้าตา Payload
    raw_body = await request.body()
    print(f"\n[DEBUG RAW BODY] -> {raw_body.decode('utf-8', 'ignore')}\n")
    
    try:
        data = await request.json()
    except Exception as e:
        print(f"[DEBUG JSON ERROR] -> {e}")
        return {"status": "bad_json"}, 400

    print(f"[DEBUG PARSED DATA] -> {data}")
    return {"status": "ok"}

    
@app.websocket("/ws/vitals")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps(current_telemetry))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--http-port", type=int, default=8080, help="Port to run server")
    args = parser.parse_args()
    
    print(f"Starting server on port {args.http_port}...")
    uvicorn.run(app, host="0.0.0.0", port=args.http_port)