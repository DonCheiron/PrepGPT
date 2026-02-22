const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

if (!hasApiKey) {
  console.warn('OPENAI_API_KEY is missing. Question generation/analysis will use local fallback responses.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });

app.use(express.static('public'));
app.use(express.json({ limit: '4mb' }));

function normalizeLanguage(language = 'English') {
  const allowed = ['English', 'Dutch', 'French', 'Romanian', 'Russian'];
  return allowed.includes(language) ? language : 'English';
}

function getFallbackQuestion(language, category, i) {
  const templates = {
    English: {
      Behavioral: 'Tell me about a time you handled a team conflict successfully.',
      Technical: 'Describe a technical challenge you solved and your exact approach.',
      Situational: 'How would you respond if priorities changed right before a deadline?',
      Motivational: 'Why are you interested in this role and this company?'
    },
    Dutch: {
      Behavioral: 'Vertel over een moment waarop je een teamconflict succesvol oploste.',
      Technical: 'Beschrijf een technisch probleem dat je hebt opgelost en je aanpak.',
      Situational: 'Hoe zou je reageren als prioriteiten vlak voor een deadline veranderen?',
      Motivational: 'Waarom ben je geïnteresseerd in deze rol en dit bedrijf?'
    },
    French: {
      Behavioral: "Parlez-moi d'une situation où vous avez résolu un conflit d'équipe avec succès.",
      Technical: 'Décrivez un défi technique que vous avez résolu et votre approche précise.',
      Situational: 'Comment réagiriez-vous si les priorités changeaient juste avant une échéance ?',
      Motivational: "Pourquoi êtes-vous intéressé(e) par ce poste et cette entreprise ?"
    },
    Romanian: {
      Behavioral: 'Povestește despre o situație în care ai rezolvat cu succes un conflict în echipă.',
      Technical: 'Descrie o provocare tehnică pe care ai rezolvat-o și abordarea ta.',
      Situational: 'Cum ai reacționa dacă prioritățile se schimbă chiar înainte de termen?',
      Motivational: 'De ce ești interesat(ă) de acest rol și de această companie?'
    },
    Russian: {
      Behavioral: 'Расскажите о случае, когда вы успешно разрешили конфликт в команде.',
      Technical: 'Опишите техническую задачу, которую вы решили, и ваш подход.',
      Situational: 'Как бы вы отреагировали, если приоритеты изменятся прямо перед дедлайном?',
      Motivational: 'Почему вас интересуют эта роль и эта компания?'
    }
  };

  const bank = templates[normalizeLanguage(language)] || templates.English;
  const variants = [
    bank[category] || bank.Behavioral,
    `${bank[category] || bank.Behavioral} ${normalizeLanguage(language) === 'English' ? 'Please include specific actions and outcomes.' : ''}`,
    `${bank[category] || bank.Behavioral} ${normalizeLanguage(language) === 'English' ? 'Use a clear STAR structure.' : ''}`
  ];
  return variants[i % variants.length];
}

function generateFallbackQuestions(categories = {}, language = 'English') {
  const questions = [];
  Object.entries(categories).forEach(([category, count]) => {
    const wanted = Math.max(0, Number(count) || 0);
    for (let i = 0; i < wanted; i += 1) {
      questions.push({ category, question: getFallbackQuestion(language, category, i) });
    }
  });

  return questions;
}


function looksLikeLanguage(text = '', language = 'English') {
  const lower = String(text).toLowerCase();
  if (!lower.trim()) return false;

  const languageSignals = {
    English: [' the ', ' and ', ' with ', ' your ', ' about ', ' tell me '],
    Dutch: [' de ', ' het ', ' een ', ' je ', ' jouw ', ' wat ', ' waarom '],
    French: [' le ', ' la ', ' les ', ' des ', ' avec ', ' pourquoi ', ' vous '],
    Romanian: [' și ', ' este ', ' care ', ' pentru ', ' cum ', ' de ce ', ' într-'],
    Russian: [' как ', ' что ', ' это ', ' для ', ' почему ', ' вы ', ' когда ']
  };

  const selected = normalizeLanguage(language);
  const selectedHits = (languageSignals[selected] || []).reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
  const englishHits = (languageSignals.English || []).reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);

  if (selected === 'English') return englishHits >= 1;
  return selectedHits >= 1 && selectedHits >= englishHits;
}

async function forceQuestionsLanguage(questions = [], language = 'English') {
  const selected = normalizeLanguage(language);
  if (!Array.isArray(questions) || questions.length === 0 || selected === 'English' || !hasApiKey) {
    return questions;
  }

  const mismatched = questions.some((q) => !looksLikeLanguage(q?.question || '', selected));
  if (!mismatched) return questions;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content:
          'Rewrite interview questions to the requested language. Keep intent and difficulty unchanged. Return ONLY JSON as {"questions":[{"category":"Behavioral|Technical|Situational|Motivational","question":"..."}]}. Every question must be entirely in the requested language.'
      },
      {
        role: 'user',
        content: `Requested language: ${selected}. Rewrite these questions and return same count and categories:
${JSON.stringify(questions)}`
      }
    ]
  });

  const parsed = JSON.parse(response.output_text);
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== questions.length) {
    return questions;
  }

  return parsed.questions;
}

