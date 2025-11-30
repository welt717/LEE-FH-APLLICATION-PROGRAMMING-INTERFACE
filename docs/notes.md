# System Architecture Notes

**Author:** Peter Mumo  
**Project:** RestPoint Software Backend API  
**Last Updated:** October 2025

---

# Developer Notes

- Always use `safeQuery()` for database calls to prevent SQL injection.
- Logs are stored in `/logs/error.log`.
- When deploying, change the database credentials in `.env`.
- Swagger documentation is auto-generated from `/routes/*.js`.
- API doc generation: `npm run docs`.
