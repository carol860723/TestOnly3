/***********************
 *  題庫（依代碼分離）
 ************************/
let currentKey = null;                      // 當前題庫代碼（由登入頁輸入）
let questions = [];                         // 本次練習實際用的題目（可能被抽題）
let fullQuestions = [];                     // 此代碼下的完整題庫（未抽題）
let wrongQuestions = [];                    // 此代碼下的錯題本

let index = 0;
let score = 0;

/* === 工具：取得不同代碼對應的 LocalStorage key === */
const qKey = () => `myQuestions_${currentKey}`;
const wKey = () => `wrongList_${currentKey}`;
const bankKeyStore = 'quiz_bank_key';

/* === 啟動：還原代碼，決定顯示哪個畫面 === */
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem(bankKeyStore);
  if (savedKey) {
    currentKey = savedKey;
    initByKey();
  } else {
    showOnly('login');
  }
});

/* === 代碼登入 === */
function setBankKey() {
  const input = document.getElementById('bankKey');
  const v = (input.value || '').trim();
  if (!v) {
    alert('請先輸入題庫代碼');
    return;
  }
  currentKey = v;
  localStorage.setItem(bankKeyStore, currentKey);
  initByKey();
}

/* === 切換代碼（不刪資料） === */
function switchBank() {
  // 回登入畫面，但保留現有資料
  currentKey = null;
  localStorage.removeItem(bankKeyStore);
  index = 0; score = 0;
  showOnly('login');
}

/* === 依當前代碼載入資料，決定進入 setup 或 quiz === */
function initByKey() {
  updateKeyChips();
  // 載入此代碼的完整題庫與錯題本
  try {
    fullQuestions = JSON.parse(localStorage.getItem(qKey()) || '[]');
  } catch { fullQuestions = []; }
  try {
    wrongQuestions = JSON.parse(localStorage.getItem(wKey()) || '[]');
  } catch { wrongQuestions = []; }

  if (fullQuestions.length === 0) {
    // 沒有題庫 → 請貼 JSON
    showOnly('setup');
  } else {
    // 有題庫 → 直接進測驗
    startQuiz();
  }
}

/* === 更新畫面上顯示的代碼 === */
function updateKeyChips() {
  ['keyLabel_setup', 'keyLabel_quiz', 'keyLabel_wrong'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentKey || '-';
  });
}

/* === 顯示單一區塊 === */
function showOnly(which) {
  const ids = ['login', 'setup', 'quiz', 'wrongBox'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === which) ? 'block' : 'none';
  });
  updateKeyChips();
}

/***********************
 *  題庫維護與開始測驗
 ************************/
function saveQuestions() {
  if (!currentKey) {
    alert('請先輸入題庫代碼');
    return;
  }
  try {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) {
      alert('請貼上題庫 JSON');
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      alert('題庫格式需為陣列，且至少 1 題');
      return;
    }
    // 基礎檢查
    for (let i = 0; i < parsed.length; i++) {
      const t = parsed[i];
      if (!t.q || !Array.isArray(t.options) || typeof t.answer !== 'number') {
        alert(`第 ${i + 1} 題格式不完整（需含 q / options[] / answer）`);
        return;
      }
      if (t.answer < 0 || t.answer >= t.options.length) {
        alert(`第 ${i + 1} 題的 answer 超出選項範圍`);
        return;
      }
    }
    // 寫入此代碼的題庫
    localStorage.setItem(qKey(), JSON.stringify(parsed));
    fullQuestions = [...parsed];
    // 清空此代碼的錯題本（避免舊規格殘留）
    wrongQuestions = [];
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
    alert('題庫已儲存！即將開始測驗。');
    startQuiz();
  } catch (e) {
    console.error(e);
    alert('JSON 解析失敗，請檢查逗號、引號、方括號是否正確。');
  }
}

