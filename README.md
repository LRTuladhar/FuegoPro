# FuegoPro

Early retirement planning app with Monte Carlo simulation.

## Running the App

You need two terminals — one for the backend, one for the frontend.

### Terminal 1 — Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 9000
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## First-Time Setup

Only needed once after cloning.

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```
