/**
 * Sleep Guard - Consolidated Application Controller (app.js)
 * รวมโค้ดควบคุม UI กราฟ (Dashboard, History) และการเชื่อมต่อข้อมูล:
 * 1. Real-time ECG (AD8232) & SpO2 Pleth Waveforms (Chart.js)
 * 2. Dynamic OSA Sleep Risk Calculation & Multi-level Clinical Alarms
 * 3. Tab Switching System (Dashboard <-> History) with URL Hash Support
 * 4. Patient History Table, Filtering, Search & Shimmer Loader
 * 5. Incident ECG Playback Snapshot Modal Dialog
 * 6. Local API Bridge Event Handling
 */

// --------------------------------------------------------------------------
// Core System Utilities & Storage Engine
// --------------------------------------------------------------------------
const SleepGuardStorageKey = 'sleep_guard_settings_v1';

const defaultSettings = {
  hrMin: 50,
  hrMax: 100,
  spo2Min: 95,
  apneaDelay: 10,
  buzzerEnabled: true,
  buzzerVolume: 80,
  alarmTone: 'medical_std',
  visualAlarm: true,
  lineNotify: false,
  lineToken: 'ey128989_demo_nurse_station_key',
  lineTarget: 'icu_group',
  hospitalName: 'โรงพยาบาลเวชศาสตร์ฉุกเฉิน (Emergency Care Hospital)',
  wardName: 'ICU Ward 4 (Intermediate Care)',
  bedId: 'Bed #04 - Sleep Lab Unit',
  staffName: 'พว. วิภาดา สุขเจริญ (RN)',
  staffRole: 'พยาบาลวิชาชีพชำนาญการ (RN Specialist)',
  dutyShift: 'afternoon'
};

