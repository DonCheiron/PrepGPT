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

function generateFallbackQuestions(categories = {}) {
  const bank = {
    Behavioral: [
      'Tell me about a time you resolved a conflict within your team.',
      'Describe a situation where you had to learn something quickly to deliver a project.',
      'Share an example of a difficult decision you made at work and how you handled it.'
    ],
    Technical: [
      'Walk me through a technically challenging problem you solved and your approach.',
      'How would you design a scalable solution for a feature with growing usage?',
      'Explain how you ensure code quality in your day-to-day development process.'
    ],
    Situational: [
      'If priorities changed suddenly right before a deadline, how would you respond?',
      'How would you handle unclear requirements from multiple stakeholders?',
      'What would you do if production failed shortly after your deployment?'
    ],
    Motivational: [
      'Why are you interested in this role and this company?',
      'What motivates you to perform at your best in a team environment?',
      'Where do you want your career to grow over the next 2-3 years?'
    ]
  };

  const questions = [];

  Object.entries(categories).forEach(([category, count]) => {
    const wanted = Math.max(0, Number(count) || 0);
    for (let i = 0; i < wanted; i += 1) {
      const list = bank[category] || [`Give an example response for a ${category} interview question.`];
      questions.push({ category, question: list[i % list.length] });
    }
  });

  return questions;
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

  let score = 20;

  if (wordCount >= 30) score += 10;
  if (wordCount >= 70) score += 10;
  if (wordCount >= 120) score += 8;
  if (wordCount >= 220) score += 6;

  if (hasSituation) score += 8;
  if (hasTask) score += 8;
  if (hasAction) score += 12;
  if (hasResult) score += 14;
  if (hasMetric) score += 12;

  score -= Math.min(12, fillerCount * 2);

  if (wordCount < 20) score -= 18;
  if (!hasAction) score -= 12;
  if (!hasResult) score -= 10;

  score = Math.max(18, Math.min(92, score));

  const improvementTips = [];
  if (!hasSituation || !hasTask) improvementTips.push('Open with situation + goal so the interviewer has context.');
  if (!hasAction) improvementTips.push('Emphasize specific actions you personally took, not just team outcomes.');
  if (!hasResult) improvementTips.push('Close with outcomes and what changed because of your work.');
  if (!hasMetric) improvementTips.push('Add concrete metrics (%, time saved, quality improvements) to strengthen credibility.');
  if (wordCount < 50) improvementTips.push('Expand your answer with more detail and structure (STAR format).');
  if (improvementTips.length === 0) improvementTips.push('Great structure—tighten clarity and keep answers concise under time pressure.');

  let feedback = 'Good baseline answer, but there is room to improve structure and impact clarity.';
  if (score >= 75) feedback = 'Strong answer with good structure and clear impact. Tighten phrasing for maximum confidence.';
  else if (score < 50) feedback = 'Answer needs more structure and specificity. Use STAR and add measurable outcomes.';

  return { score, feedback, improvementTips };
}

app.post('/api/generate-questions', async (req, res) => {
  try {
    const { resume, jobDescription, categories } = req.body;

    if (!resume || !jobDescription || !categories) {
      return res.status(400).json({ error: 'Missing resume, jobDescription, or categories.' });
    }

    if (!hasApiKey) {
      return res.json({ questions: generateFallbackQuestions(categories), source: 'fallback' });
    }

    const categorySummary = Object.entries(categories)
      .map(([category, count]) => `${category}: ${Number(count) || 0}`)
      .join(', ');

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are an expert interview coach. Return only valid JSON with this exact structure: {"questions":[{"category":"Behavioral|Technical|Situational|Motivational","question":"..."}]}. Do not include markdown or extra text.'
        },
        {
          role: 'user',
          content: `Create interview questions using the candidate resume and job description.\nCategory counts: ${categorySummary}\nResume:\n${resume}\n\nJob Description:\n${jobDescription}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);

    if (!Array.isArray(parsed.questions)) {
      return res.status(500).json({ error: 'Model response did not include a questions array.' });
    }

    res.json({ questions: parsed.questions, source: 'openai' });
  } catch (error) {
    console.error('Question generation failed:', error);
    res.status(200).json({
      questions: generateFallbackQuestions(req.body?.categories),
      source: 'fallback',
      warning: 'OpenAI question generation failed; fallback questions were used.'
    });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required.' });
    }

    if (!hasApiKey) {
      return res.status(400).json({
        error: 'OPENAI_API_KEY is not configured. Transcription unavailable; type your answer manually.'
      });
    }

    const audioFile = new File([req.file.buffer], req.file.originalname || 'answer.webm', {
      type: req.file.mimetype || 'audio/webm'
    });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe'
    });

    res.json({ transcript: transcription.text || '' });
  } catch (error) {
    console.error('Transcription failed:', error);
    res.status(500).json({ error: 'Failed to transcribe audio.' });
  }
});

app.post('/api/analyze-interview', async (req, res) => {
  try {
    const { resume, jobDescription, qaPairs } = req.body;

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
          improvementTips: evaluated.improvementTips
        };
      });

      const overallScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
      return res.json({
        overallScore,
        overallFeedback:
          overallScore >= 75
            ? 'Solid overall performance. Keep answers concise and evidence-backed.'
            : 'Your interview needs stronger structure and measurable impact in each response.',
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
            'You are a strict senior interview evaluator. Be realistic and critical. Most average answers should score between 45 and 70. Return only valid JSON with this exact format: {"overallScore": number,"overallFeedback": string,"results":[{"category":string,"question":string,"transcript":string,"score":number,"feedback":string,"improvementTips":[string]}]}. Scores are 0-100 and must clearly reflect answer quality.'
        },
        {
          role: 'user',
          content: `Evaluate this interview simulation.\nResume:\n${resume}\n\nJob Description:\n${jobDescription}\n\nInterview Q&A:\n${JSON.stringify(qaPairs, null, 2)}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);

    const calibratedResults = (parsed.results || []).map((item) => {
      const local = evaluateTranscript(item.transcript || '');
      const modelScore = Number(item.score) || 0;
      const blended = Math.round(modelScore * 0.6 + local.score * 0.4);
      const score = Math.max(20, Math.min(95, blended));

      return {
        ...item,
        score,
        improvementTips:
          Array.isArray(item.improvementTips) && item.improvementTips.length > 0 ? item.improvementTips : local.improvementTips
      };
    });

    const overallScore =
      calibratedResults.length > 0
        ? Math.round(calibratedResults.reduce((sum, row) => sum + row.score, 0) / calibratedResults.length)
        : 0;

    res.json({
      overallScore,
      overallFeedback: parsed.overallFeedback || 'Interview analysis generated successfully.',
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
