/***********************
 *  代碼分庫 + 狀態
 ************************/
let currentKey = null;          // 當前題庫代碼
let fullQuestions = [];         // 完整題庫（已載入/篩選）
let filteredPool = [];          // 篩選後的母體（供抽題）
let questions = [];             // 本次實際練習的題目集合
let wrongQuestions = [];        // 錯題本

let index = 0;
let score = 0;

// 模考/計時
let examMode = false;           // 是否為模考模式
let examTimer = null;
let leftSec = 0;

// 統計：以題目ID為key的次數
// 以「題幹+選項」計算hash作為穩定ID
let attempts = {};              // 作答次數
let corrects = {};              // 答對次數
let wrongCounts = {};           // 錯誤次數（做錯題加權用）

/* === LocalStorage key helpers === */
const bankKeyStore = 'quiz_bank_key';
const qKey = () => `myQuestions_${currentKey}`;
const wKey = () => `wrongList_${currentKey}`;
const aKey = () => `attempts_${currentKey}`;
const cKey = () => `corrects_${currentKey}`;
const wcKey= () => `wrongCounts_${currentKey}`;

/* === 啟動：若有記憶代碼 → 直接進入 === */
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem(bankKeyStore);
  if (savedKey) {
    currentKey = savedKey;
    initByKey();
  } else {
    showOnly('login');
  }

  // 匯入（setup）file inputs
  hookImporters('importFileMerge', true);
  hookImporters('importFileReplace', false);
  // 匯入（quiz）file inputs
  hookImporters('importFileMerge2', true);
  hookImporters('importFileReplace2', false);
});

/* === 代碼登入 / 切換 === */
function setBankKey() {
  const input = document.getElementById('bankKey');
  const v = (input.value || '').trim();
  if (!v) { alert('請先輸入題庫代碼'); return; }
  currentKey = v;
  localStorage.setItem(bankKeyStore, currentKey);
  initByKey();
}
function switchBank() {
  currentKey = null;
  localStorage.removeItem(bankKeyStore);
  index = 0; score = 0;
  showOnly('login');
}

/* === 初始化此代碼資料 === */
function initByKey() {
  updateKeyChips();

  try { fullQuestions = JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch { fullQuestions = []; }
  try { wrongQuestions = JSON.parse(localStorage.getItem(wKey()) || '[]'); } catch { wrongQuestions = []; }
  try { attempts = JSON.parse(localStorage.getItem(aKey()) || '{}'); } catch { attempts = {}; }
  try { corrects = JSON.parse(localStorage.getItem(cKey()) || '{}'); } catch { corrects = {}; }
  try { wrongCounts = JSON.parse(localStorage.getItem(wcKey()) || '{}'); } catch { wrongCounts = {}; }

  // 建立標籤UI
  buildTagFilters();

  if (fullQuestions.length === 0) {
    showOnly('setup');
  } else {
    // 初始為未篩選（全部），並進入 quiz
    filteredPool = [...fullQuestions];
    startPractice();
  }
}

function updateKeyChips() {
  ['keyLabel_setup','keyLabel_quiz','keyLabel_wrong'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.textContent = currentKey || '-';
  });
}

function showOnly(which) {
  ['login','setup','quiz','wrongBox','dashboard'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'dashboard') {
      if (which === 'dashboard') { el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); }
      else { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); }
    } else {
      el.style.display = (id === which) ? 'block' : 'none';
    }
  });
  updateKeyChips();
}

/***********************
 *  匯入 / 匯出
 ************************/
