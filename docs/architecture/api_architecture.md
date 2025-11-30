# System Architecture Notes

**Author:** Peter Mumo  
**Project:** RestPoint Software Backend API  
**Last Updated:** October 2025

---

Architecture Notes

The backend follows a modular, service-oriented architecture built on Node.js + Express.

Each module is fully isolated inside /controllers/, /services/, and /helpers/, promoting scalability and maintainability.

All document operations (release forms, transfer forms, burial permits, etc.) use stream-based PDF generation via PDFKit to optimize memory and speed.

Printing is handled by /services/printservices/, powered by pdf-to-printer. It supports instant print jobs from anywhere in the workflow.

Asynchronous communication and background jobs are handled through /queueEmmitter/ and event-based orchestration.

Configuration and database logic are located in /configurations/sqlConfig/, where all queries use safeQuery() for injection safety.

Middleware in /middlewares/auth/ and /middlewares/hmacEncrypt/ handles authentication, authorization, and request signing.

Caching and temporary state are managed through /cachemanager/.

AI-assisted logic (classification, body analysis, etc.) lives in /aiModels/.

Logging and auditing are centralized in /logs/, while periodic backups are stored in /backups/.

Static and generated files (documents, coffin images, inquiry attachments) are kept in /uploads/.

Utilities (notifications, timestamps, health checks, WhatsApp, filehelpers, etc.) live in /utilities/.

Documentation, compliance, and IP rights files are under /docs/ and are version-controlled with the codebase.

Microservices (document generation, printer service, DB sync) can run independently — if one crashes, others continue functioning.

The system supports multi-core clustering via PM2 or Docker Compose for high availability.

Nginx or similar reverse proxies handle load balancing between clustered API instances.

JWT + HMAC encryption is used for secure request authentication and payload integrity.

Checksum verification is applied to ensure document integrity and prevent tampering.

All timestamps are normalized to Kenya Standard Time using /utilities/timeStamps/.

The system follows the Kenya Data Protection Act (2019) and general GDPR principles for data handling and user privacy.

Every generated document record is stored in the documents table and synced with metadata (path, type, timestamp).

Crash recovery is supported by automatic backups and restart scripts in /backups/ and Docker restart policies.

Scalability: You can add more microservices (e.g., AI assist, reporting, monitoring) without changing existing modules.
