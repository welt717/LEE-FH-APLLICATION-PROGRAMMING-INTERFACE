// utilities/healthCheck.js
const os = require('os');
const { performance } = require('perf_hooks');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

async function getHealthStatus() {
  let dbOk = true;

  // Database check
  try {
    await safeQuery('SELECT 1');
  } catch (err) {
    console.error('Database health check failed:', err.message);
    dbOk = false;
  }

  // CPU
  const cpuLoad1Min = os.loadavg()[0];
  const coreCount = os.cpus().length;
  const cpuLoadPercent = ((cpuLoad1Min / coreCount) * 100).toFixed(2);

  // Memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPercent = (((totalMem - freeMem) / totalMem) * 100).toFixed(2);

  // Heap
  const heap = process.memoryUsage();

  const heapUsed = (heap.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotal = (heap.heapTotal / 1024 / 1024).toFixed(2);
  const heapUsagePercent = ((heap.heapUsed / heap.heapTotal) * 100).toFixed(2);

  // Event Loop Delay (micro-stalls)
  const start = performance.now();
  await new Promise((resolve) => setImmediate(resolve));
  const eventLoopDelay = (performance.now() - start).toFixed(2); // ms

  const healthy = dbOk && usedMemPercent < 85 && eventLoopDelay < 70;

  return {
    message: healthy ? '✅ Server is healthy' : '⚠️ Server has warnings',
    status: healthy ? 'healthy' : 'warning',
    timestamp: getKenyaTimeISO(),

    server: {
      uptimeSeconds: process.uptime(),
      cpu: {
        load1Min: cpuLoad1Min,
        cores: coreCount,
        loadPercent: cpuLoadPercent,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        usedPercent: usedMemPercent,
      },
      heap: {
        usedMB: heapUsed,
        totalMB: heapTotal,
        usagePercent: heapUsagePercent,
      },
      eventLoopDelayMs: eventLoopDelay,
    },

    database: {
      connected: dbOk,
    },
  };
}

module.exports = { getHealthStatus };
