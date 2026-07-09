// Client-side Event tracking helper
async function trackClientEvent(eventType, metadata = {}) {
  try {
    await fetch('/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, metadata })
    });
  } catch (e) {
    console.error('Event tracking failed:', e);
  }
}

// Animate values
function animateHeroCounter(id, targetVal) {
  const el = document.getElementById(id);
  if (!el) return;
  
  let isPercentage = false;
  let numericTarget = targetVal;
  if (typeof targetVal === 'string' && targetVal.endsWith('%')) {
    isPercentage = true;
    numericTarget = parseInt(targetVal) || 0;
  }
  
  let current = 0;
  const duration = 1200;
  const step = numericTarget / (duration / 16);
  
  function tick() {
    current += step;
    if (current >= numericTarget) {
      el.textContent = isPercentage ? `${Math.round(numericTarget)}%` : Math.round(numericTarget).toLocaleString();
      return;
    }
    el.textContent = isPercentage ? `${Math.round(current)}%` : Math.round(current).toLocaleString();
    requestAnimationFrame(tick);
  }
  tick();
}

async function loadHeroAnalytics() {
  try {
    const res = await fetch('/analytics');
    const data = await res.json();
    animateHeroCounter('statUsers', data.users.total_unique || 0);
    animateHeroCounter('statWorkflows', data.workflows.started || 0);
    animateHeroCounter('statUrls', data.scrapes.total_urls || 0);
    animateHeroCounter('statSuccess', `${data.workflows.success_rate || 0}%`);
  } catch (e) {
    console.error('Failed to load hero analytics:', e);
  }
}

document.addEventListener('DOMContentLoaded', loadHeroAnalytics);

function setPrompt(text) {
  document.getElementById('prompt').value = text;
}

