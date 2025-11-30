# 🏗️ System Architecture Notes

**Author:** Peter Mumo  
**Project:** RestPoint Software Backend API  
**Last Updated:** October 2025

---

## 📁 Repository Overview

**Root Directory:**

RestPointSoftware/
├── 127.0.0.1/
├── BackendApi/
├── Backups/
├── ElectronDesktopAppBundle/
├── extra_binaries/
├── FrontendClient/
├── node_modules/
├── package.json
├── package-lock.json
└── eslint.config.js

---

## 🧩 Backend API Structure

BackendApi/
├── Classifications/ # AI & NLP model integrations (classification, text generation)
├── application/ # Core runtime and business logic handlers
├── backups/ # Database and file backups
├── cachemanager/ # Local cache and Redis-like caching management
├── configurations/
│ └── sqlConfig/ # Secure SQL connection and pool setup
├── controllers/ # REST API controllers
├── docs/ # Developer and system documentation
├── helpers/ # Utility functions (validation, file ops, etc.)
├── inconsistency/ # Error anomaly tracking
├── logs/ # Logs and audit trail
├── middlewares/
│ ├── auth/ # Authentication (JWT, session)
│ └── hmacEncrypt/ # Request signature verification
├── queueEmitter/ # Real-time WebSocket or event emitter service
├── routes/ # Express API route definitions
├── services/
│ ├── document-generator-service/
│ ├── db-service/
│ └── print-service/ # Independent microservices
├── uploads/
│ ├── coffins/
│ ├── documents/
│ ├── hearses/
│ └── inquiries/
├── utilities/
│ ├── broadcasters/ # WebSocket broadcasting
│ ├── filehelpers/ # File reading/writing & compression
│ ├── healthWarning/ # System health monitoring
│ ├── openAi/ # AI integration (text automation)
│ ├── timestamps/ # Time and date utilities (Kenya TZ)
│ ├── uploads/ # File upload logic
│ └── whatsapp/ # WhatsApp integration
├── Dockerfile
├── docker-compose.yml
├── index.js
├── package.json
└── README.md

---

## ⚙️ Core Microservices

### 🧾 `document-generator-service`

- Handles all document generation requests (Release, Transfer, Burial Permit).
- Streams PDF generation using `pdfkit` and `pipeline`.
- Syncs generated documents into the SQL database.
- Memory-optimized using Node.js streams and buffers.
- Each form type runs independently.

### 🖨️ `print-service`

- Uses `pdf-to-printer` for direct PDF printing.
- Cross-platform (Windows/macOS/Linux) printing via `exec` fallback.
- Instant printing (no queueing) — handles concurrent print jobs safely.
- Callable globally within the workflow.

### 🧮 `db-service`

- Centralized query handler using `safeQuery()`.
- Prevents SQL injection and supports prepared statements.
- Handles retries and error logging.
- Used by all services and controllers.

---

## 🧱 Infrastructure & Containerization

### 🐳 Dockerfile

Defines the Node.js runtime for the backend API:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]

🧩 docker-compose.yml

Defines the multi-service orchestration:

version: '3.8'
services:
  api:
    build: ./BackendApi
    container_name: restpoint_api
    restart: always
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
    depends_on:
      - db

  db:
    image: mysql:8.0
    container_name: restpoint_db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: securepassword
      MYSQL_DATABASE: restpoint
    volumes:
      - db_data:/var/lib/mysql
    ports:
      - "3306:3306"

  redis:
    image: redis:alpine
    container_name: restpoint_cache
    restart: always
    ports:
      - "6379:6379"

volumes:
  db_data:

🔄 CI/CD Workflow (GitHub Actions)

File: .github/workflows/deploy.yml

name: Deploy Backend API

on:
  push:
    branches:
      - main

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci --prefix BackendApi

      - name: Run tests
        run: npm test --prefix BackendApi

      - name: Build Docker image
        run: docker build -t restpoint-api ./BackendApi

      - name: Deploy Container
        run: |
          docker compose -f ./BackendApi/docker-compose.yml up -d

🔐 Security & Compliance

Safe Database Access:
All DB calls use safeQuery() — protects against SQL injection.

Authentication:
JWT-based authentication with refresh token rotation.

Encryption:
HMAC-based request signing in middlewares/hmacEncrypt.

Audit Logs:
Every action logged to /logs/error.log and /logs/audit.log.

Checksum Validation:
Each uploaded file is hashed (SHA256) to verify integrity.

Backup & Recovery:
Automatic backups stored in /backups/ with timestamped filenames.

🧑‍💻 Developer Notes

Always use safeQuery() for database operations.

Logs are stored in /logs/error.log.

Update .env before deployment (especially DB credentials).

Swagger API docs auto-generate from /routes/*.js.

Generate docs:

npm run docs


For testing:

npm run dev

📜 Summary

The RestPoint Software Backend API is designed as a modular, microservice-driven, memory-optimized system supporting real-time mortuary operations.
It uses streams, pipelines, Docker containers, and GitHub Actions for CI/CD — ensuring resilience, scalability, and compliance with modern standards.

© 2025 Peter Mumo — RestPoint Software Systems


---

```
