Database Configuration (db.js)
""""Overview

This file sets up and manages the MariaDB/MySQL connection using mysql2/promise.
It supports connection pooling, safe queries, and clean shutdown.

"""Environment Variables
Variable Purpose Default
DB_HOST Database host localhost
DB_PORT Port number 3306
DB_USER Database user root
DB_PASSWORD User password (empty)
DB_NAME Database name restpointdatabase

Loaded securely via .env using dotenv.

"""Connection Pool
const pool = mysql.createPool({ ... });

Reuses connections for performance.

connectionLimit: 50 allows up to 50 simultaneous connections.

waitForConnections: true ensures queued handling when busy.

connectTimeout: 10000 → waits 10s before timeout.

dateStrings: true keeps date fields as strings.

"""Helper Functions
Function Description
safeQuery(sql, params) Executes parameterized query safely.
safeQueryOne(sql, params) Returns only one row from result.
getConnection() Returns dedicated connection for transactions.
closeDB() Closes all DB connections gracefully.
initDB() Tests DB connection at startup.

"""Graceful Shutdown
process.on('SIGINT', closeDB);
process.on('SIGTERM', closeDB);

Ensures all connections close properly before server exits.

""""Summary

Connection pooling for speed

Safe SQL execution

Manual transaction support

Clean app shutdown