// JSON syntax highlighter
function syntaxHighlightJson(jsonObj) {
  let json = JSON.stringify(jsonObj, null, 2);
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

// Simple Markdown table and basic tags parser
function markdownToHtml(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  let result = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.match(/^\|[\s\-:|]+\|$/)) {
        continue;
      }
      inTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      continue;
    } else {
      if (inTable) {
        let tableHtml = '<table>';
        tableRows.forEach((row, rIdx) => {
          tableHtml += '<tr>';
          row.forEach(cell => {
            let cellContent = cell
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/&lt;br&gt;/g, '<br>')
              .replace(/&lt;br\s*\/&gt;/g, '<br>');
            if (rIdx === 0) {
              tableHtml += '<th>' + cellContent + '</th>';
            } else {
              tableHtml += '<td>' + cellContent + '</td>';
            }
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</table>';
        result.push(tableHtml);
        tableRows = [];
        inTable = false;
      }
    }

    line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');

    if (line.startsWith('### ')) {
      result.push('<h3 style="margin-top:16px; margin-bottom:8px; font-family:\'Space Grotesk\', sans-serif;">' + line.substring(4) + '</h3>');
    } else if (line.startsWith('## ')) {
      result.push('<h2 style="margin-top:20px; margin-bottom:10px; font-family:\'Space Grotesk\', sans-serif;">' + line.substring(3) + '</h2>');
    } else if (line.startsWith('# ')) {
      result.push('<h1 style="margin-top:24px; margin-bottom:12px; font-family:\'Space Grotesk\', sans-serif;">' + line.substring(2) + '</h1>');
    } else if (line.startsWith('- ')) {
      result.push('<li style="margin-left:20px; margin-bottom:4px;">' + line.substring(2) + '</li>');
    } else if (line === '---') {
      result.push('<hr style="border:0; height:1px; background:#1E1E2E; margin:16px 0;">');
    } else if (line.length > 0) {
      result.push('<p style="margin-bottom:8px;">' + line + '</p>');
    } else {
      result.push('<br>');
    }
  }

  if (inTable) {
    let tableHtml = '<table>';
    tableRows.forEach((row, rIdx) => {
      tableHtml += '<tr>';
      row.forEach(cell => {
        let cellContent = cell
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/&lt;br&gt;/g, '<br>')
          .replace(/&lt;br\s*\/&gt;/g, '<br>');
        if (rIdx === 0) {
          tableHtml += '<th>' + cellContent + '</th>';
        } else {
          tableHtml += '<td>' + cellContent + '</td>';
        }
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table>';
    result.push(tableHtml);
  }

  return result.join('\n');
}

document.getElementById('scrapeForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('status');
  const progressCard = document.getElementById('progressCard');
  const progressBar = document.getElementById('progressBar');
  const urlList = document.getElementById('urlList');
  const jsonOutputCard = document.getElementById('jsonOutputCard');
  const textOutputCard = document.getElementById('textOutputCard');
  const output = document.getElementById('output');
  const outputText = document.getElementById('outputText');
  const limitError = document.getElementById('limitError');

  const urlsRaw = document.getElementById('urls').value.trim();
  const promptRaw = document.getElementById('prompt').value.trim();
  const format = document.querySelector('input[name="format"]:checked').value;
  const compare = document.getElementById('compareMode').checked;

  limitError.style.display = 'none';
  if (!urlsRaw) { status.textContent = 'Error: Enter at least one URL.'; progressCard.style.display = 'block'; return; }
  if (!promptRaw) { status.textContent = 'Error: Enter an extraction prompt.'; progressCard.style.display = 'block'; return; }

  const urls = urlsRaw.split('\n').map(u => u.trim()).filter(u => u.length > 0);

  if (urls.length > 5) {
    limitError.innerHTML = 'Free tier is limited to 5 URLs. You submitted ' + urls.length + ' URLs.<br>Need more? Email <a href="mailto:patilharsh310708@gmail.com">patilharsh310708@gmail.com</a> to unlock.';
    limitError.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.classList.add('pulse-active');
  jsonOutputCard.style.display = 'none';
  textOutputCard.style.display = 'none';
  urlList.innerHTML = '';
  urls.forEach((url, i) => {
    urlList.innerHTML += '<div class="url-item" id="url-' + i + '"><span class="status-icon spinning" id="icon-' + i + '" style="color:#6366F1; margin-right:8px; font-weight:bold;">⟳</span><span class="url-text">' + url + '</span></div>';
  });

  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = 'Connecting to stream...';

  try {
    const res = await fetch('/scrape-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, prompt: promptRaw, format, compare })
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr = {};
      try { parsedErr = JSON.parse(errText); } catch(e) {}
      throw new Error(parsedErr.error || 'Server returned status ' + res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    status.textContent = 'Scraping URL 0 of ' + urls.length + '...';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          try {
            const eventData = JSON.parse(jsonStr);
            if (eventData.type === 'progress') {
              const completed = eventData.completed;
              const total = eventData.total;
              const currentUrl = eventData.current_url;
              const success = eventData.result.success;

              const pct = (completed / total) * 100;
              progressBar.style.width = pct + '%';
              status.textContent = 'Scraping URL ' + completed + ' of ' + total + '...';

              const idx = urls.indexOf(currentUrl);
              if (idx !== -1) {
                const icon = document.getElementById('icon-' + idx);
                if (icon) {
                  icon.className = 'status-icon';
                  if (success) {
                    icon.style.color = '#22C55E';
                    icon.innerHTML = '✓';
                  } else {
                    icon.style.color = '#EF4444';
                    icon.innerHTML = '✗';
                  }
                }
              }
            } else if (eventData.type === 'done') {
              progressBar.style.width = '100%';
              status.textContent = 'Done — ' + eventData.succeeded + ' succeeded, ' + eventData.failed_count + ' failed. State ID: ' + eventData.state_id;

              // Retrieve final state data
              const resultsRes = await fetch('/scrape/' + eventData.state_id);
              const resultsData = await resultsRes.json();

              if (resultsData.format === 'text') {
                let formattedText = '';
                resultsData.results.forEach((r, idx) => {
                  if (resultsData.compare) {
                    formattedText += '=== Combined Comparison ===\n\n' + r.data + '\n\n';
                  } else {
                    formattedText += '=== URL: ' + r.url + ' ===\n\n' + r.data + '\n\n';
                  }
                });
                if (resultsData.failed.length > 0) {
                  formattedText += '=== Failed URLs ===\n';
                  resultsData.failed.forEach(f => {
                    formattedText += '- ' + f.url + ' (Reason: ' + f.reason + ')\n';
                  });
                }
                outputText.innerHTML = markdownToHtml(formattedText.trim());
                textOutputCard.style.display = 'block';
              } else {
                output.innerHTML = syntaxHighlightJson(resultsData);
                jsonOutputCard.style.display = 'block';
              }
            }
          } catch(e) {
            console.error('Failed to parse event line:', line, e);
          }
        }
      }
    }
  } catch(err) {
    status.textContent = 'Request failed: ' + err.message;
    progressBar.style.width = '0%';
  } finally {
    btn.disabled = false;
    btn.classList.remove('pulse-active');
  }
});

// ═══════════════════════════════════
// Tab Switching
// ═══════════════════════════════════
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
  document.getElementById(tabName + 'Tab').classList.add('active');
}

// ═══════════════════════════════════
// Workflow Logic
// ═══════════════════════════════════
let workflowPollingInterval = null;
let currentWorkflowData = null;

async function runWorkflow() {
  var goal = document.getElementById('wfGoal').value.trim();
  var depth = parseInt(document.getElementById('wfDepth').value);
  var btn = document.getElementById('wfSubmitBtn');
  var progressCard = document.getElementById('wfProgressCard');
  var resultCard = document.getElementById('wfResultCard');
  var errorCard = document.getElementById('wfErrorCard');

  if (!goal) {
    alert('Please enter a goal for the workflow.');
    return;
  }

  btn.disabled = true;
  btn.classList.add('pulse-active');
  progressCard.style.display = 'block';
  resultCard.style.display = 'none';
  errorCard.style.display = 'none';
  currentWorkflowData = null;

  // Reset all steps
  for (var i = 1; i <= 4; i++) {
    document.getElementById('wfStep' + i).className = 'wf-step';
    document.getElementById('wfStep' + i + 'Status').textContent = '';
  }
  document.getElementById('wfStats').style.display = 'none';
  document.getElementById('wfUrlsDiscovered').textContent = 'URLs discovered: 0';
  document.getElementById('wfUrlsScraped').textContent = 'URLs scraped: 0';

  var format = document.querySelector('input[name="wfformat"]:checked').value;

  try {
    var res = await fetch('/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goal, depth: depth, format: format })
    });

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Failed to start workflow');
    }

    var data = await res.json();
    // Mark step 1 as active immediately
    document.getElementById('wfStep1').className = 'wf-step active';
    startWorkflowPolling(data.workflow_id);

  } catch(err) {
    errorCard.style.display = 'block';
    document.getElementById('wfErrorOutput').textContent = err.message;
    btn.disabled = false;
    btn.classList.remove('pulse-active');
  }
}

