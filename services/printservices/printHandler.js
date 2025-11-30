/**
 * Print Service (Concurrent)
 * Author: Peter Mumo
 * Project: RestPoint Software
 *
 * Features:
 *  - Handles standard & thermal printing concurrently
 *  - Up to 3 jobs print in parallel
 *  - Auto-queues remaining jobs
 *  - Logs all errors and job activity to /logs/printer/print.log
 *  - Memory-safe, async, non-blocking
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const printer = require('pdf-to-printer');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// --- CONFIG ---
const MAX_CONCURRENT_PRINTS = 3;
const LOG_DIR = path.join(__dirname, '../../logs/printer');
const LOG_FILE = path.join(LOG_DIR, 'print.log');

// --- STATE ---
const printQueue = [];
let activeJobs = 0;

// --- INIT ---
ensureLogDir();

// ==========================
// QUEUE MANAGEMENT
// ==========================
function enqueueJob(job) {
  printQueue.push(job);
  log(`🟡 Queued job [${job.type}]`);
  processQueue();
}

async function processQueue() {
  while (activeJobs < MAX_CONCURRENT_PRINTS && printQueue.length > 0) {
    const job = printQueue.shift();
    activeJobs++;

    handlePrintJob(job)
      .then(() => log(`✅ Job completed [${job.type}]`))
      .catch((err) => {
        logError(`❌ Print job failed [${job.type}]: ${err.message}`);
      })
      .finally(() => {
        activeJobs--;
        setImmediate(processQueue); // schedule next job
      });
  }
}

// ==========================
// JOB HANDLERS
// ==========================
async function handlePrintJob(job) {
  if (job.type === 'standard') {
    await handleStandardPrint(job.filePath, job.options);
  } else if (job.type === 'thermal') {
    await handleThermalPrint(job.data, job.options);
  } else {
    throw new Error(`Unknown print job type: ${job.type}`);
  }
}

// ==========================
// STANDARD PRINT
// ==========================
async function handleStandardPrint(filePath, options = {}) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const ext = path.extname(filePath).toLowerCase();
  const printOptions = { ...options, scale: 'fit', silent: true };

  if (ext === '.pdf') {
    await printer.print(filePath, printOptions);
  } else {
    await printWithSystem(filePath);
  }

  log(`🖨️ Standard print done: ${path.basename(filePath)}`);
}

// ==========================
// THERMAL PRINT
// ==========================
async function handleThermalPrint(data, options = {}) {
  const device = new escpos.USB();
  const printerDevice = new escpos.Printer(device);

  return new Promise((resolve, reject) => {
    device.open((err) => {
      if (err) {
        logError(`⚠️ Thermal printer connection failed: ${err.message}`);
        return reject(err);
      }

      try {
        printerDevice
          .align('ct')
          .style('b')
          .text(data.title || '--- Receipt ---')
          .style('normal')
          .text(data.content || '')
          .text(`\nDate: ${new Date().toLocaleString()}`)
          .cut()
          .close();

        log('🧾 Thermal print completed');
        resolve();
      } catch (error) {
        logError(`❌ Thermal print error: ${error.message}`);
        reject(error);
      }
    });
  });
}

// ==========================
// SYSTEM FALLBACK PRINT
// ==========================
function printWithSystem(filePath) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let command;

    if (platform === 'win32') command = `start /min "" "${filePath}" /p`;
    else if (platform === 'darwin') command = `lp "${filePath}"`;
    else command = `lpr "${filePath}"`;

    exec(command, (error) => {
      if (error) {
        logError(
          `System print failed for ${path.basename(filePath)}: ${error.message}`,
        );
        reject(error);
      } else {
        log(`System print success: ${path.basename(filePath)}`);
        resolve();
      }
    });
  });
}

// ==========================
// LOGGING HELPERS
// ==========================
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
}

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(message);
}

function logError(message) {
  const entry = `[${new Date().toISOString()}] ERROR: ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.error(message);
}

// ==========================
// PUBLIC METHODS
// ==========================
async function queueStandardPrint(filePath, options = {}) {
  enqueueJob({ type: 'standard', filePath, options });
  log(`📄 Queued standard print: ${path.basename(filePath)}`);
}

async function queueThermalPrint(data, options = {}) {
  enqueueJob({ type: 'thermal', data, options });
  log(`🧾 Queued thermal print`);
}

// ==========================
// EXPORTS
// ==========================
module.exports = {
  queueStandardPrint,
  queueThermalPrint,
  handleStandardPrint,
  handleThermalPrint,
  printWithSystem,
  handlePrintJob,
  processQueue,
  log,
  logError,
};
