/**
 * Main Controller: Apple-Style Landing, Step Wizard & Public Calendar
 * Dual-Mode: Works seamlessly with Python backend OR standalone on GitHub Pages!
 */

const AVATAR_OPTIONS = [
  '😎', '🦊', '🚀', '☕', '🍕', '🥑', 
  '🎮', '🦄', '🐱', '🎧', '🧋', '🎸', 
  '🏄‍♂️', '🎨', '🥨', '🍩', '🦁', '👾'
];

const LOCAL_STORAGE_KEY = 'friends_meetups_data_store';
const OWNER_TOKENS_KEY = 'friends_meetups_owner_tokens';

function getOwnerTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OWNER_TOKENS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveOwnerTokens(tokens) {
  try {
    localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.warn('Unable to save meetup owner keys', error);
  }
}

function createOwnerToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID() + window.crypto.randomUUID();
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function canDeleteMeetup(meetupId) {
  return Boolean(getOwnerTokens()[meetupId]);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

window.appState = {
  currentView: 'landing', // 'landing', 'wizard', 'calendar'
  currentUser: {
    name: localStorage.getItem('meetup_user_name') || 'Друг',
    avatar: localStorage.getItem('meetup_user_avatar') || '😎'
  },
  meetups: [],
  backendAvailable: false,
  activeMeetup: null,
  publicCalendar: null,
  wizardCalendar: null,
  
  // Wizard state
  wizard: {
    step: 1,
    date: null,
    time: '18:30',
    activity_type: 'cafe',
    cafe_name: 'Star Cup',
    activity_detail: '',
    default_drink: 'coffee',
    is_private: 0,
    title: 'Зустріч з друзями',
    initial_note: ''
  }
};

// LocalStorage Helper for Serverless / GitHub Pages Mode
function getLocalMeetups() {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
}

function saveLocalMeetups(list) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('Unable to save meetup data in this browser', error);
    Toast.show('Не вдалося зберегти дані в браузері. Перевірте вільне місце.', 'error');
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initUserProfile();
  initModalListeners();
  
  const today = new Date();
  window.appState.wizard.date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  await loadMeetups();
  showView('landing');

  // Check URL parameters (both ?data=base64 and ?meetup=id)
  handleUrlParameters();
});

function handleUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // 1. Shared data payload via URL (for GitHub Pages / serverless sharing)
  const dataParam = urlParams.get('data');
  if (dataParam) {
    try {
      const jsonStr = decodeURIComponent(escape(atob(decodeURIComponent(dataParam))));
      const sharedMeetup = JSON.parse(jsonStr);
      if (sharedMeetup && sharedMeetup.title && sharedMeetup.date) {
        if (!sharedMeetup.id) sharedMeetup.id = 'm_' + Date.now();
        
        // Save to local storage list
        const currentList = getLocalMeetups();
        const idx = currentList.findIndex(m => m.id === sharedMeetup.id);
        if (idx >= 0) {
          currentList[idx] = sharedMeetup;
        } else {
          currentList.unshift(sharedMeetup);
        }
        saveLocalMeetups(currentList);
        window.appState.meetups = currentList;

        showView('calendar');
        setTimeout(() => window.openMeetupDetails(sharedMeetup.id), 250);
        Toast.show('Зустріч з посилання успішно завантажено!', 'success');
        return;
      }
    } catch (e) {
      console.warn('URL data parsing error', e);
    }
  }

  // 2. ID-based meetup
  const meetupParam = urlParams.get('meetup');
  if (meetupParam) {
    showView('calendar');
    setTimeout(() => window.openMeetupDetails(meetupParam), 250);
  }
}

