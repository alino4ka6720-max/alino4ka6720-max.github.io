// ==== Конфигурация улучшений ====
// type: 'click' — увеличивает силу клика, 'auto' — доход в секунду
const UPGRADES = [
  { id: 'click1', name: 'Усиленная мышь',   desc: '+1 к клику',   baseCost: 15,     costMult: 1.15, type: 'click', value: 1 },
  { id: 'auto1',  name: 'Кликающий бот',    desc: '+1/сек',       baseCost: 50,     costMult: 1.15, type: 'auto',  value: 1 },
  { id: 'click2', name: 'Кибер-перчатка',   desc: '+5 к клику',   baseCost: 200,    costMult: 1.18, type: 'click', value: 5 },
  { id: 'auto2',  name: 'Ферма ботов',      desc: '+8/сек',       baseCost: 800,    costMult: 1.18, type: 'auto',  value: 8 },
  { id: 'click3', name: 'Плазменный резак', desc: '+25 к клику',  baseCost: 3000,   costMult: 1.20, type: 'click', value: 25 },
  { id: 'auto3',  name: 'Квантовый сервер', desc: '+60/сек',      baseCost: 12000,  costMult: 1.20, type: 'auto',  value: 60 },
  { id: 'click4', name: 'Сингулярность',    desc: '+150 к клику', baseCost: 50000,  costMult: 1.25, type: 'click', value: 150 },
  { id: 'auto4',  name: 'Дайсон-сфера',     desc: '+500/сек',     baseCost: 200000, costMult: 1.25, type: 'auto',  value: 500 },
];

const PRESTIGE_THRESHOLD = 1_000_000; // сколько нужно заработать за «круг»
const SAVE_KEY = 'space_clicker_save_v1'; // ключ не менялся — старые сохранения работают
const OFFLINE_CAP_SEC = 3600;             // максимум офлайн-дохода — 1 час
const MAX_BULK = 1000;                    // защита от слишком долгих расчётов в режиме «Макс»

// ==== Состояние ====
let state = {
  coins: 0,
  totalEarned: 0,
  clickPower: 1,
  cps: 0,
  levels: {},           // id -> level
  prestigePoints: 0,
  buyMode: '1',         // '1' | '10' | 'max'
};

let resetting = false;  // true во время сброса сохранения, чтобы save() не записал всё обратно

const els = {
  coins: document.getElementById('coins'),
  cps: document.getElementById('cps'),
  mult: document.getElementById('mult'),
  clickBtn: document.getElementById('clickBtn'),
  clickPower: document.getElementById('clickPower'),
  shopList: document.getElementById('shopList'),
  buyModes: document.getElementById('buyModes'),
  prestigeBtn: document.getElementById('prestigeBtn'),
  prestigeInfo: document.getElementById('prestigeInfo'),
  resetBtn: document.getElementById('resetBtn'),
};

// ==== Форматирование чисел (1.2K, 3.4M, ...) ====
const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function formatNum(n) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return Math.floor(n).toString();
  if (n >= 1e36) return n.toExponential(2).replace('e+', 'e');
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  let digits = n < 10 ? 2 : 1;
  let r = Number(n.toFixed(digits));
  // фикс: 999.96K раньше превращалось в «1000.0K»
  if (r >= 1000 && i < UNITS.length - 1) { r /= 1000; i++; digits = 2; }
  return r.toFixed(digits) + UNITS[i];
}

// ==== Расчёты ====
function getMultiplier() {
  return 1 + state.prestigePoints * 0.1;
}

function costAtLevel(upgrade, level) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costMult, level));
}

function getCost(upgrade) {
  return costAtLevel(upgrade, state.levels[upgrade.id] || 0);
}