function getStoredSettings() {
  try {
    const saved = localStorage.getItem(SleepGuardStorageKey);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch (e) {
    return defaultSettings;
  }
}

function saveStoredSettings(newSettings) {
  try {
    localStorage.setItem(SleepGuardStorageKey, JSON.stringify(newSettings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

function getActivePatient() {
  try {
    const isGuest = localStorage.getItem('sleep_guard_guest_mode') === 'true';
    if (isGuest) {
      return {
        hn: 'GUEST-ANON',
        name: 'โหมดทั่วไป (ไม่เก็บข้อมูล)',
        age: '-',
        gender: '-',
        ward: 'ทั่วไป',
        bed: 'Bed --',
        riskLevel: 'low',
        isGuest: true
      };
    }
    const saved = localStorage.getItem('sleep_guard_patients_registry');
    if (saved) {
      const list = JSON.parse(saved);
      if (Array.isArray(list) && list.length > 0) {
        return list.find(p => p.isActive) || list[0];
      }
    }
  } catch (e) {
    console.warn('Error reading active patient:', e);
  }
  return null;
}

function getIncidentRecords() {
  try {
    const saved = localStorage.getItem('sleep_guard_incident_records');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

function saveIncidentRecord(record) {
  try {
    const records = getIncidentRecords();
    records.unshift(record);
    if (records.length > 50) records.length = 50;
    localStorage.setItem('sleep_guard_incident_records', JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save incident record:', e);
  }
}

class MedicalBuzzer {
  constructor() {
    this.audioCtx = null;
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
  }

  beep(freq = 880, duration = 200, count = 1) {
    const settings = getStoredSettings();
    if (!settings.buzzerEnabled) return;

    try {
      this.initContext();
      if (!this.audioCtx) return;

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const volume = (settings.buzzerVolume || 80) / 100 * 0.15;

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

          gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + (duration / 1000));

          osc.connect(gain);
          gain.connect(this.audioCtx.destination);

          osc.start();
          osc.stop(this.audioCtx.currentTime + (duration / 1000));
        }, i * (duration + 120));
      }
    } catch (e) {
      console.warn('Audio Buzzer playback error:', e);
    }
  }

  playCriticalAlarm() {
    this.beep(950, 180, 3);
  }

  playWarningAlarm() {
    this.beep(650, 250, 1);
  }
}

const buzzer = new MedicalBuzzer();

function showToast(title, message, type = 'info', duration = 4500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;

  let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'danger') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
  else if (type === 'warning') iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
  else if (type === 'success') iconHtml = '<i class="fa-solid fa-circle-check"></i>';

  toast.innerHTML = `
    <div class="toast-icon">${iconHtml}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  if (type === 'danger') buzzer.playCriticalAlarm();
  else if (type === 'warning') buzzer.playWarningAlarm();

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  const timer = setTimeout(() => {
    removeToast(toast);
  }, duration);

  function removeToast(el) {
    clearTimeout(timer);
    el.style.transform = 'translateX(120%)';
    el.style.opacity = '0';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }
}

function initLiveClock() {
  const clockEl = document.getElementById('liveClock') || document.querySelector('.time-stamp');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('th-TH', { hour12: false });
  }
  update();
  setInterval(update, 1000);
}

function initMobileNavigation() {
  const toggleBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.sidebar');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('show') && !sidebar.contains(e.target) && e.target !== toggleBtn) {
      sidebar.classList.remove('show');
    }
  });
}

// --------------------------------------------------------------------------
// Global State & Constants
// --------------------------------------------------------------------------
const TOTAL_POINTS = 60;
const labels = Array(TOTAL_POINTS).fill('');

let ecgChart = null;
let modalChartInstance = null;

let streamState = 'EMPTY'; // 'EMPTY', 'LIVE', 'SIGNAL_LOSS'
let lastAlarmTime = 0;
let consecutiveCriticalPackets = 0;

// Default Baseline values
const initialEcgBaseline = Array(TOTAL_POINTS).fill(50);

// Gradient Generator for Smooth Charts
function createWaveformGradient(ctx, topColor, bottomColor, height = 160) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  return grad;
}

// --------------------------------------------------------------------------
// 1. Chart Initializations
// --------------------------------------------------------------------------
function initDashboardCharts() {
  const ecgCanvas = document.getElementById('ecgWaveformChart');
  if (!ecgCanvas) return;

  const ecgCtx = ecgCanvas.getContext('2d');

  // Destroy existing if re-initializing
  if (ecgChart) ecgChart.destroy();

  // ECG Lead II Chart
  ecgChart = new Chart(ecgCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'ECG Lead II',
        data: [...initialEcgBaseline],
        borderColor: '#ef4444',
        borderWidth: 2.2,
        pointRadius: 0,
        tension: 0.2,
        fill: true,
        backgroundColor: createWaveformGradient(ecgCtx, 'rgba(239, 68, 68, 0.22)', 'rgba(239, 68, 68, 0.0)')
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 0, top: 10, bottom: 6 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false, grid: { display: false } },
        y: { display: false, min: 0, max: 120, grid: { display: false } }
      },
      animation: false
    }
  });

}

// --------------------------------------------------------------------------
// 2. Real-time Waveform Stream Pipeline
// --------------------------------------------------------------------------
let wavePhase = 0;

function clearVitalsDisplay() {
  const valHREl = document.getElementById('valHR');

  if (valHREl) valHREl.textContent = '--';

  const barHR = document.getElementById('barHR');

  if (barHR) barHR.style.width = '0%';

  const bHR = document.getElementById('badgeHR');
  if (bHR) { bHR.textContent = 'รอสัญญาณ'; bHR.className = 'status-badge status-badge-normal'; }

  const leadTag = document.getElementById('leadDetectTag');
  if (leadTag) leadTag.innerHTML = '<i class="fa-solid fa-circle-xmark text-yellow"></i> LEAD OFF';

  const elBT = document.getElementById('valBodyTemp');
  const elRT = document.getElementById('valRoomTemp');
  const elH = document.getElementById('valHumidity');
  if (elBT) elBT.textContent = '-- °C';
  if (elRT) elRT.textContent = '-- °C';
  if (elH) elH.textContent = '-- % RH';

  const bBT = document.getElementById('badgeBodyTemp');
  const bRT = document.getElementById('badgeRoomTemp');
  const bH = document.getElementById('badgeHumidity');
  if (bBT) { bBT.textContent = 'รอสัญญาณ'; bBT.className = 'status-badge status-badge-normal'; }
  if (bRT) { bRT.textContent = 'รอสัญญาณ'; bRT.className = 'status-badge status-badge-normal'; }
  if (bH) { bH.textContent = 'รอสัญญาณ'; bH.className = 'status-badge status-badge-normal'; }

  // Clear waveform chart data (flat/empty)
  if (ecgChart && ecgChart.data.datasets[0]) {
    ecgChart.data.datasets[0].data = Array(TOTAL_POINTS).fill(null);
    ecgChart.update('none');
  }
}

function pushRealWaveformSample(rawEcg, rawSpo2) {
  if (!ecgChart) return;
  if (streamState !== 'LIVE') {
    return;
  }

  const telemetry = arguments.length > 2 ? arguments[2] : null;
  if (telemetry && telemetry.leadOff) {
    const leadTag = document.getElementById('leadDetectTag');
    if (leadTag) leadTag.innerHTML = '<i class="fa-solid fa-circle-xmark text-yellow"></i> LEAD OFF';
    return;
  }

  // ห้ามแสดงผลหากไม่มีค่าจริงจากฮาร์ดแวร์
  if (rawEcg === null || rawEcg === undefined) {
    return;
  }

  let ecgVal = Number(rawEcg);
  if (isNaN(ecgVal)) return;

  const leadTag = document.getElementById('leadDetectTag');
  if (leadTag) leadTag.innerHTML = '<i class="fa-solid fa-circle-check text-green"></i> LEAD ON';

  // Shift & push to ECG Chart
  const ecgData = ecgChart.data.datasets[0].data;
  ecgData.shift();
  ecgData.push(ecgVal);
  ecgChart.update('none');

}

// --------------------------------------------------------------------------
// 3. Numerical Vitals & Clinical Risk Engine
// --------------------------------------------------------------------------
function calculateRiskScore(hr, spo2, resp) {
  if (hr === null || spo2 === null || resp === null) return null;
  let risk = 10;
  if (spo2 < 85) risk += 55;
  else if (spo2 < 90) risk += 40;
  else if (spo2 < 95) risk += 20;

  if (hr > 100) risk += 25;
  else if (hr < 50) risk += 25;

  if (resp < 8) risk += 30;
  else if (resp > 24) risk += 15;

  return Math.min(100, Math.max(0, risk));
}

function updateVitalsDisplay(telemetry) {
  if (!telemetry || !telemetry.connected) {
    clearVitalsDisplay();
    return;
  }

  const leadTag = document.getElementById('leadDetectTag');
  if (leadTag && telemetry.leadOff) {
    leadTag.innerHTML = '<i class="fa-solid fa-circle-xmark text-yellow"></i> LEAD OFF';
  }

  const settings = typeof getStoredSettings === 'function' ? getStoredSettings() : {};
  const hrMin = settings.hrMin || 50;
  const hrMax = settings.hrMax || 100;
  const spo2Min = settings.spo2Min || 95;

  const hr = telemetry.hr !== null && telemetry.hr !== undefined ? Math.round(telemetry.hr) : null;
  const spo2 = telemetry.spo2 !== null && telemetry.spo2 !== undefined ? Math.round(telemetry.spo2) : null;
  const resp = telemetry.resp !== null && telemetry.resp !== undefined ? Math.round(telemetry.resp) : null;
  const risk = telemetry.sleepRisk !== null && telemetry.sleepRisk !== undefined 
    ? Math.round(telemetry.sleepRisk) 
    : calculateRiskScore(hr, spo2, resp);

  // Update Numbers
  const valHREl = document.getElementById('valHR');
  const valSpO2El = document.getElementById('valSpO2');
  const valRespEl = document.getElementById('valResp');
  const valRiskEl = document.getElementById('valRiskScore');

  if (valHREl) valHREl.textContent = hr !== null ? hr : '--';
  if (valSpO2El) valSpO2El.textContent = spo2 !== null ? spo2 : '--';
  if (valRespEl) valRespEl.textContent = resp !== null ? resp : '--';
  if (valRiskEl) valRiskEl.textContent = risk !== null ? risk : '--';

  // Update Gauge & Bars
  const gaugeRisk = document.getElementById('gaugeRisk');
  const barHR = document.getElementById('barHR');
  const barSpO2 = document.getElementById('barSpO2');
  const barResp = document.getElementById('barResp');

  if (gaugeRisk && risk !== null) {
    const riskPercent = Math.min(100, Math.max(0, risk));
    const circumference = 339.29;
    const offset = circumference - (circumference * (riskPercent * 0.75) / 100);
    gaugeRisk.style.strokeDashoffset = offset;
    gaugeRisk.style.stroke = risk >= 65 ? '#ef4444' : risk >= 35 ? '#f59e0b' : '#10b981';
  }

  if (barHR) barHR.style.width = hr === null ? '0%' : `${Math.min(100, Math.max(5, (hr / 140) * 100))}%`;
  if (barSpO2) barSpO2.style.width = spo2 === null ? '0%' : `${Math.min(100, Math.max(5, spo2))}%`;
  if (barResp) barResp.style.width = resp === null ? '0%' : `${Math.min(100, Math.max(5, (resp / 30) * 100))}%`;

  // Status Badges & Colors
  if (hr !== null && telemetry.hrDebug && telemetry.hrDebug.startsWith('FAIL ')) {
    const hrBadge = document.getElementById('badgeHR');
    if (hrBadge) {
      hrBadge.textContent = telemetry.hrDebug;
      hrBadge.className = 'status-badge status-badge-warning';
    }
  } else if (hr !== null) {
    updateBadgeState('badgeHR', hr < hrMin || hr > hrMax, hr < hrMin ? 'Bradycardia' : hr > hrMax ? 'Tachycardia' : 'ปกติ (Normal)');
  } else if (telemetry.hrDebug) {
    const hrBadge = document.getElementById('badgeHR');
    if (hrBadge) {
      hrBadge.textContent = telemetry.hrDebug.replace('FAIL ', 'FAIL ');
      hrBadge.className = 'status-badge status-badge-warning';
    }
  }
  if (spo2 !== null) updateBadgeState('badgeSpO2', spo2 < spo2Min, spo2 < spo2Min ? 'Hypoxia (ต่ำ)' : 'ปกติ (Normal)');
  if (resp !== null) updateBadgeState('badgeResp', resp < 10 || resp > 24, resp < 10 ? 'Bradypnea' : resp > 24 ? 'Tachypnea' : 'สม่ำเสมอ');
  if (risk !== null) updateRiskBadge(risk);

  // Environmental Sensors
  if (telemetry.temp !== undefined) {
    const el = document.getElementById('valBodyTemp');
    const badge = document.getElementById('badgeBodyTemp');
    if (el) el.textContent = `${Number(telemetry.temp).toFixed(1)} °C`;
    if (badge) {
      badge.textContent = telemetry.temp > 37.5 ? 'มีไข้' : 'ปกติ';
      badge.className = `status-badge ${telemetry.temp > 37.5 ? 'status-badge-warning' : 'status-badge-normal'}`;
    }
  }

  if (telemetry.roomTemp !== undefined) {
    const el = document.getElementById('valRoomTemp');
    const badge = document.getElementById('badgeRoomTemp');
    if (el) el.textContent = `${Number(telemetry.roomTemp).toFixed(1)} °C`;
    if (badge) {
      badge.textContent = 'เหมาะสม';
      badge.className = 'status-badge status-badge-normal';
    }
  }

  if (telemetry.humidity !== undefined) {
    const el = document.getElementById('valHumidity');
    const badge = document.getElementById('badgeHumidity');
    if (el) el.textContent = `${Number(telemetry.humidity).toFixed(0)} % RH`;
    if (badge) {
      badge.textContent = 'ปกติ';
      badge.className = 'status-badge status-badge-normal';
    }
  }

  // Alarm triggers & Auto incident snapshot
  if (hr !== null && spo2 !== null && resp !== null && risk !== null) {
    checkClinicalAlarms(hr, spo2, resp, risk);
  }
}

function updateBadgeState(elementId, isAbnormal, text) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `status-badge ${isAbnormal ? 'status-badge-danger' : 'status-badge-normal'}`;
}

function updateRiskBadge(risk) {
  const el = document.getElementById('badgeRisk');
  if (!el) return;
  if (risk >= 65) {
    el.textContent = 'วิกฤต (High Risk)';
    el.className = 'status-badge status-badge-danger';
  } else if (risk >= 35) {
    el.textContent = 'ปานกลาง (Medium)';
    el.className = 'status-badge status-badge-warning';
  } else {
    el.textContent = 'ปกติ (Low Risk)';
    el.className = 'status-badge status-badge-normal';
  }
}

// --------------------------------------------------------------------------
// 4. Clinical Alarms & Incident Recorder
// --------------------------------------------------------------------------
function checkClinicalAlarms(hr, spo2, resp, risk) {
  const isCritical = spo2 < 90 || hr < 45 || hr > 120 || risk >= 75;

  if (isCritical) {
    consecutiveCriticalPackets++;
    // Trigger alarm every 12 seconds if persistent
    const now = Date.now();
    if (consecutiveCriticalPackets >= 3 && now - lastAlarmTime > 12000) {
      lastAlarmTime = now;

      if (typeof showToast === 'function') {
        showToast(
          'เตือนภัยวิกฤต: สัญญาณชีพผิดปกติ!',
          `SpO2: ${spo2}% | HR: ${hr} BPM | Risk Score: ${risk}/100 ตรวจพบภาวะเสี่ยงหยุดหายใจ`,
          'danger',
          6000
        );
      }

      // Auto-capture Incident Snapshot into History
      captureIncidentSnapshot(hr, spo2, resp, risk);
    }
  } else {
    consecutiveCriticalPackets = 0;
  }
}

function captureIncidentSnapshot(hr, spo2, resp, risk) {
  const p = typeof getActivePatient === 'function' ? getActivePatient() : null;
  const ecgPoints = ecgChart ? [...ecgChart.data.datasets[0].data] : initialEcgBaseline;

  const newIncident = {
    id: p ? p.hn || 'HN-ACTIVE' : 'HN-UNKNOWN',
    name: p ? p.name || 'ผู้ป่วยทั่วไป' : 'ผู้ป่วยห้องตรวจ',
    ageGender: p ? `${p.age || '-'} / ${p.gender || '-'}` : '54 / ชาย',
    roomBed: p ? `${p.ward || 'ICU'} • ${p.bed || 'Bed 01'}` : 'ICU • Bed 04',
    timestamp: new Date().toLocaleTimeString('th-TH', { hour12: false }) + ' วันนี้',
    hr: hr,
    spo2: spo2,
    sleepRisk: risk,
    riskLevel: risk >= 65 ? 'high' : risk >= 35 ? 'med' : 'low',
    status: risk >= 65 ? 'Apnea Detected' : 'Hypoxia Alert',
    notes: `ระบบบันทึกอัตโนมัติเนื่องจากระดับออกซิเจนในเลือด SpO2 ลดลงแตะ ${spo2}% ร่วมกับคะแนนความเสี่ยงแตะ ${risk}/100`,
    ecgSnapshot: ecgPoints
  };

  if (typeof saveIncidentRecord === 'function') {
    saveIncidentRecord(newIncident);
  }

  // Refresh history UI if active
  loadAndRenderHistory();
}

// --------------------------------------------------------------------------
// 5. Stream State Management (Empty / Live / Signal Loss)
// --------------------------------------------------------------------------
function setStreamState(state) {
  streamState = state;
  const overlay = document.getElementById('emptyStateOverlay');
  const banner = document.getElementById('signalLossBanner');
  const sensorPill = document.getElementById('patientSensorPill');
  const sidebarDot = document.getElementById('sidebarStatusDot');
  const sidebarText = document.getElementById('sidebarStatusText');
  const sidebarDeviceTag = document.getElementById('sidebarDeviceTag');
  const sidebarHwBadge = document.getElementById('sidebarHwBadge');
  const diagHwStatus = document.getElementById('diagHwStatus');
  const btnConnect = document.getElementById('btnConnectSerial');
  const btnDisconnect = document.getElementById('btnDisconnectSerial');
  const ecgLiveBadge = document.getElementById('ecgLiveBadge');
  const spo2LiveBadge = document.getElementById('spo2LiveBadge');

  if (state === 'LIVE') {
    if (overlay) overlay.classList.remove('active');
    if (banner) banner.classList.remove('active');
    if (sensorPill) {
      sensorPill.innerHTML = '<i class="fa-solid fa-wifi text-green"></i> ESP-01 Wi-Fi สตรีมสด';
      sensorPill.className = 'pill pill-status pill-active';
    }
    if (sidebarDot) sidebarDot.className = 'status-dot active';
    if (sidebarText) sidebarText.textContent = 'ออนไลน์ • เชื่อมต่อแล้ว';
    if (sidebarDeviceTag) sidebarDeviceTag.textContent = 'ออนไลน์ • สตรีมมิ่ง';
    if (sidebarHwBadge) sidebarHwBadge.innerHTML = '<i class="fa-solid fa-circle-check text-green"></i>';
    if (diagHwStatus) {
      diagHwStatus.textContent = 'เชื่อมต่อแล้ว';
      diagHwStatus.className = 'status-badge status-badge-normal';
    }
    if (btnConnect) btnConnect.style.display = 'none';
    if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
    if (ecgLiveBadge) ecgLiveBadge.innerHTML = '<span class="pulse-dot-red"></span> LIVE STREAM';
    if (spo2LiveBadge) spo2LiveBadge.innerHTML = '<span class="pulse-dot-green"></span> LIVE STREAM';

  } else if (state === 'SIGNAL_LOSS') {
    clearVitalsDisplay();
    if (overlay) overlay.classList.remove('active');
    if (banner) banner.classList.add('active');
    if (sensorPill) {
      sensorPill.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-yellow"></i> สัญญาณขาดหาย';
      sensorPill.className = 'pill pill-status pill-warning';
    }
    if (sidebarDot) sidebarDot.className = 'status-dot warning';
    if (sidebarText) sidebarText.textContent = 'สัญญาณขาดหาย';
    if (sidebarDeviceTag) sidebarDeviceTag.textContent = 'สัญญาณขาดหาย';
    if (sidebarHwBadge) sidebarHwBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-yellow"></i>';
    if (diagHwStatus) {
      diagHwStatus.textContent = 'สัญญาณขาดหาย';
      diagHwStatus.className = 'status-badge status-badge-warning';
    }
    if (btnConnect) btnConnect.style.display = 'none';
    if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
    if (ecgLiveBadge) ecgLiveBadge.innerHTML = '<span class="pulse-dot-red" style="background:#f59e0b"></span> ขาดสัญญาณ';
    if (spo2LiveBadge) spo2LiveBadge.innerHTML = '<span class="pulse-dot-green" style="background:#f59e0b"></span> ขาดสัญญาณ';

  } else { // EMPTY
    clearVitalsDisplay();
    if (overlay) overlay.classList.add('active');
    if (banner) banner.classList.remove('active');
    if (sensorPill) {
      sensorPill.innerHTML = '<i class="fa-solid fa-circle-notch"></i> รอข้อมูล ESP-01 Wi-Fi';
      sensorPill.className = 'pill pill-status';
    }
    if (sidebarDot) sidebarDot.className = 'status-dot';
    if (sidebarText) sidebarText.textContent = 'ออฟไลน์ (ยังไม่ได้เชื่อมต่อ)';
    if (sidebarDeviceTag) sidebarDeviceTag.textContent = 'ESP-01 Wi-Fi';
    if (sidebarHwBadge) sidebarHwBadge.innerHTML = '<i class="fa-solid fa-circle-notch"></i>';
    if (diagHwStatus) {
      diagHwStatus.textContent = 'รอเชื่อมต่อ';
      diagHwStatus.className = 'status-badge status-badge-normal';
    }
    if (btnConnect) btnConnect.style.display = 'inline-flex';
    if (btnDisconnect) btnDisconnect.style.display = 'none';
    if (ecgLiveBadge) ecgLiveBadge.innerHTML = '<span class="pulse-dot-red" style="background:#94a3b8"></span> รอสัญญาณ';
    if (spo2LiveBadge) spo2LiveBadge.innerHTML = '<span class="pulse-dot-green" style="background:#94a3b8"></span> รอสัญญาณ';
  }
}

window.setStreamState = setStreamState;

// --------------------------------------------------------------------------
// 6. Tab Navigation: Dashboard <-> History (Single Page)
// --------------------------------------------------------------------------
function switchTab(tabName) {
  const dashboardView = document.getElementById('viewDashboard');
  const historyView = document.getElementById('viewHistory');
  const navItems = document.querySelectorAll('.sidebar .nav-item, .mobile-nav-tab');
  const signalBanner = document.getElementById('signalLossBanner');
  const topbarActions = document.querySelector('.topbar-actions');
  const pageMainTitle = document.getElementById('pageMainTitle');
  const pageSubTitle = document.getElementById('pageSubTitle');

  navItems.forEach(item => {
    const target = item.getAttribute('data-tab');
    if (target) {
      item.classList.toggle('active', target === tabName);
    }
  });

  if (tabName === 'history') {
    if (dashboardView) dashboardView.style.display = 'none';
    if (historyView) historyView.style.display = 'block';
    // ซ่อน Signal Banner และปุ่ม WebSocket ในหน้า History
    if (signalBanner) signalBanner.style.display = 'none';
    if (topbarActions) topbarActions.style.display = 'none';
    if (pageMainTitle) pageMainTitle.textContent = 'ประวัติผู้ป่วย & บันทึกเหตุการณ์';
    if (pageSubTitle) pageSubTitle.textContent = 'Incident Log ที่ระบบบันทึกอัตโนมัติเมื่อตรวจพบสัญญาณชีพผิดปกติ';
    window.location.hash = 'history';
    loadAndRenderHistory();
  } else {
    // Default: Dashboard
    if (dashboardView) dashboardView.style.display = 'block';
    if (historyView) historyView.style.display = 'none';
    // คืน Signal Banner และปุ่ม WebSocket
    if (signalBanner) signalBanner.style.display = '';
    if (topbarActions) topbarActions.style.display = '';
    if (pageMainTitle) pageMainTitle.textContent = 'แดชบอร์ดเฝ้าระวังสัญญาณชีพ (Real-time)';
    if (pageSubTitle) pageSubTitle.textContent = 'ติดตามคลื่นไฟฟ้าหัวใจ (AD8232 ECG Lead II) และระดับออกซิเจนในเลือด (SpO2)';
    window.location.hash = 'dashboard';
    // Re-size charts cleanly
    if (ecgChart) ecgChart.resize();
  }
}

window.switchTab = switchTab;

// --------------------------------------------------------------------------
// 7. Patient History Management & Modal Snapshot
// --------------------------------------------------------------------------
let historyRecords = [];

function loadAndRenderHistory() {
  try {
    const saved = localStorage.getItem('sleep_guard_incident_records');
    if (saved) {
      const parsed = JSON.parse(saved);
      historyRecords = Array.isArray(parsed) ? parsed : [];
    } else {
      historyRecords = [];
    }
  } catch (e) {
    historyRecords = [];
  }

  filterAndRenderHistory(false);
}

function filterAndRenderHistory(showSkeleton = false) {
  const searchInput = document.getElementById('searchPatient');
  const riskSelect = document.getElementById('filterRisk');
  const tbody = document.getElementById('patientTableBody');

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const riskFilter = riskSelect ? riskSelect.value : 'all';

  if (showSkeleton && tbody) {
    tbody.innerHTML = `
      <tr class="skeleton-row">
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
      </tr>
      <tr class="skeleton-row">
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
      </tr>
      <tr class="skeleton-row">
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
        <td><div></div></td><td><div></div></td><td><div></div></td><td><div></div></td>
      </tr>
    `;
    setTimeout(() => {
      executeHistoryFilter(query, riskFilter);
    }, 350);
  } else {
    executeHistoryFilter(query, riskFilter);
  }
}

function executeHistoryFilter(query, riskFilter) {
  const filtered = historyRecords.filter(p => {
    const matchQuery = (p.name || '').toLowerCase().includes(query) ||
                       (p.id || '').toLowerCase().includes(query) ||
                       (p.roomBed || '').toLowerCase().includes(query);
    const matchRisk = (riskFilter === 'all') || (p.riskLevel === riskFilter);
    return matchQuery && matchRisk;
  });

  renderPatientTable(filtered);
}

function renderPatientTable(records) {
  const tbody = document.getElementById('patientTableBody');
  const cardList = document.getElementById('historyCardList');
  const emptyBox = document.getElementById('historyEmptyState');
  const countLabel = document.getElementById('historyCountLabel');

  // อัปเดต Stats Summary
  const statTotal = document.getElementById('statTotal');
  const statHigh = document.getElementById('statHigh');
  const statMed = document.getElementById('statMed');
  const statLow = document.getElementById('statLow');
  const allRecords = historyRecords; // ใช้ total records ไม่ใช่ filtered
  if (statTotal) statTotal.textContent = allRecords.length;
  if (statHigh) statHigh.textContent = allRecords.filter(r => r.riskLevel === 'high').length;
  if (statMed) statMed.textContent = allRecords.filter(r => r.riskLevel === 'med').length;
  if (statLow) statLow.textContent = allRecords.filter(r => r.riskLevel === 'low').length;

  // อัปเดต count label และ sidebar badge
  if (countLabel) countLabel.innerHTML = `แสดงผล <strong>${records.length}</strong> รายการ`;
  const sbHistoryBadge = document.getElementById('sidebarHistoryBadge');
  if (sbHistoryBadge) sbHistoryBadge.textContent = allRecords.length;

  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = '';
    if (cardList) cardList.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  // Desktop Table
  tbody.innerHTML = records.map((p, idx) => `
    <tr onclick="openIncidentModal(${idx})">
      <td>
        <div class="patient-cell">
          <div class="patient-avatar">${(p.name || 'ผ').charAt(3) || (p.name || 'ผ').charAt(0)}</div>
          <div class="patient-meta">
            <span class="patient-name">${p.name}</span>
            <span class="patient-sub">${p.id} • ${p.ageGender}</span>
          </div>
        </div>
      </td>
      <td><strong>${p.roomBed}</strong></td>
      <td><span class="text-muted"><i class="fa-regular fa-clock"></i> ${p.timestamp}</span></td>
      <td><span class="val-number" style="font-size:15px; font-weight:700; color:${p.hr > 100 ? '#ef4444' : '#0f172a'}">${p.hr}</span> BPM</td>
      <td><span class="val-number" style="font-size:15px; font-weight:700; color:${p.spo2 < 95 ? '#ef4444' : '#0284c7'}">${p.spo2}%</span></td>
      <td>
        <span class="risk-chip ${p.riskLevel || 'low'}">
          <i class="fa-solid fa-circle" style="font-size:7px"></i> Risk: ${p.sleepRisk}/100
        </span>
      </td>
      <td>
        <span class="status-badge ${p.riskLevel === 'high' ? 'status-badge-danger' : p.riskLevel === 'med' ? 'status-badge-warning' : 'status-badge-normal'}">
          ${p.status}
        </span>
      </td>
      <td>
        <button class="btn btn-outline btn-sm" title="ดูคลื่นหัวใจย้อนหลัง">
          <i class="fa-solid fa-chart-line"></i> กราฟ ECG
        </button>
      </td>
    </tr>
  `).join('');

  // Mobile Cards List
  if (cardList) {
    cardList.innerHTML = records.map((p, idx) => `
      <div class="history-card-item" onclick="openIncidentModal(${idx})">
        <div class="history-card-top">
          <div>
            <strong style="font-size:15px; color:#0f172a">${p.name}</strong>
            <div style="font-size:12px; color:#64748b">${p.id} • ${p.roomBed}</div>
          </div>
          <span class="status-badge ${p.riskLevel === 'high' ? 'status-badge-danger' : p.riskLevel === 'med' ? 'status-badge-warning' : 'status-badge-normal'}">
            ${p.status}
          </span>
        </div>
        <div style="font-size:12px; color:#94a3b8; margin: 6px 0 8px">
          <i class="fa-regular fa-clock"></i> ${p.timestamp}
        </div>
        <div class="history-card-metrics">
          <div class="metric-item">
            <span class="metric-label">Heart Rate</span>
            <span class="metric-num" style="color:${p.hr > 100 ? '#ef4444' : '#0f172a'}">${p.hr} BPM</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">SpO2</span>
            <span class="metric-num" style="color:${p.spo2 < 95 ? '#ef4444' : '#0284c7'}">${p.spo2}%</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Risk Score</span>
            <span class="metric-num" style="color:${p.riskLevel === 'high' ? '#ef4444' : '#10b981'}">${p.sleepRisk}/100</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// --------------------------------------------------------------------------
// 8. Incident ECG Playback Modal
// --------------------------------------------------------------------------
window.openIncidentModal = function(index) {
  const patient = historyRecords[index];
  if (!patient) return;

  const modal = document.getElementById('incidentModal');
  if (!modal) return;

  const nameEl = document.getElementById('modalPatientName');
  const idEl = document.getElementById('modalPatientId');
  const timeEl = document.getElementById('modalEventTime');
  const hrEl = document.getElementById('modalHR');
  const spo2El = document.getElementById('modalSpO2');
  const riskEl = document.getElementById('modalRiskScore');
  const notesEl = document.getElementById('modalNotes');

  if (nameEl) nameEl.textContent = patient.name;
  if (idEl) idEl.textContent = `${patient.id} • ${patient.ageGender} • ${patient.roomBed}`;
  if (timeEl) timeEl.textContent = patient.timestamp;
  if (hrEl) hrEl.textContent = `${patient.hr} BPM`;
  if (spo2El) spo2El.textContent = `${patient.spo2}%`;
  if (riskEl) riskEl.textContent = `${patient.sleepRisk}/100`;
  if (notesEl) notesEl.textContent = patient.notes;

  modal.classList.add('show');

  // Render Playback Canvas
  const canvas = document.getElementById('modalEcgChart');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (modalChartInstance) modalChartInstance.destroy();

    const snapshot = patient.ecgSnapshot || [48, 50, 52, 95, 115, 25, 45, 50, 52];

    modalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: snapshot.map((_, i) => `${(i * 0.1).toFixed(1)}s`),
        datasets: [{
          label: 'ECG Lead II (Snapshot Record)',
          data: snapshot,
          borderColor: '#ef4444',
          borderWidth: 2.2,
          pointRadius: 3,
          pointBackgroundColor: '#ef4444',
          tension: 0.25,
          fill: true,
          backgroundColor: 'rgba(239, 68, 68, 0.15)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#94a3b8' }, min: 0, max: 130 }
        }
      }
    });
  }
};

