// Study Buddy - app.js (minimal, works offline using localStorage)

const $ = id => document.getElementById(id);

// DOM
const timeEl = $('time');
const startBtn = $('start');
const pauseBtn = $('pause');
const resetBtn = $('reset');
const modeEl = $('mode');
const workInput = $('workMinutes');
const shortInput = $('shortMinutes');
const longInput = $('longMinutes');
const taskForm = $('taskForm');
const taskInput = $('taskInput');
const taskList = $('taskList');
const sessionsEl = $('sessions');
const minutesEl = $('minutes');
const resetStatsBtn = $('resetStats');

// Storage keys
const TASKS_KEY = 'studyBuddy:tasks';
const STATS_PREFIX = 'studyBuddy:stats:'; // + YYYY-MM-DD
const CYCLE_KEY = 'studyBuddy:cycle'; // completed work sessions in the current long-break cycle

// Timer state
let timerInterval = null;
let remaining = 25 * 60;
let isRunning = false;
let mode = 'work'; // 'work' | 'short' | 'long'
let sessionMinutes = 25; // minutes credited when a work session ends, captured at start
let storedCycle=0;
try { storedCycle=Number(localStorage.getItem(CYCLE_KEY)); } catch(e) { /* storage can be denied for local files or private sessions */ }
let completedWorkSessions=Number.isSafeInteger(storedCycle)&&storedCycle>=0 ? storedCycle%4 : 0;

// Utilities
function pad(n){return n.toString().padStart(2,'0')}
function formatTime(sec){return `${pad(Math.floor(sec/60))}:${pad(sec%60)}`}
function todayKey(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}

// Tasks
function loadTasks(){
 try {
  const tasks=JSON.parse(localStorage.getItem(TASKS_KEY)||'[]');
  return Array.isArray(tasks) ? tasks.filter(t=>t && typeof t.text==='string').map(t=>({text:t.text,done:t.done===true})) : [];
 } catch(e){return []}
}
function saveTasks(tasks){
 try {localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));return true;}
 catch(e){alert('Impossibile salvare i task nel browser. I dati non sono stati modificati.');return false;}
}
function renderTasks(){const tasks=loadTasks();taskList.innerHTML='';tasks.forEach((t,idx)=>{const li=document.createElement('li');li.className=t.done? 'task-done':'';li.innerHTML=`<input type=checkbox ${t.done? 'checked':''} data-idx='${idx}' aria-labelledby='task-title-${idx}'> <span class='title' id='task-title-${idx}'></span> <button data-del='${idx}'>Elimina</button>`;li.querySelector('.title').textContent=t.text;taskList.appendChild(li)})}

taskForm.addEventListener('submit',e=>{e.preventDefault();const val=taskInput.value.trim();if(!val) return;const tasks=loadTasks();tasks.push({text:val,done:false});if(!saveTasks(tasks))return;taskInput.value='';renderTasks();})

taskList.addEventListener('click',e=>{const idx=e.target.dataset.idx;const del=e.target.dataset.del;const tasks=loadTasks();if(typeof idx!=='undefined'){if(!/^\d+$/.test(idx)||!tasks[Number(idx)])return;tasks[idx].done=!tasks[idx].done;if(!saveTasks(tasks))return;renderTasks();}else if(typeof del!=='undefined'){if(!/^\d+$/.test(del)||!tasks[Number(del)])return;tasks.splice(Number(del),1);if(!saveTasks(tasks))return;renderTasks();}})

// Stats
function loadStats(){try{const s=JSON.parse(localStorage.getItem(STATS_PREFIX+todayKey())||'{}')||{};const clean=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;return {sessions:clean(s.sessions),minutes:clean(s.minutes)}}catch(e){return {sessions:0,minutes:0}}} 
function saveStats(s){
 try {localStorage.setItem(STATS_PREFIX+todayKey(),JSON.stringify(s));return true;}
 catch(e){alert('Impossibile salvare le statistiche di oggi nel browser.');return false;}
}
function renderStats(){const s=loadStats();sessionsEl.textContent=s.sessions;minutesEl.textContent=s.minutes}

resetStatsBtn.addEventListener('click',()=>{if(confirm('Resettare le statistiche di oggi?')){saveStats({sessions:0,minutes:0});renderStats()}})

