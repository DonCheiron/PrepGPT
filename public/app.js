const categories = ['Behavioral', 'Technical', 'Situational', 'Motivational'];
const FOLLOW_UP_LIMIT = 4;
const USERS_KEY = 'prepgpt_users_v1';
const CURRENT_USER_KEY = 'prepgpt_current_user_v1';

const state = {
  questions: [],
  answers: [],
  currentIndex: 0,
  mediaRecorder: null,
  audioChunks: [],
  currentAudioBlob: null,
  resumeText: '',
  jobDescriptionText: '',
  recordingSeconds: 0,
  timerInterval: null,
  dynamicFollowUpsEnabled: true,
  generatedFollowUps: 0,
  lastAnalysis: null,
  currentUser: null,
  interviewLanguage: 'English'
};

const authScreen = document.getElementById('auth-screen');
const setupScreen = document.getElementById('setup-screen');
const instructionScreen = document.getElementById('instruction-screen');
const questionScreen = document.getElementById('question-screen');
const coachingScreen = document.getElementById('coaching-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultsScreen = document.getElementById('results-screen');

const showLoginBtn = document.getElementById('show-login-btn');
const showSignupBtn = document.getElementById('show-signup-btn');
const loginPanel = document.getElementById('login-panel');
const signupPanel = document.getElementById('signup-panel');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');

const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const signupName = document.getElementById('signup-name');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');

const userChip = document.getElementById('user-chip');
const logoutBtn = document.getElementById('logout-btn');

const profileName = document.getElementById('profile-name');
const profileHeadline = document.getElementById('profile-headline');
const profileRole = document.getElementById('profile-role');
const saveProfileBtn = document.getElementById('save-profile-btn');
const sessionHistory = document.getElementById('session-history');

const setupProfileName = document.getElementById('setup-profile-name');
const setupProfileHeadline = document.getElementById('setup-profile-headline');
const setupProfileRole = document.getElementById('setup-profile-role');
const setupSaveProfileBtn = document.getElementById('setup-save-profile-btn');
const setupSessionHistory = document.getElementById('setup-session-history');
const setupProgressHistory = document.getElementById('setup-progress-history');

const resumeTextarea = document.getElementById('resume');
const resumeFileInput = document.getElementById('resume-file');
const jdTextarea = document.getElementById('job-description');
const jdFileInput = document.getElementById('job-description-file');
const dynamicFollowUpsInput = document.getElementById('dynamic-followups');
const interviewLanguageInput = document.getElementById('interview-language');

const slidersContainer = document.getElementById('sliders');
const prepareBtn = document.getElementById('prepare-btn');
const startSimulationBtn = document.getElementById('start-simulation-btn');
const restartBtn = document.getElementById('restart-btn');
const exportReportBtn = document.getElementById('export-report-btn');

const questionTitle = document.getElementById('question-title');
const questionMeta = document.getElementById('question-meta');
const currentQuestion = document.getElementById('current-question');
const starHelper = document.getElementById('star-helper');

const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const retryBtn = document.getElementById('retry-btn');
const nextBtn = document.getElementById('next-btn');

const backToQuestionsBtn = document.getElementById('back-to-questions-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const coachingList = document.getElementById('coaching-list');

const recordDot = document.getElementById('record-dot');
const recordText = document.getElementById('record-text');
const recordTimer = document.getElementById('record-timer');

const audioPreview = document.getElementById('audio-preview');
const transcriptStatus = document.getElementById('transcript-status');
const answerTranscript = document.getElementById('answer-transcript');

const overallScore = document.getElementById('overall-score');
const overallFeedback = document.getElementById('overall-feedback');
const nextStepPlan = document.getElementById('next-step-plan');
const scoreRing = document.getElementById('score-ring');
const categoryBars = document.getElementById('category-bars');
const distribution = document.getElementById('distribution');
const detailedResults = document.getElementById('detailed-results');
const progressHistory = document.getElementById('progress-history');

function showScreen(screen) {
  [authScreen, setupScreen, instructionScreen, questionScreen, coachingScreen, loadingScreen, resultsScreen].forEach((section) => {
    section.classList.add('hidden');
  });
  screen.classList.remove('hidden');
}

function getUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function persistCurrentUser(email) {
  localStorage.setItem(CURRENT_USER_KEY, email);
}

function getCurrentUser() {
  const email = localStorage.getItem(CURRENT_USER_KEY);
  if (!email) return null;
  return getUsers().find((u) => u.email === email) || null;
}

function setCurrentUser(user) {
  state.currentUser = user;
  userChip.textContent = user ? `${user.name} (${user.email})` : '';
}

function updateCurrentUser(mutator) {
  if (!state.currentUser) return;
  const users = getUsers();
  const i = users.findIndex((u) => u.email === state.currentUser.email);
  if (i < 0) return;
  const updated = mutator({ ...users[i] });
  users[i] = updated;
  saveUsers(users);
  setCurrentUser(updated);
}

function showAuthPanel(mode) {
  const loginMode = mode === 'login';
  loginPanel.classList.toggle('hidden', !loginMode);
  signupPanel.classList.toggle('hidden', loginMode);
}

function bootstrapAuth() {
  const user = getCurrentUser();
  if (user) {
    setCurrentUser(user);
    hydrateProfileInputs();
    showScreen(setupScreen);
  } else {
    showScreen(authScreen);
    showAuthPanel('login');
  }
}

function handleSignup() {
  const name = signupName.value.trim();
  const email = signupEmail.value.trim().toLowerCase();
  const password = signupPassword.value;

  if (!name || !email || !password) {
    alert('Please fill all sign-up fields.');
    return;
  }

  const users = getUsers();
  if (users.some((u) => u.email === email)) {
    alert('Account already exists for this email. Please log in.');
    return;
  }

  const user = { name, email, password, headline: '', targetRole: '', sessions: [], createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  persistCurrentUser(email);
  setCurrentUser(user);
  hydrateProfileInputs();
  showScreen(setupScreen);
}

function handleLogin() {
  const email = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value;
  const user = getUsers().find((u) => u.email === email && u.password === password);

  if (!user) {
    alert('Invalid email or password.');
    return;
  }

  persistCurrentUser(email);
  setCurrentUser(user);
  hydrateProfileInputs();
  showScreen(setupScreen);
}

function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  setCurrentUser(null);
  showScreen(authScreen);
}

function hydrateProfileInputs() {
  if (!state.currentUser) return;
  const name = state.currentUser.name || '';
  const headline = state.currentUser.headline || '';
  const role = state.currentUser.targetRole || '';

  if (profileName) profileName.value = name;
  if (profileHeadline) profileHeadline.value = headline;
  if (profileRole) profileRole.value = role;

  if (setupProfileName) setupProfileName.value = name;
  if (setupProfileHeadline) setupProfileHeadline.value = headline;
  if (setupProfileRole) setupProfileRole.value = role;

  renderSessionHistory();
  renderProgressHistory();
  renderSetupHistory();
}

function saveProfile() {
  const nextName = (setupProfileName?.value || profileName?.value || '').trim();
  const nextHeadline = (setupProfileHeadline?.value || profileHeadline?.value || '').trim();
  const nextRole = (setupProfileRole?.value || profileRole?.value || '').trim();

  updateCurrentUser((user) => ({
    ...user,
    name: nextName || user.name,
    headline: nextHeadline,
    targetRole: nextRole
  }));
  hydrateProfileInputs();
  alert('Profile updated.');
}

function createSliders() {
  categories.forEach((category) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';
    wrapper.innerHTML = `
      <div class="slider-label"><span>${category}</span><strong id="${category}-value">2</strong></div>
      <input type="range" id="${category}" min="0" max="6" value="2" />`;
    slidersContainer.appendChild(wrapper);
    const slider = wrapper.querySelector('input');
    const valueEl = wrapper.querySelector('strong');
    slider.addEventListener('input', () => { valueEl.textContent = slider.value; });
  });
}

function collectCategoryCounts() {
  return categories.reduce((acc, category) => {
    acc[category] = Number(document.getElementById(category).value);
    return acc;
  }, {});
}

function toTimer(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function startTimerUI() {
  state.recordingSeconds = 0;
  recordDot.classList.remove('hidden');
  recordDot.classList.add('active');
  recordText.textContent = 'Recording in progress';
  recordTimer.textContent = '00:00';
  state.timerInterval = setInterval(() => {
    state.recordingSeconds += 1;
    recordTimer.textContent = toTimer(state.recordingSeconds);
  }, 1000);
}

function stopTimerUI() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
  recordDot.classList.remove('active');
  recordDot.classList.add('hidden');
  recordText.textContent = 'Not recording';
}

let pdfJsLibPromise = null;
async function getPdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs').then((module) => {
      const pdfjsLib = module.default || module;
      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';
      }
      return pdfjsLib;
    });
  }
  return pdfJsLibPromise;
}

