# SkillBridge — AI Career Navigator MVP

SkillBridge is an AI-powered Career Navigator designed specifically for Tier-2 and Tier-3 college students (SDG 8: Decent Work & Economic Growth). It guides students to bridge the gap between their current skills and industry-standard job roles.

## Core Features
1. **Resume & Skills Ingestion**: Supports uploading PDF/TXT resumes or pasting raw text. Extracts skills, projects, and experience level using Claude 3.5 Sonnet.
2. **Skill-Gap Analysis (RAG)**: Retrieves target role job requirements from a local vector store (`ChromaDB`) using a local embedding model, compares it with the user's profile, and visualizes matched, missing, and partial skills alongside a match percentage gauge.
3. **Personalized Learning Path**: Generates a step-by-step roadmap timeline showing estimated study time, reasons why skills matter, and curated free learning resources.
4. **Mock Interview Agent**: A stateless turn-based mock technical interview. Includes immediate response feedback and ends with a complete markdown scorecard of strengths, weaknesses, and actionable tips.

---

## Directory Structure
```text
/home/kamalesh/ID-RDP/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI routes & setup
│   │   ├── llm.py         # Claude wrapper & parsing utilities
│   │   ├── db.py          # ChromaDB RAG helper
│   │   └── schemas.py     # Pydantic schemas
│   ├── data/
│   │   └── job_roles.json # Curated job dataset (8 seed roles)
│   ├── tests/
│   │   └── test_api.py    # Pytest unit tests (mocked LLM)
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Single-page UI with tabs and states
│   │   ├── main.jsx       # React DOM entrypoint
│   │   └── index.css      # Custom styling, glassmorphism & gradients
│   ├── index.html         # Google Fonts links & HTML head
│   ├── tailwind.config.js # Tailwind CSS configuration
│   ├── postcss.config.js  # PostCSS config
│   ├── vite.config.js     # Vite dev-server config
│   └── package.json       # Frontend dependencies & scripts
├── run_dev.sh             # Combined single-command script to start app
├── DECISIONS.md           # Architect decisions & shortcuts taken
└── TEST_RUN_LOG.md        # Test logs & simulated E2E walkthroughs
```

---

## Setup & Running Guide

### Environment Variables
You must set your Anthropic Claude API Key before starting the servers. You can do this in two ways:

#### Option 1: Using the `.env` file (Recommended)
Add your key inside the [backend/.env](file:///home/kamalesh/ID-RDP/backend/.env) file:
```env
ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

#### Option 2: Export in your terminal shell
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

### Option A: Running with the Unified Script (Recommended)
You can start both servers simultaneously with the included script:
```bash
chmod +x run_dev.sh
./run_dev.sh
```

### Option B: Running Manually in Two Terminals

#### Terminal 1: Python FastAPI Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*The backend API will run on [http://localhost:8000](http://localhost:8000)*.

#### Terminal 2: React Frontend Client
```bash
cd frontend
npm install
npm run dev
```
*The frontend interface will open on [http://localhost:5173](http://localhost:5173)*.

---

## Running Backend Unit Tests
Make sure the virtual environment is active:
```bash
cd backend
source venv/bin/activate
pytest -v tests/
```
The tests mock the Anthropic Claude API calls automatically so that no API credits are consumed.
# SkillBridge-AI-Career-Navigator-
