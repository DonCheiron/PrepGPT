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
    const { resume, jobDescription, categories } = req.body;

    if (!resume || !jobDescription || !categories) {
      return res.status(400).json({ error: 'Missing resume, jobDescription, or categories.' });
    }

    if (!hasApiKey) {
      return res.json({ questions: generateFallbackQuestions(categories), source: 'fallback' });
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
            'You are an expert interview coach. Return only valid JSON with this exact structure: {"questions":[{"category":"Behavioral|Technical|Situational|Motivational","question":"..."}]}. Do not include markdown or extra text.'
        },
        {
          role: 'user',
          content: `Create interview questions using the candidate resume and job description.\nCategory counts: ${categorySummary}\nResume:\n${resume}\n\nJob Description:\n${jobDescription}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    if (!Array.isArray(parsed.questions)) return res.status(500).json({ error: 'Model response did not include a questions array.' });

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

app.post('/api/generate-follow-up', async (req, res) => {
  try {
    const { category, question, answer } = req.body;
    if (!category || !question || !answer) return res.status(400).json({ error: 'Missing category, question, or answer.' });

    if (!hasApiKey) {
      return res.json({
        followUpQuestion: `Thanks. Can you go one level deeper: what did you personally do, and what measurable result came from that in this ${category.toLowerCase()} example?`,
        source: 'fallback'
      });
    }

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are an interviewer. Ask exactly one short follow-up question based on the candidate answer. Focus on missing detail, ownership, trade-offs, or measurable outcomes. Return only JSON: {"followUpQuestion":"..."}.'
        },
        {
          role: 'user',
          content: `Category: ${category}\nOriginal question: ${question}\nCandidate answer: ${answer}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    return res.json({ followUpQuestion: parsed.followUpQuestion, source: 'openai' });
  } catch (error) {
    console.error('Follow-up generation failed:', error);
    res.json({
      followUpQuestion: 'Could you clarify your exact role, key action, and final measurable outcome?',
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
          improvementTips: evaluated.improvementTips,
          rubricBreakdown: evaluated.rubricBreakdown,
          scoreExplanation: evaluated.scoreExplanation,
          highlights: evaluated.highlights
        };
      });

      const overallScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
      return res.json({
        overallScore,
        overallFeedback:
          overallScore >= 75
            ? 'Solid overall performance. Keep answers concise and evidence-backed.'
            : 'Your interview needs stronger structure and measurable impact in each response.',
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