async function extractPdfText(file) {
  const pdfjsLib = await getPdfJsLib();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const parts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const text = await page.getTextContent();
    parts.push(text.items.map((item) => item.str).join(' '));
  }
  return parts.join('\n').trim();
}

async function getInputText(textarea, fileInput, inputName) {
  const typedText = textarea.value.trim();
  const file = fileInput.files?.[0];
  if (typedText) return typedText;
  if (!file) return '';

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfText = await extractPdfText(file);
    if (!pdfText) throw new Error(`${inputName} PDF appears empty. Please paste text manually.`);
    return pdfText;
  }

  const isTextLike = file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name);
  if (!isTextLike) throw new Error(`${inputName} file must be .txt, .md, or .pdf.`);
  return (await file.text()).trim();
}

async function prepareInterview() {
  const categoryCounts = collectCategoryCounts();
  const totalQuestions = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  prepareBtn.disabled = true;
  prepareBtn.textContent = 'Preparing...';

  try {
    const resume = await getInputText(resumeTextarea, resumeFileInput, 'Resume');
    const jobDescription = await getInputText(jdTextarea, jdFileInput, 'Job description');

    if (!resume || !jobDescription) return alert('Please provide both resume and job description.');
    if (totalQuestions === 0) return alert('Please choose at least 1 question.');

    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobDescription, categories: categoryCounts, language: state.interviewLanguage })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not prepare interview questions.');

    state.questions = data.questions.map((q) => ({ ...q, isFollowUp: false }));
    state.answers = [];
    state.currentIndex = 0;
    state.resumeText = resume;
    state.jobDescriptionText = jobDescription;
    state.generatedFollowUps = 0;
    state.dynamicFollowUpsEnabled = Boolean(dynamicFollowUpsInput.checked);
    state.interviewLanguage = interviewLanguageInput?.value || 'English';

    showScreen(instructionScreen);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Failed to prepare interview. Please try again.');
  } finally {
    prepareBtn.disabled = false;
    prepareBtn.textContent = 'Prepare for Interview';
  }
}

