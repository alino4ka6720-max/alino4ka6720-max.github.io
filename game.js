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
const SAVE_KEY = 'space_clicker_save_v1';

// ==== Состояние ====
let state = {
  coins: 0,
  totalEarned: 0,
  clickPower: 1,
  cps: 0,
  levels: {},           // id -> level
  prestigePoints: 0,
};

const els = {
  coins: document.getElementById('coins'),
  cps: document.getElementById('cps'),
  mult: document.getElementById('mult'),
  clickBtn: document.getElementById('clickBtn'),
  clickPower: document.getElementById('clickPower'),
  shopList: document.getElementById('shopList'),
  prestigeBtn: document.getElementById('prestigeBtn'),
  prestigeInfo: document.getElementById('prestigeInfo'),
};

// ==== Форматирование чисел (1.2K, 3.4M, ...) ====
function formatNum(n) {
  if (n < 1000) return Math.floor(n).toString();
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : 1) + units[i];
}

// ==== Расчёты ====
function getMultiplier() {
  return 1 + state.prestigePoints * 0.1;
}

function getCost(upgrade) {
  const level = state.levels[upgrade.id] || 0;
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costMult, level));
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
  for (const u of UPGRADES) {
    const div = document.createElement('div');
    div.className = 'upgrade disabled';
    div.dataset.id = u.id;
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
  }
}

function renderStats() {
  els.coins.textContent = formatNum(state.coins);
  els.cps.textContent = formatNum(state.cps);
  els.mult.textContent = 'x' + getMultiplier().toFixed(1);
  els.clickPower.textContent = formatNum(state.clickPower);
}

function updateShop() {
  for (const u of UPGRADES) {
    const div = els.shopList.querySelector(`[data-id="${u.id}"]`);
    if (!div) continue;
    const level = state.levels[u.id] || 0;
    const cost = getCost(u);
    const canBuy = state.coins >= cost;
    div.classList.toggle('disabled', !canBuy);
    div.querySelector('.upgrade-level').textContent = `Ур. ${level}`;
    div.querySelector('.upgrade-cost').textContent = `${formatNum(cost)} ⚡`;
  }
}

function updatePrestige() {
  if (state.totalEarned >= PRESTIGE_THRESHOLD) {
    const gain = Math.floor(Math.sqrt(state.totalEarned / PRESTIGE_THRESHOLD));
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
  updatePrestige();
}

// ==== Действия ====
function gainCoins(amount) {
  state.coins += amount;
  state.totalEarned += amount;
}

function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return;
  const cost = getCost(u);
  if (state.coins < cost) return;
  state.coins -= cost;
  state.levels[id] = (state.levels[id] || 0) + 1;
  recalc();
  renderAll();
  save();
}

function showFloat(x, y, text) {
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
  showFloat(e.clientX, e.clientY, '+' + formatNum(state.clickPower));
  renderStats();
  updateShop();
});

els.prestigeBtn.addEventListener('click', () => {
  if (state.totalEarned < PRESTIGE_THRESHOLD) return;
  const gain = Math.floor(Math.sqrt(state.totalEarned / PRESTIGE_THRESHOLD));
  if (!confirm(`Сбросить прогресс и получить ${gain} очков престижа?`)) return;
  state.prestigePoints += gain;
  state.coins = 0;
  state.totalEarned = 0;
  state.levels = {};
  recalc();
  renderAll();
  save();
});

// ==== Игровой цикл (с учётом прошедшего времени) ====
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
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
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      state,
      savedAt: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.state) {
      state = { ...state, ...data.state };
    }
    // Офлайн-доход: начисляем за время, пока вкладка была закрыта (максимум 1 час)
    recalc();
    if (data.savedAt && state.cps > 0) {
      const offlineSec = Math.min((Date.now() - data.savedAt) / 1000, 3600);
      if (offlineSec > 30) {
        const offlineGain = state.cps * offlineSec;
        gainCoins(offlineGain);
        setTimeout(() => {
          alert(`Пока тебя не было, накопилось ${formatNum(offlineGain)} ⚡`);
        }, 100);
      }
    }
  } catch (e) { /* ignore */ }
}

window.addEventListener('beforeunload', save);
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ==== Старт ====
load();
recalc();
buildShop();
renderAll();