// Сколько уровней купим и за сколько в текущем режиме (x1 / x10 / Макс)
function getBuyPlan(upgrade) {
  const level = state.levels[upgrade.id] || 0;
  if (state.buyMode === 'max') {
    let count = 0, total = 0, budget = state.coins;
    while (count < MAX_BULK) {
      const c = costAtLevel(upgrade, level + count);
      if (budget < c) break;
      budget -= c; total += c; count++;
    }
    if (count === 0) return { count: 1, cost: costAtLevel(upgrade, level), affordable: false };
    return { count, cost: total, affordable: true };
  }
  const n = Number(state.buyMode) || 1;
  let total = 0;
  for (let i = 0; i < n; i++) total += costAtLevel(upgrade, level + i);
  return { count: n, cost: total, affordable: state.coins >= total };
}

function recalc() {
  let baseClick = 1;
  let baseCps = 0;
  for (const u of UPGRADES) {
    const level = state.levels[u.id] || 0;
    if (u.type === 'click') baseClick += u.value * level;
    else                    baseCps   += u.value * level;
  }
  const m = getMultiplier();
  state.clickPower = baseClick * m;
  state.cps = baseCps * m;
}

// ==== Рендер ====
function buildShop() {
  els.shopList.innerHTML = '';
  UPGRADES.forEach((u, idx) => {
    const div = document.createElement('div');
    div.className = 'upgrade disabled';
    div.dataset.id = u.id;
    div.title = `Горячая клавиша: ${idx + 1}`;
    div.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc} за уровень</div>
      </div>
      <div class="upgrade-buy">
        <div class="upgrade-level">Ур. 0</div>
        <div class="upgrade-cost">0 ⚡</div>
      </div>
    `;
    div.addEventListener('click', () => buyUpgrade(u.id));
    els.shopList.appendChild(div);
  });
}

function renderStats() {
  els.coins.textContent = formatNum(state.coins);
  els.cps.textContent = formatNum(state.cps);
  els.mult.textContent = 'x' + getMultiplier().toFixed(1);
  els.clickPower.textContent = formatNum(state.clickPower);
  document.title = `⚡ ${formatNum(state.coins)} · Космическая энергия`;
}

function updateShop() {
  for (const u of UPGRADES) {
    const div = els.shopList.querySelector(`[data-id="${u.id}"]`);
    if (!div) continue;
    const level = state.levels[u.id] || 0;
    const plan = getBuyPlan(u);
    div.classList.toggle('disabled', !plan.affordable);
    div.querySelector('.upgrade-level').textContent =
      plan.count > 1 && plan.affordable ? `Ур. ${level} (+${plan.count})` : `Ур. ${level}`;
    div.querySelector('.upgrade-cost').textContent = `${formatNum(plan.cost)} ⚡`;
  }
}

function updateBuyModes() {
  if (!els.buyModes) return;
  for (const b of els.buyModes.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.mode === state.buyMode);
  }
}

function updatePrestige() {
  if (state.totalEarned >= PRESTIGE_THRESHOLD) {
    const gain = getPrestigeGain();
    els.prestigeBtn.disabled = false;
    els.prestigeBtn.textContent = `Престиж +${gain}`;
    els.prestigeInfo.textContent =
      `Сбросить прогресс и получить ${gain} очков (+${gain * 10}% к доходу навсегда)`;
  } else {
    els.prestigeBtn.disabled = true;
    els.prestigeBtn.textContent = 'Престиж';
    els.prestigeInfo.textContent =
      `До престижа: ещё ${formatNum(PRESTIGE_THRESHOLD - state.totalEarned)} заработать`;
  }
}

function renderAll() {
  renderStats();
  updateShop();
  updateBuyModes();
  updatePrestige();
}

// ==== Всплывающие уведомления (вместо блокирующего alert) ====
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ==== Действия ====
function getPrestigeGain() {
  return Math.floor(Math.sqrt(state.totalEarned / PRESTIGE_THRESHOLD));
}

function gainCoins(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.coins += amount;
  state.totalEarned += amount;
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return;
  const plan = getBuyPlan(u);
  if (!plan.affordable || state.coins < plan.cost) return;
  state.coins -= plan.cost;
  state.levels[id] = (state.levels[id] || 0) + plan.count;
  recalc();
  renderAll();
  save();
}

const MAX_FLOATS = 30;
function showFloat(x, y, text) {
  // защита от засорения DOM при очень быстрых кликах
  const old = document.querySelectorAll('.float-text');
  if (old.length >= MAX_FLOATS) old[0].remove();
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ==== Обработчики ====
els.clickBtn.addEventListener('click', (e) => {
  gainCoins(state.clickPower);
  let x = e.clientX, y = e.clientY;
  // фикс: при нажатии Enter/Space координаты = 0,0 — показываем число над кнопкой
  if (e.detail === 0 || (x === 0 && y === 0)) {
    const r = els.clickBtn.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  showFloat(x, y, '+' + formatNum(state.clickPower));
  renderAll(); // фикс: раньше не обновлялась кнопка престижа при кликах
});

els.prestigeBtn.addEventListener('click', () => {
  if (state.totalEarned < PRESTIGE_THRESHOLD) return;
  const gain = getPrestigeGain();
  if (!confirm(`Сбросить прогресс и получить ${gain} очков престижа?`)) return;
  state.prestigePoints += gain;
  state.coins = 0;
  state.totalEarned = 0;
  state.levels = {};
  recalc();
  renderAll();
  save();
  toast(`Престиж! Множитель теперь ${'x' + getMultiplier().toFixed(1)}`);
});

if (els.buyModes) {
  els.buyModes.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    state.buyMode = b.dataset.mode;
    renderAll();
    save();
  });
}

if (els.resetBtn) {
  els.resetBtn.addEventListener('click', () => {
    if (!confirm('Удалить ВСЁ сохранение, включая очки престижа? Это нельзя отменить.')) return;
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });
}

// Горячие клавиши: 1–8 — купить соответствующее улучшение
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.key >= '1' && e.key <= String(UPGRADES.length)) {
    buyUpgrade(UPGRADES[Number(e.key) - 1].id);
  }
});

// ==== Игровой цикл (с учётом прошедшего времени) ====
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  // фикс: защита от смены системного времени (отрицательный dt) и от
  // бесконечного дохода после «сна» ноутбука — тот же лимит, что и для офлайна
  const dt = Math.min(Math.max((now - lastTick) / 1000, 0), OFFLINE_CAP_SEC);
  lastTick = now;
  if (state.cps > 0) {
    gainCoins(state.cps * dt);
    renderStats();
    updateShop();
    updatePrestige();
  }
}, 200);

// ==== Сохранение ====
function save() {
  if (resetting) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      state,
      savedAt: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

// Проверка данных из сохранения: битые/NaN значения не должны ломать игру
function sanitizeState(saved) {
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const levels = {};
  if (saved.levels && typeof saved.levels === 'object') {
    for (const u of UPGRADES) {
      const lv = Math.floor(Number(saved.levels[u.id]));
      if (Number.isFinite(lv) && lv > 0) levels[u.id] = lv;
    }
  }
  return {
    coins: num(saved.coins),
    totalEarned: Math.max(num(saved.totalEarned), num(saved.coins)),
    clickPower: 1,
    cps: 0,
    levels,
    prestigePoints: Math.floor(num(saved.prestigePoints)),
    buyMode: ['1', '10', 'max'].includes(saved.buyMode) ? saved.buyMode : '1',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.state) {
      state = { ...state, ...sanitizeState(data.state) };
    }
    // Офлайн-доход: начисляем за время, пока вкладка была закрыта (максимум 1 час)
    recalc();
    if (data && data.savedAt && state.cps > 0) {
      const offlineSec = Math.min((Date.now() - data.savedAt) / 1000, OFFLINE_CAP_SEC);
      if (offlineSec > 30) {
        const offlineGain = state.cps * offlineSec;
        gainCoins(offlineGain);
        setTimeout(() => {
          toast(`Пока тебя не было, накопилось ${formatNum(offlineGain)} ⚡`);
        }, 100);
      }
    }
  } catch (e) { /* ignore */ }
}

window.addEventListener('beforeunload', save);
window.addEventListener('pagehide', save); // iOS Safari не всегда вызывает beforeunload
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ==== Старт ====
load();
recalc();
buildShop();
renderAll();