function extractHighlights(transcript = '') {
  const lower = transcript.toLowerCase();
  const metricMatch = transcript.match(/\b\d+(?:\.\d+)?\s?(?:%|ms|sec|seconds|minutes|hours|days|weeks|months|users|customers|tickets|bugs|k|m)\b/gi) || [];
  const ownershipMatch = transcript.match(/\b(i led|i built|i designed|i implemented|i created|i owned|i fixed|i improved|my team and i)\b/gi) || [];
  const outcomeMatch = transcript.match(/\b(result|outcome|impact|increased|reduced|saved|launched|delivered|improved)\b/gi) || [];
  const fillerMatch = transcript.match(/\b(um|uh|like|you know|basically|kind of|sort of)\b/gi) || [];
  const vagueMatch = transcript.match(/\b(stuff|things|somehow|maybe|probably|etc)\b/gi) || [];

  return {
    strongPatterns: [...new Set([...metricMatch, ...ownershipMatch, ...outcomeMatch])].slice(0, 10),
    weakPatterns: [...new Set([...fillerMatch, ...vagueMatch])].slice(0, 10),
    metricsCount: metricMatch.length,
    ownershipCount: ownershipMatch.length,
    fillerCount: fillerMatch.length
  };
}

function evaluateTranscript(transcript = '') {
  const text = transcript.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = text.toLowerCase();

  const hasSituation = /(situation|context|when|at the time|project)/.test(lower);
  const hasTask = /(task|goal|objective|responsible)/.test(lower);
  const hasAction = /(i did|i built|i led|implemented|designed|debugged|created|improved|migrated|optimized)/.test(lower);
  const hasResult = /(result|outcome|impact|improved|reduced|increased|saved|delivered|launched)/.test(lower);
  const hasMetric = /(\d+%|\d+\s*(ms|sec|seconds|minutes|hours|days|weeks|months|users|customers|tickets|bugs|k|m))/i.test(text);
  const fillerCount = (lower.match(/\b(um|uh|like|you know|basically|kind of|sort of)\b/g) || []).length;

  const rubricBreakdown = {
    StructureSTAR: 0,
    OwnershipAndAction: 0,
    ResultsAndImpact: 0,
    MetricsSpecificity: 0,
    ClarityAndConciseness: 0
  };

  rubricBreakdown.StructureSTAR += hasSituation ? 12 : 4;
  rubricBreakdown.StructureSTAR += hasTask ? 8 : 2;
  rubricBreakdown.OwnershipAndAction += hasAction ? 22 : 8;
  rubricBreakdown.ResultsAndImpact += hasResult ? 22 : 8;
  rubricBreakdown.MetricsSpecificity += hasMetric ? 18 : 4;
  rubricBreakdown.ClarityAndConciseness += Math.max(6, 20 - Math.min(10, fillerCount * 2));

  if (wordCount < 35) rubricBreakdown.ClarityAndConciseness -= 6;
  if (wordCount > 260) rubricBreakdown.ClarityAndConciseness -= 4;

  let score = Object.values(rubricBreakdown).reduce((sum, n) => sum + n, 0);
  score = Math.max(18, Math.min(94, Math.round(score)));

  const improvementTips = [];
  if (!hasSituation || !hasTask) improvementTips.push('Open with situation + goal so the interviewer has context.');
  if (!hasAction) improvementTips.push('Emphasize specific actions you personally took, not just team outcomes.');
  if (!hasResult) improvementTips.push('Close with outcomes and what changed because of your work.');
  if (!hasMetric) improvementTips.push('Add concrete metrics (%, time saved, quality improvements) to strengthen credibility.');
  if (wordCount < 50) improvementTips.push('Expand your answer with more detail and structure (STAR format).');
  if (fillerCount > 3) improvementTips.push('Reduce filler words to improve confidence and executive presence.');
  if (improvementTips.length === 0) improvementTips.push('Strong baseline. Tighten pacing and keep impact statements crisp.');

  let feedback = 'Good baseline answer, but there is room to improve structure and impact clarity.';
  if (score >= 75) feedback = 'Strong answer with good structure and clear impact. Tighten phrasing for maximum confidence.';
  else if (score < 50) feedback = 'Answer needs more structure and specificity. Use STAR and add measurable outcomes.';

  const scoreExplanation = `Score reflects STAR structure (${rubricBreakdown.StructureSTAR}/20), ownership/actions (${rubricBreakdown.OwnershipAndAction}/22), outcomes (${rubricBreakdown.ResultsAndImpact}/22), metrics (${rubricBreakdown.MetricsSpecificity}/18), and clarity (${rubricBreakdown.ClarityAndConciseness}/20).`;

  return {
    score,
    feedback,
    improvementTips,
    rubricBreakdown,
    scoreExplanation,
    highlights: extractHighlights(text)
  };
}

