#!/bin/bash

# SkillBridge Unified Dev Service Runner

# Colors for logging
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting SkillBridge Setup & Initialization ===${NC}"

# Check for ANTHROPIC_API_KEY and load from backend/.env if available
if [ -z "$ANTHROPIC_API_KEY" ]; then
    if [ -f "backend/.env" ]; then
        export $(grep -v '^#' backend/.env | xargs)
    fi
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${RED}WARNING: ANTHROPIC_API_KEY environment variable is not set.${NC}"
    echo -e "${RED}Please export ANTHROPIC_API_KEY or configure it in backend/.env before launching.${NC}"
fi

# Trap to kill both background jobs on exit
cleanup() {
    echo -e "\n${BLUE}=== Stopping Services ===${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Setup Backend
echo -e "${GREEN}[1/4] Preparing Backend Virtual Environment...${NC}"
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

echo -e "${GREEN}[2/4] Installing Backend Dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${GREEN}[3/4] Starting FastAPI backend on http://localhost:8000...${NC}"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

cd ..

# 2. Setup Frontend
echo -e "${GREEN}[4/4] Starting Frontend Setup...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${GREEN}Installing Node dependencies (this may take a minute)...${NC}"
    npm install
fi

echo -e "${GREEN}Starting Vite Frontend on http://localhost:5173...${NC}"
npm run dev &
FRONTEND_PID=$!

cd ..

# Wait for background processes
wait
