# NOUFAR CDSS — How to Run the Project with Docker

## 🖥️ For YOUR Computer (do this first, one time only)

### Step 1 — Push your code to GitHub
Open a terminal in your project folder and run:

```
cd "C:\Users\Click\Desktop\noufar cdss"
git add --all
git commit -m "Add Docker setup"
git push
```

### Step 2 — Create your .env file (keep this secret, never share!)
Copy the example file and fill in your real values:

```
cd backend
copy .env.example .env
```

Then open `backend/.env` and make sure these values are correct:
```
PORT=5000
FLASK_AI_URL=http://ai-server:5001
MONGODB_URI=mongodb://mongo:27017/noufar_cdss
JWT_SECRET=your_secret_here
SMTP_USER=your_gmail_address
SMTP_PASS=your_gmail_app_password
```

### Step 3 — Install Docker Desktop
Download from: https://www.docker.com/products/docker-desktop
Install it, then restart your computer.

### Step 4 — Run the whole project!
```
cd "C:\Users\Click\Desktop\noufar cdss"
docker compose up --build
```

Then open your browser at: **http://localhost:8080**

---

## 👥 For YOUR PARTNER'S Computer

### Step 1 — Install Docker Desktop
Download from: https://www.docker.com/products/docker-desktop
Install it, then restart the computer.

### Step 2 — Install Git
Download from: https://git-scm.com/download/win
Install with default settings.

### Step 3 — Clone the project
Open a terminal (Command Prompt or Git Bash) and run:

```
git clone https://github.com/farouk31222/noufar-cdss.git
cd noufar-cdss
```

### Step 4 — Create the .env file
```
cd backend
copy .env.example .env
```

Then open `backend\.env` with Notepad and fill in the real values
(ask your partner for the secrets — never share them on GitHub!):
```
JWT_SECRET=ask_your_partner
SMTP_USER=ask_your_partner
SMTP_PASS=ask_your_partner
```

### Step 5 — Start everything!
```
cd ..
docker compose up --build
```

⏳ First time takes ~5-10 minutes (downloads and installs everything).
After that it will be much faster.

### Step 6 — Open the app
Open your browser and go to: **http://localhost:8080**

---

## 🔄 Daily use (after the first setup)

To START the project:
```
docker compose up
```

To STOP the project:
```
docker compose down
```

To get the LATEST code from GitHub:
```
git pull
docker compose up --build
```

---

## 🌐 What's running where?

| Service | URL |
|---------|-----|
| Frontend (your app) | http://localhost:8080 |
| Backend API | http://localhost:5000 |
| Flask AI server | http://localhost:5001 |
| MongoDB | localhost:27017 |

---

## ❓ Troubleshooting

**"Docker not found"** → Make sure Docker Desktop is running (look for the whale icon in taskbar)

**App doesn't open** → Wait a minute after `docker compose up`, then refresh the browser

**"Port already in use"** → Close any other apps using port 8080 or 5000, then try again

**Changed the code?** → Run `docker compose up --build` to rebuild