app.post('/api/generate-questions', async (req, res) => {
  try {
    const { resume, jobDescription, categories, language } = req.body;

    if (!resume || !jobDescription || !categories) {
      return res.status(400).json({ error: 'Missing resume, jobDescription, or categories.' });
    }

    if (!hasApiKey) {
      return res.json({ questions: generateFallbackQuestions(categories, normalizeLanguage(language)), source: 'fallback' });
    }

    const categorySummary = Object.entries(categories)
      .filter(([, count]) => Number(count) > 0)
      .map(([category, count]) => `${category}: ${count}`)
      .join(', ');

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are an expert interview coach. Return only valid JSON with this exact structure: {"questions":[{"category":"Behavioral|Technical|Situational|Motivational","question":"..."}]}. Do not include markdown or extra text. IMPORTANT: every question text must be in the requested language exactly.'
        },
        {
          role: 'user',
          content: `Create interview questions using the candidate resume and job description.\nCategory counts: ${categorySummary}\nRequired language: ${normalizeLanguage(language)}.\nAll question text must be in ${normalizeLanguage(language)}.\nResume:\n${resume}\n\nJob Description:\n${jobDescription}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    if (!Array.isArray(parsed.questions)) return res.status(500).json({ error: 'Model response did not include a questions array.' });

    const normalizedQuestions = await forceQuestionsLanguage(parsed.questions, language);
    res.json({ questions: normalizedQuestions, source: 'openai' });
  } catch (error) {
    console.error('Question generation failed:', error);
    res.status(200).json({
      questions: generateFallbackQuestions(req.body?.categories, normalizeLanguage(req.body?.language)),
      source: 'fallback',
      warning: 'OpenAI question generation failed; fallback questions were used.'
    });
  }
});

app.post('/api/generate-follow-up', async (req, res) => {
  try {
    const { category, question, answer, language } = req.body;
    if (!category || !question || !answer) return res.status(400).json({ error: 'Missing category, question, or answer.' });

    if (!hasApiKey) {
      return res.json({
        followUpQuestion: normalizeLanguage(language) === 'English'
          ? `Thanks. Can you go one level deeper: what did you personally do, and what measurable result came from that in this ${category.toLowerCase()} example?`
          : `Please go one level deeper in ${normalizeLanguage(language)}: what actions did you personally take and what measurable result did you achieve?`,
        source: 'fallback'
      });
    }

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are an interviewer. Ask exactly one short follow-up question based on the candidate answer. Focus on missing detail, ownership, trade-offs, or measurable outcomes. Return only JSON: {"followUpQuestion":"..."}. IMPORTANT: followUpQuestion must be written in the requested language only.'
        },
        {
          role: 'user',
          content: `Category: ${category}\nRequired language: ${normalizeLanguage(language)}. Return the follow-up question in ${normalizeLanguage(language)}.\nOriginal question: ${question}\nCandidate answer: ${answer}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    return res.json({ followUpQuestion: parsed.followUpQuestion, source: 'openai' });
  } catch (error) {
    console.error('Follow-up generation failed:', error);
    res.json({
      followUpQuestion: normalizeLanguage(req.body?.language) === 'English'
        ? 'Could you clarify your exact role, key action, and final measurable outcome?'
        : `Please clarify (in ${normalizeLanguage(req.body?.language)}): your role, key action, and measurable outcome.`,
      source: 'fallback'
    });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });
    if (!hasApiKey) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not configured. Transcription unavailable; type your answer manually.' });
    }

    const audioFile = new File([req.file.buffer], req.file.originalname || 'answer.webm', {
      type: req.file.mimetype || 'audio/webm'
    });

    const transcription = await client.audio.transcriptions.create({ file: audioFile, model: 'gpt-4o-mini-transcribe' });
    res.json({ transcript: transcription.text || '' });
  } catch (error) {
    console.error('Transcription failed:', error);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  }
});

