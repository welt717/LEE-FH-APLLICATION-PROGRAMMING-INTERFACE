# System Architecture Notes

**Author:** Peter Mumo  
**Project:** RestPoint Software Backend API  
**Last Updated:** October 2025

---

## Overview

This backend system is built on a modular microservice-inspired architecture.  
Each module (controller, service, or utility) handles a specific domain such as document management, analytics, or mortuary operations.

## Core Design

- Built on **Node.js + Express**
- Organized under `/controllers`, `/services`, `/utilities`, and `/configurations`
- Uses **stream-based document generation and printing** for memory efficiency
- Database access via `safeQuery()` to ensure secure, parameterized SQL
- Integrated **microservices** for printing, document generation, and queue emission

## Key Components

- **controllers/** – main business logic per domain
- **services/** – background and system-level services (e.g., `printservices/`)
- **utilities/** – time, storage, AI, and file helpers
- **middlewares/** – authentication and HMAC encryption
- **docs/** – developer, architecture, and compliance notes

## Deployment

- Runs on clustered Node.js instances (PM2 or Docker)
- Environment variables configured in `.env`
- Logs stored under `/logs/` for audit and monitoring
- Supports scaling and load balancing via Nginx

## Personal Notes (Peter Mumo)

- Architecture emphasizes **high availability**, **streamlined memory**, and **fault isolation**
- Document generation, printing, and DB sync are designed to run **independently and concurrently**
- Each service can restart or redeploy without interrupting others
- Built to support **future orchestration**, **AI-assisted workflows**, and **live monitoring**

---

_— End of Notes (Peter Mumo)_