// View Switcher
window.showView = function(viewName) {
  window.appState.currentView = viewName;

  const landingView = document.getElementById('view-landing');
  const wizardView = document.getElementById('view-wizard');
  const calendarView = document.getElementById('view-calendar');
  const navBackBtn = document.getElementById('nav-back-btn');

  landingView.classList.add('hidden');
  wizardView.classList.add('hidden');
  calendarView.classList.add('hidden');

  if (viewName === 'landing') {
    landingView.classList.remove('hidden');
    if (navBackBtn) navBackBtn.classList.add('hidden');
    renderLandingPreview();
  } else if (viewName === 'wizard') {
    wizardView.classList.remove('hidden');
    if (navBackBtn) navBackBtn.classList.remove('hidden');
    renderWizardStep(window.appState.wizard.step);
  } else if (viewName === 'calendar') {
    calendarView.classList.remove('hidden');
    if (navBackBtn) navBackBtn.classList.remove('hidden');
    renderPublicCalendar();
    renderPublicMeetupsList();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==================== FLOW 1: WIZARD STEP-BY-STEP ====================

window.startWizardFlow = function() {
  window.appState.wizard.step = 1;
  showView('wizard');
};

function renderWizardStep(stepNum) {
  window.appState.wizard.step = stepNum;

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`wizard-step-1`.replace('1', String(i)));
    if (el) el.classList.add('hidden');
  }

  const activePanel = document.getElementById(`wizard-step-${stepNum}`);
  if (activePanel) {
    activePanel.classList.remove('hidden');
    activePanel.classList.add('animate-slide-in');
  }

  const labels = [
    'Крок 1 з 5: Оберіть дату та час',
    'Крок 2 з 5: Який формат зустрічі?',
    'Крок 3 з 5: Оберіть локацію',
    'Крок 4 з 5: Що замовлятимете?',
    'Крок 5 з 5: Завершення та деталі'
  ];

  const percent = stepNum * 20;
  const labelEl = document.getElementById('wizard-step-label');
  const percentEl = document.getElementById('wizard-progress-percent');
  const barEl = document.getElementById('wizard-progress-bar');

  if (labelEl) labelEl.textContent = labels[stepNum - 1];
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (barEl) barEl.style.width = `${percent}%`;

  const prevBtn = document.getElementById('wizard-prev-btn');
  const nextBtn = document.getElementById('wizard-next-btn');

  if (prevBtn) {
    prevBtn.textContent = stepNum === 1 ? '✕ Скасувати' : '← Назад';
  }
  if (nextBtn) {
    nextBtn.innerHTML = stepNum === 5 ? '<span>✨ Завершити та створити</span>' : '<span>Далі</span> <span>→</span>';
  }

  if (stepNum === 1) {
    initWizardCalendar();
  } else if (stepNum === 3) {
    updateStep3UI();
  } else if (stepNum === 5) {
    updateStep5Summary();
  }
}

function initWizardCalendar() {
  if (!window.appState.wizardCalendar) {
    window.appState.wizardCalendar = new CalendarComponent('wizard-calendar-mount', {
      mode: 'picker',
      initialDate: window.appState.wizard.date,
      onSelect: (dateStr) => {
        window.appState.wizard.date = dateStr;
      }
    });
  }
  window.appState.wizardCalendar.setSelectedDate(window.appState.wizard.date);
}

window.setWizardTime = function(timeVal) {
  window.appState.wizard.time = timeVal;
  const input = document.getElementById('wizard-time-input');
  if (input) input.value = timeVal;

  document.querySelectorAll('.time-preset-chip').forEach(btn => {
    btn.classList.remove('bg-blue-50', 'border-blue-200', 'text-blue-600', 'border');
    btn.classList.add('bg-zinc-100', 'text-zinc-700');
  });

  const active = Array.from(document.querySelectorAll('.time-preset-chip')).find(b => b.textContent.includes(timeVal));
  if (active) {
    active.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-600', 'border');
    active.classList.remove('bg-zinc-100', 'text-zinc-700');
  }
};

window.selectWizardActivity = function(type) {
  window.appState.wizard.activity_type = type;

  ['walk', 'cafe', 'other'].forEach(t => {
    const card = document.getElementById(`activity-card-${t}`);
    if (card) {
      if (t === type) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    }
  });
};

function updateStep3UI() {
  const type = window.appState.wizard.activity_type;
  const cafeContainer = document.getElementById('step-3-cafe-container');
  const customContainer = document.getElementById('step-3-custom-container');
  const titleEl = document.getElementById('step-3-title');
  const subtitleEl = document.getElementById('step-3-subtitle');
  const customLabel = document.getElementById('step-3-custom-label');
  const customInput = document.getElementById('wizard-custom-detail-input');

  if (type === 'cafe') {
    if (cafeContainer) cafeContainer.classList.remove('hidden');
    if (customContainer) customContainer.classList.add('hidden');
    if (titleEl) titleEl.textContent = 'Оберіть кафе';
    if (subtitleEl) subtitleEl.textContent = 'Одне з трьох улюблених місць:';
  } else if (type === 'walk') {
    if (cafeContainer) cafeContainer.classList.add('hidden');
    if (customContainer) customContainer.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'Прогулянка на свіжому повітрі';
    if (subtitleEl) subtitleEl.textContent = 'Де саме гулятимемо?';
    if (customLabel) customLabel.textContent = 'Вкажіть парк або місце зустрічі (необов\'язково):';
    if (customInput) customInput.placeholder = 'Наприклад: Парк Шевченка, Набережна, Центр...';
  } else {
    if (cafeContainer) cafeContainer.classList.add('hidden');
    if (customContainer) customContainer.classList.remove('hidden');
    if (titleEl) titleEl.textContent = 'Щось особливе';
    if (subtitleEl) subtitleEl.textContent = 'Опишіть вашу ідею зустрічі:';
    if (customLabel) customLabel.textContent = 'Вкажіть активність або локацію:';
    if (customInput) customInput.placeholder = 'Наприклад: Настільні ігри вдома, Кінотеатр, Пікнік...';
  }
}

window.selectWizardCafe = function(cafeName) {
  window.appState.wizard.cafe_name = cafeName;

  const map = {
    'Star Cup': 'cafe-card-star-cup',
    'Light Mood': 'cafe-card-light-mood',
    'Жовтий навєсік': 'cafe-card-yellow-tent'
  };

  Object.entries(map).forEach(([name, id]) => {
    const card = document.getElementById(id);
    if (card) {
      if (name === cafeName) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    }
  });
};