// Timer core
function setMode(m){mode=m;modeEl.textContent = m==='work'? 'Work' : (m==='short'?'Short Break':'Long Break');const raw=(m==='work'? workInput.value : (m==='short'? shortInput.value : longInput.value));let minutes=parseInt(raw,10);if(!Number.isFinite(minutes)) minutes=(m==='work'? 25 : (m==='short'? 5 : 15));minutes=Math.min(m==='work'?180:(m==='short'?60:120),Math.max(1,minutes));remaining=minutes*60;sessionMinutes=minutes;updateTime();}

function updateTime(){timeEl.textContent = formatTime(remaining);document.title = isRunning ? formatTime(remaining)+' · Study Buddy' : 'Study Buddy'}

function tick(){if(!isRunning)return;const left=Math.ceil((endAt-performance.now())/1000);if(left<=0){remaining=0;updateTime();onSessionEnd();return}if(left!==remaining){remaining=left;updateTime()}}

function onSessionEnd(){
 if(!isRunning)return; // a stale completion callback must not credit another session
 pauseTimer(); // clear the old interval before notifications can block or throw
 // vibrate or alert
 try {if(typeof navigator.vibrate==='function') navigator.vibrate(400); else alert('Sessione terminata!');} catch(e) { /* notifications must not prevent accounting or the next mode */ }
 if(mode==='work'){// increment stats
   const s=loadStats(); const added = sessionMinutes; s.sessions = (s.sessions||0) + 1; s.minutes = (s.minutes||0) + added; saveStats(s); renderStats(); completedWorkSessions=(completedWorkSessions+1)%4; try {localStorage.setItem(CYCLE_KEY,String(completedWorkSessions));} catch(e) { /* current page still keeps the cycle */ }
 }
 // auto switch mode
 if(mode==='work'){ if(completedWorkSessions % 4 === 0) setMode('long'); else setMode('short'); }
 else setMode('work');
 // auto start next session? keep stopped to let user choose
 pauseTimer();}

let endAt = 0;
function startTimer(){if(isRunning) return;isRunning=true;startBtn.disabled=true;pauseBtn.disabled=false;endAt=performance.now()+remaining*1000;updateTime();timerInterval=setInterval(tick,250)}
function pauseTimer(){if(!isRunning) return;remaining=Math.max(0,Math.ceil((endAt-performance.now())/1000));isRunning=false;startBtn.disabled=false;pauseBtn.disabled=true;clearInterval(timerInterval);timerInterval=null;updateTime()}
function resetTimer(){pauseTimer();setMode('work')}

startBtn.addEventListener('click',startTimer);pauseBtn.addEventListener('click',pauseTimer);resetBtn.addEventListener('click',()=>{if(confirm('Reimpostare il timer?')) resetTimer();});
// Keyboard: Space starts/pauses, R resets (ignored while typing in an input)
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.altKey||e.metaKey||(e.target&&e.target.isContentEditable))return;if(e.target&&/^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();if(isRunning)pauseTimer();else startTimer();}else if(e.key==='r'||e.key==='R'){if(confirm('Reimpostare il timer?')) resetTimer();}});

// Settings persist
[workInput,shortInput,longInput].forEach(inp=>{inp.addEventListener('change',()=>{
 pauseTimer();setMode(mode);
 try {localStorage.setItem('studyBuddy:settings',JSON.stringify({work:workInput.value,short:shortInput.value,long:longInput.value}));}
 catch(e){alert('Impossibile salvare le impostazioni. Restano valide solo per questa pagina.');}
})})

function loadSettings(){let s=null;try{s=JSON.parse(localStorage.getItem('studyBuddy:settings')||'null')}catch(e){s=null}if(s&&typeof s==='object'&&!Array.isArray(s)){for(const [key,input,max] of [['work',workInput,180],['short',shortInput,60],['long',longInput,120]]){const n=Number(s[key]);if(Number.isInteger(n)&&n>=1&&n<=max)input.value=String(n)}}}

// Refresh daily totals after an overnight tab resumes, without disturbing its timer.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderStats();});

// Init
function init(){loadSettings();renderTasks();renderStats();setMode('work');updateTime();}
init();

// Optional: reset data helper (for debugging)
window._studyBuddyResetAll = function(){if(confirm('Cancellare tutti i dati locali dello Study Buddy?')){pauseTimer();localStorage.removeItem(TASKS_KEY);localStorage.removeItem('studyBuddy:settings');workInput.value='25';shortInput.value='5';longInput.value='15';localStorage.removeItem(CYCLE_KEY);completedWorkSessions=0;localStorage.removeItem(STATS_PREFIX+todayKey());renderTasks();renderStats();setMode('work');updateTime();}}
