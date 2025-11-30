const os = require('os');
const osUtils = require('os-utils');
const pidusage = require('pidusage');

let performanceStats = {
  cpu: {
    usage: 0,
    count: os.cpus().length,
    model: os.cpus()[0].model,
  },
  memory: {
    total: os.totalmem(),
    free: os.freemem(),
    used: 0,
    usage: 0,
  },
  process: {
    memory: 0,
    cpu: 0,
    uptime: 0,
  },
  system: {
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),
  },
  load: {
    average: os.loadavg(),
    current: 0,
  },
};

// Function to update performance stats
async function updatePerformanceStats() {
  return new Promise((resolve) => {
    // Get CPU usage
    osUtils.cpuUsage((cpuUsage) => {
      performanceStats.cpu.usage = Math.round(cpuUsage * 100);

      // Get memory stats
      performanceStats.memory.free = os.freemem();
      performanceStats.memory.used =
        performanceStats.memory.total - performanceStats.memory.free;
      performanceStats.memory.usage = Math.round(
        (performanceStats.memory.used / performanceStats.memory.total) * 100,
      );

      // Get process stats
      pidusage(process.pid, (err, stats) => {
        if (!err) {
          performanceStats.process.memory = Math.round(
            stats.memory / 1024 / 1024,
          ); // Convert to MB
          performanceStats.process.cpu = Math.round(stats.cpu);
          performanceStats.process.uptime = Math.round(process.uptime());
        }

        // Update system uptime and load
        performanceStats.system.uptime = os.uptime();
        performanceStats.load.average = os.loadavg();
        performanceStats.load.current = os.loadavg()[0]; // 1-minute load average

        resolve(performanceStats);
      });
    });
  });
}

function startPerformanceMonitoring(io, intervalMs = 5000) {
  setInterval(async () => {
    await updatePerformanceStats();

    // Broadcast performance stats to all connected clients
    if (io) {
      io.emit('performance_stats', performanceStats);
    }
  }, intervalMs);
}

module.exports = {
  updatePerformanceStats,
  startPerformanceMonitoring,
  getPerformanceStats: () => performanceStats,
};