window.selectWizardDrink = function(drink) {
  window.appState.wizard.default_drink = drink;

  ['coffee', 'tea', 'other'].forEach(d => {
    const card = document.getElementById(`drink-card-${d}`);
    if (card) {
      if (d === drink) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    }
  });
};

window.updatePrivacyCard = function() {
  const isPrivate = document.querySelector('input[name="wizard_privacy"]:checked')?.value === '1';
  window.appState.wizard.is_private = isPrivate ? 1 : 0;

  const pubCard = document.getElementById('privacy-card-public');
  const privCard = document.getElementById('privacy-card-private');

  if (isPrivate) {
    if (privCard) privCard.classList.add('selected');
    if (pubCard) pubCard.classList.remove('selected');
  } else {
    if (pubCard) pubCard.classList.add('selected');
    if (privCard) privCard.classList.remove('selected');
  }
};

function updateStep5Summary() {
  const w = window.appState.wizard;
  const timeInput = document.getElementById('wizard-time-input');
  if (timeInput) w.time = timeInput.value;

  const customInput = document.getElementById('wizard-custom-detail-input');
  if (customInput) w.activity_detail = customInput.value.trim();

  const dtEl = document.getElementById('summary-date-time');
  const locEl = document.getElementById('summary-location');
  const drinkEl = document.getElementById('summary-drink');

  if (dtEl) dtEl.textContent = `${w.date}, о ${w.time}`;
  if (locEl) {
    if (w.activity_type === 'cafe') {
      locEl.textContent = `Кафе "${w.cafe_name}"`;
    } else if (w.activity_type === 'walk') {
      locEl.textContent = w.activity_detail ? `Прогулянка (${w.activity_detail})` : 'Прогулянка на свіжому повітрі';
    } else {
      locEl.textContent = w.activity_detail || 'Щось інше';
    }
  }
  if (drinkEl) {
    if (w.activity_type === 'cafe') {
      const drinkLabel = w.default_drink === 'coffee' ? 'Кава ☕' : (w.default_drink === 'tea' ? 'Чай 🍵' : 'Щось інше 🥤');
      drinkEl.textContent = `Ваш напій: ${drinkLabel}`;
      drinkEl.parentElement.style.display = 'block';
    } else {
      drinkEl.parentElement.style.display = 'none';
    }
  }

  const titleInput = document.getElementById('wizard-title-input');
  if (titleInput && (!titleInput.value || titleInput.value === 'Зустріч з друзями')) {
    if (w.activity_type === 'cafe') {
      titleInput.value = `Кава в ${w.cafe_name}`;
    } else if (w.activity_type === 'walk') {
      titleInput.value = 'Прогулянка з друзями';
    } else {
      titleInput.value = w.activity_detail || 'Зустріч з друзями';
    }
  }
}

window.wizardNextStep = async function() {
  const current = window.appState.wizard.step;

  if (current === 1) {
    const timeInput = document.getElementById('wizard-time-input');
    if (timeInput) window.appState.wizard.time = timeInput.value;
    if (!window.appState.wizard.date) {
      Toast.show('Будь ласка, оберіть дату в календарі', 'warning');
      return;
    }
    renderWizardStep(2);
  } else if (current === 2) {
    renderWizardStep(3);
  } else if (current === 3) {
    const customInput = document.getElementById('wizard-custom-detail-input');
    if (customInput) window.appState.wizard.activity_detail = customInput.value.trim();

    if (window.appState.wizard.activity_type === 'cafe') {
      renderWizardStep(4);
    } else {
      renderWizardStep(5);
    }
  } else if (current === 4) {
    renderWizardStep(5);
  } else if (current === 5) {
    await submitWizardMeetup();
  }
};

window.wizardPrevStep = function() {
  const current = window.appState.wizard.step;
  if (current === 1) {
    showView('landing');
  } else if (current === 5) {
    if (window.appState.wizard.activity_type !== 'cafe') {
      renderWizardStep(3);
    } else {
      renderWizardStep(4);
    }
  } else {
    renderWizardStep(current - 1);
  }
};

