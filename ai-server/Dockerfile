# AI Server — Python Flask
FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and trained models
COPY . .

EXPOSE 5001

CMD ["python", "app.py"]
