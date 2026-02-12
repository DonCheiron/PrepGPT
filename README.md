# PrepGPT

PrepGPT is an interview simulation web app. It generates tailored interview questions from a resume and job description, captures spoken answers, transcribes them with OpenAI speech-to-text, and provides detailed AI feedback and scoring.

## Features

- Input resume and job description.
- Choose number of interview questions by category using sliders:
  - Behavioral
  - Technical
  - Situational
  - Motivational
- Generate questions privately (not shown until simulation starts).
- Record one answer per question, with retry and next flow.
- Automatic speech-to-text transcription via OpenAI.
- Detailed per-question feedback, transcripts, and overall score.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

   Then set `OPENAI_API_KEY` in `.env`.

3. Run the app:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:3000>


## How to open the landing page quickly

You have two options:

1. **Run the app (recommended)**

   ```bash
   npm install
   npm run dev
   ```

   Then open: <http://localhost:3000>

2. **Preview static UI only (no backend/OpenAI calls):**

   ```bash
   python3 -m http.server 3000
   ```

   Then open: <http://localhost:3000> (root now redirects to the PrepGPT page).

## Notes

- The backend endpoints rely on OpenAI models for:
  - question generation,
  - transcription,
  - interview analysis.
- A microphone-enabled browser is required for recording answers.
