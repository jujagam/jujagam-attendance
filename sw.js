// 국자감 주자감 출석부 — Service Worker v1
const CACHE_NAME = 'jujagam-att-v1';
const ALARM_CHECK_INTERVAL = 60 * 1000; // 1분마다 알람 확인

// ── 설치 ──────────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        '/',
        '/index.html'
      ]).catch(function() {});
    })
  );
});

// ── 활성화 ────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
  // 주기적 알람 체크 시작
  startAlarmLoop();
});

// ── 네트워크 요청 캐시 ────────────────────────────────
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).catch(function() {
        return cached;
      });
    })
  );
});

// ── Push 알림 수신 ────────────────────────────────────
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '출석부 알림', {
      body: data.body || '',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: data.tag || 'att-notif',
      data: data
    })
  );
});

// ── 알림 클릭 → 앱 열기 ──────────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// ── 주기적 알람 체크 (Periodic Background Sync) ───────
self.addEventListener('periodicsync', function(e) {
  if (e.tag === 'att-alarm-check') {
    e.waitUntil(checkAlarms());
  }
});

// ── 메시지 수신 (앱 → 서비스워커) ────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'ALARM_DATA') {
    // 앱에서 알람 데이터를 보내면 저장
    alarmData = e.data.alarms || [];
    recordData = e.data.records || {};
    studentData = e.data.students || [];
    settingsData = e.data.settings || {};
  }
  if (e.data && e.data.type === 'CHECK_NOW') {
    checkAlarms();
  }
});

// ── 알람 데이터 (앱에서 전달받음) ────────────────────
var alarmData = [];
var recordData = {};
var studentData = [];
var settingsData = {};
var sentToday = {};  // {alarmId_date: true}

function todayStr() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function checkAlarms() {
  var now = new Date();
  var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  var today = todayStr();

  alarmData.forEach(function(alarm) {
    if (!alarm.enabled) return;
    if (alarm.time !== hhmm) return;
    var key = alarm.id + '_' + today;
    if (sentToday[key]) return;
    sentToday[key] = true;
    sendSummaryNotif(alarm.grade, today);
  });
}

function sendSummaryNotif(grade, today) {
  var todayRec = recordData[today] || {};
  var gs = studentData.filter(function(s) {
    return grade === '전체' || s.grade === grade;
  });
  if (gs.length === 0) return;

  var c = {'출석':0,'결석':0,'지각':0,'조퇴':0,'온라인':0,'미입력':0};
  var abNames = [];
  gs.forEach(function(s) {
    var rec = todayRec[s.id];
    if (rec && rec.status) {
      if (c[rec.status] !== undefined) c[rec.status]++;
      if (rec.status === '결석') abNames.push(s.name);
    } else {
      c['미입력']++;
    }
  });

  var gradeShort = grade === '전체' ? '전체' :
    grade.replace('중등 ', '중').replace('고등 ', '고').replace('학년', '');
  var lines = [];
  if (c['출석']   > 0) lines.push('출석 ' + c['출석'] + '명');
  if (c['결석']   > 0) lines.push('결석 ' + c['결석'] + '명' + (abNames.length ? ': ' + abNames.join(', ') : ''));
  if (c['지각']   > 0) lines.push('지각 ' + c['지각'] + '명');
  if (c['조퇴']   > 0) lines.push('조퇴 ' + c['조퇴'] + '명');
  if (c['온라인'] > 0) lines.push('온라인 ' + c['온라인'] + '명');
  if (c['미입력'] > 0) lines.push('미입력 ' + c['미입력'] + '명');

  var acaName = settingsData.acaName || '출석부';
  return self.registration.showNotification(
    acaName + ' — ' + gradeShort + ' 출결 현황',
    {
      body: lines.join(' | ') || '출결 기록 없음',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: 'summary-' + grade,
      requireInteraction: true
    }
  );
}

// ── 백그라운드 알람 루프 (Periodic Sync 미지원 시 fallback) ──
var _loopTimer = null;
function startAlarmLoop() {
  if (_loopTimer) clearInterval(_loopTimer);
  _loopTimer = setInterval(function() {
    checkAlarms();
  }, ALARM_CHECK_INTERVAL);
}