async function submitWizardMeetup() {
  const w = window.appState.wizard;
  const ownerToken = createOwnerToken();
  const title = document.getElementById('wizard-title-input')?.value.trim() || 'Зустріч з друзями';
  const initialNote = document.getElementById('wizard-note-input')?.value.trim() || '';

  const payload = {
    id: 'm_' + Date.now(),
    title: title,
    date: w.date,
    time: w.time || '18:30',
    activity_type: w.activity_type,
    activity_detail: w.activity_detail,
    cafe_name: w.activity_type === 'cafe' ? w.cafe_name : '',
    default_drink: w.activity_type === 'cafe' ? w.default_drink : null,
    is_private: w.is_private === 1,
    initial_note: initialNote,
    creator_name: window.appState.currentUser.name,
    creator_avatar: window.appState.currentUser.avatar,
    participants: [{
      id: 'part_' + Date.now(),
      name: window.appState.currentUser.name,
      avatar: window.appState.currentUser.avatar,
      drink_choice: w.activity_type === 'cafe' ? w.default_drink : null,
      status: 'going'
    }],
    notes: initialNote ? [{
      id: 'note_' + Date.now(),
      author_name: window.appState.currentUser.name,
      author_avatar: window.appState.currentUser.avatar,
      content: initialNote,
      created_at: new Date().toISOString()
    }] : [],
    created_at: new Date().toISOString()
  };

  let savedMeetup = payload;

  try {
    const res = await fetch('/api/meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, owner_token: ownerToken })
    });

    if (res.ok) {
      window.appState.backendAvailable = true;
      const result = await res.json();
      if (result.meetup) savedMeetup = result.meetup;
    } else if (res.status !== 404 || res.headers.get('content-type')?.includes('application/json')) {
      const result = await res.json().catch(() => ({}));
      Toast.show(result.error || 'Не вдалося створити зустріч', 'error');
      return;
    }
  } catch (err) {
    if (window.appState.backendAvailable) {
      Toast.show('Сервер недоступний. Зустріч не створено.', 'error');
      return;
    }
    console.log('Running in client-side / GitHub Pages mode');
  }

  const ownerTokens = getOwnerTokens();
  ownerTokens[savedMeetup.id] = ownerToken;
  saveOwnerTokens(ownerTokens);

  // Always persist locally
  const currentList = getLocalMeetups();
  currentList.unshift(savedMeetup);
  saveLocalMeetups(currentList);
  window.appState.meetups = currentList;

  // Confetti & sound
  window.Confetti.burst(window.innerWidth / 2, window.innerHeight / 2, 100);
  window.SoundEffects.playSuccess();
  Toast.show('Зустріч успішно заплановано!', 'success');

  showView('calendar');
  window.openMeetupDetails(savedMeetup.id);
}

// ==================== FLOW 2: PUBLIC CALENDAR VIEW ====================

window.openCalendarView = function() {
  showView('calendar');
};

function renderPublicCalendar() {
  if (!window.appState.publicCalendar) {
    window.appState.publicCalendar = new CalendarComponent('public-calendar-mount', {
      mode: 'full',
      onSelect: (dateStr) => {
        const dayMeetups = window.appState.meetups.filter(m => m.date === dateStr);
        if (dayMeetups.length === 1) {
          window.openMeetupDetails(dayMeetups[0].id);
        } else if (dayMeetups.length === 0) {
          window.appState.wizard.date = dateStr;
          startWizardFlow();
        }
      }
    });
  }
  window.appState.publicCalendar.render();
}

