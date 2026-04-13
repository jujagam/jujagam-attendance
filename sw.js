// 국자감 주자감 출석부 — Service Worker v3
const BASE_PATH = '/jujagam-attendance';

// 설치 - 캐시 없이 단순하게
self.addEventListener('install', function(e) {
  console.log('[SW] 설치 완료');
  self.skipWaiting();
});

// 활성화
self.addEventListener('activate', function(e) {
  console.log('[SW] 활성화 완료');
  e.waitUntil(self.clients.claim());
});

// fetch - 네트워크 우선
self.addEventListener('fetch', function(e) {
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});

// 알림 클릭 → 앱 열기
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window'}).then(function(clients) {
      if(clients.length > 0) return clients[0].focus();
      return self.clients.openWindow(BASE_PATH + '/');
    })
  );
});

// 메시지 수신
self.addEventListener('message', function(e) {
  if(!e.data) return;
  if(e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if(e.data.type === 'ALARM_DATA'){
    alarmData    = e.data.alarms   || [];
    recordData   = e.data.records  || {};
    studentData  = e.data.students || [];
    settingsData = e.data.settings || {};
  }
  if(e.data.type === 'CHECK_NOW') checkAlarms();
});

// 알람 데이터
var alarmData=[], recordData={}, studentData=[], settingsData={}, sentToday={};

function todayStr(){
  var d=new Date();
  return d.getFullYear()+'-'+
    String(d.getMonth()+1).padStart(2,'0')+'-'+
    String(d.getDate()).padStart(2,'0');
}

function checkAlarms(){
  var now=new Date();
  var hhmm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  var today=todayStr();
  alarmData.forEach(function(alarm){
    if(!alarm.enabled||alarm.time!==hhmm) return;
    var key=alarm.id+'_'+today;
    if(sentToday[key]) return;
    sentToday[key]=true;
    sendSummaryNotif(alarm.grade, today);
  });
}

function sendSummaryNotif(grade, today){
  var todayRec=recordData[today]||{};
  var gs=studentData.filter(function(s){ return grade==='전체'||s.grade===grade; });
  if(gs.length===0) return;
  var c={'출석':0,'결석':0,'지각':0,'조퇴':0,'온라인':0,'미입력':0};
  var abNames=[];
  gs.forEach(function(s){
    var rec=todayRec[s.id];
    if(rec&&rec.status){
      if(c[rec.status]!==undefined) c[rec.status]++;
      if(rec.status==='결석') abNames.push(s.name);
    } else c['미입력']++;
  });
  var gs2=grade==='전체'?'전체':
    grade.replace('중등 ','중').replace('고등 ','고').replace('학년','');
  var lines=[];
  if(c['출석']>0)   lines.push('출석 '+c['출석']+'명');
  if(c['결석']>0)   lines.push('결석 '+c['결석']+'명'+(abNames.length?': '+abNames.join(', '):''));
  if(c['지각']>0)   lines.push('지각 '+c['지각']+'명');
  if(c['조퇴']>0)   lines.push('조퇴 '+c['조퇴']+'명');
  if(c['온라인']>0) lines.push('온라인 '+c['온라인']+'명');
  if(c['미입력']>0) lines.push('미입력 '+c['미입력']+'명');
  return self.registration.showNotification(
    (settingsData.acaName||'출석부')+' — '+gs2+' 출결 현황',
    {body:lines.join(' | ')||'출결 기록 없음',
     icon:BASE_PATH+'/icon-192.svg',
     tag:'summary-'+grade,
     requireInteraction:true}
  );
}

// 1분마다 알람 체크
setInterval(checkAlarms, 60*1000);
console.log('[SW] 시작됨');
