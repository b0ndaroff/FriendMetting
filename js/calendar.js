/**
 * Apple-Styled Two-Month Calendar Component
 */

class CalendarComponent {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.currentDate = new Date();
    this.baseYear = this.currentDate.getFullYear();
    this.baseMonth = this.currentDate.getMonth(); // 0-indexed
    this.selectedDateStr = options.initialDate || null;
    this.mode = options.mode || 'full'; // 'full' or 'picker'
    this.onSelect = options.onSelect || null;

    this.monthNamesUk = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ];

    this.weekDaysUk = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  }

  prevMonth() {
    this.baseMonth--;
    if (this.baseMonth < 0) {
      this.baseMonth = 11;
      this.baseYear--;
    }
    this.render();
  }

  nextMonth() {
    this.baseMonth++;
    if (this.baseMonth > 11) {
      this.baseMonth = 0;
      this.baseYear++;
    }
    this.render();
  }

  today() {
    const now = new Date();
    this.baseYear = now.getFullYear();
    this.baseMonth = now.getMonth();
    this.render();
  }

  setSelectedDate(dateStr) {
    this.selectedDateStr = dateStr;
    this.render();
  }

  render() {
    if (!this.container) return;

    // Month 1
    const m1Year = this.baseYear;
    const m1Month = this.baseMonth;

    // Month 2
    let m2Year = this.baseYear;
    let m2Month = this.baseMonth + 1;
    if (m2Month > 11) {
      m2Month = 0;
      m2Year++;
    }

    const html = `
      <div class="flex flex-col gap-5 animate-slide-in">
        <!-- Calendar Header Navigation (Apple Style) -->
        <div class="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-black/5 shadow-sm">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">🗓️</span>
            <h3 class="text-base font-bold text-zinc-900 tracking-tight">
              ${this.monthNamesUk[m1Month]} ${m1Year} &mdash; ${this.monthNamesUk[m2Month]} ${m2Year}
            </h3>
          </div>

          <div class="flex items-center gap-1.5">
            <button class="cal-today-btn px-3 py-1 rounded-full text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition">
              Сьогодні
            </button>
            <div class="h-4 w-px bg-zinc-200 mx-1"></div>
            <button class="cal-prev-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition" title="Попередній">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button class="cal-next-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition" title="Наступний">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        <!-- 2 Months Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          ${this.renderMonthCard(m1Year, m1Month)}
          ${this.renderMonthCard(m2Year, m2Month)}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  renderMonthCard(year, month) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayRaw = new Date(year, month, 1).getDay();
    const firstDayIndex = firstDayRaw === 0 ? 6 : firstDayRaw - 1;

    let daysHtml = '';

    for (let i = 0; i < firstDayIndex; i++) {
      daysHtml += `<div class="calendar-day-cell empty"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isPast = dateStr < todayStr;
      const isToday = dateStr === todayStr;
      const isSelected = this.selectedDateStr === dateStr;

      // Meetups for this day
      const dayMeetups = (window.appState?.meetups || []).filter(m => m.date === dateStr);

      let meetupsHtml = '';
      if (this.mode === 'full' && dayMeetups.length > 0) {
        meetupsHtml = `
          <div class="mt-1 flex flex-col gap-1 overflow-hidden">
            ${dayMeetups.slice(0, 2).map(m => {
              const pillClass = m.activity_type === 'cafe' ? 'pill-cafe' : (m.activity_type === 'walk' ? 'pill-walk' : 'pill-other');
              const icon = m.activity_type === 'cafe' ? '☕' : (m.activity_type === 'walk' ? '🚶' : '✨');
              return `
                <div class="meetup-pill ${pillClass}" onclick="event.stopPropagation(); window.openMeetupDetails('${m.id}')" title="${m.title} (${m.time})">
                  <span>${icon}</span>
                  <span class="font-bold">${m.time}</span>
                  <span class="truncate">${m.title}</span>
                </div>
              `;
            }).join('')}
            ${dayMeetups.length > 2 ? `<span class="text-[9.5px] font-bold text-zinc-500 pl-1">+ ще ${dayMeetups.length - 2}</span>` : ''}
          </div>
        `;
      } else if (this.mode === 'picker' && dayMeetups.length > 0) {
        // Subtle dot badge in picker mode
        meetupsHtml = `
          <div class="mt-auto flex items-center justify-center pt-1">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
        `;
      }

      daysHtml += `
        <div class="calendar-day-cell ${isPast ? 'disabled' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
             data-date="${dateStr}">
          <div class="flex items-center justify-between">
            <div class="${isToday ? 'day-number-circle' : 'text-xs font-semibold text-zinc-800'}">
              ${day}
            </div>
            ${dayMeetups.length > 0 && this.mode === 'full' && !isToday ? `<span class="w-2 h-2 rounded-full bg-amber-500"></span>` : ''}
          </div>
          ${meetupsHtml}
        </div>
      `;
    }

    return `
      <div class="bg-white p-5 rounded-3xl border border-black/5 shadow-sm flex flex-col">
        <div class="flex items-center justify-between pb-3 mb-2 border-b border-zinc-100">
          <h4 class="text-sm font-bold text-zinc-900">
            ${this.monthNamesUk[month]} <span class="text-zinc-400 font-normal">${year}</span>
          </h4>
          <span class="text-[11px] font-medium text-zinc-400">
            ${totalDays} днів
          </span>
        </div>

        <div class="grid grid-cols-7 gap-1 mb-2 text-center">
          ${this.weekDaysUk.map(d => `<div class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 py-0.5">${d}</div>`).join('')}
        </div>

        <div class="grid grid-cols-7 gap-1.5 flex-1">
          ${daysHtml}
        </div>
      </div>
    `;
  }

  attachEvents() {
    const prev = this.container.querySelector('.cal-prev-btn');
    const next = this.container.querySelector('.cal-next-btn');
    const today = this.container.querySelector('.cal-today-btn');

    if (prev) prev.onclick = () => this.prevMonth();
    if (next) next.onclick = () => this.nextMonth();
    if (today) today.onclick = () => this.today();

    const cells = this.container.querySelectorAll('.calendar-day-cell:not(.empty):not(.disabled)');
    cells.forEach(cell => {
      cell.onclick = () => {
        const dateStr = cell.getAttribute('data-date');
        this.selectedDateStr = dateStr;

        this.container.querySelectorAll('.calendar-day-cell.selected').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');

        if (this.onSelect) {
          this.onSelect(dateStr);
        }
      };
    });
  }
}

window.CalendarComponent = CalendarComponent;

