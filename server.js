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
app.use(express.json({ limit: '2mb' }));

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
      questions.push({
        category,
        question: list[i % list.length]
      });
    }
  });

  return questions;
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
        const lengthScore = Math.min(100, Math.max(45, Math.round((qa.transcript.length / 300) * 100)));
        return {
          category: qa.category,
          question: qa.question,
          transcript: qa.transcript,
          score: lengthScore,
          feedback:
            'Fallback analysis mode: your answer has been scored based on clarity/length proxy. Add STAR structure for stronger responses.',
          improvementTips: [
            'State the context and your objective first.',
            'Describe concrete actions you personally took.',
            'End with measurable outcomes and lessons learned.'
          ]
        };
      });

      const overallScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
      return res.json({
        overallScore,
        overallFeedback:
          'Fallback analysis mode (no OpenAI key). Configure OPENAI_API_KEY for full AI-based personalized feedback.',
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
            'You are a senior interview evaluator. Return only valid JSON with this exact format: {"overallScore": number,"overallFeedback": string,"results":[{"category":string,"question":string,"transcript":string,"score":number,"feedback":string,"improvementTips":[string]}]}. Scores are 0-100.'
        },
        {
          role: 'user',
          content: `Evaluate this interview simulation.\nResume:\n${resume}\n\nJob Description:\n${jobDescription}\n\nInterview Q&A:\n${JSON.stringify(qaPairs, null, 2)}`
        }
      ]
    });

    const parsed = JSON.parse(response.output_text);
    res.json({ ...parsed, source: 'openai' });
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ error: 'Failed to analyze interview.' });
  }
});

app.listen(PORT, () => {
  console.log(`PrepGPT running at http://localhost:${PORT}`);
});