function renderCurrentQuestion() {
  const questionObj = state.questions[state.currentIndex];
  questionTitle.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  questionMeta.textContent = `Category: ${questionObj.category}${questionObj.isFollowUp ? ' • Adaptive follow-up' : ''} • Language: ${state.interviewLanguage}`;
  currentQuestion.textContent = questionObj.question;

  answerTranscript.value = '';
  transcriptStatus.textContent = 'Record your answer, then transcribe or edit it before moving on.';
  nextBtn.disabled = true;
  nextBtn.textContent = state.currentIndex === state.questions.length - 1 ? 'See Coaching' : 'Next Question';

  stopTimerUI();
  recordTimer.textContent = '00:00';
  audioPreview.classList.add('hidden');
  audioPreview.removeAttribute('src');
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) state.audioChunks.push(event.data); };
    state.mediaRecorder.onstop = async () => {
      state.currentAudioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
      audioPreview.src = URL.createObjectURL(state.currentAudioBlob);
      audioPreview.classList.remove('hidden');
      await transcribeAudio();
      stream.getTracks().forEach((track) => track.stop());
    };
    state.mediaRecorder.start();
    startTimerUI();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    transcriptStatus.textContent = 'Recording...';
  } catch (error) {
    console.error(error);
    alert('Unable to access microphone. Please allow microphone permissions.');
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    state.mediaRecorder.stop();
    stopTimerUI();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    transcriptStatus.textContent = 'Transcribing...';
  }
}

async function transcribeAudio() {
  if (!state.currentAudioBlob) return;
  const formData = new FormData();
  formData.append('audio', state.currentAudioBlob, 'answer.webm');
  try {
    const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Transcription request failed.');
    answerTranscript.value = data.transcript || '';
    transcriptStatus.textContent = 'Transcription ready. You can edit before continuing.';
    nextBtn.disabled = answerTranscript.value.trim().length === 0;
  } catch {
    transcriptStatus.textContent = 'Transcription failed. You may type your answer manually.';
    nextBtn.disabled = answerTranscript.value.trim().length === 0;
  }
}

