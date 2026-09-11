from flask import Flask, request, jsonify

app = Flask(__name__)

# Root route so visiting in a browser returns something valid instead of 404
@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "status": "Server running",
        "endpoint": "/api/telemetry"
    }), 200

# Telemetry endpoint matching your ESP8266 HTTP POST
@app.route('/api/telemetry', methods=['POST'])
def receive_telemetry():
    data = request.get_json(silent=True)
    
    if not data:
        return jsonify({"status": "error", "message": "Invalid or missing JSON"}), 400

    lead_off = data.get("leadOff", False)
    
    if lead_off:
        print("[Alert] Lead Off detected ('Gagal')")
    else:
        ecg_value = data.get("ecg")
        print(f"[Data] ECG Value: {ecg_value}")

    return jsonify({"status": "success", "received": data}), 200

if __name__ == '__main__':
    # Listen on port 8080 accessible from outside the workspace
    app.run(host='0.0.0.0', port=8080)