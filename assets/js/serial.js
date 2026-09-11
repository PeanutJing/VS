/**
 * Sleep Guard - PC Bridge Telemetry Client (serial.js)
 * รับข้อมูลจาก ESP-01 Wi-Fi ผ่าน FastAPI แล้วส่งต่อให้หน้าเว็บด้วย WebSocket
 * - Real-time ECG & SpO2 Stream via WebSockets (Zero Jitter)
 * - Auto-reconnect & Hardware Connection State Watchdog
 */

class MicrobitWebSocketClient {
  constructor() {
    this.wsUrl = this._resolveWsUrl();
    this.ws = null;
    this.isConnected = false;
    this.isHardwareAttached = false;
    this.lastPacketTime = 0;
    
    // Callbacks & Event Listeners
    this.vitalsCallbacks = new Set();
    this.scanCallbacks = new Set();
    this.pongCallbacks = new Set();
    this.statusCallbacks = new Set();
    
    // Watchdog
    this.watchdogInterval = null;
    this.isSignalLost = false;
    this._connectPromise = null;
    
    // Auto-connect attempt on page initialization
    this._initAutoConnect();
  }

  _resolveWsUrl() {
    // กำหนด WebSocket URL อัตโนมัติตาม Host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.host;
    // หากรันผ่าน File Protocol ให้ชี้ไปที่ localhost:8080
    if (window.location.protocol === 'file:' || !host) {
      host = 'localhost:8080';
    }
    return `${protocol}//${host}/ws/vitals`;
  }

  // ------------------------------------------------------------------------
  // 1. Connect / Disconnect Handlers
  // ------------------------------------------------------------------------
  connect() {
    // ถ้าเชื่อมต่ออยู่แล้ว คืนค่า true ทันที
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      this._emitStatus(true, null);
      this._emitSignalStatus('LIVE');
      return Promise.resolve(true);
    }

    // ถ้ากำลังรอการเชื่อมต่ออยู่ ให้คืน Promise เดิม
    if (this._connectPromise && this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return this._connectPromise;
    }

    this._connectPromise = new Promise((resolve) => {
      let isSettled = false;
      const finish = (result) => {
        if (!isSettled) {
          isSettled = true;
          this._connectPromise = null;
          resolve(result);
        }
      };

      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
          console.log('[Sleep Guard API] WebSocket Connected to', this.wsUrl);
          this.isConnected = true;
          this.isSignalLost = false;
          this.lastPacketTime = Date.now();
          this._startWatchdog();
          
          // แจ้งเตือนสถานะการเชื่อมต่อทันทีที่ WebSocket เปิดสำเร็จ
          this._emitStatus(true, null);
          this._emitSignalStatus('LIVE');
          
          if (typeof showToast === 'function') {
            showToast('เชื่อมต่อ PC Bridge สำเร็จ', 'กำลังรอข้อมูลจาก ESP-01 Wi-Fi...', 'success', 3000);
          }

          finish(true);
        };

        this.ws.onmessage = (event) => {
          try {
            this.lastPacketTime = Date.now();
            
            if (this.isSignalLost) {
              this.isSignalLost = false;
              this._emitSignalStatus('LIVE');
            }

            const raw = (typeof event.data === 'string') ? event.data.trim() : '';
            if (!raw) return;

            // 1. จัดการกรณีข้อความสถานะแบบ Plain Text เช่น "connected", "disconnected", "pong"
            const rawLower = raw.toLowerCase();
            if (rawLower === 'connected') {
              if (!this.isHardwareAttached) {
                this.isHardwareAttached = true;
                this._emitStatus(this.isConnected, { connected: true });
                if (typeof showToast === 'function') {
                  showToast('ตรวจพบ micro:bit', 'ฮาร์ดแวร์เชื่อมต่อเรียบร้อยแล้ว', 'success', 3000);
                }
              }
              return;
            }

            if (rawLower === 'disconnected') {
              if (this.isHardwareAttached) {
                this.isHardwareAttached = false;
                this._emitStatus(this.isConnected, { connected: false });
              }
              return;
            }

            if (rawLower === 'pong') {
              this.pongCallbacks.forEach(cb => {
                try { cb(); } catch (err) { console.error(err); }
              });
              return;
            }

            // 2. แปลงข้อมูล JSON หรือแยก Key-Value
            let data = null;
            if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
              data = JSON.parse(raw);
            } else if (raw.includes(':')) {
              // กรณีข้อความส่งมาในรูปแบบ Key-Value เช่น "ECG:75, SPO2:98, HR:72"
              data = {};
              const pairs = raw.split(',');
              for (const pair of pairs) {
                const colonIdx = pair.indexOf(':');
                if (colonIdx !== -1) {
                  const k = pair.substring(0, colonIdx).trim().toLowerCase();
                  const v = pair.substring(colonIdx + 1).trim();
                  if (v.toLowerCase() === 'true') data[k] = true;
                  else if (v.toLowerCase() === 'false') data[k] = false;
                  else {
                    const num = Number(v);
                    data[k] = isNaN(num) ? v : num;
                  }
                }
              }
            } else {
              // ข้อความอื่นๆ ที่ไม่ใช่ JSON และไม่มีรูปแบบสัญญาณชีพ
              return;
            }

            if (!data || typeof data !== 'object') return;

            // ตรวจจับสถานะการเชื่อมต่อฮาร์ดแวร์
            if ('connected' in data) {
              const hwConnected = !!data.connected;
              if (hwConnected !== this.isHardwareAttached) {
                this.isHardwareAttached = hwConnected;
                this._emitStatus(this.isConnected, data);
                if (hwConnected && typeof showToast === 'function') {
                  showToast('ตรวจพบ micro:bit', `เชื่อมต่อผ่านพอร์ต ${data.port || 'USB'} สำเร็จ`, 'success', 3000);
                }
              }
            }

            // ส่งข้อมูลให้ UI
            this.vitalsCallbacks.forEach(cb => {
              try { cb(data); } catch (err) { console.error(err); }
            });

          } catch (e) {
            console.error('Error parsing WS message:', e, 'Raw message:', event.data);
          }
        };