function renderPublicMeetupsList() {
  const container = document.getElementById('public-meetups-list');
  if (!container) return;

  const meetups = window.appState.meetups;
  if (!meetups || meetups.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-10 text-zinc-500">
        <span class="text-3xl block mb-2">🎈</span>
        <p class="text-sm font-medium">Поки що немає запланованих зустрічей.</p>
        <button onclick="startWizardFlow()" class="apple-btn-primary px-4 py-2 text-xs font-semibold mt-3">
          Будьте першим, хто запланує
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = meetups.map(m => {
    const loc = m.cafe_name ? `Кафе "${m.cafe_name}"` : (m.activity_type === 'walk' ? 'Прогулянка' : m.activity_detail || 'Зустріч');
    const icon = m.activity_type === 'cafe' ? '☕' : (m.activity_type === 'walk' ? '🚶' : '✨');
    const count = (m.participants || []).length;

    return `
      <div onclick="window.openMeetupDetails('${m.id}')" 
           class="p-4 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 cursor-pointer transition flex items-center justify-between group">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-xl shadow-xs group-hover:scale-105 transition">
            ${icon}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-sm text-zinc-900 group-hover:text-blue-600 transition">${m.title}</h4>
              ${m.is_private ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-600 font-semibold">🔒 Приватна</span>' : ''}
            </div>
            <p class="text-xs text-zinc-500 flex items-center gap-2 mt-1">
              <span>📅 ${m.date}</span>
              <span>⏰ ${m.time}</span>
              <span>📍 ${loc}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex -space-x-2">
            ${(m.participants || []).slice(0, 3).map(p => `
              <div class="w-7 h-7 rounded-full bg-white border-2 border-zinc-100 flex items-center justify-center text-xs shadow-xs" title="${p.name}">
                ${p.avatar || '👤'}
              </div>
            `).join('')}
            ${count > 3 ? `<div class="w-7 h-7 rounded-full bg-blue-50 text-blue-600 border-2 border-white flex items-center justify-center text-[10px] font-bold">+${count - 3}</div>` : ''}
          </div>
          <span class="text-zinc-400 group-hover:translate-x-1 transition text-sm">→</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderLandingPreview() {
  const container = document.getElementById('landing-recent-preview');
  if (!container) return;

  const meetups = window.appState.meetups;
  if (!meetups || meetups.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <span>🔥</span> Найближчі події друзів (${meetups.length})
        </h4>
        <button onclick="openCalendarView()" class="text-xs font-semibold text-blue-600 hover:text-blue-700">
          Показати всі в календарі →
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        ${meetups.slice(0, 2).map(m => `
          <div onclick="showView('calendar'); window.openMeetupDetails('${m.id}')" 
               class="p-3.5 rounded-2xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/70 cursor-pointer transition flex items-center gap-3">
            <span class="text-2xl">${m.activity_type === 'cafe' ? '☕' : (m.activity_type === 'walk' ? '🚶' : '✨')}</span>
            <div class="min-w-0 flex-1">
              <h5 class="text-xs font-bold text-zinc-900 truncate">${m.title}</h5>
              <p class="text-[11px] text-zinc-500 mt-0.5">${m.date} &bull; ${m.time} &bull; ${(m.participants || []).length} учасників</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Load Meetups (Dual-Mode: Backend API with LocalStorage Fallback)
async function loadMeetups() {
  try {
    const res = await fetch('/api/meetups');
    if (res.ok) {
      const data = await res.json();
      window.appState.backendAvailable = true;
      window.appState.meetups = Array.isArray(data.meetups) ? data.meetups : [];
      saveLocalMeetups(window.appState.meetups);
      updateViewsAfterMeetupsLoaded();
      return;
    }
  } catch (err) {
    // Backend API unavailable (GitHub Pages or offline)
  }

  // Fallback to local storage
  window.appState.backendAvailable = false;
  window.appState.meetups = getLocalMeetups();
  updateViewsAfterMeetupsLoaded();
}

function updateViewsAfterMeetupsLoaded() {
  if (window.appState.publicCalendar) window.appState.publicCalendar.render();
  if (window.appState.wizardCalendar) window.appState.wizardCalendar.render();
  if (window.appState.currentView === 'landing') renderLandingPreview();
  if (window.appState.currentView === 'calendar') renderPublicMeetupsList();
}

// ==================== MEETUP DETAILS MODAL ====================

window.openMeetupDetails = async function(meetupId) {
  // Try local first
  let meetup = window.appState.meetups.find(m => m.id === meetupId);

  if (!meetup) {
    try {
      const res = await fetch(`/api/meetups/${meetupId}`);
      if (res.ok) {
        const data = await res.json();
        meetup = data.meetup;
      }
    } catch (err) {}
  }

  if (!meetup) {
    Toast.show('Зустріч не знайдено', 'error');
    return;
  }

  window.appState.activeMeetup = meetup;
  renderMeetupDetails(meetup);
  openModal('meetup-details-modal');
};

function renderMeetupDetails(m) {
  const container = document.getElementById('meetup-details-content');
  if (!container) return;

  const loc = m.cafe_name ? `Кафе "${m.cafe_name}"` : (m.activity_type === 'walk' ? 'Прогулянка' : m.activity_detail || 'Зустріч');
  const icon = m.activity_type === 'cafe' ? '☕' : (m.activity_type === 'walk' ? '🚶' : '✨');
  const currentName = (window.appState.currentUser.name || '').trim().toLocaleLowerCase();
  const isJoined = (m.participants || []).some(p => (p.name || '').trim().toLocaleLowerCase() === currentName);

  const participantsHtml = (m.participants || []).map(p => {
    const drinkBadge = p.drink_choice ? `
      <span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
        ${CalendarExport.getDrinkLabel(p.drink_choice)}
      </span>
    ` : '';
    return `
      <div class="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">${p.avatar || '😎'}</span>
          <div>
            <h5 class="text-xs font-bold text-zinc-900">${escapeHtml(p.name)}</h5>
            <span class="text-[10px] text-emerald-600 font-semibold">✓ приєднався</span>
          </div>
        </div>
        ${drinkBadge}
      </div>
    `;
  }).join('');

  const notesHtml = (m.notes || []).map(n => `
    <div class="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex items-start gap-2.5">
      <span class="text-xl flex-shrink-0">${n.author_avatar || '💬'}</span>
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-zinc-900">${escapeHtml(n.author_name)}</span>
          <span class="text-[10px] text-zinc-400">${new Date(n.created_at || Date.now()).toLocaleTimeString('uk-UA', {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <p class="text-xs text-zinc-600 mt-1 leading-relaxed">${escapeHtml(n.content)}</p>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="flex items-start justify-between pb-4 border-b border-zinc-100">
      <div class="flex items-start gap-3">
        <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl border border-amber-100 shadow-xs">
          ${icon}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-bold text-zinc-900">${escapeHtml(m.title)}</h3>
            ${m.is_private ? '<span class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold">🔒 Приватна</span>' : '<span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">🌐 Публічна</span>'}
          </div>
          <p class="text-xs text-zinc-500 mt-1 flex flex-wrap gap-2.5 font-medium">
            <span>📅 ${m.date}</span>
            <span>⏰ ${m.time}</span>
            <span>📍 ${escapeHtml(loc)}</span>
            <span>👑 ${escapeHtml(m.creator_avatar)} ${escapeHtml(m.creator_name)}</span>
          </p>
        </div>
      </div>
    </div>

    ${canDeleteMeetup(m.id) ? `
      <div class="mt-3 flex justify-end">
        <button onclick="deleteMeetup('${m.id}')" class="px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition">
          🗑 Видалити зустріч
        </button>
      </div>
    ` : ''}

    <!-- Calendar Export Buttons (Requirement 7) -->
    <div class="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
          <span>📆</span> Додати подію в календар:
        </span>
        <button onclick="copyShareLink('${m.id}')" class="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          🔗 Скопіювати лінк
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button onclick="CalendarExport.addToGoogleCalendar(window.appState.activeMeetup)" 
                class="px-3 py-2 rounded-xl bg-white hover:bg-blue-50 border border-zinc-200 text-blue-700 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
          Google Calendar
        </button>

        <button onclick="CalendarExport.downloadIcs(window.appState.activeMeetup)" 
                class="px-3 py-2 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.67-1.09 1.74-.95 2.77.99.08 2.06-.52 2.68-1.27z"/></svg>
          Apple Calendar (.ics)
        </button>

        <button onclick="CalendarExport.copyNotionCard(window.appState.activeMeetup)" 
                class="px-3 py-2 rounded-xl bg-white hover:bg-stone-50 border border-zinc-200 text-stone-800 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition">
          <span>📝</span> Notion (Картка)
        </button>
      </div>
    </div>

    <!-- Participants & Join Form -->
    <div class="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
          <span>👥</span> Учасники (${(m.participants || []).length})
        </h4>
        ${!isJoined ? `
          <button onclick="showJoinForm('${m.id}')" 
                  class="apple-btn-primary px-3 py-1.5 text-xs font-semibold">
            + Приєднатися
          </button>
        ` : `
          <span class="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            ✓ Ви у списку
          </span>
        `}
      </div>

      <div id="join-form-container-${m.id}" class="hidden mb-3 p-3.5 rounded-2xl bg-white border border-blue-200 shadow-sm">
        <h5 class="text-xs font-bold text-blue-600 mb-2">Підтвердження участі</h5>
        <div class="space-y-2.5">
          ${m.activity_type === 'cafe' ? `
            <div>
              <label class="block text-[11px] font-semibold text-zinc-700 mb-1">Що замовлятимете у кафе?</label>
              <div class="grid grid-cols-3 gap-1.5 text-xs">
                <label class="cursor-pointer flex items-center justify-center gap-1 p-2 rounded-xl bg-zinc-50 border border-zinc-200 hover:border-blue-400">
                  <input type="radio" name="join_drink" value="coffee" checked class="hidden">
                  <span>☕ Кава</span>
                </label>
                <label class="cursor-pointer flex items-center justify-center gap-1 p-2 rounded-xl bg-zinc-50 border border-zinc-200 hover:border-blue-400">
                  <input type="radio" name="join_drink" value="tea" class="hidden">
                  <span>🍵 Чай</span>
                </label>
                <label class="cursor-pointer flex items-center justify-center gap-1 p-2 rounded-xl bg-zinc-50 border border-zinc-200 hover:border-blue-400">
                  <input type="radio" name="join_drink" value="other" class="hidden">
                  <span>🥤 Інше</span>
                </label>
              </div>
            </div>
          ` : ''}

          <div class="flex justify-end gap-2 pt-1">
            <button onclick="hideJoinForm('${m.id}')" class="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800">Скасувати</button>
            <button onclick="submitJoin('${m.id}')" class="apple-btn-primary px-4 py-1.5 text-xs font-semibold">
              Приєднатись
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
        ${participantsHtml}
      </div>
    </div>

    <!-- Notes Feed (Requirement 5) -->
    <div class="mt-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80">
      <h4 class="text-xs font-bold text-zinc-900 flex items-center gap-1.5 mb-2.5">
        <span>💬</span> Примітки та побажання (${(m.notes || []).length})
      </h4>

      <div class="flex flex-col gap-2 max-h-44 overflow-y-auto pr-1 mb-3">
        ${notesHtml.length > 0 ? notesHtml : '<p class="text-xs text-zinc-400 italic">Поки що немає коментарів. Будьте першим!</p>'}
      </div>

      <form onsubmit="event.preventDefault(); submitNote('${m.id}');" class="flex gap-2">
        <input type="text" id="note-input-${m.id}" 
               placeholder="Додайте примітку для всіх..." 
               class="flex-1 bg-white border border-zinc-200 rounded-xl px-3.5 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition">
        <button type="submit" class="apple-btn-primary px-4 py-2 text-xs font-semibold">
          Надіслати
        </button>
      </form>
    </div>
  `;
}

window.deleteMeetup = async function(meetupId) {
  const meetup = window.appState.meetups.find(item => item.id === meetupId);
  const ownerToken = getOwnerTokens()[meetupId];
  if (!meetup || !ownerToken) {
    Toast.show('Видалити зустріч може лише автор із браузера, де її створили', 'warning');
    return;
  }

  if (!window.confirm(`Видалити зустріч «${meetup.title}»? Учасники та примітки також буде видалено.`)) return;

  if (window.appState.backendAvailable) {
    try {
      const res = await fetch(`/api/meetups/${encodeURIComponent(meetupId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_token: ownerToken })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Toast.show(data.error || 'Не вдалося видалити зустріч', 'error');
        return;
      }
    } catch (error) {
      Toast.show('Сервер недоступний. Зустріч не видалено.', 'error');
      return;
    }
  }

  window.appState.meetups = window.appState.meetups.filter(item => item.id !== meetupId);
  saveLocalMeetups(window.appState.meetups);
  const ownerTokens = getOwnerTokens();
  delete ownerTokens[meetupId];
  saveOwnerTokens(ownerTokens);
  window.appState.activeMeetup = null;
  closeModal('meetup-details-modal');
  updateViewsAfterMeetupsLoaded();
  Toast.show('Зустріч видалено', 'success');
};

// RSVP Handlers
window.showJoinForm = function(meetupId) {
  const container = document.getElementById(`join-form-container-${meetupId}`);
  if (container) container.classList.remove('hidden');
};

window.hideJoinForm = function(meetupId) {
  const container = document.getElementById(`join-form-container-${meetupId}`);
  if (container) container.classList.add('hidden');
};

window.submitJoin = async function(meetupId) {
  const drinkRadio = document.querySelector('input[name="join_drink"]:checked');
  const drink = drinkRadio ? drinkRadio.value : null;
  const newParticipant = {
    id: 'part_' + Date.now(),
    name: window.appState.currentUser.name,
    avatar: window.appState.currentUser.avatar,
    drink_choice: drink,
    status: 'going'
  };

  try {
    const res = await fetch(`/api/meetups/${encodeURIComponent(meetupId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newParticipant)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.meetup) {
        window.appState.activeMeetup = data.meetup;
      }
    } else if (res.status !== 404 || res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      Toast.show(data.error || 'Не вдалося приєднатися до зустрічі', 'error');
      return;
    }
  } catch (err) {}

  // Update locally
  const currentList = getLocalMeetups();
  const m = currentList.find(item => item.id === meetupId);
  if (m) {
    if (!m.participants) m.participants = [];
    const existingIndex = m.participants.findIndex(p => (p.name || '').trim().toLocaleLowerCase() === newParticipant.name.trim().toLocaleLowerCase());
    if (existingIndex >= 0) m.participants[existingIndex] = { ...m.participants[existingIndex], ...newParticipant };
    else m.participants.push(newParticipant);
    saveLocalMeetups(currentList);
    window.appState.meetups = currentList;
    window.appState.activeMeetup = window.appState.activeMeetup?.participants ? window.appState.activeMeetup : m;
  }

  window.Confetti.burst(window.innerWidth / 2, window.innerHeight / 2, 70);
  window.SoundEffects.playSuccess();
  Toast.show('Ви приєдналися до зустрічі!', 'success');

  renderMeetupDetails(window.appState.activeMeetup);
  updateViewsAfterMeetupsLoaded();
};

window.submitNote = async function(meetupId) {
  const input = document.getElementById(`note-input-${meetupId}`);
  if (!input || !input.value.trim()) return;

  const content = input.value.trim();
  const newNote = {
    id: 'note_' + Date.now(),
    author_name: window.appState.currentUser.name,
    author_avatar: window.appState.currentUser.avatar,
    content: content,
    created_at: new Date().toISOString()
  };

  try {
    const res = await fetch(`/api/meetups/${encodeURIComponent(meetupId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.meetup) {
        window.appState.activeMeetup = data.meetup;
      }
    } else if (res.status !== 404 || res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      Toast.show(data.error || 'Не вдалося додати примітку', 'error');
      return;
    }
  } catch (err) {}

  // Update locally
  const currentList = getLocalMeetups();
  const m = currentList.find(item => item.id === meetupId);
  if (m) {
    if (!m.notes) m.notes = [];
    if (!m.notes.some(note => note.id === newNote.id)) m.notes.push(newNote);
    saveLocalMeetups(currentList);
    window.appState.meetups = currentList;
    window.appState.activeMeetup = window.appState.activeMeetup?.notes ? window.appState.activeMeetup : m;
  }

  input.value = '';
  Toast.show('Примітку додано!', 'success');
  renderMeetupDetails(window.appState.activeMeetup);
  updateViewsAfterMeetupsLoaded();
};

window.copyShareLink = function(meetupId) {
  const meetup = window.appState.meetups.find(m => m.id === meetupId);
  let url = `${window.location.origin}${window.location.pathname}?meetup=${meetupId}`;

  // If we have the meetup data, encode it into the URL so it works seamlessly on GitHub Pages
  if (meetup) {
    try {
      const jsonStr = JSON.stringify(meetup);
      const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(jsonStr))));
      url = `${window.location.origin}${window.location.pathname}?data=${encoded}`;
    } catch (e) {}
  }

  navigator.clipboard.writeText(url).then(() => {
    Toast.show('Посилання скопійовано! Воно відкриє зустріч у будь-кого з друзів.', 'success');
  }).catch(() => {
    Toast.show('Не вдалося скопіювати', 'warning');
  });
};

// ==================== USER PROFILE & MODALS ====================

function initUserProfile() {
  const avatarEl = document.getElementById('user-avatar-display');
  const nameEl = document.getElementById('user-name-display');

  if (avatarEl) {
    if (window.appState.currentUser.avatar.startsWith('data:image')) {
      avatarEl.innerHTML = `<img src="${window.appState.currentUser.avatar}" class="w-full h-full object-cover rounded-full" alt="avatar" />`;
    } else {
      avatarEl.textContent = window.appState.currentUser.avatar;
    }
  }
  if (nameEl) nameEl.textContent = window.appState.currentUser.name;

  const profileBtn = document.getElementById('user-profile-btn');
  if (profileBtn) profileBtn.onclick = () => openAvatarModal();

  const grid = document.getElementById('avatar-grid');
  if (grid) {
    grid.innerHTML = AVATAR_OPTIONS.map(emoji => `
      <button type="button" class="text-2xl p-2.5 rounded-xl hover:bg-zinc-100 border border-zinc-200 transition transform hover:scale-110 flex items-center justify-center"
              onclick="selectAvatar('${emoji}')">
        ${emoji}
      </button>
    `).join('');
  }

  const customAvatarInput = document.getElementById('custom-avatar-file');
  if (customAvatarInput) {
    customAvatarInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          saveUserProfile(window.appState.currentUser.name, event.target.result, true);
          closeModal('avatar-modal');
        };
        reader.readAsDataURL(file);
      }
    };
  }
}

function selectAvatar(emoji) {
  const nameInput = document.getElementById('profile-name-input');
  const newName = nameInput ? nameInput.value.trim() : window.appState.currentUser.name;
  saveUserProfile(newName || window.appState.currentUser.name, emoji);
  closeModal('avatar-modal');
  Toast.show('Профіль оновлено!', 'success');
}

function saveUserProfile(name, avatar, isCustomImage = false) {
  window.appState.currentUser.name = name;
  window.appState.currentUser.avatar = avatar;
  localStorage.setItem('meetup_user_name', name);
  localStorage.setItem('meetup_user_avatar', avatar);

  const avatarEl = document.getElementById('user-avatar-display');
  const nameEl = document.getElementById('user-name-display');

  if (avatarEl) {
    if (isCustomImage || avatar.startsWith('data:image')) {
      avatarEl.innerHTML = `<img src="${avatar}" class="w-full h-full object-cover rounded-full" alt="avatar" />`;
    } else {
      avatarEl.textContent = avatar;
    }
  }
  if (nameEl) nameEl.textContent = name;
}

function openAvatarModal() {
  const nameInput = document.getElementById('profile-name-input');
  if (nameInput) nameInput.value = window.appState.currentUser.name;
  openModal('avatar-modal');
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    const content = modal.querySelector('.apple-modal');
    if (content) content.classList.add('animate-fade-scale');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function initModalListeners() {
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('active');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
    }
  });

  const notifSettingsBtn = document.getElementById('notif-settings-btn');
  if (notifSettingsBtn) notifSettingsBtn.onclick = () => openNotificationModal();
}

function openNotificationModal() {
  const settings = window.NotificationManager.settings;
  const toggle = document.getElementById('push-enabled-toggle');
  const chk15 = document.getElementById('remind-15m-chk');
  const chk1h = document.getElementById('remind-1h-chk');
  const chk1d = document.getElementById('remind-1d-chk');
  const chkSound = document.getElementById('remind-sound-chk');

  if (toggle) toggle.checked = settings.enabled;
  if (chk15) chk15.checked = settings.remind15Min;
  if (chk1h) chk1h.checked = settings.remind1Hour;
  if (chk1d) chk1d.checked = settings.remind1Day;
  if (chkSound) chkSound.checked = settings.sound;

  openModal('notification-settings-modal');
}

window.savePushSettingsFromModal = async function() {
  const toggle = document.getElementById('push-enabled-toggle');
  let enabled = toggle ? toggle.checked : false;

  if (enabled) {
    const granted = await window.NotificationManager.requestPermission();
    if (!granted) {
      if (toggle) toggle.checked = false;
      enabled = false;
    }
  }

  window.NotificationManager.saveSettings({
    enabled: enabled,
    remind15Min: document.getElementById('remind-15m-chk')?.checked ?? true,
    remind1Hour: document.getElementById('remind-1h-chk')?.checked ?? true,
    remind1Day: document.getElementById('remind-1d-chk')?.checked ?? false,
    sound: document.getElementById('remind-sound-chk')?.checked ?? true
  });

  closeModal('notification-settings-modal');
  Toast.show('Налаштування сповіщень збережено!', 'success');
};

window.testPushAlert = function() {
  window.NotificationManager.sendTestNotification();
};

