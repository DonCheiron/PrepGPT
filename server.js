const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is missing. API endpoints that use OpenAI will fail until it is set.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.static('public'));
app.use(express.json({ limit: '2mb' }));

app.post('/api/generate-questions', async (req, res) => {
  try {
    const { resume, jobDescription, categories } = req.body;

    if (!resume || !jobDescription || !categories) {
      return res.status(400).json({ error: 'Missing resume, jobDescription, or categories.' });
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

    const text = response.output_text;
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed.questions)) {
      return res.status(500).json({ error: 'Model response did not include a questions array.' });
    }

    res.json({ questions: parsed.questions });
  } catch (error) {
    console.error('Question generation failed:', error);
    res.status(500).json({ error: 'Failed to generate interview questions.' });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required.' });
    }

    const transcription = await client.audio.transcriptions.create({
      file: new File([req.file.buffer], req.file.originalname || 'answer.webm', {
        type: req.file.mimetype || 'audio/webm'
      }),
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
    res.json(parsed);
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ error: 'Failed to analyze interview.' });
  }
});

app.listen(PORT, () => {
  console.log(`PrepGPT running at http://localhost:${PORT}`);
});