function exportBlob(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 500);
}
function exportQuestions() {
  if (!currentKey) return alert('尚未登入代碼');
  exportBlob(`questions_${currentKey}.json`, fullQuestions);
}
function exportWrongs() {
  if (!currentKey) return alert('尚未登入代碼');
  exportBlob(`wrongs_${currentKey}.json`, wrongQuestions);
}
function hookImporters(inputId, merge) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('格式需為陣列');
      if (merge) {
        // 合併：以題幹+選項做簡易去重
        const existsSet = new Set(fullQuestions.map(q=>getQid(q)));
        const toAdd = parsed.filter(q=>!existsSet.has(getQid(q)));
        fullQuestions = [...fullQuestions, ...toAdd];
      } else {
        // 覆蓋
        if (!confirm('確定以匯入內容覆蓋本代碼題庫？此動作無法復原')) return;
        fullQuestions = parsed;
        wrongQuestions = [];
        attempts = {}; corrects = {}; wrongCounts = {};
        localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
        localStorage.setItem(aKey(), JSON.stringify(attempts));
        localStorage.setItem(cKey(), JSON.stringify(corrects));
        localStorage.setItem(wcKey(), JSON.stringify(wrongCounts));
      }
      localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
      filteredPool = [...fullQuestions];
      buildTagFilters();
      alert('匯入完成！');
      startPractice();
    } catch (err) {
      console.error(err);
      alert('匯入失敗：' + err.message);
    } finally {
      e.target.value = '';
    }
  };
}
function triggerImport(merge, inQuiz=false) {
  const id = inQuiz
    ? (merge ? 'importFileMerge2' : 'importFileReplace2')
    : (merge ? 'importFileMerge' : 'importFileReplace');
  document.getElementById(id).click();
}

/***********************
 *  題庫儲存（setup）
 ************************/
function saveQuestions() {
  if (!currentKey) { alert('請先輸入題庫代碼'); return; }
  try {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) return alert('請貼上題庫 JSON');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return alert('需為陣列且至少一題');

    // 簡單驗證
    for (let i=0;i<parsed.length;i++) {
      const t = parsed[i];
      if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
        alert(`第 ${i+1} 題格式不完整（需含 q / options[] / answer）`);
        return;
      }
      if (t.answer < 0 || t.answer >= t.options.length) {
        alert(`第 ${i+1} 題 answer 超出選項範圍`);
        return;
      }
    }

    fullQuestions = parsed;
    filteredPool = [...fullQuestions];
    wrongQuestions = [];
    attempts = {}; corrects = {}; wrongCounts = {};

    localStorage.setItem(qKey(), JSON.stringify(fullQuestions));
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
    localStorage.setItem(aKey(), JSON.stringify(attempts));
    localStorage.setItem(cKey(), JSON.stringify(corrects));
    localStorage.setItem(wcKey(), JSON.stringify(wrongCounts));

    buildTagFilters();

    alert('題庫已儲存！');
    startPractice();
  } catch (e) {
    console.error(e);
    alert('JSON 解析失敗，請檢查逗號、引號、方括號是否正確。');
  }
}

/***********************
 *  標籤 / 篩選
 ************************/
