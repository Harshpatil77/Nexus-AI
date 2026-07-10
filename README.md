<p align="center">
  <img src="https://img.shields.io/badge/Nexus_AI-v2.0.0-6366F1?style=for-the-badge&labelColor=0A0A0F" alt="Version" />
  <img src="https://img.shields.io/badge/Node.js-20+-22C55E?style=for-the-badge&logo=node.js&labelColor=0A0A0F" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-4.x-F8F8FF?style=for-the-badge&logo=express&labelColor=0A0A0F" alt="Express" />
  <img src="https://img.shields.io/badge/Railway-Deployed-6366F1?style=for-the-badge&logo=railway&labelColor=0A0A0F" alt="Railway" />
</p>

<h1 align="center">⚡ Nexus AI</h1>
<p align="center"><strong>The execution layer for autonomous AI agents.</strong></p>
<p align="center">
  Scrape any website and extract structured data using plain English prompts.<br/>
  No JSON schemas. No pipeline crashes. No hidden costs.
</p>

<p align="center">
  <a href="https://nexus-ai-production-4eb6.up.railway.app/">🌐 Live Demo</a> &nbsp;·&nbsp;
  <a href="#-api-reference">📖 API Docs</a> &nbsp;·&nbsp;
  <a href="#-quick-start">🚀 Quick Start</a>
</p>

---

## 🎯 What is Nexus AI?

Nexus AI is a production-ready web scraping + AI extraction API. Paste URLs, describe what you want in plain English, and get clean JSON or plain text back — powered by **Firecrawl** for scraping and **NVIDIA Nemotron 3 Ultra 550B** for intelligent extraction. Now with **autonomous multi-step Workflows** that discover, scrape, and extract data from a single plain English goal.

### How It Works

```
01  Paste URLs          →  Up to 5 websites in parallel
02  Describe in English →  "Extract pricing, company name, and contact email"
03  Get Results         →  Clean JSON or formatted plain text
```

---

## ✨ Features