        this.ws.onclose = () => {
          console.warn('[Sleep Guard API] WebSocket Disconnected');
          this._handleDisconnect();
          finish(false);
        };

        this.ws.onerror = (err) => {
          console.error('[Sleep Guard API] WebSocket Error', err);
          finish(false);
        };

      } catch (err) {
        console.error('Could not create WebSocket:', err);
        this._handleDisconnect();
        finish(false);
      }
    });

    return this._connectPromise;
  }

  disconnect() {
    this._connectPromise = null;
    if (this.ws) {
      this.ws.close();
    }
    this._handleDisconnect();
    if (typeof showToast === 'function') {
      showToast('ตัดการเชื่อมต่อแล้ว', 'หยุดรับข้อมูลจาก WebSocket เรียบร้อย', 'warning', 3000);
    }
    return true;
  }

  _handleDisconnect() {
    this.isConnected = false;
    this.isHardwareAttached = false;
    this.ws = null;
    this._connectPromise = null;
    this._stopWatchdog();
    this._emitStatus(false, null);
    this._emitSignalStatus('EMPTY');
  }

  // ------------------------------------------------------------------------
  // 3. Command Methods
  // ------------------------------------------------------------------------
  scanModules() {
    if (!this.isConnected || !this.ws) return false;
    this.ws.send(JSON.stringify({ action: "scan" }));
    if (typeof showToast === 'function') {
      showToast('กำลังสแกนพอร์ต...', 'ส่งคำสั่ง SCAN_MODULES ผ่าน WebSocket', 'info', 2500);
    }
    return true;
  }

  pingDevice(devId) {
    if (!this.isConnected || !this.ws) return false;
    this.ws.send(JSON.stringify({ action: "ping", id: devId }));
    return true;
  }

  // ------------------------------------------------------------------------
  // 4. Watchdog & Auto-Connect
  // ------------------------------------------------------------------------
  _startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      if (this.isConnected && !this.isSignalLost) {
        const elapsed = Date.now() - this.lastPacketTime;
        // หากไม่มีข้อมูลอัปเดตเกิน 3 วินาที หรือฮาร์ดแวร์แจ้งหลุด
        if (elapsed > 3200 || !this.isHardwareAttached) {
          this.isSignalLost = true;
          this._emitSignalStatus('SIGNAL_LOSS');
        }
      }
    }, 1000);
  }

  _stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  _initAutoConnect() {
    setTimeout(() => {
      this.connect();
    }, 800);
  }

  // ------------------------------------------------------------------------
  // 5. Listener Subscriptions
  // ------------------------------------------------------------------------
  onVitals(callback) {
    this.vitalsCallbacks.add(callback);
    return () => this.vitalsCallbacks.delete(callback);
  }

  onScanResult(callback) {
    this.scanCallbacks.add(callback);
    return () => this.scanCallbacks.delete(callback);
  }

  onPong(callback) {
    this.pongCallbacks.add(callback);
    return () => this.pongCallbacks.delete(callback);
  }

  onStatusChange(callback) {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  _emitStatus(connected, data) {
    this.statusCallbacks.forEach(cb => {
      try { cb(connected, data); } catch (e) { console.error(e); }
    });
  }

  _emitSignalStatus(status) {
    if (typeof window.setStreamState === 'function') {
      window.setStreamState(status);
    }
  }
}

// Global Singleton Instance
window.microbitSerial = new MicrobitWebSocketClient();
