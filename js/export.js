/**
 * Calendar Export Utilities (Google Calendar, Apple Calendar .ics, Notion)
 * Fully compatible with GitHub Pages (Static Mode) & Backend Server
 */

const CalendarExport = {
  escapeIcsText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  },

  formatDatesForGoogle(dateStr, timeStr, endTimeStr) {
    const cleanDate = (dateStr || '').replace(/-/g, '');
    const cleanStartTime = (timeStr || '18:00').replace(':', '') + '00';
    
    let cleanEndTime;
    if (endTimeStr) {
      cleanEndTime = endTimeStr.replace(':', '') + '00';
    } else {
      const [hours, minutes] = (timeStr || '18:00').split(':').map(Number);
      const totalMinutes = (hours || 18) * 60 + (minutes || 0) + 90;
      const endH = String(Math.floor((totalMinutes / 60) % 24)).padStart(2, '0');
      const endM = String(totalMinutes % 60).padStart(2, '0');
      cleanEndTime = `${endH}${endM}00`;
    }

    return `${cleanDate}T${cleanStartTime}/${cleanDate}T${cleanEndTime}`;
  },

  getLocation(meetup) {
    if (meetup.activity_type === 'cafe') {
      return `Кафе "${meetup.cafe_name || 'Кафе'}"`;
    } else if (meetup.activity_type === 'walk') {
      return meetup.activity_detail ? `Прогулянка (${meetup.activity_detail})` : 'Прогулянка на свіжому повітрі';
    } else {
      return meetup.activity_detail || 'Зустріч з друзями';
    }
  },

  getDescription(meetup) {
    const participantsList = (meetup.participants || [])
      .map(p => `• ${p.avatar || '👤'} ${p.name}${p.drink_choice ? ` (обрав: ${CalendarExport.getDrinkLabel(p.drink_choice)})` : ''}`)
      .join('\n');

    let notesText = '';
    if (meetup.notes && meetup.notes.length > 0) {
      notesText = '\n\nПримітки:\n' + meetup.notes.map(n => `${n.author_avatar || '💬'} ${n.author_name}: "${n.content}"`).join('\n');
    }

    return `Зустріч з друзями: ${meetup.title}\n\nУчасники:\n${participantsList}${notesText}\n\nСтворено у "Зустрічі з друзями"`;
  },

  getDrinkLabel(choice) {
    if (choice === 'coffee') return 'Кава ☕';
    if (choice === 'tea') return 'Чай 🍵';
    if (choice === 'other') return 'Щось інше 🥤';
    return choice || 'Напій';
  },

  // 1. Google Calendar Export
  addToGoogleCalendar(meetup) {
    const title = encodeURIComponent(meetup.title || 'Зустріч з друзями');
    const dates = CalendarExport.formatDatesForGoogle(meetup.date, meetup.time, meetup.end_time);
    const location = encodeURIComponent(CalendarExport.getLocation(meetup));
    const details = encodeURIComponent(CalendarExport.getDescription(meetup));

    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(googleUrl, '_blank', 'noopener,noreferrer');
  },

  // 2. Apple Calendar (.ics) Client-Side Generator (Works 100% offline & on GitHub Pages)
  downloadIcs(meetup) {
    const dateStr = (meetup.date || '').replace(/-/g, '');
    const timeStr = (meetup.time || '18:00').replace(':', '') + '00';
    const startDt = `${dateStr}T${timeStr}`;

    let endDateStr = dateStr;
    let endH, endM;
    if (meetup.end_time) {
      [endH, endM] = meetup.end_time.split(':');
    } else {
      const [hours, minutes] = (meetup.time || '18:00').split(':').map(Number);
      const totalMinutes = (hours || 18) * 60 + (minutes || 0) + 90;
      endH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
      endM = String(totalMinutes % 60).padStart(2, '0');
      if (totalMinutes >= 24 * 60) {
        const nextDay = new Date(`${meetup.date}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        endDateStr = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`;
      }
    }
    const endDt = `${endDateStr}T${endH}${endM.replace(':', '')}00`;

    const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const title = meetup.title || 'Зустріч з друзями';
    const location = CalendarExport.getLocation(meetup);
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FriendsMeetup//UA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${meetup.id || Date.now()}@friendsmeetup.app`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${startDt}`,
      `DTEND:${endDt}`,
      `SUMMARY:${CalendarExport.escapeIcsText(title)}`,
      `LOCATION:${CalendarExport.escapeIcsText(location)}`,
      `DESCRIPTION:${CalendarExport.escapeIcsText(CalendarExport.getDescription(meetup))}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `meetup-${title.replace(/[\s/\\?%*:|"<>]/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // 3. Notion Integration & Clipboard Card
  openNotionCalendar(meetup) {
    window.open('https://calendar.notion.so', '_blank', 'noopener,noreferrer');
  },

  copyNotionCard(meetup) {
    const loc = CalendarExport.getLocation(meetup);
    const dateFormatted = new Date(meetup.date + 'T' + (meetup.time || '18:00')).toLocaleString('uk-UA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const participantsList = (meetup.participants || [])
      .map(p => `  - ${p.avatar || '👤'} **${p.name}** [${p.drink_choice ? CalendarExport.getDrinkLabel(p.drink_choice) : 'учасник'}]`)
      .join('\n');

    let notesText = '';
    if (meetup.notes && meetup.notes.length > 0) {
      notesText = '\n**Примітки:**\n' + meetup.notes.map(n => `> ${n.author_avatar || '💬'} **${n.author_name}**: ${n.content}`).join('\n');
    }

    const notionCard = `### 🤝 ${meetup.title}
- **Дата і час:** ${dateFormatted}
- **Локація:** ${loc}
- **Організатор:** ${meetup.creator_avatar || '😎'} ${meetup.creator_name}
- **Учасники (${(meetup.participants || []).length}):**
${participantsList}
${notesText}

---
*Створено у Friends Meetup*`;

    navigator.clipboard.writeText(notionCard).then(() => {
      Toast.show('Картку зустрічі для Notion скопійовано у буфер!', 'success');
    }).catch(() => {
      Toast.show('Не вдалося скопіювати автоматично', 'warning');
    });
  }
};

window.CalendarExport = CalendarExport;

