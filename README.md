# Sakkou Bot
A bot for Sakkou co-working space members and Guilan Incubation Center

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in your API keys
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs (Swagger): http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
python3 -m http.server 3000
```

Open: http://localhost:3000/