function startQuiz() {
  if (!currentKey) { showOnly('login'); return; }

  showOnly('quiz');
  applyQuestionCount(false);     // 先依下拉選擇取得本次要練習的題目集合

  // 初始化分數/索引
  shuffle(questions);
  index = 0;
  score = 0;

  document.getElementById('total').textContent = questions.length;
  document.getElementById('score').textContent = score;
  loadQuestion();
}

/* === 依題數設定抽題；fromUser=true 表示使用者在下拉改動 → 需重置分數與索引 === */
function applyQuestionCount(fromUser = false) {
  const select = document.getElementById('questionCount');
  const v = select ? select.value : 'all';
  if (v === 'all') {
    questions = [...fullQuestions];
  } else {
    const n = parseInt(v, 10);
    const tmp = [...fullQuestions];
    shuffle(tmp);
    questions = tmp.slice(0, Math.min(n, tmp.length));
  }
  if (fromUser) {
    // 使用者切換題數 → 重新開始
    index = 0; score = 0;
    document.getElementById('score').textContent = score;
    document.getElementById('total').textContent = questions.length;
    loadQuestion();
  } else {
    document.getElementById('total').textContent = questions.length;
  }
}

/***********************
 *  出題與作答
 ************************/
function loadQuestion() {
  if (!questions.length) {
    alert('本代碼下目前沒有題目，請先到「題庫 JSON」貼題。');
    showOnly('setup');
    return;
  }
  const q = questions[index];

  // 進度
  const pct = (index / questions.length) * 100;
  document.getElementById('progress').style.width = `${pct}%`;

  // 題幹 / 選項
  document.getElementById('current').textContent = index + 1;
  document.getElementById('question').textContent = q.q;

  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn fade';
    btn.textContent = opt;
    btn.onclick = () => checkAnswer(i);
    optionsDiv.appendChild(btn);
  });

  const fb = document.getElementById('feedback');
  fb.textContent = '';
  fb.className = '';
}

function checkAnswer(choice) {
  const q = questions[index];
  const fb = document.getElementById('feedback');

  if (choice === q.answer) {
    fb.innerHTML = `✔ 正確<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'correct';
    score++;
    document.getElementById('score').textContent = score;
  } else {
    fb.innerHTML = `✘ 錯誤，正確答案：${q.options[q.answer]}<br><br>詳解：${q.explain || '無'}`;
    fb.className = 'incorrect';
    // 加入錯題本（此代碼下）
    wrongQuestions.push(q);
    localStorage.setItem(wKey(), JSON.stringify(wrongQuestions));
  }

  // 禁止重複作答
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

function nextQuestion() {
  index++;
  if (index >= questions.length) {
    // 滿格
    document.getElementById('progress').style.width = '100%';
    setTimeout(() => {
      alert(`測驗結束！得分：${score}/${questions.length}`);
      // 重抽續玩
      shuffle(questions);
      index = 0;
      score = 0;
      document.getElementById('score').textContent = score;
      loadQuestion();
    }, 80);
    return;
  }
  loadQuestion();
}

/***********************
 *  錯題本
 ************************/
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
    li.innerHTML = `【${i + 1}】${w.q}<br>
      正解：${w.options[w.answer]}<br>
      詳解：${w.explain || '無'}`;
    list.appendChild(li);
  });
}
function backToQuiz() { showOnly('quiz'); }

/***********************
 *  重置（僅清除此代碼的資料）
 ************************/
function resetAll() {
  if (!currentKey) return;
  if (confirm(`確定清除「${currentKey}」代碼下的所有資料（題庫 + 錯題本）？`)) {
    localStorage.removeItem(qKey());
    localStorage.removeItem(wKey());
    fullQuestions = [];
    wrongQuestions = [];
    questions = [];
    index = 0; score = 0;
    alert('已清除。請貼上新的題庫 JSON。');
    showOnly('setup');
  }
}

/***********************
 *  小工具
 ************************/
function shuffle(arr) {
  // Fisher–Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
