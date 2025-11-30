// controllers/backups/backup.js
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const cron = require('node-cron');
const mysql = require('mysql2/promise'); // for warnings table
require('dotenv').config();

// CONFIG
const BACKUP_DIR = 'C:/RestPointSoftware/Backups';
const UPLOADS_DIR = 'C:/RestPointSoftware/BackendApi/uploads';
const USB_PATH = 'E:/RestPointBackups'; // we will delete previous and save new
const NAS_PATH = 'Z:/RestPointBackups';
const MAX_BACKUPS = 1; // keep only latest backup
const MAX_WARNINGS = 10; // keep last 10 warnings

// DB CONFIG (for warnings logging)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// ---- UTIL ----
async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

// ---- WARNINGS LOGGING ----
async function logWarning(type, message) {
  try {
    const createdAt = new Date().toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
    });
    await pool.query(
      'INSERT INTO backup_warnings (warning_type, message, created_at) VALUES (?, ?, ?)',
      [type, message, createdAt],
    );

    // Keep only last MAX_WARNINGS
    await pool.query(
      `
      DELETE FROM backup_warnings
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM backup_warnings ORDER BY id DESC LIMIT ?
        ) tmp
      )
    `,
      [MAX_WARNINGS],
    );

    console.log(`📋 Log: ${type} - ${message}`);
  } catch (err) {
    console.error('❌ Failed to log warning:', err.message);
  }
}

// ---- DOCUMENTS BACKUP ----
async function backupDocuments(timestamp) {
  const backupName = `documents_backup_${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  copyRecursiveSync(UPLOADS_DIR, backupPath);
  console.log(`📂 Documents backup created → ${backupPath}`);
  return backupPath;
}

// ---- COPY RECURSIVE ----
function copyRecursiveSync(src, dest) {
  if (!fssync.existsSync(src)) return;
  if (!fssync.existsSync(dest)) fssync.mkdirSync(dest, { recursive: true });

  fssync.readdirSync(src).forEach((file) => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);

    if (fssync.lstatSync(srcPath).isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      fssync.copyFileSync(srcPath, destPath);
    }
  });
}

// ---- RESTORE DOCUMENTS ----
async function restoreLatestBackup() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const docBackups = files
      .filter((f) => f.startsWith('documents_backup_'))
      .sort();

    if (!docBackups.length) {
      console.error('❌ No document backups available to restore.');
      return;
    }

    const latestDocs = path.join(BACKUP_DIR, docBackups[docBackups.length - 1]);
    copyRecursiveSync(latestDocs, UPLOADS_DIR);
    console.log(`🔄 Documents restored from → ${latestDocs}`);
  } catch (err) {
    console.error('❌ Restore error:', err.message);
  }
}

// ---- RETRY HANDLER ----
async function withRetry(fn, retries = 2) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      console.log(`🔁 Retry attempt ${attempt}...`);
    }
  }
}

// ---- CLEANUP OLD BACKUPS ----
async function cleanupOldBackups() {
  const files = await fs.readdir(BACKUP_DIR);
  const docBackups = files
    .filter((f) => f.startsWith('documents_backup_'))
    .sort();

  if (docBackups.length > MAX_BACKUPS) {
    const remove = docBackups.slice(0, docBackups.length - MAX_BACKUPS);
    for (const f of remove)
      fssync.rmSync(path.join(BACKUP_DIR, f), { recursive: true, force: true });
  }

  // Cleanup USB_PATH to only keep latest backup
  try {
    await fs.access(USB_PATH);
    const usbFiles = await fs.readdir(USB_PATH);
    for (const file of usbFiles) {
      fssync.rmSync(path.join(USB_PATH, file), {
        recursive: true,
        force: true,
      });
    }
  } catch {
    console.log(`⚠️ ${USB_PATH} not available, skipping USB cleanup...`);
  }
}

// ---- MASTER BACKUP FUNCTION ----
async function runBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await ensureBackupDir();

    const docsBackup = await withRetry(() => backupDocuments(timestamp), 2);

    // Copy to USB + NAS
    for (const target of [USB_PATH, NAS_PATH]) {
      try {
        await fs.access(target);

        // Delete previous backups in USB
        if (target === USB_PATH) {
          const files = await fs.readdir(USB_PATH);
          for (const file of files) {
            fssync.rmSync(path.join(USB_PATH, file), {
              recursive: true,
              force: true,
            });
          }
        }

        if (docsBackup)
          copyRecursiveSync(
            docsBackup,
            path.join(target, path.basename(docsBackup)),
          );
        console.log(`📀 Documents backup copied to → ${target}`);
      } catch {
        console.log(`⚠️ ${target} not available, skipping...`);
      }
    }

    await cleanupOldBackups();
    await logWarning(
      'BACKUP_SUCCESS',
      `Documents backup created successfully at ${timestamp}`,
    );
  } catch (err) {
    console.error('❌ Backup error:', err.message);
    await logWarning('BACKUP_FAILURE', err.message);
  }
}

// ---- SCHEDULER ----
function scheduleBackups() {
  runBackup(); // run once on startup

  cron.schedule('0 2 * * *', async () => {
    await runBackup();
  });
}

module.exports = { runBackup, scheduleBackups, restoreLatestBackup };