window.closeIncidentModal = function() {
  const modal = document.getElementById('incidentModal');
  if (modal) modal.classList.remove('show');
};

window.openHardwareModal = function() {
  const modal = document.getElementById('hardwareModal');
  if (modal) modal.classList.add('show');
};

window.closeHardwareModal = function() {
  const modal = document.getElementById('hardwareModal');
  if (modal) modal.classList.remove('show');
};

// --------------------------------------------------------------------------
// 9. Synchronize Active Patient Header & Sidebar Card
// --------------------------------------------------------------------------
function syncActivePatientDisplay() {
  const namePill = document.getElementById('patientNamePill');
  const wardPill = document.getElementById('patientWardPill');
  const sbName = document.getElementById('sidebarPatientName');
  const sbHn = document.getElementById('sidebarPatientHN');
  const sbWard = document.getElementById('sidebarWardTag');
  const p = typeof getActivePatient === 'function' ? getActivePatient() : null;

  if (!p) {
    if (namePill) namePill.innerHTML = `<i class="fa-solid fa-user-injured"></i> ยังไม่ได้ระบุผู้ป่วย`;
    if (wardPill) wardPill.innerHTML = `<i class="fa-solid fa-bed-pulse"></i> หอผู้ป่วยทั่วไป`;
    if (sbName) sbName.textContent = 'ยังไม่ได้ระบุผู้ป่วย';
    if (sbHn) sbHn.textContent = 'คลิกเพื่อตั้งค่า';
    if (sbWard) sbWard.textContent = 'หอผู้ป่วยทั่วไป';
    return;
  }

  if (namePill) {
    if (p.isGuest) {
      namePill.innerHTML = `<i class="fa-solid fa-shield-halved" style="color:#0d9488"></i> โหมดทั่วไป (ไม่เก็บข้อมูล)`;
    } else {
      namePill.innerHTML = `<i class="fa-solid fa-user-injured"></i> ${p.name || 'ยังไม่ได้ระบุผู้ป่วย'} ${p.hn && p.hn !== '-' ? `(${p.hn})` : ''}`;
    }
    namePill.style.cursor = 'pointer';
    namePill.onclick = () => window.location.href = 'settings.html';
  }

  if (wardPill) {
    wardPill.innerHTML = `<i class="fa-solid fa-bed-pulse"></i> ${p.ward && p.ward !== '-' ? p.ward : 'ทั่วไป'}`;
  }

  // Sidebar Patient Card
  if (sbName) {
    if (p.isGuest) {
      sbName.textContent = 'โหมดทั่วไป (ไม่ระบุตัวตน)';
    } else {
      sbName.textContent = p.name || 'ยังไม่ได้ระบุผู้ป่วย';
    }
  }

  if (sbHn) {
    if (p.isGuest) {
      sbHn.textContent = 'Anonymous Guest';
    } else {
      sbHn.textContent = p.hn && p.hn !== '-' ? `HN: ${p.hn}` : 'HN: ยังไม่ได้ระบุ';
    }
  }

  if (sbWard) {
    sbWard.textContent = p.ward && p.ward !== '-' ? p.ward : 'ทั่วไป';
  }
}

