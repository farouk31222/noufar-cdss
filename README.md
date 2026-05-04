<div align="center">

# NOUFAR CDSS

**Clinical Decision Support System for Hyperthyroidism Relapse Prediction**

A full-stack medical web application built for doctors to run AI-powered relapse predictions, manage patients, and collaborate through a secure clinical workflow — with a complete admin management console.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white)

</div>

---

## Overview

NOUFAR CDSS is a full-stack clinical decision support platform with two distinct interfaces:

- **Doctor App** — a secure, role-based clinical workflow for running and reviewing hyperthyroidism relapse predictions
- **Admin Console** — a management dashboard for approving doctors, reviewing profiles, and handling support requests

The AI inference engine runs a trained ensemble model (Random Forest + Logistic Regression + Deep Neural Network) with explainability outputs for each prediction.

---

## Features

### Doctor Application
- Landing page with platform presentation
- Secure login with **JWT authentication** and **2FA email verification**
- Dashboard with prediction history and patient statistics
- Dataset upload and patient selection workflow
- AI-powered relapse prediction with feature importance explainability
- Prediction history and detailed result review
- Patient directory management
- Account settings and notification preferences

### Admin Console
- Doctor registration approval workflow
- Full doctor profile review (documents, credentials)
- Doctor account management
- Support inbox
- System monitoring

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, JavaScript (vanilla) |
| Backend API | Node.js, Express.js |
| Database | MongoDB with Mongoose ODM |
| AI / ML Server | Python, Flask, scikit-learn, TensorFlow |
| Authentication | JWT + 2FA email verification |
| Email | Nodemailer (SMTP) |
| Local deployment | Docker Compose, nginx |
| Cloud deployment | Railway |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│              frontend/ (HTML / CSS / JS)                │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP
              ┌──────────▼──────────┐
              │   nginx (port 8080) │  ← local Docker
              │   or Express static │  ← Railway / direct
              └─────