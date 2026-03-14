const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WORKER_URL = 'https://komunalka-v2-api.mikolenko-anton1.workers.dev';

let authToken = localStorage.getItem('k_token') || '';
let sessionLogin = localStorage.getItem('k_login') || '';
let profile = JSON.parse(localStorage.getItem('kprofile') || '{"name":"","login":"","userId":""}');

let defaultTariffs = {
  water: 30.38,
  hotWater: 100.00,
  electroBase: 4.32,
  electroWinter: 2.64,
  winterLimit: 2000,
  nightCoef: 0.5,
  gas: 7.96
};

let defaultPrefs = {
  showWater: true,
  showHotWater: false,
  showElectro: true,
  showGas: true,
  electroTwoZone: true,
  electroWinter: true,
  remindersEnabled: false,
  remWaterStart: 1,
  remWaterEnd: 5,
  remElectroStart: 28,
  remElectroEnd: 3
};

let defaultCustomServices = [{ id: 's1', name: '', defaultSum: '' }];

let addresses = [];
let currentAddressId = '';
let tariffs = { ...defaultTariffs };
let prefs = { ...defaultPrefs };
let records = [];
let customServices = [...defaultCustomServices];
let currentCalc = {
  waterCost: 0,
  hotWaterCost: 0,
  electroCost: 0,
  gasCost: 0,
  customCost: 0,
  total: 0
};

let toastTimeout = null;
let currentMode = localStorage.getItem('themeMode') || 'auto';
let activeThemeColor = localStorage.getItem('k_color') || 'blue';

function showToast(msg, icon = '✅') {
  $('toastMsg').innerText = msg;
  $('toastIcon').innerText = icon;
  $('toast').classList.remove('hidden');
  $('toast').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    $('toast').classList.remove('show');
    setTimeout(() => $('toast').classList.add('hidden'), 250);
  }, 2400);
}

function setMetaThemeColor() {
  const dark = document.documentElement.classList.contains('dark');
  $('metaThemeColor').setAttribute('content', dark ? '#08111f' : '#f4f7fb');
}

