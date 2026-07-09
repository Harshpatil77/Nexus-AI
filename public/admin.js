// Global Chart instances to allow updates
let dailyChartInstance = null;
let successChartInstance = null;
let errorChartInstance = null;

// Animate numbers
function animateValue(id, start, end, duration) {
  if (start === end) return;
  const range = end - start;
  let current = start;
  const increment = end > start ? 1 : -1;
  const stepTime = Math.abs(Math.floor(duration / range));
  const obj = document.getElementById(id);
  
  if (stepTime < 10) {
    // Too fast, use requestAnimationFrame
    const startTime = performance.now();
    function update(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const val = Math.floor(progress * range + start);
      obj.innerHTML = val.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        obj.innerHTML = end.toLocaleString();
      }
    }
    requestAnimationFrame(update);
  } else {
    const timer = setInterval(() => {
      current += increment;
      obj.innerHTML = current.toLocaleString();
      if (current == end) {
        clearInterval(timer);
      }
    }, stepTime);
  }
}

// Fetch all dashboard data
async function fetchDashboardData() {
  try {
    // Parallel fetch endpoints
    const [
      summaryRes,
      founderRes,
      feedbackRes,
      errorsRes
    ] = await Promise.all([
      fetch('/analytics'),
      fetch('/analytics/founder-report'),
      fetch('/analytics/feedback'),
      fetch('/analytics/errors')
    ]);

    const summary = await summaryRes.json();
    const founder = await founderRes.json();
    const feedback = await feedbackRes.json();
    const errors = await errorsRes.json();

    // Populate Overview Card metrics
    const userVal = summary.users.total_unique || 0;
    const currentUsers = parseInt(document.getElementById('metricUsers').innerText) || 0;
    document.getElementById('metricUsers').innerText = userVal;
    document.getElementById('metricDAU').innerText = `DAU: ${summary.users.dau || 0} | WAU: ${summary.users.wau || 0}`;

    document.getElementById('metricSuccess').innerText = `${summary.workflows.success_rate || 0}%`;
    document.getElementById('metricSuccessCount').innerText = `Started: ${summary.workflows.started || 0} | Success: ${summary.workflows.completed || 0}`;

    document.getElementById('metricDuration').innerText = `${summary.workflows.avg_duration_s || 0}s`;
    document.getElementById('metricUrlsDiscovered').innerText = `Avg Scrapes: ${summary.workflows.avg_urls_scraped || 0} URLs`;

    document.getElementById('metricReturning').innerText = `${summary.users.returning_pct || 0}%`;
    document.getElementById('metricAvgSession').innerText = `Avg Session: ${summary.users.avg_session_duration_s || 0}s`;

    // Populate YC Metrics
    document.getElementById('ycActivation').innerText = `${summary.yc_metrics.activation_rate || 0}%`;
    document.getElementById('ycNPS').innerText = summary.yc_metrics.nps || 0;
    document.getElementById('ycPowerUsers').innerText = summary.yc_metrics.power_users || 0;
    document.getElementById('ycSatisfaction').innerText = `${summary.yc_metrics.avg_satisfaction || 0}/5`;

    // Executive Report Summary
    document.getElementById('founderExecutiveSummary').innerText = founder.executive_summary || 'No data reported yet.';

    // Top Lists
    renderRankedList('goalsList', summary.top_goals, 'goal');
    renderRankedList('domainsList', summary.top_domains, 'domain');

    // Render Insights list
    const insightsContainer = document.getElementById('insightsList');
    insightsContainer.innerHTML = '';
    if (summary.insights && summary.insights.length > 0) {
      summary.insights.forEach(insight => {
        const div = document.createElement('div');
        div.className = 'insight-item';
        div.innerText = insight;
        insightsContainer.appendChild(div);
      });
    } else {
      insightsContainer.innerHTML = '<p class="loading">No insights generated yet. Run more workflows!</p>';
    }

    // Render Feedback
    const feedbackContainer = document.getElementById('feedbackList');
    feedbackContainer.innerHTML = '';
    if (feedback && feedback.length > 0) {
      // Show latest first
      feedback.slice().reverse().forEach(f => {
        const item = document.createElement('div');
        item.className = 'feedback-item';
        item.innerHTML = `
          <div class="feedback-meta">
            <span class="feedback-solved ${f.solved_problem ? 'feedback-solved' : 'feedback-failed'}">
              ${f.solved_problem ? '👍 Solved Problem' : '👎 Did Not Solve'}
            </span>
            <span class="feedback-building">${escapeHtml(f.building)}</span>
          </div>
          <div class="feedback-text"><strong>Goal:</strong> ${escapeHtml(f.goal_description || 'N/A')}</div>
          ${f.missing_feature ? `<div class="feedback-expect"><strong>Friction point:</strong> ${escapeHtml(f.missing_feature)}</div>` : ''}
          <div class="feedback-score">Likelihood to reuse: ${'★'.repeat(f.reuse_likelihood)}${'☆'.repeat(5 - f.reuse_likelihood)}</div>
        `;
        feedbackContainer.appendChild(item);
      });
    } else {
      feedbackContainer.innerHTML = '<p class="loading">No customer feedback responses received yet.</p>';
    }

    // Render System Errors
    const errorsContainer = document.getElementById('errorsList');
    errorsContainer.innerHTML = '';
    if (errors.errors && errors.errors.length > 0) {
      errors.errors.forEach(err => {
        const item = document.createElement('div');
        item.className = 'error-item';
        item.innerHTML = `
          <div class="error-meta">
            <span>${err.type === 'workflow_failed' ? '🤖 Workflow' : '🔍 Scrape'} Error</span>
            <span>${new Date(err.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="error-title">${escapeHtml(err.error)}</div>
          <div class="error-domain">Domain: ${escapeHtml(err.domain)}</div>
        `;
        errorsContainer.appendChild(item);
      });
    } else {
      errorsContainer.innerHTML = '<p class="loading">No failures logged. High five! 🚀</p>';
    }

    // Render Charts
    renderCharts(summary);

  } catch (err) {
    console.error('Error fetching dashboard summary:', err);
  }
}

