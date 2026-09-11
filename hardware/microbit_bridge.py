#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sleep Guard - micro:bit Python Serial Bridge & Local Telemetry Server (FastAPI)
File: hardware/microbit_bridge.py
"""

import sys
import time
import json
import asyncio
import argparse
from contextlib import asynccontextmanager

try:
    import serial
    import serial.tools.list_ports
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    sys.exit(1)

# ------------------------------------------------------------------------------
# Global State & CLI Config
    print("[ERROR] Missing dependencies. Run: pip install fastapi uvicorn websockets")

    "port": None,
    "wifi_only": False,
    "http_port": 8080
}

current_telemetry = {
discovered_modules = []
serial_instance = None
running = True
ecg_estimator = {
    "baseline": None,
    "peak_level": 0.0,
    "previous_above_threshold": False,
    "last_beat_time": None,
    "intervals": [],
# ------------------------------------------------------------------------------
    "last_debug": None
    "ecg": None,
    "leadOff": False,
    "hr": None,
    "connected": True,
    "port": "ESP8266 Wi-Fi",
        return

    estimator = ecg_estimator
    now = time.monotonic()
    estimator["sample_times"].append(now)
    estimator["sample_times"] = [sample_time for sample_time in estimator["sample_times"] if now - sample_time <= 2.0]
    if len(estimator["sample_times"]) < 16:
        if current_telemetry["hr"] is None:
            current_telemetry["hrDebug"] = "FAIL SAMPLE_RATE"

    if estimator["baseline"] is None:
        estimator["baseline"] = sample
        return

    estimator["baseline"] += (sample - estimator["baseline"]) * 0.02
    deviation = sample - estimator["baseline"]
    estimator["peak_level"] = max(abs(deviation), estimator["peak_level"] * 0.995)
    threshold = max(20.0, estimator["peak_level"] * 0.5)
    above_threshold = deviation > threshold
    # A refractory period prevents one QRS complex from counting multiple times.
    is_new_beat = above_threshold and not estimator["previous_above_threshold"]
    if is_new_beat and (estimator["last_beat_time"] is None or now - estimator["last_beat_time"] > 0.3):
        if estimator["last_beat_time"] is not None:
            interval = now - estimator["last_beat_time"]
            if 0.3 <= interval <= 2.0:
                estimator["intervals"].append(interval)
                estimator["intervals"] = estimator["intervals"][-4:]
                current_telemetry["hr"] = round(60 / (sum(estimator["intervals"]) / len(estimator["intervals"])))
                current_telemetry["hrDebug"] = f"BPM {current_telemetry['hr']}"
        estimator["last_beat_time"] = now

    if current_telemetry["hr"] is None and len(estimator["sample_times"]) >= 16:
        current_telemetry["hrDebug"] = "FAIL NO_BEAT"

    debug = current_telemetry["hrDebug"]
    if debug != estimator["last_debug"]:
        print(f"[{debug}]")
        estimator["last_debug"] = debug

    estimator["previous_above_threshold"] = above_threshold

def set_lead_off(lead_off):
    current_telemetry["leadOff"] = lead_off
    if lead_off:
        current_telemetry["ecg"] = None
        current_telemetry["hr"] = None
        current_telemetry["sleepRisk"] = None
        current_telemetry["hrDebug"] = "FAIL LEAD_OFF"
        ecg_estimator.update({"baseline": None, "peak_level": 0.0, "previous_above_threshold": False, "last_beat_time": None, "intervals": [], "sample_times": []})

# ------------------------------------------------------------------------------
# Serial Reader Async Task
# ------------------------------------------------------------------------------
async def parse_incoming_line(line):
    global current_telemetry, discovered_modules
    line = line.strip()
    if not line: return

    current_telemetry["lastUpdate"] = time.time()
    current_telemetry["packetCount"] += 1
    updated = False

    if line.lower() in ("gagal", "lead_off", "leads_off"):
        set_lead_off(True)
        print("[FAIL LEAD_OFF]")
        await manager.broadcast(current_telemetry)
        return

    if line.startswith("{") and line.endswith("}"):
        try:
            data = json.loads(line)
            if "modules" in data:
                discovered_modules = data["modules"]
                return
            aliases = {"ecg": "ecg", "raw": "ecg", "value": "ecg", "spo2": "spo2", "hr": "hr", "heart_rate": "hr", "resp": "resp", "respiration": "resp", "temp": "temp"}
            explicit_hr = False
            for key, value in data.items():
                if str(key).lower() in ("leadoff", "lead_off"):
                    set_lead_off(bool(value))
                    continue
                target = aliases.get(str(key).lower())
                if target is not None:
                    current_telemetry[target] = value
                    explicit_hr = explicit_hr or target == "hr"
            if "ecg" in data or "raw" in data or "value" in data:
                if "leadoff" not in {str(key).lower() for key in data} and "lead_off" not in {str(key).lower() for key in data}:
                    set_lead_off(False)
                if not current_telemetry["leadOff"] and not explicit_hr:
                    update_hr_from_ecg(current_telemetry["ecg"])
            updated = True
        except json.JSONDecodeError: pass
    elif ":" in line:
        pairs = line.split(",")
        explicit_hr = False
        has_ecg = False
        for pair in pairs:
            if ":" in pair:
                k, v = pair.split(":", 1)
                k, v = k.strip().upper(), v.strip()
                try:
                    num = float(v)
                    if k == "ECG": current_telemetry["ecg"] = int(num); has_ecg = True
                    elif k in ("RAW", "VALUE"): current_telemetry["ecg"] = int(num); has_ecg = True
                    elif k == "SPO2": current_telemetry["spo2"] = int(num)
                    elif k == "HR": current_telemetry["hr"] = int(num); explicit_hr = True
                    elif k == "RESP": current_telemetry["resp"] = int(num)
                    elif k == "TEMP": current_telemetry["temp"] = round(num, 1)
                    updated = True
                except ValueError: pass
        if has_ecg and not explicit_hr:
            set_lead_off(False)
            update_hr_from_ecg(current_telemetry["ecg"])
        elif explicit_hr:
            current_telemetry["hrDebug"] = f"BPM {current_telemetry['hr']}"
            print(f"[{current_telemetry['hrDebug']}]")
    else:
        try:
            current_telemetry["ecg"] = int(float(line))
            set_lead_off(False)
            update_hr_from_ecg(current_telemetry["ecg"])
            updated = True
        except ValueError:
            pass

    if updated:
        current_telemetry["sleepRisk"] = calculate_sleep_risk(
            current_telemetry["hr"], current_telemetry["spo2"], current_telemetry["resp"]
        )
        await manager.broadcast(current_telemetry)

async def serial_worker(port_name, baud_rate, is_mock=False):
    global serial_instance, current_telemetry, running
    loop = asyncio.get_running_loop()

    if is_mock:
        print("[MOCK MODE] Simulating live telemetry...")
        current_telemetry["connected"] = True
        current_telemetry["port"] = "SIMULATOR"
        step = 0
        while running:
            await asyncio.sleep(0.035)
            step += 1
            ecg_val = 50 + int(35 * math.sin(step * 0.2) + (15 if step % 25 == 0 else 0))
            current_telemetry["ecg"] = max(10, min(100, ecg_val))
            current_telemetry["spo2"] = 98 if (step % 200 > 30) else 91
            current_telemetry["hr"] = 74 + int(4 * math.sin(step * 0.05))
            current_telemetry["sleepRisk"] = calculate_sleep_risk(current_telemetry["hr"], current_telemetry["spo2"], current_telemetry["resp"])
            current_telemetry["packetCount"] += 1
            current_telemetry["lastUpdate"] = time.time()
            await manager.broadcast(current_telemetry)
        return

    while running:
        if not port_name:
            detected_port, desc = find_microbit_port()
            if not detected_port:
                await asyncio.sleep(1.5)
                continue
            port_name = detected_port
            print(f"\n[DETECTED] Found micro:bit on {port_name} ({desc})")

        try:
            print(f"[CONNECTING] Opening serial port {port_name} at {baud_rate}...")
            serial_instance = await loop.run_in_executor(None, lambda: serial.Serial(port_name, baud_rate, timeout=0.1))
            current_telemetry["connected"] = True
            current_telemetry["port"] = port_name
            await manager.broadcast(current_telemetry)

            while running and serial_instance.is_open:
                line = await loop.run_in_executor(None, serial_instance.readline)
                if line:
                    await parse_incoming_line(line.decode("utf-8", "ignore"))
                else:
                    await asyncio.sleep(0.01)

        except serial.SerialException as e:
            print(f"\n[ERROR] Port {port_name}: {e}")
            port_name = None
            current_telemetry["connected"] = False
            set_lead_off(True)
            for k in ["ecg", "spo2", "hr", "resp", "sleepRisk", "temp"]:
                current_telemetry[k] = None
            await manager.broadcast(current_telemetry)
            await asyncio.sleep(2.0)
        finally:
            current_telemetry["connected"] = False
            set_lead_off(True)
            ecg_estimator.update({"baseline": None, "peak_level": 0.0, "previous_above_threshold": False, "last_beat_time": None, "intervals": [], "sample_times": []})
            for k in ["ecg", "spo2", "hr", "resp", "sleepRisk", "temp"]:
                current_telemetry[k] = None
            if serial_instance and serial_instance.is_open:
                serial_instance.close()

# ------------------------------------------------------------------------------
# FastAPI Application setup
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global running
    running = True
    if not cli_config["wifi_only"]:
        asyncio.create_task(serial_worker(cli_config["port"], cli_config["baud"], cli_config["mock"]))
    yield
    running = False

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws/vitals")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps(current_telemetry))
        while True:
            data = await websocket.receive_text()
            try:
                cmd = json.loads(data)
                if cmd.get("action") == "scan":
                    send_serial_command("SCAN_MODULES\n")
                elif cmd.get("action") == "ping":
                    dev_id = cmd.get("id", "DEVICE")
                    send_serial_command(f"PING:{dev_id}\n")
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/vitals")
def get_vitals():
    """Fallback REST API"""
    return current_telemetry

@app.post("/api/telemetry")
async def receive_wifi_telemetry(data: dict):
    """Receive telemetry forwarded by an ESP-01 over the local network."""
    current_telemetry["connected"] = True
    current_telemetry["port"] = "ESP-01 Wi-Fi"
    await parse_incoming_line(json.dumps(data))
    print(f"[ESP WIFI] packet={current_telemetry['packetCount']} ecg={current_telemetry['ecg']} leadOff={current_telemetry['leadOff']}")
    return {"status": "accepted", "packetCount": current_telemetry["packetCount"]}

@app.get("/api/scan")
def scan_modules():
    send_serial_command("SCAN_MODULES\n")
    return {"status": "command_sent"}

@app.post("/api/ping")
def ping_device(id: str = "DEVICE"):
    send_serial_command(f"PING:{id}\n")
    return {"status": "ping_sent", "id": id}

# Mount static files (HTML, JS, CSS) at the root
app.mount("/", StaticFiles(directory=PROJECT_ROOT, html=True), name="static")

def main():
    parser = argparse.ArgumentParser(description="Sleep Guard - FastAPI Serial Bridge")
    parser.add_argument("-p", "--port", type=str, default=None, help="Serial COM port")
    parser.add_argument("-b", "--baud", type=int, default=115200, help="Baud rate")
    parser.add_argument("--http-port", type=int, default=8080, help="HTTP/WS port (default: 8080)")
    parser.add_argument("--mock", action="store_true", help="Simulate telemetry")
    parser.add_argument("--wifi-only", action="store_true", help="Receive telemetry from ESP-01 via POST instead of USB serial")
    args = parser.parse_args()

    cli_config["port"] = args.port
    cli_config["baud"] = args.baud
    cli_config["mock"] = args.mock
    cli_config["wifi_only"] = args.wifi_only
    cli_config["http_port"] = args.http_port

    print("=" * 66)
    print(f"  SLEEP GUARD - FASTAPI WEBSOCKET BRIDGE")
    print(f"  Dashboard:  http://localhost:{args.http_port}/")
    print(f"  API Vitals: http://localhost:{args.http_port}/api/vitals")
    print(f"  WebSocket:  ws://localhost:{args.http_port}/ws/vitals")
    print("=" * 66)
    uvicorn.run(app, host="0.0.0.0", port=args.http_port, log_level="info")

if __name__ == "__main__":
    main()
