const categories = ['Behavioral', 'Technical', 'Situational', 'Motivational'];

const state = {
  questions: [],
  answers: [],
  currentIndex: 0,
  mediaRecorder: null,
  audioChunks: [],
  currentAudioBlob: null
};

const setupScreen = document.getElementById('setup-screen');
const instructionScreen = document.getElementById('instruction-screen');
const questionScreen = document.getElementById('question-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultsScreen = document.getElementById('results-screen');

const slidersContainer = document.getElementById('sliders');
const prepareBtn = document.getElementById('prepare-btn');
const startSimulationBtn = document.getElementById('start-simulation-btn');

const questionTitle = document.getElementById('question-title');
const questionMeta = document.getElementById('question-meta');
const currentQuestion = document.getElementById('current-question');

const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const retryBtn = document.getElementById('retry-btn');
const nextBtn = document.getElementById('next-btn');

const audioPreview = document.getElementById('audio-preview');
const transcriptStatus = document.getElementById('transcript-status');
const answerTranscript = document.getElementById('answer-transcript');

const overallScore = document.getElementById('overall-score');
const overallFeedback = document.getElementById('overall-feedback');
const detailedResults = document.getElementById('detailed-results');

function showScreen(screen) {
  [setupScreen, instructionScreen, questionScreen, loadingScreen, resultsScreen].forEach((section) => {
    section.classList.add('hidden');
  });
  screen.classList.remove('hidden');
}

function createSliders() {
  categories.forEach((category) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';

    wrapper.innerHTML = `
      <div class="slider-label">
        <span>${category}</span>
        <strong id="${category}-value">2</strong>
      </div>
      <input type="range" id="${category}" min="0" max="6" value="2" />
    `;

    slidersContainer.appendChild(wrapper);

    const slider = wrapper.querySelector('input');
    const valueEl = wrapper.querySelector('strong');
    slider.addEventListener('input', () => {
      valueEl.textContent = slider.value;
    });
  });
}

function collectCategoryCounts() {
  return categories.reduce((acc, category) => {
    acc[category] = Number(document.getElementById(category).value);
    return acc;
  }, {});
}

async function prepareInterview() {
  const resume = document.getElementById('resume').value.trim();
  const jobDescription = document.getElementById('job-description').value.trim();
  const categoryCounts = collectCategoryCounts();

  const totalQuestions = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

  if (!resume || !jobDescription) {
    alert('Please provide both resume and job description.');
    return;
  }

  if (totalQuestions === 0) {
    alert('Please choose at least 1 question across all categories.');
    return;
  }

  prepareBtn.disabled = true;
  prepareBtn.textContent = 'Preparing...';

  try {
    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobDescription, categories: categoryCounts })
    });

    if (!response.ok) {
      throw new Error('Could not prepare interview questions.');
    }

    const data = await response.json();
    state.questions = data.questions;
    state.answers = [];
    state.currentIndex = 0;

    showScreen(instructionScreen);
  } catch (error) {
    console.error(error);
    alert('Failed to prepare interview. Please try again.');
  } finally {
    prepareBtn.disabled = false;
    prepareBtn.textContent = 'Prepare for Interview';
  }
}

function renderCurrentQuestion() {
  const questionObj = state.questions[state.currentIndex];
  questionTitle.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  questionMeta.textContent = `Category: ${questionObj.category}`;
  currentQuestion.textContent = questionObj.question;

  answerTranscript.value = '';
  transcriptStatus.textContent = 'Record your answer, then transcribe or edit it before moving on.';
  nextBtn.disabled = true;
  state.currentAudioBlob = null;

  audioPreview.classList.add('hidden');
  audioPreview.removeAttribute('src');
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];

    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = async () => {
      state.currentAudioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
      audioPreview.src = URL.createObjectURL(state.currentAudioBlob);
      audioPreview.classList.remove('hidden');
      await transcribeAudio();
      stream.getTracks().forEach((track) => track.stop());
    };

    state.mediaRecorder.start();
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
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    transcriptStatus.textContent = 'Transcribing...';
  }
}

async function transcribeAudio() {
  if (!state.currentAudioBlob) {
    return;
  }

  const formData = new FormData();
  formData.append('audio', state.currentAudioBlob, 'answer.webm');

  try {
    const response = await fetch('/api/transcribe', { method: 'POST', body: formData });

    if (!response.ok) {
      throw new Error('Transcription request failed.');
    }

    const data = await response.json();
    answerTranscript.value = data.transcript || '';
    transcriptStatus.textContent = 'Transcription ready. You can edit before continuing.';
    nextBtn.disabled = answerTranscript.value.trim().length === 0;
  } catch (error) {
    console.error(error);
    transcriptStatus.textContent = 'Transcription failed. You may type your answer manually.';
    nextBtn.disabled = answerTranscript.value.trim().length === 0;
  }
}

function saveAnswerAndContinue() {
  const transcript = answerTranscript.value.trim();
  if (!transcript) {
    alert('Please record or type an answer before moving on.');
    return;
  }

  const questionObj = state.questions[state.currentIndex];
  state.answers[state.currentIndex] = {
    category: questionObj.category,
    question: questionObj.question,
    transcript
  };

  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderCurrentQuestion();
  } else {
    analyzeInterview();
  }
}

function retryQuestion() {
  answerTranscript.value = '';
  nextBtn.disabled = true;
  transcriptStatus.textContent = 'Retry: record your answer again.';
}

async function analyzeInterview() {
  showScreen(loadingScreen);

  const resume = document.getElementById('resume').value.trim();
  const jobDescription = document.getElementById('job-description').value.trim();

  try {
    const response = await fetch('/api/analyze-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobDescription, qaPairs: state.answers })
    });

    if (!response.ok) {
      throw new Error('Failed to analyze interview.');
    }

    const data = await response.json();
    renderResults(data);
  } catch (error) {
    console.error(error);
    alert('Interview analysis failed. Please try again.');
    showScreen(questionScreen);
  }
}

function renderResults(data) {
  overallScore.textContent = `Overall Interview Score: ${data.overallScore}/100`;
  overallFeedback.textContent = data.overallFeedback;

  detailedResults.innerHTML = '';

  (data.results || []).forEach((result, index) => {
    const item = document.createElement('article');
    item.className = 'result-item';

    const tips = (result.improvementTips || []).map((tip) => `<li>${tip}</li>`).join('');

    item.innerHTML = `
      <h4>Q${index + 1} (${result.category}) - Score: ${result.score}/100</h4>
      <p><strong>Question:</strong> ${result.question}</p>
      <p><strong>Transcript:</strong> ${result.transcript}</p>
      <p><strong>Feedback:</strong> ${result.feedback}</p>
      <p><strong>Improvement Tips:</strong></p>
      <ul>${tips}</ul>
    `;

    detailedResults.appendChild(item);
  });

  showScreen(resultsScreen);
}

prepareBtn.addEventListener('click', prepareInterview);
startSimulationBtn.addEventListener('click', () => {
  showScreen(questionScreen);
  renderCurrentQuestion();
});

recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
retryBtn.addEventListener('click', retryQuestion);
nextBtn.addEventListener('click', saveAnswerAndContinue);

answerTranscript.addEventListener('input', () => {
  nextBtn.disabled = answerTranscript.value.trim().length === 0;
});

createSliders();