// --------------------------------------------------------------------------
// 10. Initialization & Event Listeners
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // ลบข้อมูล mock-up เก่าออกจาก localStorage (ถ้ามีการ seed ไปก่อนหน้า)
  try {
    const storedRaw = localStorage.getItem('sleep_guard_incident_records');
    if (storedRaw) {
      const stored = JSON.parse(storedRaw);
      const mockHNs = ['HN-84920', 'HN-73192', 'HN-91044', 'HN-65231'];
      const hasMock = Array.isArray(stored) && stored.some(r => mockHNs.includes(r.id));
      if (hasMock) {
        // กรองเอาเฉพาะข้อมูลจริงออก (ที่ไม่ใช่ mock)
        const realOnly = stored.filter(r => !mockHNs.includes(r.id));
        localStorage.setItem('sleep_guard_incident_records', JSON.stringify(realOnly));
      }
    }
  } catch (e) { /* ignore */ }

  initLiveClock();
  initMobileNavigation();
  initDashboardCharts();
  syncActivePatientDisplay();
  if (window.microbitSerial && window.microbitSerial.isConnected) {
    setStreamState('LIVE');
  } else {
    setStreamState('EMPTY');
  }

  // Handle URL Hash for View Switching (#dashboard or #history)
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash === 'history') {
    switchTab('history');
  } else {
    switchTab('dashboard');
  }

  // Sidebar navigation tab events
  document.querySelectorAll('[data-tab]').forEach(item => {
    item.addEventListener('click', (e) => {
      const tab = item.getAttribute('data-tab');
      if (tab === 'dashboard' || tab === 'history') {
        e.preventDefault();
        switchTab(tab);
      }
    });
  });

  // Local API / Serial Connect Buttons
  const btnConnect = document.getElementById('btnConnectSerial');
  const btnReconnectEmpty = document.getElementById('btnReconnectEmpty');
  const btnDisconnect = document.getElementById('btnDisconnectSerial');

  async function handleConnect() {
    if (window.microbitSerial) {
      if (btnConnect) {
        btnConnect.disabled = true;
        btnConnect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเชื่อมต่อ...';
      }
      try {
        const ok = await window.microbitSerial.connect();
        if (ok || (window.microbitSerial && window.microbitSerial.isConnected)) {
          setStreamState('LIVE');
        } else {
          if (typeof showToast === 'function') {
            showToast('เชื่อมต่อไม่สำเร็จ', 'กรุณาตรวจสอบ microbit_bridge.py ที่พอร์ต 8080', 'danger', 3000);
          }
        }
      } catch (err) {
        console.error('Connection error:', err);
      } finally {
        if (btnConnect) {
          btnConnect.disabled = false;
          btnConnect.innerHTML = '<i class="fa-solid fa-plug"></i> เชื่อมต่อ PC Bridge (8080)';
        }
      }
    }
  }

  if (btnConnect) btnConnect.addEventListener('click', handleConnect);
  if (btnReconnectEmpty) btnReconnectEmpty.addEventListener('click', handleConnect);

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      if (window.microbitSerial) {
        window.microbitSerial.disconnect();
        setStreamState('EMPTY');
      }
    });
  }

  // Hook into Local API Telemetry
  if (window.microbitSerial) {
    window.microbitSerial.onVitals((data) => {
      if (streamState !== 'LIVE') {
        setStreamState('LIVE');
      }
      pushRealWaveformSample(data.ecg, data.spo2, data);
      updateVitalsDisplay(data);
    });

    window.microbitSerial.onStatusChange((connected) => {
      if (connected) {
        setStreamState('LIVE');
      } else {
        setStreamState('EMPTY');
      }
    });
  }

  // History Filter Listeners
  const searchInput = document.getElementById('searchPatient');
  if (searchInput) {
    searchInput.addEventListener('input', () => filterAndRenderHistory(false));
  }

  const riskSelect = document.getElementById('filterRisk');
  if (riskSelect) {
    riskSelect.addEventListener('change', () => filterAndRenderHistory(true));
  }

  const refreshBtn = document.getElementById('btnRefreshHistory');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (typeof showToast === 'function') {
        showToast('กำลังรีเฟรชข้อมูล', 'ดึงบันทึกสัญญาณชีพและประวัติผู้ป่วยล่าสุด...', 'info', 2000);
      }
      filterAndRenderHistory(true);
    });
  }

  const clearBtn = document.getElementById('btnClearHistory');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (historyRecords.length === 0) {
        showToast('ไม่มีข้อมูล', 'ยังไม่มีประวัติการแจ้งเตือนในระบบ', 'info', 2500);
        return;
      }
      if (confirm(`ต้องการลบประวัติการแจ้งเตือนทั้งหมด ${historyRecords.length} รายการ?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) {
        localStorage.removeItem('sleep_guard_incident_records');
        historyRecords = [];
        filterAndRenderHistory(false);
        showToast('ล้างประวัติแล้ว', 'ลบข้อมูล Incident Log ทั้งหมดเรียบร้อย', 'success', 3000);
      }
    });
  }

  // Close modal on backdrop click
  const modal = document.getElementById('incidentModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeIncidentModal();
    });
  }
});

// Export Public API
window.sleepGuardAPI = {
  pushVitals: updateVitalsDisplay,
  pushWaveform: pushRealWaveformSample,
  setStreamState: setStreamState,
  switchTab: switchTab
};
