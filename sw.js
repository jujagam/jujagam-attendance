// 국자감 주자감 출석부 — Service Worker v2
// GitHub Pages 경로: /jujagam-attendance/
const CACHE_NAME = 'jujagam-att-v2';
const BASE_PATH = '/jujagam-attendance';
const ALARM_CHECK_INTERVAL = 60 * 1000;

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        BASE_PATH + '/',
        BASE_PATH + '/index.html',
        BASE_PATH + '/manifest.json',
        BASE_PATH + '/icon-192.svg'
      ]).catch(function() {});
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
  startAlarmLoop();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).catch(function() { return cached; });
    })
  );
});

self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '출석부 알림', {
      body: data.body || '',
      icon: BASE_PATH + '/icon-192.svg',
      badge: BASE_PATH + '/icon-192.svg',
      tag: data.tag || 'att-notif'
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow(BASE_PATH + '/');
    })
  );
});

self.addEventListener('periodicsync', function(e) {
  if (e.tag === 'att-alarm-check') e.waitUntil(checkAlarms());
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'ALARM_DATA') {
    alarmData    = e.data.alarms   || [];
    recordData   = e.data.records  || {};
    studentData  = e.data.students || [];
    settingsData = e.data.settings || {};
  }
  if (e.data && e.data.type === 'CHECK_NOW') checkAlarms();
});

var alarmData=[], recordData={}, studentData=[], settingsData={}, sentToday={};

function todayStr() {
  var d=new Date(), y=d.getFullYear(),
      m=String(d.getMonth()+1).padStart(2,'0'),
      dd=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+dd;
}

function checkAlarms() {
  var now=new Date(),
      hhmm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
      today=todayStr();
  alarmData.forEach(function(alarm) {
    if (!alarm.enabled || alarm.time!==hhmm) return;
    var key=alarm.id+'_'+today;
    if (sentToday[key]) return;
    sentToday[key]=true;
    sendSummaryNotif(alarm.grade, today);
  });
}

function sendSummaryNotif(grade, today) {
  var todayRec=recordData[today]||{};
  var gs=studentData.filter(function(s){ return grade==='전체'||s.grade===grade; });
  if (gs.length===0) return;
  var c={'출석':0,'결석':0,'지각':0,'조퇴':0,'온라인':0,'미입력':0}, abNames=[];
  gs.forEach(function(s) {
    var rec=todayRec[s.id];
    if (rec&&rec.status) { if(c[rec.status]!==undefined) c[rec.status]++; if(rec.status==='결석') abNames.push(s.name); }
    else c['미입력']++;
  });
  var gs2=grade==='전체'?'전체':grade.replace('중등 ','중').replace('고등 ','고').replace('학년','');
  var lines=[];
  if(c['출석']>0)   lines.push('출석 '+c['출석']+'명');
  if(c['결석']>0)   lines.push('결석 '+c['결석']+'명'+(abNames.length?': '+abNames.join(', '):''));
  if(c['지각']>0)   lines.push('지각 '+c['지각']+'명');
  if(c['조퇴']>0)   lines.push('조퇴 '+c['조퇴']+'명');
  if(c['온라인']>0) lines.push('온라인 '+c['온라인']+'명');
  if(c['미입력']>0) lines.push('미입력 '+c['미입력']+'명');
  return self.registration.showNotification(
    (settingsData.acaName||'출석부')+' — '+gs2+' 출결 현황',
    { body:lines.join(' | ')||'출결 기록 없음', icon:BASE_PATH+'/icon-192.svg', badge:BASE_PATH+'/icon-192.svg', tag:'summary-'+grade, requireInteraction:true }
  );
}

var _loopTimer=null;
function startAlarmLoop() {
  if (_loopTimer) clearInterval(_loopTimer);
  _loopTimer=setInterval(checkAlarms, ALARM_CHECK_INTERVAL);
}
