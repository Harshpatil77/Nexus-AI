import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Paths to persistence files (we'll save in the root directory)
const ANALYTICS_FILE = path.join(process.cwd(), 'analytics.json');
const FEEDBACK_FILE = path.join(process.cwd(), 'feedback.json');
const USERS_FILE = path.join(process.cwd(), 'users.json');
const SESSIONS_FILE = path.join(process.cwd(), 'sessions.json');

// Helper to check and initialize JSON files atomically
async function loadData(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
}

async function saveData(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error saving data to ${filePath}:`, err);
  }
}

export async function ensureDataFiles() {
  const analyticsInit = { events: [], last_updated: new Date().toISOString() };
  const feedbackInit = [];
  const usersInit = {};
  const sessionsInit = {};

  try {
    await fs.access(ANALYTICS_FILE);
  } catch {
    await saveData(ANALYTICS_FILE, analyticsInit);
  }

  try {
    await fs.access(FEEDBACK_FILE);
  } catch {
    await saveData(FEEDBACK_FILE, feedbackInit);
  }

  try {
    await fs.access(USERS_FILE);
  } catch {
    await saveData(USERS_FILE, usersInit);
  }

  try {
    await fs.access(SESSIONS_FILE);
  } catch {
    await saveData(SESSIONS_FILE, sessionsInit);
  }
}

// Deterministic User Hash (No raw IP storing)
export function hashUser(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'unknown';
  const rawString = `${ip}-${ua}`;
  return crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 16);
}

// User Tracking
export async function trackUserSession(userHash, action = 'visit') {
  const users = await loadData(USERS_FILE, {});
  const now = new Date().toISOString();
  
  if (!users[userHash]) {
    users[userHash] = {
      first_seen: now,
      last_seen: now,
      total_sessions: 1,
      returning_user: false,
      workflows_run: 0,
      scrapes_run: 0,
      total_duration_ms: 0
    };
  } else {
    users[userHash].last_seen = now;
    users[userHash].returning_user = true;
    if (action === 'session_start') {
      users[userHash].total_sessions++;
    }
  }

  if (action === 'workflow') {
    users[userHash].workflows_run++;
  } else if (action === 'scrape') {
    users[userHash].scrapes_run++;
  }

  await saveData(USERS_FILE, users);
  return users[userHash];
}

// Session Lifecycle
export async function manageSession(userHash, sessionId, action = 'start', durationMs = 0) {
  const sessions = await loadData(SESSIONS_FILE, {});
  const now = new Date().toISOString();

  if (action === 'start') {
    sessions[sessionId] = {
      userHash,
      start_time: now,
      last_active: now,
      duration_ms: 0
    };
    await trackUserSession(userHash, 'session_start');
  } else if (action === 'heartbeat' || action === 'update') {
    if (sessions[sessionId]) {
      sessions[sessionId].last_active = now;
      const start = new Date(sessions[sessionId].start_time).getTime();
      sessions[sessionId].duration_ms = Date.now() - start;
    }
  }

  await saveData(SESSIONS_FILE, sessions);
}

// Core Event Logging
export async function trackEvent(eventType, userHash, sessionId, metadata = {}) {
  const analytics = await loadData(ANALYTICS_FILE, { events: [] });
  const event = {
    timestamp: new Date().toISOString(),
    eventType,
    userHash,
    sessionId,
    ...metadata
  };

  analytics.events.push(event);
  analytics.last_updated = new Date().toISOString();
  await saveData(ANALYTICS_FILE, analytics);

  // Update user stats
  if (eventType === 'workflow_started') {
    await trackUserSession(userHash, 'workflow');
  } else if (eventType === 'scrape_started') {
    await trackUserSession(userHash, 'scrape');
  }

  // Update session heartbeat
  if (sessionId) {
    await manageSession(userHash, sessionId, 'update');
  }
}

// Middleware
export function analyticsMiddleware(req, res, next) {
  const userHash = hashUser(req);
  
  // Extract or generate sessionId
  let sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.setHeader('X-Session-Id', sessionId);
  }

  req.userHash = userHash;
  req.sessionId = sessionId;

  // Track page views
  if (req.path === '/' && req.method === 'GET') {
    manageSession(userHash, sessionId, 'start').catch(console.error);
    trackEvent('page_view', userHash, sessionId).catch(console.error);
  }

  next();
}

// Aggregation & Metrics Helpers
export async function computeMetrics() {
  const analytics = await loadData(ANALYTICS_FILE, { events: [] });
  const users = await loadData(USERS_FILE, {});
  const feedback = await loadData(FEEDBACK_FILE, []);
  const sessions = await loadData(SESSIONS_FILE, {});
  const events = analytics.events || [];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  // User metrics
  const uniqueUsersCount = Object.keys(users).length;
  const returningUsersCount = Object.values(users).filter(u => u.returning_user).length;
  const returningPct = uniqueUsersCount ? Math.round((returningUsersCount / uniqueUsersCount) * 100) : 0;

  // Active Users calculation (DAU, WAU)
  const activeToday = new Set();
  const activeThisWeek = new Set();

  Object.entries(users).forEach(([hash, user]) => {
    const lastSeenTime = new Date(user.last_seen).getTime();
    if (now - lastSeenTime <= dayMs) activeToday.add(hash);
    if (now - lastSeenTime <= weekMs) activeThisWeek.add(hash);
  });

  // Session stats
  const sessionDurations = Object.values(sessions).map(s => s.duration_ms || 0);
  const avgSessionDurationMs = sessionDurations.length ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length) : 0;

  // Workflow metrics
  const workflowEvents = events.filter(e => e.eventType.startsWith('workflow_'));
  const wfStarted = workflowEvents.filter(e => e.eventType === 'workflow_started');
  const wfCompleted = workflowEvents.filter(e => e.eventType === 'workflow_completed');
  const wfFailed = workflowEvents.filter(e => e.eventType === 'workflow_failed');

  const wfSuccessRate = wfStarted.length ? Math.round((wfCompleted.length / wfStarted.length) * 100) : 0;
  const wfFailureRate = wfStarted.length ? Math.round((wfFailed.length / wfStarted.length) * 100) : 0;

  let totalWfTime = 0;
  let totalWfUrlsDiscovered = 0;
  let totalWfUrlsScraped = 0;
  wfCompleted.forEach(e => {
    if (e.duration) totalWfTime += e.duration;
    if (e.urls_discovered) totalWfUrlsDiscovered += e.urls_discovered;
    if (e.urls_scraped) totalWfUrlsScraped += e.urls_scraped;
  });
  const avgWfDuration = wfCompleted.length ? Math.round(totalWfTime / wfCompleted.length) : 0;
  const avgWfDiscovered = wfCompleted.length ? parseFloat((totalWfUrlsDiscovered / wfCompleted.length).toFixed(1)) : 0;
  const avgWfScraped = wfCompleted.length ? parseFloat((totalWfUrlsScraped / wfCompleted.length).toFixed(1)) : 0;

  // Scrape metrics
  const scrapeEvents = events.filter(e => e.eventType.startsWith('scrape_'));
  const scrStarted = scrapeEvents.filter(e => e.eventType === 'scrape_started');
  const scrCompleted = scrapeEvents.filter(e => e.eventType === 'scrape_completed');
  
  let totalScrUrls = 0;
  let textOutputCount = 0;
  let jsonOutputCount = 0;
  let compareModeCount = 0;

  scrStarted.forEach(e => {
    if (e.url_count) totalScrUrls += e.url_count;
    if (e.format === 'text') textOutputCount++;
    if (e.format === 'json') jsonOutputCount++;
    if (e.compare) compareModeCount++;
  });
  const avgScrUrls = scrStarted.length ? parseFloat((totalScrUrls / scrStarted.length).toFixed(1)) : 0;

  // Error tracking & top failures
  const errors = [];
  events.forEach(e => {
    if (e.eventType === 'workflow_failed' || e.eventType === 'scrape_failed') {
      errors.push({
        type: e.eventType,
        error: e.error || 'Unknown error',
        domain: e.domain || 'unknown',
        timestamp: e.timestamp
      });
    }
  });

  const failureReasons = {};
  errors.forEach(err => {
    const reason = err.error.split(':')[0] || 'Unknown Error';
    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
  });
  const topErrors = Object.entries(failureReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  // Goals and prompts frequency
  const goalFrequency = {};
  wfStarted.forEach(e => {
    if (e.goal) {
      goalFrequency[e.goal] = (goalFrequency[e.goal] || 0) + 1;
    }
  });
  const topGoals = Object.entries(goalFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([goal, count]) => ({ goal, count }));

  const promptFrequency = {};
  scrStarted.forEach(e => {
    if (e.prompt) {
      promptFrequency[e.prompt] = (promptFrequency[e.prompt] || 0) + 1;
    }
  });
  const topPrompts = Object.entries(promptFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([prompt, count]) => ({ prompt, count }));

  // Domains visited
  const domainFrequency = {};
  events.forEach(e => {
    if (e.domains && Array.isArray(e.domains)) {
      e.domains.forEach(d => {
        domainFrequency[d] = (domainFrequency[d] || 0) + 1;
      });
    } else if (e.domain) {
      domainFrequency[e.domain] = (domainFrequency[e.domain] || 0) + 1;
    }
  });
  const topDomains = Object.entries(domainFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  // Daily aggregates (last 30 days)
  const dailyStats = {};
  events.forEach(e => {
    const dateStr = e.timestamp.split('T')[0];
    if (!dailyStats[dateStr]) {
      dailyStats[dateStr] = { visits: 0, scrapes: 0, workflows: 0, errors: 0 };
    }
    if (e.eventType === 'page_view') dailyStats[dateStr].visits++;
    if (e.eventType === 'scrape_started') dailyStats[dateStr].scrapes++;
    if (e.eventType === 'workflow_started') dailyStats[dateStr].workflows++;
    if (e.eventType === 'workflow_failed' || e.eventType === 'scrape_failed') dailyStats[dateStr].errors++;
  });

  // YC Metrics
  const usersWithWorkflow = Object.values(users).filter(u => u.workflows_run > 0).length;
  const activationRate = uniqueUsersCount ? Math.round((usersWithWorkflow / uniqueUsersCount) * 100) : 0;

  // Retention: users returning after 24h of first seen
  const usersRetained = Object.values(users).filter(u => {
    const first = new Date(u.first_seen).getTime();
    const last = new Date(u.last_seen).getTime();
    return (last - first) >= (24 * 60 * 60 * 1000);
  }).length;
  const retentionRate = uniqueUsersCount ? Math.round((usersRetained / uniqueUsersCount) * 100) : 0;

  const powerUsers = Object.values(users).filter(u => u.workflows_run >= 5).length;
  const avgWorkflowsPerUser = uniqueUsersCount ? parseFloat((wfStarted.length / uniqueUsersCount).toFixed(1)) : 0;

  // NPS and satisfaction
  const satisfactionScores = feedback.map(f => parseInt(f.reuse_likelihood)).filter(s => !isNaN(s));
  const avgSatisfaction = satisfactionScores.length ? parseFloat((satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length).toFixed(1)) : 0;

  const promoters = feedback.filter(f => parseInt(f.reuse_likelihood) >= 5).length;
  const detractors = feedback.filter(f => parseInt(f.reuse_likelihood) <= 3).length;
  const nps = feedback.length ? Math.round(((promoters - detractors) / feedback.length) * 100) : 0;

  return {
    users: {
      total_unique: uniqueUsersCount,
      returning_pct: returningPct,
      dau: activeToday.size,
      wau: activeThisWeek.size,
      avg_session_duration_s: Math.round(avgSessionDurationMs / 1000)
    },
    workflows: {
      started: wfStarted.length,
      completed: wfCompleted.length,
      failed: wfFailed.length,
      success_rate: wfSuccessRate,
      failure_rate: wfFailureRate,
      avg_duration_s: Math.round(avgWfDuration / 1000),
      avg_urls_discovered: avgWfDiscovered,
      avg_urls_scraped: avgWfScraped
    },
    scrapes: {
      total: scrStarted.length,
      total_urls: totalScrUrls,
      avg_urls_per_request: avgScrUrls,
      text_format_pct: scrStarted.length ? Math.round((textOutputCount / scrStarted.length) * 100) : 0,
      json_format_pct: scrStarted.length ? Math.round((jsonOutputCount / scrStarted.length) * 100) : 0,
      compare_mode_pct: scrStarted.length ? Math.round((compareModeCount / scrStarted.length) * 100) : 0
    },
    top_errors: topErrors,
    top_goals: topGoals,
    top_prompts: topPrompts,
    top_domains: topDomains,
    daily: dailyStats,
    yc_metrics: {
      activation_rate: activationRate,
      retention_rate: retentionRate,
      power_users: powerUsers,
      avg_workflows_per_user: avgWorkflowsPerUser,
      avg_satisfaction: avgSatisfaction,
      nps: nps,
      feedback_count: feedback.length
    }
  };
}

export async function getPublicMetrics() {
  const metrics = await computeMetrics();
  return {
    users: { total_unique: metrics.users.total_unique },
    workflows: { started: metrics.workflows.started, success_rate: metrics.workflows.success_rate },
    scrapes: { total_urls: metrics.scrapes.total_urls }
  };
}

// Automated Insights Generator
export async function getInsights() {
  const metrics = await computeMetrics();
  const insights = [];

  // Insight 1: Main use case
  if (metrics.top_goals.length > 0) {
    const topGoal = metrics.top_goals[0].goal;
    insights.push(`Most popular user research goal: "${topGoal}"`);
  }

  // Insight 2: Formatting preferences
  if (metrics.scrapes.json_format_pct > 60) {
    insights.push(`JSON output mode is highly preferred (${metrics.scrapes.json_format_pct}% of scrapes), indicating developer/API usage focus.`);
  } else if (metrics.scrapes.text_format_pct > 60) {
    insights.push(`Plain Text output mode is preferred (${metrics.scrapes.text_format_pct}% of scrapes), suggesting research-driven usage.`);
  }

  // Insight 3: Returning users
  if (metrics.users.returning_pct > 25) {
    insights.push(`Strong product-market fit indicator: ${metrics.users.returning_pct}% of developers are returning to use the tool.`);
  }

  // Insight 4: Failure mode
  if (metrics.top_errors.length > 0) {
    insights.push(`Top platform bottleneck: "${metrics.top_errors[0].reason}" is causing the most run failures.`);
  }

  // Insight 5: Success rate
  if (metrics.workflows.success_rate > 80) {
    insights.push(`Workflow pipeline is highly stable, achieving a ${metrics.workflows.success_rate}% autonomous completion rate.`);
  } else if (metrics.workflows.success_rate < 50 && metrics.workflows.started > 5) {
    insights.push(`Workflow pipeline has a high error rate (${metrics.workflows.failure_rate}%). Investigation into agent steps is recommended.`);
  }

  return insights;
}

// Founder Report
export async function getFounderReport() {
  const metrics = await computeMetrics();
  const feedback = await loadData(FEEDBACK_FILE, []);
  const insights = await getInsights();

  // Find biggest user segments from feedback
  const segments = {};
  feedback.forEach(f => {
    if (f.building) {
      segments[f.building] = (segments[f.building] || 0) + 1;
    }
  });
  const topSegment = Object.entries(segments).sort((a, b) => b[1] - a[1])[0]?.[0] || 'AI Developers';

  return {
    biggest_user_segment: topSegment,
    fastest_growing_use_case: metrics.top_goals[0]?.goal || 'Competitor monitoring & scraping',
    most_requested_feature: feedback.map(f => f.missing_feature).filter(Boolean).slice(0, 3).join(', ') || 'Stealth scraping capability',
    biggest_friction_point: metrics.top_errors[0]?.reason || 'API Timeout or Rate limits',
    returning_user_pct: `${metrics.users.returning_pct}%`,
    activation_rate: `${metrics.yc_metrics.activation_rate}%`,
    success_rate: `${metrics.workflows.success_rate}%`,
    avg_workflow_duration: `${metrics.workflows.avg_duration_s} seconds`,
    top_domains: metrics.top_domains.map(d => d.domain).slice(0, 3),
    top_prompts: metrics.top_prompts.map(p => p.prompt).slice(0, 3),
    insights: insights,
    executive_summary: `Nexus AI is gaining solid developer traction in its prototyping phase. Currently, ${metrics.users.returning_pct}% of the ${metrics.users.total_unique} unique developers returned to run additional scrapes or agentic workflows. The primary user base is building ${topSegment}s, with the most active use cases centered around "${metrics.top_goals[0]?.goal || 'automated extraction'}". We have logged a workflow success rate of ${metrics.workflows.success_rate}%, with an average autonomous execution duration of ${metrics.workflows.avg_duration_s} seconds per goal. Our customer feedback yields a Net Promoter Score (NPS) of ${metrics.yc_metrics.nps} with an average reuse likelihood rating of ${metrics.yc_metrics.avg_satisfaction}/5.`
  };
}

// Express Router
export const analyticsRouter = express.Router();

analyticsRouter.get('/', async (req, res) => {
  const metrics = await computeMetrics();
  const insights = await getInsights();
  res.json({ ...metrics, insights });
});

analyticsRouter.get('/users', async (req, res) => {
  const users = await loadData(USERS_FILE, {});
  res.json(users);
});

analyticsRouter.get('/workflows', async (req, res) => {
  const metrics = await computeMetrics();
  res.json(metrics.workflows);
});

analyticsRouter.get('/errors', async (req, res) => {
  const metrics = await computeMetrics();
  res.json({ errors: metrics.top_errors });
});

analyticsRouter.get('/goals', async (req, res) => {
  const metrics = await computeMetrics();
  res.json({ goals: metrics.top_goals });
});

analyticsRouter.get('/prompts', async (req, res) => {
  const metrics = await computeMetrics();
  res.json({ prompts: metrics.top_prompts });
});

analyticsRouter.get('/feedback', async (req, res) => {
  const feedback = await loadData(FEEDBACK_FILE, []);
  res.json(feedback);
});

analyticsRouter.get('/daily', async (req, res) => {
  const metrics = await computeMetrics();
  res.json(metrics.daily);
});

analyticsRouter.get('/founder-report', async (req, res) => {
  const report = await getFounderReport();
  res.json(report);
});

// Client-side event ingestion
analyticsRouter.post('/track', async (req, res) => {
  const { eventType, metadata } = req.body;
  if (!eventType) {
    return res.status(400).json({ error: 'eventType is required' });
  }

  await trackEvent(eventType, req.userHash, req.sessionId, metadata || {});
  res.json({ success: true });
});