async function maybeInsertFollowUp(questionObj, transcript) {
  if (!state.dynamicFollowUpsEnabled || questionObj.isFollowUp || state.generatedFollowUps >= FOLLOW_UP_LIMIT) return;
  try {
    const response = await fetch('/api/generate-follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume: state.resumeText,
        jobDescription: state.jobDescriptionText,
        category: questionObj.category,
        question: questionObj.question,
        answer: transcript,
        language: state.interviewLanguage
      })
    });
    const data = await response.json();
    if (!response.ok || !data.followUpQuestion) return;
    state.questions.splice(state.currentIndex + 1, 0, {
      category: questionObj.category,
      question: data.followUpQuestion,
      isFollowUp: true
    });
    state.generatedFollowUps += 1;
  } catch (error) {
    console.warn('Follow-up generation skipped:', error);
  }
}

function getCoachingHints(transcript) {
  const text = transcript.toLowerCase();
  const hints = [];
  if (!/(situation|when|context|project)/.test(text)) hints.push('Add context first: what was the situation?');
  if (!/(i|my|me)\s+(led|built|designed|implemented|created|owned|fixed|improved)/.test(text)) {
    hints.push('Emphasize your ownership with concrete actions you personally took.');
  }
  if (!/(%|reduced|increased|saved|impact|result|outcome|kpi|metric|users)/.test(text)) {
    hints.push('Include measurable outcomes (%, time saved, quality gains).');
  }
  if ((text.match(/\b(um|uh|like|basically|kind of|sort of)\b/g) || []).length > 2) {
    hints.push('Reduce filler words to sound more confident and concise.');
  }
  if (transcript.trim().split(/\s+/).filter(Boolean).length < 45) {
    hints.push('Expand your answer using STAR to add depth.');
  }
  return hints;
}

function renderCoachingScreen() {
  coachingList.innerHTML = '';
  state.answers.forEach((item, index) => {
    const el = document.createElement('article');
    el.className = 'result-item';
    const hints = getCoachingHints(item.transcript);
    el.innerHTML = `
      <h4>Q${index + 1} (${item.category})</h4>
      <p><strong>Question:</strong> ${item.question}</p>
      <textarea data-coaching-index="${index}" rows="5">${item.transcript}</textarea>
      <p><strong>Coaching tips before scoring:</strong></p>
      <ul>${(hints.length ? hints : ['Strong draft answer. Keep it concise and confident.']).map((h) => `<li>${h}</li>`).join('')}</ul>`;
    coachingList.appendChild(el);
  });
  showScreen(coachingScreen);
}

async function saveAnswerAndContinue() {
  const transcript = answerTranscript.value.trim();
  if (!transcript) return alert('Please record or type an answer before moving on.');
  const questionObj = state.questions[state.currentIndex];
  state.answers[state.currentIndex] = {
    category: questionObj.category,
    question: questionObj.question,
    transcript,
    isFollowUp: questionObj.isFollowUp
  };

  if (state.currentIndex < state.questions.length - 1) {
    await maybeInsertFollowUp(questionObj, transcript);
    state.currentIndex += 1;
    renderCurrentQuestion();
  } else {
    renderCoachingScreen();
  }
}

function retryQuestion() {
  answerTranscript.value = '';
  nextBtn.disabled = true;
  transcriptStatus.textContent = 'Retry: record your answer again.';
  stopTimerUI();
  recordTimer.textContent = '00:00';
}

function scoreBadgeClass(score) {
  if (score >= 75) return 'badge-high';
  if (score >= 50) return 'badge-mid';
  return 'badge-low';
}