function applyThemeMode() {
  const dark = currentMode === 'dark' || (currentMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  setMetaThemeColor();
}

window.setThemeMode = function(mode) {
  currentMode = mode;
  localStorage.setItem('themeMode', mode);
  applyThemeMode();

  ['light', 'auto', 'dark'].forEach(m => {
    const btn = $('mode-' + m);
    if (!btn) return;
    btn.classList.toggle('active', m === mode);
  });
};

window.setThemeColor = function(color) {
  document.body.classList.remove('theme-blue', 'theme-indigo', 'theme-violet', 'theme-rose', 'theme-zinc');
  document.body.classList.add('theme-' + color);
  activeThemeColor = color;
  localStorage.setItem('k_color', color);

  document.querySelectorAll('.theme-dot').forEach(el => el.classList.remove('active'));
  $('btn-theme-' + color)?.classList.add('active');
};

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${WORKER_URL}${path}`, { ...options, headers });
  let data = null;

  try {
    data = await res.json();
  } catch {
    data = { success: false, error: 'INVALID_SERVER_RESPONSE' };
  }

  if (!res.ok || !data.success) throw new Error(data.error || `HTTP_${res.status}`);
  return data;
}

function getCurrentAddress() {
  return addresses.find(a => a.id === currentAddressId) || addresses[0] || null;
}

function syncCurrentAddressMemory() {
  const idx = addresses.findIndex(a => a.id === currentAddressId);
  if (idx >= 0) {
    addresses[idx].tariffs = { ...tariffs };
    addresses[idx].prefs = { ...prefs };
    addresses[idx].customServices = [...customServices];
  }
}

async function loadAddressRecords(addressId) {
  const data = await apiFetch(`/api/addresses/${addressId}/records`);
  records = (data.records || []).map(r => {
    const d = r.data || {};
    const t = r.totals || {};
    return {
      id: r.id,
      month: r.month,
      wPrev: d.wPrev || 0,
      wCur: d.wCur || 0,
      hwPrev: d.hwPrev || 0,
      hwCur: d.hwCur || 0,
      dPrev: d.dPrev || 0,
      dCur: d.dCur || 0,
      nPrev: d.nPrev || 0,
      nCur: d.nCur || 0,
      gPrev: d.gPrev || 0,
      gCur: d.gCur || 0,
      customData: d.customData || {},
      waterCost: t.waterCost || 0,
      hotWaterCost: t.hotWaterCost || 0,
      electroCost: t.electroCost || 0,
      gasCost: t.gasCost || 0,
      customCost: t.customCost || 0,
      total: t.total || 0,
      paid: !!r.paid
    };
  });
}

async function bootstrapAfterLogin() {
  const me = await apiFetch('/api/me');

  profile = {
    login: me.user?.login || sessionLogin,
    name: me.user?.displayName || me.user?.login || sessionLogin,
    userId: me.user?.userId || ''
  };

  localStorage.setItem('kprofile', JSON.stringify(profile));
  $('userGreeting').innerText = `Привіт, ${profile.name || 'користувач'}!`;

  addresses = (me.addresses || []).map(addr => ({
    id: addr.id,
    name: addr.name || 'Мій дім',
    tariffs: { ...defaultTariffs, ...(addr.tariffs || {}) },
    prefs: { ...defaultPrefs, ...(addr.prefs || {}) },
    customServices: addr.customServices?.length ? addr.customServices : [...defaultCustomServices]
  }));

  if (!addresses.length) throw new Error('NO_ADDRESS');

  currentAddressId = addresses[0].id;
  await loadCurrentAddress();

  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
}

async function loadCurrentAddress() {
  const addr = getCurrentAddress();
  if (!addr) return;

  tariffs = { ...defaultTariffs, ...(addr.tariffs || {}) };
  prefs = { ...defaultPrefs, ...(addr.prefs || {}) };
  customServices = addr.customServices?.length ? [...addr.customServices] : [...defaultCustomServices];

  $('currentAddressDisplay').innerText = addr.name || 'Мій дім';
  await loadAddressRecords(addr.id);
  initAppUI();
}

async function performLogin(login, password) {
  const btn = $('authSubmitBtn');
  const errEl = $('authError');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerText = 'Вхід...';

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    });

    authToken = data.token;
    sessionLogin = data.user.login;

    localStorage.setItem('k_token', authToken);
    localStorage.setItem('k_login', sessionLogin);

    await bootstrapAfterLogin();
    showToast('Успішний вхід', '✅');
  } catch (error) {
    errEl.innerText =
      error.message === 'NOT_FOUND' ? 'Акаунт не знайдено' :
      error.message === 'WRONG_PASSWORD' ? 'Невірний пароль' :
      'Помилка сервера';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Увійти';
  }
}

async function performRegister(login, password) {
  await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ login, password, displayName: login })
  });
}

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  await performLogin($('authLogin').value.trim(), $('authPass').value.trim());
});

$('registerBtn').addEventListener('click', async () => {
  const login = $('authLogin').value.trim();
  const password = $('authPass').value.trim();

  if (!login || !password) return showToast('Введи логін і пароль', '⚠️');

  try {
    await performRegister(login, password);
    showToast('Акаунт створено, тепер увійди', '🎉');
  } catch (e) {
    showToast(e.message === 'ALREADY_EXISTS' ? 'Такий логін вже існує' : 'Помилка реєстрації', '⚠️');
  }
});

function renderCalcCustomServices() {
  $('customServicesContainer').innerHTML = customServices.map(srv => `
    <div class="custom-box">
      <span>${srv.name || 'Послуга'}</span>
      <input type="number" step="0.01" id="custom_${srv.id}" placeholder="${srv.defaultSum || '0.00'}" class="custom-srv-input" />
    </div>
  `).join('');

  document.querySelectorAll('.custom-srv-input').forEach(input => input.addEventListener('input', calculatePreview));
}

function renderSettingsCustomServices() {
  $('customServicesSettingsList').innerHTML = customServices.map((srv, i) => `
    <div class="custom-settings-row">
      <input type="text" value="${srv.name || ''}" onchange="customServices[${i}].name=this.value" placeholder="Назва" />
      <input type="number" step="0.01" value="${srv.defaultSum || ''}" onchange="customServices[${i}].defaultSum=this.value" placeholder="Сума" />
      <button type="button" onclick="removeCustomServiceField(${i})">✕</button>
    </div>
  `).join('');
}

window.addCustomServiceField = function() {
  customServices.push({ id: 's' + Date.now(), name: '', defaultSum: '' });
  renderSettingsCustomServices();
};

window.removeCustomServiceField = function(index) {
  customServices.splice(index, 1);
  if (!customServices.length) customServices = [{ id: 's1', name: '', defaultSum: '' }];
  renderSettingsCustomServices();
};

function calculatePreview() {
  const num = id => parseFloat($(id)?.value) || 0;
  const diff = (a, b) => Math.max(0, num(b) - num(a));

  const waterUsed = prefs.showWater ? diff('wPrev', 'wCur') : 0;
  const hotWaterUsed = prefs.showHotWater ? diff('hwPrev', 'hwCur') : 0;
  const dayUsed = prefs.showElectro ? diff('dPrev', 'dCur') : 0;
  const nightUsed = (prefs.showElectro && prefs.electroTwoZone) ? diff('nPrev', 'nCur') : 0;
  const gasUsed = prefs.showGas ? diff('gPrev', 'gCur') : 0;

  const isWinter = $('isWinterInput').checked;
  const electroTariff = (prefs.electroWinter && isWinter)
    ? Number(tariffs.electroWinter || 0)
    : Number(tariffs.electroBase || 0);

  let customCost = 0;
  customServices.forEach(srv => {
    const el = $(`custom_${srv.id}`);
    let v = parseFloat(el?.value);
    if (isNaN(v)) v = parseFloat(srv.defaultSum || 0) || 0;
    customCost += v;
  });

  currentCalc.waterCost = waterUsed * Number(tariffs.water || 0);
  currentCalc.hotWaterCost = hotWaterUsed * Number(tariffs.hotWater || 0);
  currentCalc.electroCost = (dayUsed * electroTariff) + (nightUsed * electroTariff * Number(tariffs.nightCoef || 0.5));
  currentCalc.gasCost = gasUsed * Number(tariffs.gas || 0);
  currentCalc.customCost = customCost;
  currentCalc.total = currentCalc.waterCost + currentCalc.hotWaterCost + currentCalc.electroCost + currentCalc.gasCost + currentCalc.customCost;

  $('waterCostDisplay').innerText = `${fmt.format(currentCalc.waterCost)} ₴`;
  $('hotWaterCostDisplay').innerText = `${fmt.format(currentCalc.hotWaterCost)} ₴`;
  $('electroCostDisplay').innerText = `${fmt.format(currentCalc.electroCost)} ₴`;
  $('gasCostDisplay').innerText = `${fmt.format(currentCalc.gasCost)} ₴`;
  $('customCostDisplay').innerText = `${fmt.format(currentCalc.customCost)} ₴`;
  $('heroTotal').innerHTML = `${fmt.format(currentCalc.total)} <span>₴</span>`;

  $('wDiffBadge').innerText = `${waterUsed} м³`;
  $('hwDiffBadge').innerText = `${hotWaterUsed} м³`;
  $('dDiffBadge').innerText = `${dayUsed} кВт`;
  $('nDiffBadge').innerText = `${nightUsed} кВт`;
  $('gDiffBadge').innerText = `${gasUsed} м³`;
}

function fillPreviousReadings() {
  ['wPrev','wCur','hwPrev','hwCur','dPrev','dCur','nPrev','nCur','gPrev','gCur'].forEach(id => {
    if ($(id)) $(id).value = '';
  });

  document.querySelectorAll('.custom-srv-input').forEach(el => el.value = '');
  if (!records.length) return;

  const lr = [...records].sort((a, b) => b.month.localeCompare(a.month))[0];

  $('wPrev').value = lr.wCur || '';
  $('wCur').value = lr.wCur || '';
  $('hwPrev').value = lr.hwCur || '';
  $('hwCur').value = lr.hwCur || '';
  $('dPrev').value = lr.dCur || '';
  $('dCur').value = lr.dCur || '';
  $('nPrev').value = lr.nCur || '';
  $('nCur').value = lr.nCur || '';
  $('gPrev').value = lr.gCur || '';
  $('gCur').value = lr.gCur || '';

  customServices.forEach(srv => {
    const el = $(`custom_${srv.id}`);
    if (!el) return;
    if (lr.customData && lr.customData[srv.id]) el.value = lr.customData[srv.id].val;
    else if (srv.defaultSum) el.value = srv.defaultSum;
  });
}

async function saveCurrentRecord() {
  const month = $('monthInput').value;
  const data = {
    wPrev: parseFloat($('wPrev').value) || 0,
    wCur: parseFloat($('wCur').value) || 0,
    hwPrev: parseFloat($('hwPrev').value) || 0,
    hwCur: parseFloat($('hwCur').value) || 0,
    dPrev: parseFloat($('dPrev').value) || 0,
    dCur: parseFloat($('dCur').value) || 0,
    nPrev: parseFloat($('nPrev').value) || 0,
    nCur: parseFloat($('nCur').value) || 0,
    gPrev: parseFloat($('gPrev').value) || 0,
    gCur: parseFloat($('gCur').value) || 0,
    customData: {}
  };

  customServices.forEach(srv => {
    const el = $(`custom_${srv.id}`);
    let v = parseFloat(el?.value);
    if (isNaN(v)) v = parseFloat(srv.defaultSum || 0) || 0;
    if (v) data.customData[srv.id] = { name: srv.name, val: v };
  });

  await apiFetch(`/api/addresses/${currentAddressId}/records/${month}`, {
    method: 'PUT',
    body: JSON.stringify({
      data,
      totals: currentCalc,
      paid: false
    })
  });

  await loadAddressRecords(currentAddressId);
  renderRecords();
  fillPreviousReadings();
  calculatePreview();
}

$('utilityForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await saveCurrentRecord();
    showToast('Збережено!', '✅');
    switchTab('tabHistory', 1);
  } catch {
    showToast('Помилка збереження', '⚠️');
  }
});

function renderChart(sortedRecords) {
  const container = $('chartContainer');
  const recent = sortedRecords.slice(0, 6).reverse();

  if (!recent.length) {
    container.innerHTML = `<div class="chart-bar" style="width:100%;justify-content:center;"><span class="chart-bar-label">Ще немає даних</span></div>`;
    return;
  }

  const max = Math.max(...recent.map(r => r.total), 1);

  container.innerHTML = recent.map(r => {
    const h = (r.total / max) * 100;
    return `
      <div class="chart-bar">
        <div class="chart-bar-fill ${r.paid ? '' : 'warning'}" style="height:${Math.max(8, h)}%"></div>
        <div class="chart-bar-label">${r.month.slice(5)}</div>
      </div>
    `;
  }).join('');
}

function renderRecords() {
  const sorted = [...records].sort((a, b) => b.month.localeCompare(a.month));
  $('statsAvg').innerText = sorted.length
    ? `${fmt.format(sorted.reduce((s, r) => s + r.total, 0) / sorted.length)} ₴`
    : '0 ₴';

  renderChart(sorted);

  $('recordsList').innerHTML = sorted.map(rec => `
    <div class="record-card">
      <div class="record-top">
        <div>
          <div class="record-month">${rec.month}</div>
          <div class="status-pill ${rec.paid ? 'status-paid' : 'status-debt'}">${rec.paid ? 'Оплачено' : 'Борг'}</div>
        </div>
        <div class="record-total">${fmt.format(rec.total)} ₴</div>
      </div>

      <div class="record-details">
        ${rec.waterCost ? `<div class="record-line"><span>Вода</span><span>${fmt.format(rec.waterCost)} ₴</span></div>` : ''}
        ${rec.hotWaterCost ? `<div class="record-line"><span>Гаряча вода</span><span>${fmt.format(rec.hotWaterCost)} ₴</span></div>` : ''}
        ${rec.electroCost ? `<div class="record-line"><span>Світло</span><span>${fmt.format(rec.electroCost)} ₴</span></div>` : ''}
        ${rec.gasCost ? `<div class="record-line"><span>Газ</span><span>${fmt.format(rec.gasCost)} ₴</span></div>` : ''}
        ${rec.customCost ? `<div class="record-line"><span>Інше</span><span>${fmt.format(rec.customCost)} ₴</span></div>` : ''}
      </div>

      <div class="record-actions">
        <button type="button" onclick="togglePaidByMonth('${rec.month}')" class="btn ${rec.paid ? 'btn-secondary' : 'btn-primary'}">
          ${rec.paid ? 'Скасувати' : 'Позначити оплаченим'}
        </button>
        <button type="button" onclick="deleteRecordByMonth('${rec.month}')" class="btn btn-danger danger-mini">✕</button>
      </div>
    </div>
  `).join('');
}

window.togglePaidByMonth = async function(month) {
  try {
    await apiFetch(`/api/addresses/${currentAddressId}/records/${month}/paid`, { method: 'PATCH' });
    await loadAddressRecords(currentAddressId);
    renderRecords();
  } catch {
    showToast('Помилка', '⚠️');
  }
};

window.deleteRecordByMonth = async function(month) {
  if (!confirm('Видалити розрахунок?')) return;

  try {
    await apiFetch(`/api/addresses/${currentAddressId}/records/${month}`, { method: 'DELETE' });
    await loadAddressRecords(currentAddressId);
    renderRecords();
    fillPreviousReadings();
    calculatePreview();
  } catch {
    showToast('Помилка', '⚠️');
  }
};

window.switchTab = function(tabId, index = -1) {
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.remove('tab-active');
    el.classList.add('tab-hidden');
  });

  $(tabId).classList.remove('tab-hidden');
  $(tabId).classList.add('tab-active');

  if (index >= 0) {
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    const btnId = tabId === 'tabCalc' ? 'btnTabCalc' : tabId === 'tabHistory' ? 'btnTabHistory' : 'btnTabSettings';
    $(btnId).classList.add('active');
  }

  if (tabId === 'tabHistory') renderRecords();
  if (tabId === 'tabSettings') renderSettingsCustomServices();

  $('swipeContainer').scrollTo({ top: 0, behavior: 'smooth' });
};

window.openAddressModal = function() {
  $('addressModal').classList.remove('hidden');
  setTimeout(() => $('addressModalContent').classList.add('open'), 10);
  renderAddressModal();
};

window.closeAddressModal = function() {
  $('addressModalContent').classList.remove('open');
  setTimeout(() => $('addressModal').classList.add('hidden'), 300);
};

function renderAddressModal() {
  $('addressListModal').innerHTML = addresses.map(a => `
    <div class="address-item ${a.id === currentAddressId ? 'active' : ''}" onclick="selectAddress('${a.id}')">
      <span class="address-item-name">${a.name}</span>
      <button onclick="editAddressName(event, '${a.id}')" class="address-edit">✎</button>
    </div>
  `).join('');
}

window.selectAddress = async function(id) {
  syncCurrentAddressMemory();
  currentAddressId = id;
  await loadCurrentAddress();
  closeAddressModal();
};

window.addNewAddress = async function() {
  const name = prompt("Назва об'єкту:");
  if (!name || !name.trim()) return;

  try {
    const data = await apiFetch('/api/addresses', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        tariffs: defaultTariffs,
        prefs: defaultPrefs,
        customServices: defaultCustomServices
      })
    });

    addresses.push({
      id: data.address.id,
      name: data.address.name,
      tariffs: { ...defaultTariffs, ...(data.address.tariffs || {}) },
      prefs: { ...defaultPrefs, ...(data.address.prefs || {}) },
      customServices: data.address.customServices || [...defaultCustomServices]
    });

    currentAddressId = data.address.id;
    await loadCurrentAddress();
    closeAddressModal();
    showToast('Додано', '✅');
  } catch {
    showToast('Помилка', '⚠️');
  }
};

window.editAddressName = async function(e, id) {
  e.stopPropagation();
  const addr = addresses.find(a => a.id === id);
  const newName = prompt('Нова назва:', addr?.name || '');

  if (!newName || !newName.trim()) return;

  try {
    const data = await apiFetch(`/api/addresses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName.trim() })
    });

    const i = addresses.findIndex(a => a.id === id);
    if (i >= 0) addresses[i].name = data.address.name;
    if (currentAddressId === id) $('currentAddressDisplay').innerText = data.address.name;
    renderAddressModal();
  } catch {
    showToast('Помилка', '⚠️');
  }
};