// Render Ranked Lists
function renderRankedList(elementId, items, keyName) {
  const container = document.getElementById(elementId);
  container.innerHTML = '';
  if (items && items.length > 0) {
    items.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="rank-text" title="${escapeHtml(item[keyName])}">${escapeHtml(item[keyName])}</span>
        <span class="rank-count">${item.count} run${item.count > 1 ? 's' : ''}</span>
      `;
      container.appendChild(li);
    });
  } else {
    container.innerHTML = '<li class="loading">No records found yet.</li>';
  }
}

// Render/Update Chart.js charts
function renderCharts(summary) {
  // Chart 1: Daily Platform Activity Line Chart
  const dailyData = summary.daily || {};
  const dates = Object.keys(dailyData).sort();
  const visits = dates.map(d => dailyData[d].visits || 0);
  const scrapes = dates.map(d => dailyData[d].scrapes || 0);
  const workflows = dates.map(d => dailyData[d].workflows || 0);

  const ctxDaily = document.getElementById('dailyChart').getContext('2d');
  
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(ctxDaily, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDate(d)),
      datasets: [
        {
          label: 'Page Visits',
          data: visits,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Scrapes',
          data: scrapes,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Workflows',
          data: workflows,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'Inter' } } }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748B' } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748B', stepSize: 1 } }
      }
    }
  });

  // Chart 2: Success Rate Doughnut
  const ctxSuccess = document.getElementById('successChart').getContext('2d');
  if (successChartInstance) successChartInstance.destroy();
  successChartInstance = new Chart(ctxSuccess, {
    type: 'doughnut',
    data: {
      labels: ['Successful', 'Failed'],
      datasets: [{
        data: [summary.workflows.completed || 0, summary.workflows.failed || 0],
        backgroundColor: ['#10B981', '#EF4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94A3B8' } }
      }
    }
  });

  // Chart 3: Error Breakdown Bar Chart
  const errorData = summary.top_errors || [];
  const errorLabels = errorData.map(e => e.reason.substring(0, 15) + (e.reason.length > 15 ? '..' : ''));
  const errorCounts = errorData.map(e => e.count);

  const ctxError = document.getElementById('errorChart').getContext('2d');
  if (errorChartInstance) errorChartInstance.destroy();
  errorChartInstance = new Chart(ctxError, {
    type: 'bar',
    data: {
      labels: errorLabels.length ? errorLabels : ['None'],
      datasets: [{
        label: 'Failure Count',
        data: errorCounts.length ? errorCounts : [0],
        backgroundColor: '#EF4444',
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748B', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748B', stepSize: 1 } }
      }
    }
  });
}

// Utility formatting helpers
function formatDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(parts[1], 10) - 1]} ${parts[2]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Init Dashboard
document.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  // Poll statistics every 30 seconds for live updates
  setInterval(fetchDashboardData, 30000);
});
