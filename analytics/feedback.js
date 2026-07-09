import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { trackEvent } from './analytics.js';

const FEEDBACK_FILE = path.join(process.cwd(), 'feedback.json');

async function loadFeedback() {
  try {
    const data = await fs.readFile(FEEDBACK_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function saveFeedback(data) {
  try {
    await fs.writeFile(FEEDBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving feedback:', err);
  }
}

const feedbackRouter = express.Router();

// Submit feedback
feedbackRouter.post('/api/feedback', async (req, res) => {
  const { solved_problem, building, goal_description, missing_feature, reuse_likelihood } = req.body;

  if (solved_problem === undefined || !building || !reuse_likelihood) {
    return res.status(400).json({ error: 'Missing required feedback fields' });
  }

  const feedbackList = await loadFeedback();
  const feedbackId = crypto.randomUUID();
  const feedbackItem = {
    id: feedbackId,
    userHash: req.userHash,
    timestamp: new Date().toISOString(),
    solved_problem: !!solved_problem,
    building,
    goal_description: goal_description || '',
    missing_feature: missing_feature || '',
    reuse_likelihood: parseInt(reuse_likelihood, 10)
  };

  feedbackList.push(feedbackItem);
  await saveFeedback(feedbackList);

  // Track event
  await trackEvent('feedback_submitted', req.userHash, req.sessionId, {
    feedbackId,
    solved_problem: !!solved_problem,
    building,
    reuse_likelihood: parseInt(reuse_likelihood, 10)
  });

  res.json({ success: true, feedbackId });
});

// Check if user has submitted feedback
feedbackRouter.get('/api/feedback/check', async (req, res) => {
  const feedbackList = await loadFeedback();
  const alreadySubmitted = feedbackList.some(item => item.userHash === req.userHash);
  res.json({ alreadySubmitted });
});

export default feedbackRouter;
