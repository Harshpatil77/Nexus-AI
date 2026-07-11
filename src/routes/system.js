import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPublicMetrics, trackEvent } from '../../analytics/analytics.js';

const systemRouter = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

systemRouter.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html')));
systemRouter.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
systemRouter.get('/metrics', async (req, res) => res.json(await getPublicMetrics()));
systemRouter.post('/track', async (req, res) => {
  const { eventType, metadata } = req.body;
  if (!eventType) return res.status(400).json({ error: 'eventType is required' });
  await trackEvent(eventType, req.userHash, req.sessionId, metadata || {});
  res.json({ success: true });
});

export default systemRouter;