function makeNextStepPlan(results = []) {
  const weak = results
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.category);
  if (weak.length === 0) return 'Continue regular practice with timed simulations and concise STAR answers.';
  return `Next-step plan: run 2 focused drills on ${[...new Set(weak)].join(', ')} and include one metric + one trade-off in every answer.`;
}

app.post('/api/analyze-interview', async (req, res) => {
  try {
    const { resume, jobDescription, qaPairs, language } = req.body;
    if (!resume || !jobDescription || !Array.isArray(qaPairs) || qaPairs.length === 0) {
      return res.status(400).json({ error: 'Missing required interview data.' });
    }

    if (!hasApiKey) {
      const results = qaPairs.map((qa) => {
        const evaluated = evaluateTranscript(qa.transcript);
        return {
          category: qa.category,
          question: qa.question,
          transcript: qa.transcript,
          score: evaluated.score,
          feedback: evaluated.feedback,
          improvementTips: evaluated.improvementTips,
          rubricBreakdown: evaluated.rubricBreakdown,
          scoreExplanation: evaluated.scoreExplanation,
          highlights: evaluated.highlights
        };
      });

      const overallScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
      const selectedLanguage = normalizeLanguage(language);
      const fallbackOverallFeedback =
        selectedLanguage === 'Dutch'
          ? (overallScore >= 75
              ? 'Sterke algemene prestatie. Houd je antwoorden beknopt en onderbouwd met bewijs.'
              : 'Je interview heeft meer structuur en meetbare impact per antwoord nodig.')
          : selectedLanguage === 'French'
            ? (overallScore >= 75
                ? 'Performance globale solide. Gardez des réponses concises et appuyées par des preuves.'
                : 'Votre entretien a besoin de plus de structure et d\'impact mesurable dans chaque réponse.')
            : selectedLanguage === 'Romanian'
              ? (overallScore >= 75
                  ? 'Performanță generală solidă. Menține răspunsurile concise și susținute de dovezi.'
                  : 'Interviul tău are nevoie de mai multă structură și impact măsurabil în fiecare răspuns.')
              : selectedLanguage === 'Russian'
                ? (overallScore >= 75
                    ? 'Хороший общий результат. Держите ответы краткими и подкрепляйте фактами.'
                    : 'Вашему интервью нужна более чёткая структура и измеримый результат в каждом ответе.')
                : overallScore >= 75
                  ? 'Solid overall performance. Keep answers concise and evidence-backed.'
                  : 'Your interview needs stronger structure and measurable impact in each response.';

      return res.json({
        overallScore,
        overallFeedback: fallbackOverallFeedback,
        nextStepPlan: makeNextStepPlan(results),
        results,
        source: 'fallback'
      });
    }

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a strict senior interview evaluator. Be realistic and critical. Most average answers should score between 45 and 70. Return only valid JSON with this exact format: {"overallScore": number,"overallFeedback": string,"results":[{"category":string,"question":string,"transcript":string,"score":number,"feedback":string,"improvementTips":[string]}]}. Scores are 0-100 and must clearly reflect answer quality. IMPORTANT: all user-facing text fields (overallFeedback, feedback, improvementTips) must be entirely in the requested language.'
        },
        {
          role: 'user',
          content: `Evaluate this interview simulation.\nRequired language: ${normalizeLanguage(language)}. All user-facing text must be in ${normalizeLanguage(language)}.\nResume:\n${resume}\n\nJob Description:\n${jobDescription}\n\nInterview Q&A:\n${JSON.stringify(qaPairs, null, 2)}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    const calibratedResults = (parsed.results || []).map((item) => {
      const local = evaluateTranscript(item.transcript || '');
      const modelScore = Number(item.score) || 0;
      const blended = Math.round(modelScore * 0.55 + local.score * 0.45);
      const score = Math.max(18, Math.min(94, blended));

      return {
        category: item.category,
        question: item.question,
        transcript: item.transcript,
        feedback: item.feedback || local.feedback,
        score,
        improvementTips:
          Array.isArray(item.improvementTips) && item.improvementTips.length > 0 ? item.improvementTips : local.improvementTips,
        rubricBreakdown: local.rubricBreakdown,
        scoreExplanation: local.scoreExplanation,
        highlights: local.highlights
      };
    });

    const overallScore = calibratedResults.length
      ? Math.round(calibratedResults.reduce((sum, row) => sum + row.score, 0) / calibratedResults.length)
      : 0;

    res.json({
      overallScore,
      overallFeedback: parsed.overallFeedback || 'Interview analysis generated successfully.',
      nextStepPlan: makeNextStepPlan(calibratedResults),
      results: calibratedResults,
      source: 'openai'
    });
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ error: 'Failed to analyze interview.' });
  }
});

app.listen(PORT, () => {
  console.log(`PrepGPT running at http://localhost:${PORT}`);
});
