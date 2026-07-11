import express from 'express';
import dotenv from 'dotenv';
import { analyticsMiddleware, analyticsRouter, ensureDataFiles } from '../analytics/analytics.js';
import feedbackRouter from '../analytics/feedback.js';
import dashboardRouter, { adminAuth } from '../analytics/dashboard.js';
import scrapeRouter from './routes/scrape.js';
import systemRouter from './routes/system.js';
import workflowRouter from './routes/workflow.js';

dotenv.config();
await ensureDataFiles();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/admin.html', (req, res) => res.status(404).send('Not found'));
app.use(express.static('public'));
app.use(analyticsMiddleware);
app.use(systemRouter);
app.use(scrapeRouter);
app.use(workflowRouter);
app.use('/analytics', adminAuth, analyticsRouter);
app.use(feedbackRouter);
app.use(dashboardRouter);

app.listen(PORT, () => console.log(`Nexus AI API server running on port ${PORT}`));
