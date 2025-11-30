SECURITY AND COMPLIANCE NOTES
Overview

This document summarizes the key security, privacy, and compliance measures implemented within the Smart City Kenya Systems (including Mortuary Management, Document Generator, and API Services).
The goal is to maintain data integrity, confidentiality, and system reliability across all deployed modules.

🔐 1. Authentication & Authorization

Secure user login with JWT-based sessions (short-lived tokens).

Role-based access control (RBAC): ensures users (admin, staff, pathologists) can only access authorized routes.

Passwords are hashed using bcrypt before storage — never stored in plain text.

Sessions and tokens validated on every protected request.

2. Data Security

All sensitive records (deceased data, forms, documents) stored in a secured Maria db database.

Data transmission between client ↔ server uses HTTPS (TLS 1.2+).

File uploads are sanitized and stored in a non-public directory.

All generated documents (PDFs, images) use UUIDs and timestamped filenames to prevent collisions.

File access is controlled — users can only download documents they’re authorized to view.

3.  Streamlined Memory and File Handling

Document processing (PDF generation, uploads, prints) handled via Node.js Streams to reduce memory footprint.

No temporary in-memory storage of large files — data is streamed directly from generator → file system → printer.

Automatic cleanup of temp files after processing.

4. Service Isolation & Orchestration

Microservices pattern applied:

document-generator-service → handles secure form generation.

print-service → isolated printer control (no external network exposure).

db-service → isolated database transactions.

All services communicate internally through validated API calls or message channels.

Orchestrator service coordinates workflows with error-handling and logging.

5. Logging & Monitoring

All API and document actions are logged with timestamps, user, and action details.

Separate error logs and audit logs maintained for traceability.

System monitored for uptime and error trends using Node process clustering.

6. Data Compliance

System designed to align with:

Kenya Data Protection Act (2019)

GDPR principles — data minimization, user consent, right to erasure

Personal data collected only when necessary and retained for lawful purposes.

User data can be exported or deleted upon authorized request.

7. Backup & Recovery

Scheduled database backups (encrypted and timestamped).

Backup retention policies applied to ensure both recovery and compliance.

Disaster recovery testing performed periodically.

8. Infrastructure Hardening

Server runs in a restricted environment with firewall and limited SSH access.

Environment variables (e.g., DB passwords, API keys) stored in .env — not in codebase.

Node.js updated regularly for security patches.

Rate limiting and input validation applied to all endpoints.

9. Document Integrity & Digital Signatures

Generated PDFs include:

Embedded metadata (creation time, author, hash).

Optional digital signature and barcode for authenticity verification.

10. Future Enhancements (Planned)

Integration with PKI-based digital signatures (CA-signed).

End-to-end document encryption and QR verification portal.

Real-time intrusion detection and user anomaly monitoring.

11. Summary
    Your software system implements strong practical security:

Protected access

Encrypted data flows

Service isolation

Compliance with Kenya’s privacy standards