function getAllTags() {
  const set = new Set();
  for (const q of fullQuestions) {
    if (Array.isArray(q.tags) && q.tags.length) {
      q.tags.forEach(t => set.add(String(t)));
    } else {
      set.add('未分類');
    }
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
}
function buildTagFilters() {
  const tags = getAllTags();
  const box = document.getElementById('tagFilters');
  if (!box) return;
  box.innerHTML = '';
  tags.forEach(tag=>{
    const id = `tag-${hash(tag)}`;
    const label = document.createElement('label');
    label.className = 'tag';
    label.innerHTML = `<input type="checkbox" id="${id}" data-tag="${tag}"/> ${tag}`;
    box.appendChild(label);
  });
}
function getSelectedTags() {
  const inputs = document.querySelectorAll('#tagFilters input[type="checkbox"]');
  const selected = [];
  inputs.forEach(chk => { if (chk.checked) selected.push(chk.getAttribute('data-tag')); });
  return selected;
}
function selectAllTags() {
  document.querySelectorAll('#tagFilters input[type="checkbox"]').forEach(chk=>{ chk.checked = true; });
}
function clearAllTags() {
  document.querySelectorAll('#tagFilters input[type="checkbox"]').forEach(chk=>{ chk.checked = false; });
}
function applyFilters() {
  const chosen = getSelectedTags();
  if (chosen.length === 0) {
    filteredPool = [...fullQuestions];
  } else {
    filteredPool = fullQuestions.filter(q=>{
      const list = (Array.isArray(q.tags) && q.tags.length) ? q.tags.map(String) : ['未分類'];
      return list.some(t => chosen.includes(t));
    });
  }
  // 套用新母體 → 重新抽題
  applyQuestionCount(false);
  startPractice(); // 回到一般練習（非模考）
}

/***********************
 *  模式：一般練習 / 只做錯題 / 錯題強化
 ************************/
function startPractice() {
  examOff();
  questions = [...filteredPool];
  if (!questions.length) { alert('目前篩選結果為 0 題，請調整篩選。'); return; }
  shuffle(questions);
  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  loadQuestion();
}
function startWrongOnly() {
  examOff();
  if (!wrongQuestions.length) return alert('目前沒有錯題可以練習！');
  // 仍可套用篩選：以 wrong ∩ 篩選母體
  const poolSet = new Set(filteredPool.map(q=>getQid(q)));
  const picked = wrongQuestions.filter(q=>poolSet.has(getQid(q)));
  if (!picked.length) return alert('篩選條件下沒有錯題，請調整篩選或先做題。');
  questions = [...picked];
  shuffle(questions);
  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  loadQuestion();
}
function startWrongBoost() {
  examOff();
  if (!wrongQuestions.length) return alert('目前沒有錯題可強化！');
  const poolSet = new Set(filteredPool.map(q=>getQid(q)));
  const candidates = wrongQuestions.filter(q=>poolSet.has(getQid(q)));
  if (!candidates.length) return alert('篩選條件下沒有錯題，請調整篩選或先做題。');
  // 依 wrongCounts 加權抽樣，強化重複錯題
  const weighted = [];
  for (const q of candidates) {
    const id = getQid(q);
    const w = Math.max(1, (wrongCounts[id] || 1)); // 至少1
    for (let i=0;i<w;i++) weighted.push(q);
  }
  // 取 questionCount 指定數量
  const n = getDesiredCount(weighted.length);
  questions = sampleWithoutReplacement(weighted, n);
  index = 0; score = 0;
  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  loadQuestion();
}

/***********************
 *  題數控制
 ************************/
function getDesiredCount(maxLen) {
  const sel = document.getElementById('questionCount');
  const v = sel ? sel.value : 'all';
  return (v==='all') ? maxLen : Math.min(parseInt(v,10), maxLen);
}
function applyQuestionCount(fromUser = false) {
  const n = getDesiredCount(filteredPool.length);
  // 先用 filteredPool 當母體，抽 n 題給 questions
  const tmp = [...filteredPool];
  shuffle(tmp);
  questions = tmp.slice(0, n);
  if (fromUser) {
    index = 0; score = 0; examOff();
    document.getElementById('score').textContent = score;
    document.getElementById('total').textContent = questions.length;
    loadQuestion();
  } else {
    document.getElementById('total').textContent = questions.length;
  }
}

/***********************
 *  模考模式（整卷倒數、交卷成績單）
 ************************/
function startExamMode() {
  if (!questions.length) { alert('題庫為空，請先準備題目。'); return; }
  examOff(); // 保險清空
  const sec = parseInt(document.getElementById('examSeconds').value || '1800', 10);
  if (isNaN(sec) || sec < 60) return alert('請輸入 ≥ 60 秒');
  examMode = true;
  leftSec = sec;
  // 模考：不即時顯示詳解（feedback 清空），僅記錄作答
  renderTimer(leftSec);
  if (examTimer) clearInterval(examTimer);
  examTimer = setInterval(()=>{
    leftSec--;
    renderTimer(leftSec);
    if (leftSec <= 0) submitExam(false);
  }, 1000);
  // 重新開始
  shuffle(questions);
  index = 0; score = 0;
  document.getElementById('score').textContent = score;
  document.getElementById('total').textContent = questions.length;
  loadQuestion();
}
function renderTimer(sec) {
  const m = Math.floor(sec/60), s = sec%60;
  document.getElementById('timer').textContent = `${m}:${String(s).padStart(2,'0')}`;
}
function examOff() {
  examMode = false;
  if (examTimer) clearInterval(examTimer);
  examTimer = null;
  document.getElementById('timer').textContent = '未開始';
}
function submitExam(manual) {
  if (!examMode && !manual) return; // 自動交卷需在模考中
  if (manual && !examMode) { alert('目前不在模考模式'); return; }
  // 交卷：直接結算 score（在 exam 下我們已逐題累積）
  if (examTimer) clearInterval(examTimer);
  examTimer = null;
  const total = questions.length;
  alert(`⏱ 交卷完成！得分：${score}/${total}`);
  // 結束模考 → 回到一般模式，保留當前題目池便於繼續練習
  examOff();
}

/***********************
 *  出題 / 作答
 ************************/
function loadQuestion() {
  if (!questions.length) {
    alert('目前題目集合為 0 題，請調整篩選或匯入題庫。');
    showOnly('setup');
    return;
  }
  const q = questions[index];

  // 進度
  const pct = (index / questions.length) * 100;
  document.getElementById('progress').style.width = `${pct}%`;

  // 題目
  document.getElementById('current').textContent = (index + 1);
  document.getElementById('question').textContent = q.q;

  // 選項（模考與練習相同介面，但顯示/紀錄不同）
  const box = document.getElementById('options');
  box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => selectAnswer(i);
    box.appendChild(btn);
  });

  // 練習模式才顯示 feedback
  const fb = document.getElementById('feedback');
  fb.textContent = '';
  fb.className = '';
}
function selectAnswer(choice) {
  const q = questions[index];
  const fb = document.getElementById('feedback');
  const id = getQid(q);

  // 統計：次數 +1
  attempts[id] = (attempts[id] || 0) + 1;

  if (examMode) {
    // 模考：不立刻顯示正誤，只在最後交卷顯示總分
    if (choice === q.answer) {
      score++;
      corrects[id] = (corrects[id] || 0) + 1;
    } else {
      wrongCounts[id] = (wrongCounts[id] || 0) + 1;
      // 錯題本加入
      pushWrong(q);
    }
    // 鎖定當題
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    // 直接到下一題
    setTimeout(nextQuestion, 100);
  } else {
    // 練習：立即給回饋
    if (choice === q.answer) {
      fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'correct';
      score++;
      corrects[id] = (corrects[id] || 0) + 1;
    } else {
      fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
      fb.className = 'incorrect';
      wrongCounts[id] = (wrongCounts[id] || 0) + 1;
      pushWrong(q);
    }
    document.getElementById('score').textContent = score;
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
  }

  // 落地：統計存檔
  localStorage.setItem(aKey(), JSON.stringify(attempts));
  localStorage.setItem(cKey(), JSON.stringify(corrects));
  localStorage.setItem(wcKey(), JSON.stringify(wrongCounts));
}
function nextQuestion() {
  index++;
  if (index >= questions.length) {
    // 滿格
    document.getElementById('progress').style.width = '100%';
    setTimeout(() => {
      if (!examMode) {
        alert(`練習結束！得分：${score}/${questions.length}`);
      } else {
        // 模考：保持沉默，等待交卷鈕或自動時間到
      }
      // 重新洗牌繼續
      shuffle(questions);
      index = 0;
      // 練習模式才歸零分數；模考由 startExamMode 重置
      if (!examMode) {
        score = 0;
        document.getElementById('score').textContent = score;
      }
      loadQuestion();
    }, 80);
    return;
  }
  loadQuestion();
}