function renderCategoryBars(results) {
  categoryBars.innerHTML = '';
  categories.forEach((category) => {
    const items = results.filter((result) => result.category === category);
    if (!items.length) return;
    const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<div class="bar-head"><span>${category}</span><strong>${score}/100</strong></div><div class="bar-track"><div class="bar-fill" style="width:${score}%"></div></div>`;
    categoryBars.appendChild(row);
  });
}

function renderDistribution(results) {
  const buckets = {
    'Strong (75-100)': results.filter((result) => result.score >= 75).length,
    'Developing (50-74)': results.filter((result) => result.score >= 50 && result.score < 75).length,
    'Needs Work (<50)': results.filter((result) => result.score < 50).length
  };
  distribution.innerHTML = Object.entries(buckets)
    .map(([label, count]) => `<span class="dist-chip">${label}: ${count}</span>`)
    .join('');
}

function renderRubricBreakdown(breakdown = {}) {
  const rows = Object.entries(breakdown).map(([key, value]) => `<li><strong>${key}</strong>: ${value}</li>`).join('');
  return rows ? `<ul class="rubric-list">${rows}</ul>` : '<p class="meta">Rubric details unavailable.</p>';
}

function highlightTranscript(transcript, highlights = {}) {
  let highlighted = transcript;
  (highlights.strongPatterns || []).forEach((pattern) => {
    const safe = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    highlighted = highlighted.replace(new RegExp(safe, 'gi'), (m) => `<mark class="hl-strong">${m}</mark>`);
  });
  (highlights.weakPatterns || []).forEach((pattern) => {
    const safe = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    highlighted = highlighted.replace(new RegExp(safe, 'gi'), (m) => `<mark class="hl-weak">${m}</mark>`);
  });
  return highlighted;
}

function persistSession(totalScore, resultsCount) {
  updateCurrentUser((user) => ({
    ...user,
    sessions: [{ at: new Date().toISOString(), overallScore: totalScore, questions: resultsCount }, ...(user.sessions || [])].slice(0, 40)
  }));
}

function renderSessionHistory() {
  const sessions = state.currentUser?.sessions || [];
  if (!sessions.length) {
    sessionHistory.innerHTML = '<p class="meta">No sessions yet. Complete an interview to see your history.</p>';
    return;
  }
  sessionHistory.innerHTML = `<ul>${sessions.slice(0, 8).map((s) => `<li>${new Date(s.at).toLocaleString()} — <strong>${s.overallScore}/100</strong> (${s.questions} questions)</li>`).join('')}</ul>`;
}

function renderProgressHistory() {
  const sessions = state.currentUser?.sessions || [];
  if (!sessions.length) {
    progressHistory.innerHTML = '<p class="meta">No previous sessions yet.</p>';
    return;
  }
  const recent = sessions.slice(0, 10).reverse();
  const bars = recent.map((s) => `<span class="mini-bar" style="height:${Math.max(8, s.overallScore)}px" title="${s.overallScore}"></span>`).join('');
  progressHistory.innerHTML = `<div class="mini-chart">${bars}</div><p class="meta">Latest score: ${sessions[0].overallScore}/100</p>`;
}


function renderSetupHistory() {
  const sessions = state.currentUser?.sessions || [];
  if (!setupSessionHistory || !setupProgressHistory) return;

  if (!sessions.length) {
    setupSessionHistory.innerHTML = '<p class="meta">No sessions yet. Complete an interview to see your history.</p>';
    setupProgressHistory.innerHTML = '<p class="meta">No score trend yet.</p>';
    return;
  }

  setupSessionHistory.innerHTML = `<ul>${sessions.slice(0, 6).map((s) => `<li>${new Date(s.at).toLocaleString()} — <strong>${s.overallScore}/100</strong> (${s.questions} questions)</li>`).join('')}</ul>`;
  const recent = sessions.slice(0, 10).reverse();
  const bars = recent.map((s) => `<span class="mini-bar" style="height:${Math.max(8, s.overallScore)}px" title="${s.overallScore}"></span>`).join('');
  setupProgressHistory.innerHTML = `<div class="mini-chart">${bars}</div><p class="meta">Latest score: ${sessions[0].overallScore}/100</p>`;
}

async function analyzeInterview() {
  showScreen(loadingScreen);
  try {
    const response = await fetch('/api/analyze-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume: state.resumeText,
        jobDescription: state.jobDescriptionText,
        qaPairs: state.answers,
        language: state.interviewLanguage
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to analyze interview.');
    state.lastAnalysis = data;
    renderResults(data);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Interview analysis failed. Please try again.');
    showScreen(coachingScreen);
  }
}

function renderResults(data) {
  const totalScore = Number(data.overallScore) || 0;
  overallScore.textContent = `${totalScore}/100`;
  overallFeedback.textContent = data.overallFeedback;
  nextStepPlan.textContent = data.nextStepPlan || '';
  const ringDeg = Math.round((Math.max(0, Math.min(100, totalScore)) / 100) * 360);
  scoreRing.style.background = `conic-gradient(var(--primary) ${ringDeg}deg, #e7ebff ${ringDeg}deg)`;

  const results = data.results || [];
  renderCategoryBars(results);
  renderDistribution(results);
  persistSession(totalScore, results.length);
  hydrateProfileInputs();

  detailedResults.innerHTML = '';
  results.forEach((result, index) => {
    const item = document.createElement('article');
    item.className = 'result-item';
    item.innerHTML = `
      <h4>Q${index + 1} (${result.category}) <span class="score-badge ${scoreBadgeClass(result.score)}">${result.score}/100</span></h4>
      <p><strong>Question:</strong> ${result.question}</p>
      <p><strong>Transcript:</strong> <span class="transcript-html">${highlightTranscript(result.transcript || '', result.highlights || {})}</span></p>
      <p><strong>Feedback:</strong> ${result.feedback}</p>
      <p><strong>Score Explanation:</strong> ${result.scoreExplanation || 'Detailed explanation unavailable.'}</p>
      <p><strong>Rubric Breakdown:</strong></p>${renderRubricBreakdown(result.rubricBreakdown)}
      <p><strong>Improvement Tips:</strong></p><ul>${(result.improvementTips || []).map((tip) => `<li>${tip}</li>`).join('')}</ul>`;
    detailedResults.appendChild(item);
  });

  showScreen(resultsScreen);
}

function exportReportAsPdf() {
  if (!state.lastAnalysis) return alert('No analysis available yet.');
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) return alert('PDF export library failed to load. Please refresh and try again.');

  const doc = new jsPdf();
  let y = 16;
  const margin = 12;
  const maxWidth = 185;
  const addWrapped = (text, spacing = 6) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, margin, y);
    y += lines.length * spacing;
    if (y > 275) { doc.addPage(); y = 16; }
  };

  doc.setFontSize(16);
  doc.text('PrepGPT Interview Report', margin, y);
  y += 10;
  doc.setFontSize(11);
  addWrapped(`User: ${state.currentUser?.name || 'N/A'} (${state.currentUser?.email || ''})`);
  addWrapped(`Overall Score: ${state.lastAnalysis.overallScore}/100`);
  addWrapped(`Overall Feedback: ${state.lastAnalysis.overallFeedback}`);
  if (state.lastAnalysis.nextStepPlan) addWrapped(`Next-step plan: ${state.lastAnalysis.nextStepPlan}`);
  (state.lastAnalysis.results || []).forEach((row, idx) => {
    addWrapped(`Q${idx + 1} (${row.category}) — Score: ${row.score}/100`);
    addWrapped(`Question: ${row.question}`);
    addWrapped(`Transcript: ${row.transcript}`);
    addWrapped(`Feedback: ${row.feedback}`);
    addWrapped(`Tips: ${(row.improvementTips || []).join(' | ')}`);
    y += 2;
  });

  doc.save(`prepgpt-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function restartFlow() {
  state.questions = [];
  state.answers = [];
  state.currentIndex = 0;
  state.resumeText = '';
  state.jobDescriptionText = '';
  state.lastAnalysis = null;
  answerTranscript.value = '';
  stopTimerUI();
  showScreen(setupScreen);
}

showLoginBtn.addEventListener('click', () => showAuthPanel('login'));
showSignupBtn.addEventListener('click', () => showAuthPanel('signup'));
loginBtn.addEventListener('click', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', logout);
if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);
if (setupSaveProfileBtn) setupSaveProfileBtn.addEventListener('click', saveProfile);

prepareBtn.addEventListener('click', prepareInterview);
startSimulationBtn.addEventListener('click', () => {
  showScreen(questionScreen);
  renderCurrentQuestion();
});
restartBtn.addEventListener('click', restartFlow);
exportReportBtn.addEventListener('click', exportReportAsPdf);

recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
retryBtn.addEventListener('click', retryQuestion);
nextBtn.addEventListener('click', saveAnswerAndContinue);

backToQuestionsBtn.addEventListener('click', () => {
  state.currentIndex = Math.max(0, state.questions.length - 1);
  showScreen(questionScreen);
  renderCurrentQuestion();
});

analyzeBtn.addEventListener('click', () => {
  document.querySelectorAll('[data-coaching-index]').forEach((input) => {
    const i = Number(input.getAttribute('data-coaching-index'));
    if (state.answers[i]) state.answers[i].transcript = input.value.trim();
  });
  analyzeInterview();
});

answerTranscript.addEventListener('input', () => {
  nextBtn.disabled = answerTranscript.value.trim().length === 0;
});

createSliders();
bootstrapAuth();
