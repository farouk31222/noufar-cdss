# NOUFAR CDSS

A full-stack clinical decision support system for doctors managing hyperthyroidism relapse prediction. Built with Node.js, Python/Flask, MongoDB, and a machine learning inference engine.

## What it does

**Doctor-facing application**
- Secure authentication with 2FA email verification
- Dashboard with prediction history and patient overview
- New prediction workflow with dataset upload and patient selection
- AI-powered relapse prediction with explainability outputs
- Account settings and notification management

**Admin console**
- Doctor registration approval workflow
- Doctor profile review and management
- Support inbox
- System monitoring

## Project Structure

```
noufar-cdss/
├── frontend/                    # Static HTML/CSS/JS application
│   ├── index.html               # Landing page
│   ├── dashboard.html           # Doctor dashboard
│   ├── new-prediction.html      # Prediction workflow
│   ├── dataset-selection.html   # Patient selection from uploaded data
│   ├── prediction-details.html  # Prediction results and explainability
│   ├── history.html             # Results history
│   ├── patients.html            # Patient directory
│   ├── account-settings.html    # Account & notification settings
│   ├── admin-doctor-management/ # Admin console
│   └── assets/                  # Images, icons, media
├── backend/                     # Node.js / Express API
│   └── src/
│       ├── routes/              # Auth, predictions, notifications, support
│       ├── controllers/
│       ├── models/              # MongoDB schemas
│       └── services/            # Email, JWT, etc.
├── ai-server/                   # Python / Flask ML inference server
│   ├── app.py
│   ├── model_registry.py
│   └── pipeline_components.py
├── scripts/                     # Model rebuild scripts
├── docker-compose.yml           # Run everything locally with Docker
├── Dockerfile.frontend          # nginx static server for local Docker
└── nginx.conf                   # nginx config with API proxy
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | Node.js, Express, MongoDB (Mongoose) |
| AI Server | Python, Flask, scikit-learn, TensorFlow |
| Database | MongoDB |
| Auth | JWT + 2FA email verification |
| Email | Nodemailer / SMTP |
| Local deployment | Docker Compose + nginx |
| Cloud deployment | Railway (backend + AI server) |

## Running Locally with Docker

See [SETUP-GUIDE.md](SETUP-GUIDE.md) for full step-by-step instructions.

**Quick start:**
```bash
# Clone the repo
git clone https://github.com/farouk31222/noufar-cdss.git
cd noufar-cdss

# Create and fill in your .env
cp backend/.env.example backend/.env
# (edit backend/.env with your values)

# Run everything
docker compose up --build
```

Then open: **http://localhost:8080**

| Service | URL |
|---------|-----|
| App | http://localhost:8080 |
| Backend API | http://localhost:5000 |
| AI Server 