/***********************
 *  錯題本
 ************************/
function pushWrong(q) {
  // 以 QID 去重
  const id = getQid(q);
  const set = new Set(wrongQuestions.map(x=>getQid(x)));
  if (!set.has(id)) {
    wrongQuestions.push(q);
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
  }
}
function showWrong() {
  showOnly('wrongBox');
  const list = document.getElementById('wrongList');
  list.innerHTML = '';
  if (!wrongQuestions.length) {
    const li = document.createElement('li');
    li.textContent = '目前沒有錯題，太棒了！🎉';
    list.appendChild(li);
    return;
  }
  wrongQuestions.forEach((w, i) => {
    const li = document.createElement('li');
    li.innerHTML = `【${i+1}】${w.q}<br>正解：${w.options[w.answer]}<br>詳解：${w.explain || '無'}`;
    list.appendChild(li);
  });
}
function backToQuiz() { showOnly('quiz'); }

/***********************
 *  儀表板（成績統計）
 ************************/
function openDashboard() {
  // 整體正確率
  const totalAttempts = Object.values(attempts).reduce((a,b)=>a+b,0);
  const totalCorrects = Object.values(corrects).reduce((a,b)=>a+b,0);
  const acc = totalAttempts ? (100 * totalCorrects / totalAttempts) : 0;

  const summary = document.getElementById('dashSummary');
  summary.innerHTML = '';
  summary.appendChild(cardStat('總作答次數', totalAttempts));
  summary.appendChild(cardStat('總答對次數', totalCorrects));
  summary.appendChild(cardBar('整體正確率', acc));

  // 各標籤正確率（依 fullQuestions 建立QID→tag）
  const tagMap = {}; // tag -> {attempts, corrects}
  for (const q of fullQuestions) {
    const tags = (Array.isArray(q.tags) && q.tags.length) ? q.tags : ['未分類'];
    const id = getQid(q);
    tags.forEach(t=>{
      if (!tagMap[t]) tagMap[t] = {a:0, c:0};
      tagMap[t].a += (attempts[id] || 0);
      tagMap[t].c += (corrects[id] || 0);
    });
  }
  const byTag = document.getElementById('dashByTag');
  byTag.innerHTML = '';
  Object.keys(tagMap).sort((a,b)=>a.localeCompare(b,'zh-Hant')).forEach(tag=>{
    const a = tagMap[tag].a, c = tagMap[tag].c;
    const p = a ? (100*c/a) : 0;
    byTag.appendChild(cardBar(`${tag} 正確率`, p));
  });

  showOnly('dashboard');
}
function closeDashboard() { showOnly('quiz'); }

