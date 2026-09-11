/**
 * Sleep Guard - System Settings Controller (settings.js)
 * Modern Senior UI/UX Clinical Settings Engine:
 * - 2 Unified Segmented Tabs:
 *   1) Patient Profile & Vitals Alert Thresholds (Merged Patient EHR + Vitals Guard)
 *   2) Acoustic Buzzer & LINE Alerts
 * - Auto-HN (Hospital Number) Generation System
 * - Interactive Dynamic Heart Rate Spectrum Visualizer
 * - Clinical Presets Quick Selector (Adult, Elderly, ICU, Athlete)
 * - Individual Patient Cards Directory with Live Status & Thresholds
 * - Stepper Controls & Audio Buzzer Test Suite
 * - LocalStorage Persistence with Multi-Patient Registry
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

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initMobileNavigation();
  let currentSettings = getStoredSettings();

  // --------------------------------------------------------------------------
  // 1. Data Store & Storage Key
  // --------------------------------------------------------------------------
  const PATIENTS_STORAGE_KEY = 'sleep_guard_patients_registry';

  function isGuestModeActive() {
    return localStorage.getItem('sleep_guard_guest_mode') === 'true';
  }

  function getStoredPatients() {
    try {
      const saved = localStorage.getItem(PATIENTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading patient records from storage:', e);
    }
    return [];
  }

  function saveStoredPatients(patients) {
    try {
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(patients));
    } catch (e) {
      console.error('Error saving patient records to storage:', e);
    }
  }

  let patientsData = getStoredPatients();

  // Helper: Auto-Generate Unique HN
  function generateUniqueHN() {
    let newHn = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 100) {
      attempts++;
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      newHn = `HN-${randomNum}`;
      isUnique = !patientsData.some(p => p.hn.toUpperCase() === newHn.toUpperCase());
    }
    return newHn;
  }

  // --------------------------------------------------------------------------
  // 2. DOM Elements References
  // --------------------------------------------------------------------------
  // Patient Profile & Vitals Form Elements
  const inputPatientHn = document.getElementById('inputPatientHn');
  const btnGenerateHn = document.getElementById('btnGenerateHn');
  const inputPatientName = document.getElementById('inputPatientName');
  const inputPatientAge = document.getElementById('inputPatientAge');
  const selectPatientGender = document.getElementById('selectPatientGender');
  const inputPatientWard = document.getElementById('inputPatientWard');
  const inputPatientBed = document.getElementById('inputPatientBed');
  const inputPatientAdmitDate = document.getElementById('inputPatientAdmitDate');
  const inputPatientPhone = document.getElementById('inputPatientPhone');
  const inputPatientDoctor = document.getElementById('inputPatientDoctor');
  const inputPatientNurse = document.getElementById('inputPatientNurse');
  const diseaseTagsContainer = document.getElementById('diseaseTagsContainer');
  const inputOtherConditions = document.getElementById('inputOtherConditions');
  const inputPatientAllergies = document.getElementById('inputPatientAllergies');
  const inputBaselineBp = document.getElementById('inputBaselineBp');
  const selectAssignedDevice = document.getElementById('selectAssignedDevice');
  const inputClinicalNotes = document.getElementById('inputClinicalNotes');
  const formModeTitle = document.getElementById('formModeTitle');

  // Vitals Thresholds Elements
  const inputHrMin = document.getElementById('inputHrMin');
  const inputHrMax = document.getElementById('inputHrMax');
  const inputSpo2Min = document.getElementById('inputSpo2Min');
  const inputApneaDelay = document.getElementById('inputApneaDelay');
  const hrRangeDisplay = document.getElementById('hrRangeDisplay');
  const zoneBrady = document.getElementById('zoneBrady');
  const zoneNormal = document.getElementById('zoneNormal');
  const zoneTachy = document.getElementById('zoneTachy');
  const gaugeBradyVal = document.getElementById('gaugeBradyVal');
  const gaugeTachyVal = document.getElementById('gaugeTachyVal');
  const presetBtns = document.querySelectorAll('.btn-preset[data-preset]');

  // Active Patient Overview Elements
  const dispAvatar = document.getElementById('dispAvatar');
  const dispFullName = document.getElementById('dispFullName');
  const dispHnTag = document.getElementById('dispHnTag');
  const dispRiskBadge = document.getElementById('dispRiskBadge');
  const dispWardBed = document.getElementById('dispWardBed');
  const dispAgeGender = document.getElementById('dispAgeGender');
  const dispDoctor = document.getElementById('dispDoctor');
  const dispAdmitDate = document.getElementById('dispAdmitDate');
  const dispConditionTags = document.getElementById('dispConditionTags');
  const dispThresholdHr = document.getElementById('dispThresholdHr');
  const dispThresholdSpo2 = document.getElementById('dispThresholdSpo2');
  const dispThresholdApnea = document.getElementById('dispThresholdApnea');

  // Action Buttons
  const btnSavePatient = document.getElementById('btnSavePatient');
  const btnSetActivePatient = document.getElementById('btnSetActivePatient');
  const btnResetPatientForm = document.getElementById('btnResetPatientForm');
  const btnCancelPatientEdit = document.getElementById('btnCancelPatientEdit');
  const btnDeletePatient = document.getElementById('btnDeletePatient');
  const btnNewPatientTop = document.getElementById('btnNewPatientTop');
  const btnAutoNewPatient = document.getElementById('btnAutoNewPatient');
  const searchSettingsPatients = document.getElementById('searchSettingsPatients');
  const patientCardsGrid = document.getElementById('patientCardsGrid');
  const patientCounterBadge = document.getElementById('patientCounterBadge');
  const patientQuickPresetsGroup = document.getElementById('patientQuickPresetsGroup');

  // Tab 2 (Audio & Alerts) Elements
  const toggleBuzzer = document.getElementById('toggleBuzzer');
  const buzzerStatusTag = document.getElementById('buzzerStatusTag');
  const sliderBuzzerVol = document.getElementById('sliderBuzzerVol');
  const badgeBuzzerVol = document.getElementById('badgeBuzzerVol');
  const soundWaveBox = document.getElementById('soundWaveBox');
  const volPresetBtns = document.querySelectorAll('.btn-vol-preset');
  const selectAlarmTone = document.getElementById('selectAlarmTone');
  const btnTestBuzzer = document.getElementById('btnTestBuzzer');
  const btnTestCriticalAlarm = document.getElementById('btnTestCriticalAlarm');
  const toggleVisualAlarm = document.getElementById('toggleVisualAlarm');
  const toggleLineNotify = document.getElementById('toggleLineNotify');
  const inputLineToken = document.getElementById('inputLineToken');
  const btnToggleTokenVisibility = document.getElementById('btnToggleTokenVisibility');
  const selectLineTarget = document.getElementById('selectLineTarget');
  const btnTestLineNotify = document.getElementById('btnTestLineNotify');

  // Action Bar Footer
  const btnResetDefaults = document.getElementById('btnResetDefaults');
  const btnSubmitForm = document.getElementById('btnSubmitForm');
  const lastSavedIndicator = document.getElementById('lastSavedIndicator');

  // --------------------------------------------------------------------------
  // 3. Tab Switching Mechanism (Dual Sync: Top Tabs & Sidebar Sub-menu)
  // --------------------------------------------------------------------------
  const topTabs = document.querySelectorAll('.settings-tab-bar .tab-btn');
  const sidebarTabs = document.querySelectorAll('.sub-menu .settings-nav-item');
  const panels = document.querySelectorAll('.settings-panel');

  function switchTab(targetTabId) {
    topTabs.forEach(btn => {
      const match = btn.getAttribute('data-tab') === targetTabId;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    sidebarTabs.forEach(btn => {
      const match = btn.getAttribute('data-tab') === targetTabId;
      btn.classList.toggle('active', match);
    });

    panels.forEach(panel => {
      const match = panel.id === targetTabId;
      panel.classList.toggle('active', match);
    });
  }

  topTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      if (target) switchTab(target);
    });
  });

  sidebarTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      if (target) switchTab(target);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Interactive Live Heart Rate Spectrum Visualizer
  // --------------------------------------------------------------------------
  function updateSpectrumVisualizer() {
    if (!inputHrMin || !inputHrMax || !zoneBrady || !zoneNormal || !zoneTachy) return;

    let hrMin = parseInt(inputHrMin.value, 10) || 50;
    let hrMax = parseInt(inputHrMax.value, 10) || 100;

    if (hrMin >= hrMax) hrMin = hrMax - 1;
    if (hrMin < 30) hrMin = 30;
    if (hrMax > 180) hrMax = 180;

    const totalRange = 180 - 30; // 150
    const bradyPercent = Math.max(12, Math.min(60, ((hrMin - 30) / totalRange) * 100));
    const tachyPercent = Math.max(12, Math.min(60, ((180 - hrMax) / totalRange) * 100));
    const normalPercent = Math.max(20, 100 - bradyPercent - tachyPercent);

    zoneBrady.style.width = `${bradyPercent.toFixed(1)}%`;
    zoneNormal.style.width = `${normalPercent.toFixed(1)}%`;
    zoneTachy.style.width = `${tachyPercent.toFixed(1)}%`;

    if (gaugeBradyVal) gaugeBradyVal.textContent = hrMin;
    if (gaugeTachyVal) gaugeTachyVal.textContent = hrMax;
    if (hrRangeDisplay) hrRangeDisplay.textContent = `ช่วงปลอดภัย: ${hrMin} - ${hrMax} BPM`;
  }

  if (inputHrMin) inputHrMin.addEventListener('input', updateSpectrumVisualizer);
  if (inputHrMax) inputHrMax.addEventListener('input', updateSpectrumVisualizer);

  // Stepper Increment/Decrement Controls (+ / -)
  const stepperBtns = document.querySelectorAll('.btn-stepper');
  stepperBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-step-target');
      const step = parseInt(btn.getAttribute('data-step'), 10) || 1;
      const input = document.getElementById(targetId);

      if (input) {
        let val = parseInt(input.value, 10) || 0;
        const min = parseInt(input.min, 10) || 0;
        const max = parseInt(input.max, 10) || 200;

        val = Math.max(min, Math.min(max, val + step));
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));

        presetBtns.forEach(p => p.classList.remove('active'));
      }
    });
  });

  // Clinical Presets Quick Selector
  const clinicalPresets = {
    adult: { hrMin: 50, hrMax: 100, spo2Min: 95, apneaDelay: 10, label: 'ผู้ใหญ่ทั่วไป (Adult Standard)' },
    elderly: { hrMin: 55, hrMax: 95, spo2Min: 93, apneaDelay: 8, label: 'ผู้สูงอายุ / พักฟื้น (Elderly Care)' },
    icu: { hrMin: 60, hrMax: 110, spo2Min: 96, apneaDelay: 6, label: 'เฝ้าระวังวิกฤต ICU (ICU Strict)' },
    athlete: { hrMin: 45, hrMax: 100, spo2Min: 95, apneaDelay: 12, label: 'นักกีฬา (Athletic Bradycardia)' }
  };

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.getAttribute('data-preset');
      const preset = clinicalPresets[presetKey];
      if (!preset) return;

      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (inputHrMin) inputHrMin.value = preset.hrMin;
      if (inputHrMax) inputHrMax.value = preset.hrMax;
      if (inputSpo2Min) inputSpo2Min.value = preset.spo2Min;
      if (inputApneaDelay) inputApneaDelay.value = preset.apneaDelay;

      updateSpectrumVisualizer();
      showToast('ปรับใช้โหมดพรีเซ็ตแล้ว', `โหลดเกณฑ์มาตรฐานสำหรับ "${preset.label}" เรียบร้อย`, 'info', 2500);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Patient Profile & Clinical Form Engine
  // --------------------------------------------------------------------------
  if (diseaseTagsContainer) {
    diseaseTagsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.tag-chip');
      if (chip) chip.classList.toggle('active');
    });
  }

  function getSelectedConditions() {
    if (!diseaseTagsContainer) return [];
    const activeChips = diseaseTagsContainer.querySelectorAll('.tag-chip.active');
    return Array.from(activeChips).map(c => c.getAttribute('data-condition'));
  }

  function setSelectedConditions(conditions = []) {
    if (!diseaseTagsContainer) return;
    const chips = diseaseTagsContainer.querySelectorAll('.tag-chip');
    chips.forEach(chip => {
      const cond = chip.getAttribute('data-condition');
      chip.classList.toggle('active', conditions.includes(cond));
    });
  }

  function getSelectedRiskLevel() {
    const radio = document.querySelector('input[name="patientRiskLevel"]:checked');
    return radio ? radio.value : 'high';
  }

  function setSelectedRiskLevel(level = 'high') {
    const radio = document.querySelector(`input[name="patientRiskLevel"][value="${level}"]`);
    if (radio) radio.checked = true;
  }

  // Populate Patient Data & Specific Vitals Thresholds
  function populatePatientForm(patient) {
    if (!patient) return;

    if (inputPatientHn) inputPatientHn.value = patient.hn || '';
    if (inputPatientName) inputPatientName.value = patient.name || '';
    if (inputPatientAge) inputPatientAge.value = patient.age || '';
    if (selectPatientGender) selectPatientGender.value = patient.gender || 'ชาย';
    if (inputPatientWard) inputPatientWard.value = patient.ward || '';
    if (inputPatientBed) inputPatientBed.value = patient.bed || '';
    if (inputPatientAdmitDate) inputPatientAdmitDate.value = patient.admitDate || '';
    if (inputPatientPhone) inputPatientPhone.value = patient.phone || '';
    if (inputPatientDoctor) inputPatientDoctor.value = patient.doctor || '';
    if (inputPatientNurse) inputPatientNurse.value = patient.nurse || '';

    setSelectedConditions(patient.conditions || []);
    if (inputOtherConditions) inputOtherConditions.value = patient.otherConditions || '';
    if (inputPatientAllergies) inputPatientAllergies.value = patient.allergies || '';
    setSelectedRiskLevel(patient.riskLevel || 'high');

    // Individual Vitals Thresholds
    if (inputHrMin) inputHrMin.value = patient.hrMin ?? 50;
    if (inputHrMax) inputHrMax.value = patient.hrMax ?? 100;
    if (inputSpo2Min) inputSpo2Min.value = patient.spo2Min ?? 95;
    if (inputApneaDelay) inputApneaDelay.value = patient.apneaDelay ?? 10;

    if (inputBaselineBp) inputBaselineBp.value = patient.baselineBp || '120/80';
    if (selectAssignedDevice) selectAssignedDevice.value = patient.assignedDevice || 'DEV-001';
    if (inputClinicalNotes) inputClinicalNotes.value = patient.clinicalNotes || '';

    if (formModeTitle) {
      formModeTitle.textContent = `แบบฟอร์มข้อมูลประวัติผู้ป่วย: ${patient.name} (${patient.hn})`;
    }

    if (btnDeletePatient) {
      btnDeletePatient.style.display = 'inline-flex';
    }

    updateSpectrumVisualizer();
    highlightSelectedPatientPreset(patient.hn);
  }

  // Clear Form and Auto-Generate New HN
  function clearPatientForm() {
    const autoHn = generateUniqueHN();
    if (inputPatientHn) inputPatientHn.value = autoHn;
    if (inputPatientName) inputPatientName.value = '';
    if (inputPatientAge) inputPatientAge.value = '';
    if (selectPatientGender) selectPatientGender.value = 'ชาย';
    if (inputPatientWard) inputPatientWard.value = 'ICU Ward 4 (Intermediate Care)';
    if (inputPatientBed) inputPatientBed.value = 'ICU-04 / เตียง ใหม่';

    const nowIso = new Date().toISOString().slice(0, 16);
    if (inputPatientAdmitDate) inputPatientAdmitDate.value = nowIso;
    if (inputPatientPhone) inputPatientPhone.value = '';
    if (inputPatientDoctor) inputPatientDoctor.value = 'นพ. เกียรติศักดิ์ อานันท์';
    if (inputPatientNurse) inputPatientNurse.value = 'พว. วิภาดา สุขเจริญ (RN)';

    setSelectedConditions(['OSA']);
    if (inputOtherConditions) inputOtherConditions.value = '';
    if (inputPatientAllergies) inputPatientAllergies.value = 'ปฏิเสธประวัติแพ้ยา';
    setSelectedRiskLevel('high');

    // Default Vitals
    if (inputHrMin) inputHrMin.value = 50;
    if (inputHrMax) inputHrMax.value = 100;
    if (inputSpo2Min) inputSpo2Min.value = 95;
    if (inputApneaDelay) inputApneaDelay.value = 10;
    if (inputBaselineBp) inputBaselineBp.value = '120/80';
    if (selectAssignedDevice) selectAssignedDevice.value = 'DEV-001';
    if (inputClinicalNotes) inputClinicalNotes.value = '';

    if (formModeTitle) {
      formModeTitle.textContent = 'แบบฟอร์มลงทะเบียนประวัติผู้ป่วยรายใหม่ (+ New Patient)';
    }

    if (btnDeletePatient) {
      btnDeletePatient.style.display = 'none';
    }

    document.querySelectorAll('[data-patient-preset]').forEach(btn => btn.classList.remove('active'));
    updateSpectrumVisualizer();

    if (inputPatientName) inputPatientName.focus();
  }

  // Auto Generate HN Button
  if (btnGenerateHn) {
    btnGenerateHn.addEventListener('click', () => {
      const newHn = generateUniqueHN();
      if (inputPatientHn) {
        inputPatientHn.value = newHn;
        inputPatientHn.classList.add('pulse-highlight');
        setTimeout(() => inputPatientHn.classList.remove('pulse-highlight'), 600);
      }
      showToast('สร้างรหัส HN ใหม่แล้ว', `รหัสประจำตัวผู้ป่วย: ${newHn}`, 'info', 2000);
    });
  }

  // --------------------------------------------------------------------------
  // Guest Mode & Onboarding Handlers
  // --------------------------------------------------------------------------
  function enableGuestMode() {
    localStorage.setItem('sleep_guard_guest_mode', 'true');
    patientsData.forEach(p => p.isActive = false);
    saveStoredPatients(patientsData);
    updateActivePatientBanner();
    renderQuickPresetsToolbar();
    renderPatientsCardsDirectory();
    showToast('เปิดโหมดไม่เก็บข้อมูลสำเร็จ', 'ระบบเข้าสู่โหมดมอนิเตอร์สัญญาณชีพสดทั่วไปโดยไม่บันทึกประวัติส่วนบุคคล', 'success', 3500);
  }
  window.enableGuestModeGlobal = enableGuestMode;

  // Update Active Patient Banner
  function updateActivePatientBanner() {
    const onboardingEl = document.getElementById('noPatientOnboarding');
    const bannerEl = document.getElementById('activePatientBanner');
    const presetsToolbar = document.getElementById('presetsToolbar');
    const isGuest = isGuestModeActive();

    // If no registered patients AND not in guest mode -> Show Onboarding Choice
    if (patientsData.length === 0 && !isGuest) {
      if (onboardingEl) onboardingEl.style.display = 'block';
      if (bannerEl) bannerEl.style.display = 'none';
      if (presetsToolbar) presetsToolbar.style.display = 'none';
      return;
    }

    if (onboardingEl) onboardingEl.style.display = 'none';
    if (bannerEl) bannerEl.style.display = 'flex';
    if (presetsToolbar) presetsToolbar.style.display = 'flex';

    if (isGuest) {
      // Display Guest / Anonymous Mode in Banner
      if (dispAvatar) dispAvatar.innerHTML = '<i class="fa-solid fa-shield-halved" style="font-size:22px; color:#0d9488;"></i>';
      if (dispFullName) dispFullName.textContent = 'โหมดมอนิเตอร์ทั่วไป (ไม่เก็บข้อมูลส่วนบุคคล)';
      if (dispHnTag) dispHnTag.textContent = 'HN: GUEST-ANON';
      if (dispRiskBadge) {
        dispRiskBadge.className = 'status-badge status-badge-normal';
        dispRiskBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> โหมดไม่บันทึกประวัติ (Guest Mode)';
      }
      if (dispWardBed) dispWardBed.textContent = 'หอผู้ป่วยทั่วไป (General Monitoring)';
      if (dispAgeGender) dispAgeGender.textContent = 'ไม่ระบุตัวตน';
      if (dispDoctor) dispDoctor.textContent = 'ระบบกลาง (Standard)';
      if (dispAdmitDate) dispAdmitDate.textContent = 'โหมดเรียลไทม์สด';
      if (dispConditionTags) {
        dispConditionTags.innerHTML = '<span class="cond-tag tag-info"><i class="fa-solid fa-user-shield"></i> มอนิเตอร์สดไม่ระบุตัวตน</span>';
      }
      if (dispThresholdHr) dispThresholdHr.innerHTML = '50 - 100 <small>BPM</small>';
      if (dispThresholdSpo2) dispThresholdSpo2.innerHTML = '≥ 95 <small>%</small>';
      if (dispThresholdApnea) dispThresholdApnea.innerHTML = '10 <small>วินาที</small>';
      return;
    }

    const activePat = patientsData.find(p => p.isActive) || patientsData[0];
    if (!activePat) {
      if (onboardingEl) onboardingEl.style.display = 'block';
      if (bannerEl) bannerEl.style.display = 'none';
      if (presetsToolbar) presetsToolbar.style.display = 'none';
      return;
    }

    if (dispAvatar) {
      const initial = activePat.name.replace(/^คุณ|^นาย|^นางสาว|^นาง/, '').trim().charAt(0) || 'ผ';
      dispAvatar.textContent = initial;
    }
    if (dispFullName) dispFullName.textContent = activePat.name;
    if (dispHnTag) dispHnTag.textContent = `HN: ${activePat.hn}`;

    if (dispRiskBadge) {
      if (activePat.riskLevel === 'high') {
        dispRiskBadge.className = 'status-badge status-badge-danger';
        dispRiskBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> เฝ้าระวังพิเศษ ICU (High Risk)';
      } else if (activePat.riskLevel === 'med') {
        dispRiskBadge.className = 'status-badge status-badge-warning';
        dispRiskBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> เฝ้าระวังกึ่งวิกฤต (Medium Risk)';
      } else {
        dispRiskBadge.className = 'status-badge status-badge-normal';
        dispRiskBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> พักฟื้นทั่วไป (Low Risk)';
      }
    }

    if (dispWardBed) dispWardBed.textContent = `${activePat.ward || '-'} / ${activePat.bed || '-'}`;
    if (dispAgeGender) dispAgeGender.textContent = `${activePat.age ? activePat.age + ' ปี' : '-'} • เพศ ${activePat.gender || 'ชาย'}`;
    if (dispDoctor) dispDoctor.textContent = activePat.doctor || 'นพ. ประจำเวร';
    if (dispAdmitDate) {
      const dt = activePat.admitDate ? new Date(activePat.admitDate).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '-';
      dispAdmitDate.textContent = dt;
    }

    if (dispConditionTags) {
      let tagsHtml = '';
      if (activePat.conditions && activePat.conditions.length > 0) {
        const labelsMap = {
          'OSA': '<i class="fa-solid fa-lungs"></i> ภาวะหยุดหายใจ (OSA)',
          'Arrhythmia': '<i class="fa-solid fa-heart-crack"></i> Arrhythmia',
          'Hypertension': '<i class="fa-solid fa-gauge-high"></i> HT ความดันสูง',
          'CAD': '<i class="fa-solid fa-shield-heart"></i> โรคหลอดเลือดหัวใจ (CAD)',
          'Diabetes': '<i class="fa-solid fa-droplet"></i> เบาหวาน (DM)',
          'Asthma': '<i class="fa-solid fa-wind"></i> หอบหืด/COPD',
          'PostOp': '<i class="fa-solid fa-syringe"></i> พักฟื้นหลังผ่าตัด'
        };
        tagsHtml = activePat.conditions.map(c => `
          <span class="cond-tag ${c === 'OSA' || c === 'Arrhythmia' ? 'tag-critical' : 'tag-warn'}">
            ${labelsMap[c] || c}
          </span>
        `).join('');
      }
      if (activePat.allergies && !activePat.allergies.includes('ปฏิเสธ')) {
        tagsHtml += `<span class="cond-tag tag-allergy"><i class="fa-solid fa-ban"></i> ${activePat.allergies}</span>`;
      }
      dispConditionTags.innerHTML = tagsHtml || '<span class="text-muted" style="font-size:12px">ไม่มีประวัติโรคประจำตัววิกฤต</span>';
    }

    if (dispThresholdHr) dispThresholdHr.innerHTML = `${activePat.hrMin || 50} - ${activePat.hrMax || 100} <small>BPM</small>`;
    if (dispThresholdSpo2) dispThresholdSpo2.innerHTML = `≥ ${activePat.spo2Min || 95} <small>%</small>`;
    if (dispThresholdApnea) dispThresholdApnea.innerHTML = `${activePat.apneaDelay || 10} <small>วินาที</small>`;
  }

  // Highlight Preset Toolbar
  function highlightSelectedPatientPreset(hn) {
    document.querySelectorAll('[data-patient-preset]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-patient-preset') === hn);
    });
  }

  // Render Top Quick Presets
  function renderQuickPresetsToolbar() {
    if (!patientQuickPresetsGroup) return;
    const currentHn = inputPatientHn ? inputPatientHn.value : '';
    const isGuest = isGuestModeActive();

    let guestBtnHtml = `
      <button type="button" class="btn-preset ${isGuest ? 'active' : ''}" id="btnPresetGuest">
        <i class="fa-solid fa-shield-halved text-teal"></i> โหมดไม่เก็บข้อมูล ${isGuest ? '(กำลังใช้งาน)' : ''}
      </button>
    `;

    const btnsHtml = patientsData.map(p => {
      const isSelected = !isGuest && (p.hn === currentHn || p.isActive);
      let iconColor = 'text-primary';
      if (p.riskLevel === 'high') iconColor = 'text-danger';
      else if (p.riskLevel === 'med') iconColor = 'text-amber';

      return `
        <button type="button" class="btn-preset ${isSelected ? 'active' : ''}" data-patient-preset="${p.hn}">
          <i class="fa-solid fa-bed-pulse ${iconColor}"></i> ${p.name.split(' ')[0]} (${p.hn})
        </button>
      `;
    }).join('');

    patientQuickPresetsGroup.innerHTML = `
      ${guestBtnHtml}
      ${btnsHtml}
    `;

    // Re-bind click handlers
    patientQuickPresetsGroup.querySelectorAll('[data-patient-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hn = btn.getAttribute('data-patient-preset');
        const pat = patientsData.find(p => p.hn === hn);
        if (pat) {
          populatePatientForm(pat);
          openPatientModal();
          showToast('โหลดข้อมูลผู้ป่วย', `เปิดข้อมูล "${pat.name}" (${pat.hn})`, 'info', 2000);
        }
      });
    });

    const presetGuestBtn = document.getElementById('btnPresetGuest');
    if (presetGuestBtn) presetGuestBtn.addEventListener('click', enableGuestMode);
  }

  // Wire Onboarding Buttons & Switcher
  const btnStartRegister = document.getElementById('btnStartRegister');
  const btnCardRegister = document.getElementById('btnCardRegister');
  const btnStartGuest = document.getElementById('btnStartGuest');
  const btnCardGuest = document.getElementById('btnCardGuest');
  const btnSwitchToGuest = document.getElementById('btnSwitchToGuest');

  if (btnStartRegister) btnStartRegister.addEventListener('click', triggerNewPatientFlow);
  if (btnCardRegister) btnCardRegister.addEventListener('click', (e) => {
    if (e.target !== btnStartRegister) triggerNewPatientFlow();
  });
  if (btnStartGuest) btnStartGuest.addEventListener('click', enableGuestMode);
  if (btnCardGuest) btnCardGuest.addEventListener('click', (e) => {
    if (e.target !== btnStartGuest) enableGuestMode();
  });
  if (btnSwitchToGuest) btnSwitchToGuest.addEventListener('click', enableGuestMode);

  // --------------------------------------------------------------------------
  // Native HTML5 <dialog> Control Helpers (showModal / close)
  // --------------------------------------------------------------------------
  const patientDialog = document.getElementById('patientDialog');
  const btnCloseDialog = document.getElementById('btnCloseDialog');
  const btnOpenAddPatientModal = document.getElementById('btnOpenAddPatientModal');

  function openPatientModal() {
    if (patientDialog && typeof patientDialog.showModal === 'function') {
      if (!patientDialog.open) {
        patientDialog.showModal();
      }
    }
  }

  function closePatientModal() {
    if (patientDialog && typeof patientDialog.close === 'function') {
      if (patientDialog.open) {
        patientDialog.close();
      }
    }
  }

  // Close dialog on backdrop (overlay) click natively
  if (patientDialog) {
    patientDialog.addEventListener('click', (e) => {
      const rect = patientDialog.getBoundingClientRect();
      const isInside = (
        rect.top <= e.clientY && e.clientY <= rect.bottom &&
        rect.left <= e.clientX && e.clientX <= rect.right
      );
      if (!isInside) {
        closePatientModal();
      }
    });
  }

  if (btnCloseDialog) btnCloseDialog.addEventListener('click', closePatientModal);
  if (btnCancelPatientEdit) btnCancelPatientEdit.addEventListener('click', closePatientModal);
  if (btnOpenAddPatientModal) btnOpenAddPatientModal.addEventListener('click', triggerNewPatientFlow);

  // Render Saved Patients Cards Grid (แต่ละคนขึ้นเป็นการ์ดชัดเจน)
  function renderPatientsCardsDirectory(searchQuery = '') {
    if (!patientCardsGrid) return;

    const query = searchQuery.trim().toLowerCase();
    const filtered = patientsData.filter(p => {
      return (
        p.name.toLowerCase().includes(query) ||
        p.hn.toLowerCase().includes(query) ||
        p.ward.toLowerCase().includes(query) ||
        p.bed.toLowerCase().includes(query) ||
        (p.doctor && p.doctor.toLowerCase().includes(query))
      );
    });

    if (patientCounterBadge) {
      patientCounterBadge.textContent = `${patientsData.length} ราย`;
    }

    if (patientsData.length === 0) {
      patientCardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; background: #ffffff; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 44px 24px; text-align: center; color: #64748b;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #f1f5f9; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; color: #94a3b8; margin-bottom: 14px;">
            <i class="fa-solid fa-users-slash"></i>
          </div>
          <h4 style="font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 6px;">ยังไม่มีรายชื่อผู้ป่วยที่ลงทะเบียนในระบบ</h4>
          <p style="font-size: 13.5px; color: #64748b; max-width: 520px; margin: 0 auto 20px auto; line-height: 1.5;">
            คุณสามารถเลือก "สมัครข้อมูลผู้ป่วย" เพื่อเพิ่มประวัติและตั้งเกณฑ์สัญญาณชีพเฉพาะบุคคล หรือกด "ใช้งานแบบไม่เก็บข้อมูล" เพื่อมอนิเตอร์สัญญาณชีพสดทั่วไป
          </p>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.triggerNewPatientGlobal()"><i class="fa-solid fa-user-plus"></i> สมัครข้อมูลผู้ป่วยใหม่</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="window.enableGuestModeGlobal()"><i class="fa-solid fa-shield-halved text-teal"></i> ใช้งานแบบไม่เก็บข้อมูล</button>
          </div>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      patientCardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 40px 20px; text-align: center; color: #94a3b8;">
          <i class="fa-regular fa-folder-open" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
          <strong style="font-size: 15px; color: #475569;">ไม่พบประวัติผู้ป่วยที่ตรงกับคำค้นหา "${searchQuery}"</strong>
          <p style="font-size: 13px; margin-top: 4px;">คุณสามารถกดปุ่ม "+ เพิ่มผู้ป่วยใหม่" เพื่อเปิดหน้าต่างลงทะเบียนผู้ป่วยใหม่ได้ทันที</p>
        </div>
      `;
      return;
    }

    patientCardsGrid.innerHTML = filtered.map(p => {
      const initial = p.name.replace(/^คุณ|^นาย|^นางสาว|^นาง/, '').trim().charAt(0) || 'ผ';
      const isActive = !!p.isActive;

      let riskBadgeHtml = '<span class="status-badge status-badge-normal">ความเสี่ยงต่ำ</span>';
      if (p.riskLevel === 'high') {
        riskBadgeHtml = '<span class="status-badge status-badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> เสี่ยงสูง ICU</span>';
      } else if (p.riskLevel === 'med') {
        riskBadgeHtml = '<span class="status-badge status-badge-warning">เฝ้าระวังกึ่งวิกฤต</span>';
      }

      const condsHtml = (p.conditions || []).map(c => `<span class="cond-tag tag-info" style="font-size:11px;">${c}</span>`).join('');
      const allergyHtml = p.allergies && !p.allergies.includes('ปฏิเสธ')
        ? `<span class="cond-tag tag-allergy" style="font-size:11px;"><i class="fa-solid fa-ban"></i> ${p.allergies}</span>`
        : '';

      return `
        <div class="patient-card-item patient-card-horizontal ${isActive ? 'patient-card-active' : ''}">
          <!-- Col 1: Identity -->
          <div class="card-col-identity">
            <div class="card-patient-avatar">${initial}</div>
            <div class="card-patient-headings">
              <div class="patient-name-badge-row">
                <strong>${p.name}</strong>
                ${isActive ? '<span class="active-pulse-badge pulse-badge-inline"><span class="pulse-dot"></span> LIVE</span>' : ''}
              </div>
              <div class="card-subtext">${p.hn} • ${p.age ? p.age + ' ปี' : '-'} (${p.gender || 'ชาย'})</div>
              <div class="card-location-meta">
                <span><i class="fa-solid fa-bed text-muted"></i> <strong>${p.bed}</strong></span>
                <span class="text-muted">•</span>
                <span class="text-muted"><i class="fa-solid fa-hospital"></i> ${p.ward}</span>
              </div>
            </div>
          </div>

          <!-- Col 2: Vitals Range -->
          <div class="card-col-vitals">
            <div class="card-vitals-pill-row horizontal-vitals">
              <div class="v-item">
                <span>Safe HR</span>
                <strong class="text-danger">${p.hrMin || 50}-${p.hrMax || 100} <small>BPM</small></strong>
              </div>
              <div class="v-item">
                <span>Min SpO2</span>
                <strong class="text-primary">≥ ${p.spo2Min || 95}%</strong>
              </div>
              <div class="v-item">
                <span>Apnea</span>
                <strong class="text-purple">${p.apneaDelay || 10}s</strong>
              </div>
            </div>
          </div>

          <!-- Col 3: Clinical Tags & Risk -->
          <div class="card-col-clinical">
            <div class="card-risk-wrap">
              ${riskBadgeHtml}
            </div>
            <div class="card-tags-row">
              ${condsHtml}
              ${allergyHtml}
            </div>
          </div>

          <!-- Col 4: Action Buttons -->
          <div class="card-col-actions">
            ${!isActive ? `
              <button type="button" class="btn-table-action action-active btn-action-monitor" onclick="window.handleSetActivePatient('${p.hn}')">
                <i class="fa-solid fa-play"></i> <span>เลือกมอนิเตอร์สด</span>
              </button>
            ` : '<span class="badge-pill badge-primary-soft badge-live-now"><i class="fa-solid fa-circle-check text-green"></i> กำลังมอนิเตอร์</span>'}
            <button type="button" class="btn-table-action" onclick="window.handleEditPatient('${p.hn}')" title="แก้ไขข้อมูล">
              <i class="fa-solid fa-pen-to-square"></i> <span>แก้ไข</span>
            </button>
            <button type="button" class="btn-table-action action-delete" onclick="window.handleDeletePatient('${p.hn}')" title="ลบประวัติ">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function triggerNewPatientFlow() {
    clearPatientForm();
    openPatientModal();
    showToast('ลงทะเบียนผู้ป่วยใหม่', `สร้างรหัส HN อัตโนมัติ: ${inputPatientHn.value}`, 'info', 2500);
  }
  window.triggerNewPatientGlobal = triggerNewPatientFlow;

  if (btnAutoNewPatient) btnAutoNewPatient.addEventListener('click', triggerNewPatientFlow);
  if (btnNewPatientTop) btnNewPatientTop.addEventListener('click', triggerNewPatientFlow);

  if (btnResetPatientForm) {
    btnResetPatientForm.addEventListener('click', () => {
      clearPatientForm();
      showToast('ล้างฟอร์มแล้ว', 'พร้อมสำหรับการลงทะเบียนผู้ป่วยรายใหม่', 'info', 2000);
    });
  }

  // Global inline handlers
  window.handleEditPatient = function(hn) {
    const patient = patientsData.find(p => p.hn === hn);
    if (patient) {
      populatePatientForm(patient);
      openPatientModal();
      showToast('เปิดข้อมูลผู้ป่วย', `แบบฟอร์มแก้ไขข้อมูลของ "${patient.name}" (${patient.hn})`, 'info', 2000);
    }
  };

  window.handleSetActivePatient = function(hn) {
    const patient = patientsData.find(p => p.hn === hn);
    if (!patient) return;

    patientsData.forEach(p => {
      p.isActive = (p.hn === hn);
    });

    saveStoredPatients(patientsData);
    updateActivePatientBanner();
    renderQuickPresetsToolbar();
    renderPatientsCardsDirectory(searchSettingsPatients ? searchSettingsPatients.value : '');

    showToast(
      'เปลี่ยนผู้ป่วยมอนิเตอร์สดแล้ว',
      `ตั้งค่าให้ระบบติดตามสัญญาณชีพของ "${patient.name}" (${patient.ward} - ${patient.bed})`,
      'success',
      3500
    );
  };

  window.handleDeletePatient = function(hn) {
    const targetPat = patientsData.find(p => p.hn === hn);
    if (!targetPat) return;

    if (confirm(`คุณต้องการลบข้อมูลประวัติผู้ป่วย "${targetPat.name}" (${targetPat.hn}) ออกจากระบบหรือไม่?`)) {
      const wasActive = targetPat.isActive;
      patientsData = patientsData.filter(p => p.hn !== hn);

      if (wasActive && patientsData.length > 0) {
        patientsData[0].isActive = true;
      }

      saveStoredPatients(patientsData);
      updateActivePatientBanner();
      renderQuickPresetsToolbar();
      renderPatientsCardsDirectory(searchSettingsPatients ? searchSettingsPatients.value : '');
      clearPatientForm();
      closePatientModal();

      showToast('ลบข้อมูลสำเร็จ', `ลบประวัติผู้ป่วย ${targetPat.name} เรียบร้อยแล้ว`, 'danger', 3000);
    }
  };

  // Save Patient & Vitals Settings Button
  if (btnSavePatient) {
    btnSavePatient.addEventListener('click', () => {
      const hn = (inputPatientHn ? inputPatientHn.value : '').trim();
      const name = (inputPatientName ? inputPatientName.value : '').trim();

      if (!hn || !name) {
        showToast('กรุณากรอกข้อมูลจำเป็น', 'โปรดระบุ รหัสประจำตัวผู้ป่วย (HN) และ ชื่อ-นามสกุล', 'warning', 3500);
        if (!hn && inputPatientHn) inputPatientHn.focus();
        else if (inputPatientName) inputPatientName.focus();
        return;
      }

      const existingIndex = patientsData.findIndex(p => p.hn.toLowerCase() === hn.toLowerCase());

      const patientRecord = {
        hn: hn,
        name: name,
        age: parseInt(inputPatientAge?.value, 10) || null,
        gender: selectPatientGender?.value || 'ชาย',
        ward: inputPatientWard?.value.trim() || 'ICU Ward 4',
        bed: inputPatientBed?.value.trim() || 'ICU-04 / เตียง A',
        admitDate: inputPatientAdmitDate?.value || new Date().toISOString().slice(0, 16),
        phone: inputPatientPhone?.value.trim() || '',
        doctor: inputPatientDoctor?.value.trim() || 'นพ. เจ้าของไข้',
        nurse: inputPatientNurse?.value.trim() || 'พว. ผู้รับผิดชอบ',
        conditions: getSelectedConditions(),
        otherConditions: inputOtherConditions?.value.trim() || '',
        allergies: inputPatientAllergies?.value.trim() || 'ปฏิเสธประวัติแพ้ยา',
        riskLevel: getSelectedRiskLevel(),
        hrMin: parseInt(inputHrMin?.value, 10) || 50,
        hrMax: parseInt(inputHrMax?.value, 10) || 100,
        spo2Min: parseInt(inputSpo2Min?.value, 10) || 95,
        apneaDelay: parseInt(inputApneaDelay?.value, 10) || 10,
        baselineBp: inputBaselineBp?.value.trim() || '120/80',
        assignedDevice: selectAssignedDevice?.value || 'DEV-001',
        clinicalNotes: inputClinicalNotes?.value.trim() || '',
        isActive: existingIndex >= 0 ? patientsData[existingIndex].isActive : false
      };

      if (existingIndex >= 0) {
        patientsData[existingIndex] = patientRecord;
        showToast('อัปเดตข้อมูลสำเร็จ', `บันทึกการแก้ไขประวัติ & เกณฑ์สัญญาณชีพของ "${name}" (${hn}) แล้ว`, 'success', 3500);
      } else {
        if (patientsData.length === 0) patientRecord.isActive = true;
        patientsData.unshift(patientRecord);
        showToast('เพิ่มผู้ป่วยใหม่สำเร็จ', `ลงทะเบียนการ์ดผู้ป่วยใหม่ "${name}" (${hn}) เข้าสู่ระบบแล้ว`, 'success', 3500);
      }

      localStorage.setItem('sleep_guard_guest_mode', 'false');
      saveStoredPatients(patientsData);
      updateActivePatientBanner();
      renderQuickPresetsToolbar();
      renderPatientsCardsDirectory(searchSettingsPatients ? searchSettingsPatients.value : '');

      const origText = btnSavePatient.innerHTML;
      btnSavePatient.innerHTML = '<i class="fa-solid fa-check"></i> <span>บันทึกแล้ว!</span>';
      btnSavePatient.style.background = 'var(--status-success)';
      setTimeout(() => {
        btnSavePatient.innerHTML = origText;
        btnSavePatient.style.background = '';
        closePatientModal();
      }, 700);
    });
  }

  // Set Active Patient Button in Form
  if (btnSetActivePatient) {
    btnSetActivePatient.addEventListener('click', () => {
      const hn = (inputPatientHn ? inputPatientHn.value : '').trim();
      if (!hn) {
        showToast('ไม่พบรหัส HN', 'กรุณาระบุรหัสผู้ป่วยก่อนตั้งค่าเป็นผู้ป่วยมอนิเตอร์สด', 'warning', 3000);
        return;
      }
      if (btnSavePatient) btnSavePatient.click();
      window.handleSetActivePatient(hn);
    });
  }

  // Delete Patient Button in Form
  if (btnDeletePatient) {
    btnDeletePatient.addEventListener('click', () => {
      const hn = (inputPatientHn ? inputPatientHn.value : '').trim();
      if (hn) window.handleDeletePatient(hn);
    });
  }

  // Search Filter
  if (searchSettingsPatients) {
    searchSettingsPatients.addEventListener('input', (e) => {
      renderPatientsCardsDirectory(e.target.value);
    });
  }

  // --------------------------------------------------------------------------
  // 6. Tab 2: Master Buzzer & Audio Suite
  // --------------------------------------------------------------------------
  function updateBuzzerStatusTag(enabled) {
    if (!buzzerStatusTag) return;
    if (enabled) {
      buzzerStatusTag.textContent = 'เปิดใช้งาน';
      buzzerStatusTag.className = 'status-tag tag-active';
    } else {
      buzzerStatusTag.textContent = 'ปิดเสียง (Muted)';
      buzzerStatusTag.className = 'status-tag tag-inactive';
    }
  }

  if (toggleBuzzer) {
    toggleBuzzer.addEventListener('change', (e) => {
      updateBuzzerStatusTag(e.target.checked);
    });
  }

  if (sliderBuzzerVol && badgeBuzzerVol) {
    sliderBuzzerVol.addEventListener('input', (e) => {
      badgeBuzzerVol.textContent = `${e.target.value}%`;
    });
  }

  volPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const vol = parseInt(btn.getAttribute('data-vol'), 10);
      if (sliderBuzzerVol) {
        sliderBuzzerVol.value = vol;
        if (badgeBuzzerVol) badgeBuzzerVol.textContent = `${vol}%`;
      }
    });
  });

  function triggerWaveformAnimation(duration = 1200) {
    if (!soundWaveBox) return;
    soundWaveBox.classList.add('playing');
    setTimeout(() => {
      soundWaveBox.classList.remove('playing');
    }, duration);
  }

  if (btnTestBuzzer) {
    btnTestBuzzer.addEventListener('click', () => {
      buzzer.beep(880, 200, 2);
      triggerWaveformAnimation(900);
      showToast('ทดสอบเสียงเตือน', 'ทดสอบเสียง Beep ความถี่มาตรฐาน 880 Hz', 'info', 2000);
    });
  }

  if (btnTestCriticalAlarm) {
    btnTestCriticalAlarm.addEventListener('click', () => {
      buzzer.playCriticalAlarm();
      triggerWaveformAnimation(1600);

      if (toggleVisualAlarm && toggleVisualAlarm.checked) {
        document.body.classList.add('alarm-strobe-active');
        setTimeout(() => {
          document.body.classList.remove('alarm-strobe-active');
        }, 1500);
      }

      showToast('ทดสอบสัญญาณวิกฤต', 'ส่งสัญญาณเสียงระดับฉุกเฉิน (High Priority Alarm) 950 Hz', 'danger', 2500);
    });
  }

  if (btnToggleTokenVisibility && inputLineToken) {
    btnToggleTokenVisibility.addEventListener('click', () => {
      const isPassword = inputLineToken.type === 'password';
      inputLineToken.type = isPassword ? 'text' : 'password';
      btnToggleTokenVisibility.innerHTML = isPassword 
        ? '<i class="fa-solid fa-eye-slash"></i>' 
        : '<i class="fa-solid fa-eye"></i>';
    });
  }

  if (btnTestLineNotify) {
    btnTestLineNotify.addEventListener('click', () => {
      showToast(
        'จำลองการส่ง LINE Notify',
        'ส่งข้อความ: "[CRITICAL] Sleep Guard Alert: ตรวจพบ HR ผิดปกติที่ Ward 4" สำเร็จ',
        'success',
        4000
      );
    });
  }

  // --------------------------------------------------------------------------
  // 7. Master Save Footer Handler
  // --------------------------------------------------------------------------
  if (btnSubmitForm) {
    btnSubmitForm.addEventListener('click', () => {
      if (btnSavePatient) btnSavePatient.click();

      // Save Audio & LINE settings
      const audioSettings = {
        buzzerEnabled: toggleBuzzer ? toggleBuzzer.checked : true,
        buzzerVolume: parseInt(sliderBuzzerVol?.value, 10) || 80,
        alarmTone: selectAlarmTone ? selectAlarmTone.value : 'medical_std',
        visualAlarm: toggleVisualAlarm ? toggleVisualAlarm.checked : true,
        lineNotify: toggleLineNotify ? toggleLineNotify.checked : false,
        lineToken: inputLineToken ? inputLineToken.value : '',
        lineTarget: selectLineTarget ? selectLineTarget.value : 'icu_group'
      };
      saveStoredSettings({ ...currentSettings, ...audioSettings });
      currentSettings = { ...currentSettings, ...audioSettings };

      if (lastSavedIndicator) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
        lastSavedIndicator.innerHTML = `<i class="fa-solid fa-circle-check text-green"></i> บันทึกล่าสุด: วันนี้ ${timeStr} น.`;
      }
    });
  }

  if (btnResetDefaults) {
    btnResetDefaults.addEventListener('click', () => {
      if (confirm('คุณต้องการล้างข้อมูลผู้ป่วยและคืนค่าการตั้งค่าระบบทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?')) {
        saveStoredSettings(defaultSettings);
        saveStoredPatients([]);
        localStorage.removeItem('sleep_guard_guest_mode');
        patientsData = [];
        currentSettings = defaultSettings;

        updateActivePatientBanner();
        renderQuickPresetsToolbar();
        renderPatientsCardsDirectory();
        clearPatientForm();

        if (toggleBuzzer) toggleBuzzer.checked = true;
        if (sliderBuzzerVol) sliderBuzzerVol.value = 80;
        if (badgeBuzzerVol) badgeBuzzerVol.textContent = '80%';

        showToast('ล้างข้อมูลและคืนค่ามาตรฐานแล้ว', 'ระบบพร้อมสำหรับการลงทะเบียนผู้ป่วยใหม่หรือเลือกโหมดไม่เก็บข้อมูล', 'info', 3500);
      }
    });
  }

  // --------------------------------------------------------------------------
  // 8. Initialization
  // --------------------------------------------------------------------------
  updateActivePatientBanner();
  renderQuickPresetsToolbar();
  renderPatientsCardsDirectory();

  const activePat = patientsData.find(p => p.isActive) || patientsData[0];
  if (activePat) {
    populatePatientForm(activePat);
  }

  if (toggleBuzzer) {
    toggleBuzzer.checked = currentSettings.buzzerEnabled !== false;
    updateBuzzerStatusTag(toggleBuzzer.checked);
  }
  if (sliderBuzzerVol) {
    sliderBuzzerVol.value = currentSettings.buzzerVolume ?? 80;
    if (badgeBuzzerVol) badgeBuzzerVol.textContent = `${currentSettings.buzzerVolume ?? 80}%`;
  }
  if (selectAlarmTone && currentSettings.alarmTone) selectAlarmTone.value = currentSettings.alarmTone;
  if (toggleVisualAlarm) toggleVisualAlarm.checked = currentSettings.visualAlarm !== false;
  if (toggleLineNotify) toggleLineNotify.checked = !!currentSettings.lineNotify;
  if (inputLineToken && currentSettings.lineToken) inputLineToken.value = currentSettings.lineToken;
  if (selectLineTarget && currentSettings.lineTarget) selectLineTarget.value = currentSettings.lineTarget;
});