window.saveSettings = async function() {
  tariffs = {
    water: parseFloat($('tWater').value) || 0,
    hotWater: parseFloat($('tHotWater').value) || 0,
    electroBase: parseFloat($('tElectroBase').value) || 0,
    electroWinter: parseFloat($('tElectroWinter').value) || 0,
    winterLimit: defaultTariffs.winterLimit,
    nightCoef: defaultTariffs.nightCoef,
    gas: parseFloat($('tGas').value) || 0
  };

  prefs = {
    showWater: $('prefWater').checked,
    showHotWater: $('prefHotWater').checked,
    showElectro: $('prefElectro').checked,
    showGas: $('prefGas').checked,
    electroTwoZone: $('prefElectroTwoZone').checked,
    electroWinter: $('prefElectroWinter').checked,
    remindersEnabled: false,
    remWaterStart: 1,
    remWaterEnd: 5,
    remElectroStart: 28,
    remElectroEnd: 3
  };

  try {
    await apiFetch(`/api/addresses/${currentAddressId}`, {
      method: 'PATCH',
      body: JSON.stringify({ tariffs, prefs, customServices })
    });

    const idx = addresses.findIndex(a => a.id === currentAddressId);
    if (idx >= 0) {
      addresses[idx].tariffs = { ...tariffs };
      addresses[idx].prefs = { ...prefs };
      addresses[idx].customServices = [...customServices];
    }

    initAppUI();
    showToast('Налаштування збережено', '✅');
  } catch {
    showToast('Помилка', '⚠️');
  }
};