function startWorkflowPolling(workflowId) {
  if (workflowPollingInterval) {
    clearInterval(workflowPollingInterval);
  }
  workflowPollingInterval = setInterval(async function() {
    try {
      var res = await fetch('/workflow/' + workflowId);
      if (!res.ok) return;
      var data = await res.json();
      currentWorkflowData = data;

      updateWorkflowSteps(data);

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(workflowPollingInterval);
        workflowPollingInterval = null;
        document.getElementById('wfSubmitBtn').disabled = false;
        document.getElementById('wfSubmitBtn').classList.remove('pulse-active');

        if (data.status === 'completed') {
          showWorkflowResults(data);
          // Trigger YC Product Learning survey modal
          setTimeout(function() {
            if (typeof triggerFeedbackModal === 'function') {
              triggerFeedbackModal(data.goal);
            }
          }, 2000);
        } else {
          var errorCard = document.getElementById('wfErrorCard');
          errorCard.style.display = 'block';
          var failReasons = (data.failed || []).map(function(f) {
            return (f.step ? 'Step ' + f.step + ': ' : '') + f.reason;
          }).join('\n');
          document.getElementById('wfErrorOutput').textContent = failReasons || 'Workflow failed. Please try a more specific goal.';
        }
      }
    } catch(e) {
      console.error('Workflow polling error:', e);
    }
  }, 3000);
}

function updateWorkflowSteps(data) {
  for (var i = 1; i <= 4; i++) {
    var step = document.getElementById('wfStep' + i);
    var statusEl = document.getElementById('wfStep' + i + 'Status');
    if (data.steps_completed && data.steps_completed.indexOf(i) !== -1) {
      step.className = 'wf-step completed';
      statusEl.textContent = '✓ Done';
    } else if (data.current_step === i && data.status === 'processing') {
      step.className = 'wf-step active';
      statusEl.textContent = '⟳ Running...';
      statusEl.style.color = '#6366F1';
    } else if (data.status === 'failed' && data.current_step === i) {
      step.className = 'wf-step failed';
      statusEl.textContent = '✗ Failed';
      statusEl.style.color = '#EF4444';
    } else {
      step.className = 'wf-step';
      statusEl.textContent = '';
    }
  }

  var stats = document.getElementById('wfStats');
  stats.style.display = 'flex';
  document.getElementById('wfUrlsDiscovered').textContent = 'URLs discovered: ' + (data.urls_discovered || 0);
  document.getElementById('wfUrlsScraped').textContent = 'URLs scraped: ' + (data.urls_scraped || 0);
}

function showWorkflowResults(data) {
  var resultCard = document.getElementById('wfResultCard');
  resultCard.style.display = 'block';

  var summary = document.getElementById('wfResultSummary');
  summary.innerHTML = '<span style="color:#22C55E;">✓ Completed</span> — ' +
    (data.urls_scraped || 0) + ' URLs scraped, ' +
    (data.results ? data.results.length : 0) + ' results extracted';

  var outputEl = document.getElementById('wfResultOutput');
  if (data.format === 'text') {
    outputEl.style.fontFamily = "'Inter', sans-serif";
    outputEl.style.lineHeight = "1.6";
    var compiledText = '';
    (data.results || []).forEach(function(r) {
      compiledText += '### URL: ' + r.url + '\n\n' + r.text + '\n\n---\n\n';
    });
    outputEl.innerHTML = markdownToHtml(compiledText.trim());
  } else {
    outputEl.style.fontFamily = "'JetBrains Mono', monospace";
    outputEl.style.lineHeight = "1.5";
    outputEl.innerHTML = syntaxHighlightJson(data);
  }
}

function downloadWorkflowJson() {
  if (!currentWorkflowData) return;
  trackClientEvent('json_downloaded', { workflowId: currentWorkflowData.workflow_id }).catch(console.error);
  var jsonStr = JSON.stringify(currentWorkflowData, null, 2);
  var blob = new Blob([jsonStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'workflow_' + currentWorkflowData.workflow_id + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
