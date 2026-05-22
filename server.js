import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const port = process.env.PORT || 8787;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
}

const client = new Anthropic();

app.use(express.json({ limit: '256kb' }));

app.post('/api/claude', async (req, res) => {
  const {
    system,
    content,
    model = 'claude-sonnet-4-6',
    max_tokens = 1024,
  } = req.body || {};

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    const msg = await client.messages.create({
      model,
      max_tokens,
      system,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    res.json({ text, stop_reason: msg.stop_reason, usage: msg.usage });
  } catch (err) {
    const status = err?.status ?? 500;
    console.error(`[claude] ${status}:`, err?.message || err);
    res.status(status).json({ error: err?.message || 'upstream error' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(port, () => {
  console.log(`Celerie agent backend listening on http://localhost:${port}`);
});