window.exportCSV = function() {
  if (!records.length) return showToast('Немає даних', '⚠️');

  let headers = ['Місяць', 'Всього', 'Статус'];
  let csv = '\uFEFF' + headers.join(',') + '\n';

  [...records].sort((a, b) => b.month.localeCompare(a.month)).forEach(r => {
    csv += [r.month, r.total, r.paid ? 'Оплачено' : 'Борг'].join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `komunalka_${currentAddressId}.csv`;
  link.click();
};

window.logout = function() {
  if (!confirm('Вийти з акаунту?')) return;

  localStorage.removeItem('k_token');
  localStorage.removeItem('k_login');
  localStorage.removeItem('kprofile');

  authToken = '';
  sessionLogin = '';
  profile = { name: '', login: '', userId: '' };

  location.reload();
};

function initAppUI() {
  $('tWater').value = tariffs.water ?? '';
  $('tHotWater').value = tariffs.hotWater ?? '';
  $('tElectroBase').value = tariffs.electroBase ?? '';
  $('tElectroWinter').value = tariffs.electroWinter ?? '';
  $('tGas').value = tariffs.gas ?? '';

  $('prefWater').checked = !!prefs.showWater;
  $('prefHotWater').checked = !!prefs.showHotWater;
  $('prefElectro').checked = !!prefs.showElectro;
  $('prefGas').checked = !!prefs.showGas;
  $('prefElectroTwoZone').checked = !!prefs.electroTwoZone;
  $('prefElectroWinter').checked = !!prefs.electroWinter;

  $('blockWater').style.display = prefs.showWater ? '' : 'none';
  $('blockHotWater').style.display = prefs.showHotWater ? '' : 'none';
  $('blockElectro').style.display = prefs.showElectro ? '' : 'none';
  $('blockGas').style.display = prefs.showGas ? '' : 'none';
  $('electroNightRow').style.display = prefs.electroTwoZone ? '' : 'grid';
  $('settingHotWaterWrap').style.display = prefs.showHotWater ? 'flex' : 'none';
  $('settingElectroWinterWrap').style.display = prefs.showElectro ? 'flex' : 'none';

  renderCalcCustomServices();
  renderSettingsCustomServices();

  if (!$('monthInput').value) {
    $('monthInput').value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  }

  fillPreviousReadings();
  calculatePreview();
  renderRecords();
}

['wPrev','wCur','hwPrev','hwCur','dPrev','dCur','nPrev','nCur','gPrev','gCur','isWinterInput','monthInput'].forEach(id => {
  $(id)?.addEventListener('input', calculatePreview);
  $(id)?.addEventListener('change', calculatePreview);
});

applyThemeMode();
setThemeMode(currentMode);
setThemeColor(activeThemeColor);

if (authToken) {
  bootstrapAfterLogin().catch(() => {
    localStorage.removeItem('k_token');
    localStorage.removeItem('k_login');
    localStorage.removeItem('kprofile');
  });
}