| Feature | Description |
|---|---|
| **🔗 Multi-URL Scraping** | Scrape up to 5 URLs in a single request, all processed in parallel |
| **🤖 Autonomous Workflows** | Describe a goal in plain English — Nexus AI discovers URLs, scrapes them, follows links, and merges results automatically |
| **🧠 AI-Powered Extraction** | NVIDIA Nemotron 3 Ultra 550B extracts structured data from raw HTML using natural language prompts |
| **📡 Real-Time Streaming** | Server-Sent Events (SSE) endpoint streams live progress as each URL is scraped and parsed |
| **🔄 Auto-Retry Logic** | Failed scrapes automatically retry up to 3 times with a 2-second delay between attempts |
| **📊 Dual Output Formats** | Choose between syntax-highlighted JSON or clean plain text output |
| **🔀 Compare Mode** | Combine content from multiple URLs into a single extraction for side-by-side analysis |
| **💾 State Persistence** | Every scrape result is saved with a unique state ID for later retrieval |
| **🎨 Premium Dark UI** | Built-in frontend with tabbed navigation, Space Grotesk typography, gradient accents, and micro-animations |
| **⚡ Rate Limiting** | Free tier capped at 5 URLs per request (scraper) and 8 URLs per workflow |
| **🏥 Health Check** | `/health` endpoint for uptime monitoring and deployment verification |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (ES Modules) |
| **Framework** | Express 4.x |
| **Scraping** | [Firecrawl API](https://firecrawl.dev) |
| **AI Extraction** | [NVIDIA Nemotron 3 Ultra 550B](https://build.nvidia.com) via NVIDIA API |
| **Frontend** | Vanilla HTML/CSS/JS (served inline) |
| **Fonts** | Space Grotesk · Inter · JetBrains Mono |
| **Deployment** | [Railway](https://railway.app) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ installed
- **Firecrawl API key** — get one at [firecrawl.dev](https://firecrawl.dev)
- **NVIDIA API key** — get one at [build.nvidia.com](https://build.nvidia.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/Harshpatil77/Nexus-AI.git
cd Nexus-AI

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### Configuration

Edit `.env` with your API keys:

```env
PORT=3000
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
ANTHROPIC_API_KEY=your_nvidia_api_key_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose_a_long_unique_password
```

> **Note:** The `ANTHROPIC_API_KEY` variable is used to authenticate with the NVIDIA Nemotron API endpoint.

### Run

```bash
# Start the server
npm start

# Or use the dev script
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 API Reference

### `GET /health`

Health check endpoint for uptime monitoring.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1783074830324
}
```

---

### `POST /scrape`

Scrape URLs and extract structured data. Returns results after all URLs are processed.

**Request Body:**
```json
{
  "urls": [
    "https://example.com",
    "https://example2.com"
  ],
  "prompt": "Extract the company name, pricing, and contact email",
  "format": "json"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urls` | `string[]` | ✅ | Array of URLs to scrape (max 5) |
| `prompt` | `string` | ✅ | Plain English extraction instructions |
| `format` | `string` | ❌ | `"json"` or `"text"` (default: `"text"`) |

**Success Response (200):**
```json
{
  "state_id": "9cf20126-e4b3-4148-8671-588337fe3e15",
  "format": "json",
  "results": [
    {
      "url": "https://example.com",
      "data": {
        "company": "Example Corp",
        "pricing": "$99/mo",
        "email": "hello@example.com"
      }
    }
  ],
  "failed": [],
  "total": 1,
  "succeeded": 1,
  "failed_count": 0
}
```

**Rate Limit Error (400):**
```json
{
  "error": "Free tier is limited to 5 URLs per request.",
  "limit": 5,
  "submitted": 8
}
```

---

### `POST /scrape-stream`

Same as `/scrape` but streams progress in real-time via Server-Sent Events (SSE).

**Request Body:** Same as `POST /scrape`, with an optional `compare` boolean. Set `compare: true` to combine successful pages into one extraction.

**SSE Events:**

```
event: progress
data: {"url":"https://example.com","status":"scraping","index":0,"total":2}

event: progress
data: {"url":"https://example.com","status":"extracting","index":0,"total":2}

event: url_complete
data: {"url":"https://example.com","index":0,"data":{...}}

event: complete
data: {"state_id":"...","results":[...],"failed":[],"total":2,"succeeded":2}
```

---

### `GET /scrape/:state_id`

Retrieve a previously saved scrape result by its state ID.

**Response:** The saved JSON result object.

---

### `POST /workflow`

Start an autonomous multi-step workflow. Nexus AI discovers URLs, scrapes them, follows links, and merges results — all from a single plain English goal.

**Request Body:**
```json
{
  "goal": "Find all AI tools launched this week on ProductHunt, extract their names, pricing, and founding team",
  "depth": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `goal` | `string` | ✅ | Plain English description of what you want |
| `depth` | `number` | ❌ | Crawl depth: `1` (seed only) or `2` (follow links). Default: `2`, max: `2` |

**Response (201):**
```json
{
  "workflow_id": "3c850ccd-0402-4134-9fde-1a6aad5aaa82",
  "status": "processing",
  "goal": "Find all AI tools launched this week on ProductHunt..."
}
```

The workflow runs **asynchronously** in the background. Poll `GET /workflow/:id` to check progress.

**4-Step Execution Pipeline:**
```
Step 1  🔍  Discover seed URLs from your goal (via NVIDIA AI)
Step 2  🌐  Scrape all seed pages (via Firecrawl)
Step 3  🔗  Extract and scrape deep links found on seed pages
Step 4  🧹  Merge, deduplicate, and return structured results
```

---

### `GET /workflow/:workflow_id`

Check the status of a running or completed workflow.

**Response (200):**
```json
{
  "workflow_id": "3c850ccd-0402-4134-9fde-1a6aad5aaa82",
  "status": "completed",
  "goal": "Find all AI tools...",
  "current_step": 4,
  "steps_completed": [1, 2, 3, 4],
  "urls_discovered": 8,
  "urls_scraped": 8,
  "results": [{"name": "AI Tool", "pricing": "Free", "url": "..."}],
  "failed": [],
  "created_at": 1783506845041,
  "completed_at": 1783506845082
}
```

| Status | Meaning |
|---|---|
| `processing` | Workflow is still running |
| `completed` | All steps finished successfully |
| `failed` | Workflow encountered a fatal error |

---

## 🧪 Testing

Run the full integration test suite (uses mock API servers, no real API credits consumed):

```bash
node test_api.js
```

**Test coverage (10 tests):**
| Step | Verification |
|---|---|
| 1 | `GET /health` returns correct status |
| 2 | Input validation rejects bad requests |
| 3 | Successful multi-URL scrape and extraction |
| 4 | Retry logic (3 attempts) and partial failure handling |
| 5 | State file persistence and retrieval |
| 6 | `POST /workflow` returns 201 with workflow_id |
| 7 | `GET /workflow/:id` returns valid processing/completed status |
| 8 | Workflow completes all 4 steps end-to-end |
| 9 | Empty goal validation returns 400 |
| 10 | Depth clamping (max 2) works correctly |

---

## 🚢 Deployment

Nexus AI is deployed on **Railway** with automatic deploys from the `main` branch.

**Live URL:** [https://nexus-ai-production-4eb6.up.railway.app/](https://nexus-ai-production-4eb6.up.railway.app/)

### Deploy Your Own

1. Fork this repository
2. Connect to [Railway](https://railway.app)
3. Add environment variables (`FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`)
4. Deploy — Railway auto-detects Node.js and runs `npm start`

---

## 📁 Project Structure

```
Nexus-AI/
├── index.js          # Express server, API routes, and workflow logic
├── analytics/         # Analytics, feedback, and protected dashboard routes
├── public/            # Main UI, feedback UI, and dashboard assets
├── test_api.js        # Integration test suite with mock servers
├── package.json       # Dependencies and scripts
├── .env.example       # Environment variable template
├── .gitignore         # Git ignore rules
└── README.md          # You are here
```

---

## 📬 Contact

**Need higher rate limits or custom integrations?**

📧 [patilharsh310708@gmail.com](mailto:patilharsh310708@gmail.com)

---

<p align="center">
  Built with ⚡ by <a href="https://github.com/Harshpatil77">Harsh Patil</a>
</p>
