import time
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

PROJECT_ROOT = Path(__file__).resolve().parent.parent
app = Flask(__name__, static_folder=str(PROJECT_ROOT), static_url_path='')
CORS(app)

current_telemetry = {
    "ecg": None,
    "leadOff": False,
    "packetCount": 0,
    "lastUpdate": 0
}

# Root route so visiting in a browser returns something valid instead of 404
@app.route('/', methods=['GET'])
def index():
    return app.send_static_file('index.html')

# Telemetry endpoint matching your ESP8266 HTTP POST
@app.route('/api/telemetry', methods=['POST'])
def receive_telemetry():
    global current_telemetry

    data = request.get_json(silent=True)
    
    if not data:
        return jsonify({"status": "error", "message": "Invalid or missing JSON"}), 400

    current_telemetry["lastUpdate"] = time.time()
    current_telemetry["packetCount"] += 1

    if data.get("leadOff") is True:
        current_telemetry["leadOff"] = True
        current_telemetry["ecg"] = None
        print(f"[ESP WIFI] Packet #{current_telemetry['packetCount']} - LEAD OFF (Gagal)")
    else:
        current_telemetry["leadOff"] = False
        current_telemetry["ecg"] = data.get("ecg")
        print(f"[ESP WIFI] Packet #{current_telemetry['packetCount']} - ECG: {current_telemetry['ecg']}")

    return jsonify({
        "status": "accepted",
        "packetCount": current_telemetry["packetCount"]
    }), 200

@app.route('/api/vitals', methods=['GET'])
def get_vitals():
    return jsonify(current_telemetry), 200

if __name__ == '__main__':
    # Listen on port 8080 accessible from outside the workspace
    app.run(host='0.0.0.0', port=8080)