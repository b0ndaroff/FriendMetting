/**
 * Web Push Notifications & Timers Manager
 */

class NotificationManager {
  constructor() {
    this.storageKey = 'meetup_push_settings';
    this.notifiedKey = 'meetup_notified_events';
    this.settings = this.loadSettings();
    this.notifiedMap = this.loadNotifiedMap();
    this.initInterval();
  }

  loadSettings() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      enabled: false,
      remind15Min: true,
      remind1Hour: true,
      remind1Day: false,
      sound: true
    };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
  }

  loadNotifiedMap() {
    const saved = localStorage.getItem(this.notifiedKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {};
  }

  saveNotifiedMap() {
    localStorage.setItem(this.notifiedKey, JSON.stringify(this.notifiedMap));
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      Toast.show('Ваш браузер не підтримує Web Notifications', 'warning');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.saveSettings({ enabled: true });
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.saveSettings({ enabled: true });
        Toast.show('Пуш-сповіщення успішно дозволено!', 'success');
        return true;
      }
    }

    Toast.show('Дозвіл на сповіщення не надано у налаштуваннях браузера', 'warning');
    return false;
  }

  sendPush(title, body, tag = 'meetup-alert') {
    if (this.settings.sound && window.SoundEffects) {
      window.SoundEffects.playNotification();
    }

    if ('Notification' in window && Notification.permission === 'granted' && this.settings.enabled) {
      try {
        const notif = new Notification(title, {
          body: body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png',
          tag: tag,
          renotify: true
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (err) {
        console.warn('Native push error, showing in-app toast', err);
      }
    }

    // Always show fallback in-app toast
    Toast.show(`🔔 ${title}: ${body}`, 'info', 5000);
  }

  sendTestNotification() {
    this.sendPush(
      '🎉 Тестове нагадування!',
      'Пуш-сповіщення працюють ідеально! Ви не пропустите зустріч з друзями.',
      'test-alert'
    );
  }

  initInterval() {
    // Check every 30 seconds
    setInterval(() => this.checkUpcomingMeetups(), 30000);
  }

  checkUpcomingMeetups() {
    if (!this.settings.enabled) return;
    const meetups = window.appState ? window.appState.meetups : [];
    if (!meetups || meetups.length === 0) return;

    const now = new Date().getTime();

    meetups.forEach(m => {
      // Meetup target timestamp
      const targetTime = new Date(`${m.date}T${m.time || '18:00'}:00`).getTime();
      const diffMinutes = Math.round((targetTime - now) / (1000 * 60));

      if (diffMinutes <= 0) return; // in the past

      // 15 min reminder (trigger between 13 and 16 min)
      if (this.settings.remind15Min && diffMinutes <= 16 && diffMinutes >= 13) {
        const key = `${m.id}_15m`;
        if (!this.notifiedMap[key]) {
          this.notifiedMap[key] = true;
          this.saveNotifiedMap();
          this.sendPush(
            `⏰ Зустріч за 15 хвилин!`,
            `"${m.title}" розпочнеться о ${m.time}. Локація: ${m.cafe_name || m.activity_type}`,
            key
          );
        }
      }

      // 1 hour reminder (between 55 and 65 min)
      if (this.settings.remind1Hour && diffMinutes <= 65 && diffMinutes >= 55) {
        const key = `${m.id}_1h`;
        if (!this.notifiedMap[key]) {
          this.notifiedMap[key] = true;
          this.saveNotifiedMap();
          this.sendPush(
            `⏳ Зустріч через 1 годину`,
            `Не забудьте про "${m.title}" о ${m.time}!`,
            key
          );
        }
      }

      // 1 day reminder (between 1410 and 1450 min)
      if (this.settings.remind1Day && diffMinutes <= 1450 && diffMinutes >= 1410) {
        const key = `${m.id}_1d`;
        if (!this.notifiedMap[key]) {
          this.notifiedMap[key] = true;
          this.saveNotifiedMap();
          this.sendPush(
            `📅 Зустріч завтра`,
            `Завтра о ${m.time} зустріч "${m.title}".`,
            key
          );
        }
      }
    });
  }
}

window.NotificationManager = new NotificationManager();