function cardStat(title, value) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">${title}</div><div style="font-size:22px;font-weight:800">${value}</div>`;
  return div;
}
function cardBar(title, percent) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">${title}：${percent.toFixed(1)}%</div>
    <div class="bar"><div style="width:${Math.min(100,Math.max(0,percent))}%"></div></div>`;
  return div;
}

/***********************
 *  重置（僅清除此代碼的資料）
 ************************/
function resetAll() {
  if (!currentKey) return;
  if (!confirm(`確定清除「${currentKey}」代碼下的所有資料（題庫 + 錯題本 + 統計）？`)) return;
  localStorage.removeItem(qKey());
  localStorage.removeItem(wKey());
  localStorage.removeItem(aKey());
  localStorage.removeItem(cKey());
  localStorage.removeItem(wcKey());
  fullQuestions = []; filteredPool = []; questions = []; wrongQuestions = [];
  attempts = {}; corrects = {}; wrongCounts = {};
  index = 0; score = 0;
  alert('已清除。請貼上新的題庫 JSON。');
  showOnly('setup');
}

/***********************
 *  小工具
 ************************/
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function sampleWithoutReplacement(pool, n) {
  // 從 pool（可含重複q物件）中等機率抽 n 題，避免重複題
  const set = new Set();
  const out = [];
  let safety = 0;
  while (out.length < n && safety < pool.length * 5) {
    safety++;
    const q = pool[Math.floor(Math.random()*pool.length)];
    const id = getQid(q);
    if (!set.has(id)) { set.add(id); out.push(q); }
  }
  return out;
}
function hash(str) {
  // 簡易 hash（非安全），足夠用於ID顯示
  let h = 0;
  for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
function getQid(q) {
  // 用「題幹 + 選項串」作為穩定ID
  const sig = q.q + '||' + (q.options || []).join('|');
  return hash(sig);
}
