const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const hpp = require('hpp');

const http = require('http');
const path = require('path');
const statusMonitor = require('express-status-monitor');

const fs = require('fs');
const os = require('os');
require('source-map-support').install();

const { Server: SocketIOServer } = require('socket.io');

// --- Local helpers ---
const { initDB, safeQuery } = require('./configurations/sqlConfig/db');
const { getHealthStatus } = require('./utilities/heathWarning/health');
const {
  createActiveMonitoringAssist,
} = require('./controllers/ActiveMonitoringAssist/active');
const { getKenyaTimeISO } = require('./utilities/timeStamps/timeStamps');

const app = express();

const HOST = '0.0.0.0';
const PORT = 5000;

const {
  startPerformanceMonitoring,
  updatePerformanceStats,
  getPerformanceStats,
} = require('./services/performanceMonitor');

// ----------------- Main Server Error Logging -----------------
const {
  globalErrorHandler,
} = require('./middlewares/errorHandler/errorHandler');
app.use(globalErrorHandler);

// ----------------- Security & Performance -----------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'self'", 'http://localhost:5173'],
      },
    },
  }),
);

app.use(hpp());
app.use(compression({ level: 3, threshold: 1024 }));
const { allowedOrigins, corsOptions } = require('./configurations/corsConfig');
const { initBackgroundTasks } = require('./services/backgroundTasks');

app.use(cors(corsOptions));

const monitor = statusMonitor({ path: '/status' });
app.use(monitor);

// ----------------- Request Logging Middleware -----------------
const { requestLogger, requestStats } = require('./middlewares/requestLogger');
app.use(requestLogger);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve /uploads folder with CORP header
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

// Optionally: specific folder
app.use(
  '/uploads/coffins',
  express.static(path.join(__dirname, 'uploads/coffins'), {
    setHeaders: (res, filePath) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

app.use(
  '/uploads/documents',
  express.static(path.join(__dirname, 'uploads/documents'), {
    setHeaders: (res, filePath) => {
      res.setHeaders('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

app.use(
  '/uploads/releases',
  express.static(path.join(__dirname, 'uploads/releases'), {
    setHeaders: (res, filePath) => {
      res.setHeaders('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);
// ----------------- Request Analytics Routes -----------------
app.get('/api/v1/restpoint/analytics/requests', (req, res) => {
  try {
    const fileAnalytics = {
      totalRequests: requestStats.totalRequests,
      requestsByMethod: requestStats.requestsByMethod,
      requestsByStatus: requestStats.requestsByStatus,
      requestsByEndpoint: requestStats.requestsByEndpoint,
      requestsByHour: requestStats.requestsByHour,
      uniqueIPs: Object.keys(requestStats.requestsByIP).length,
      // Calculate average response time across all endpoints
      averageResponseTime:
        Object.values(requestStats.responseTimes).reduce(
          (acc, curr) => acc + curr.average,
          0,
        ) / (Object.keys(requestStats.responseTimes).length || 1),
    };

    res.json({
      success: true,
      data: {
        fileAnalytics: fileAnalytics,
        realTimeStats: {
          totalRequests: requestStats.totalRequests,
          requestsByMethod: requestStats.requestsByMethod,
          requestsByIP: requestStats.requestsByIP,
          uniqueIPs: Object.keys(requestStats.requestsByIP).length,
          uptime: Math.floor((new Date() - requestStats.startTime) / 1000),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Request analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get request analytics',
      error: error.message,
    });
  }
});

app.get('/api/v1/restpoint/analytics/requests/recent', (req, res) => {
  // Not implemented with in-memory stats for now, or could read from winston file
  res.json({ success: true, message: 'Use logs endpoint for recent requests' });
});

app.get('/api/v1/restpoint/analytics/requests/ips', (req, res) => {
  try {
    const topIPs = Object.entries(requestStats.requestsByIP)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([ip, count]) => ({ ip, requests: count }));

    res.json({
      success: true,
      data: {
        totalUniqueIPs: Object.keys(requestStats.requestsByIP).length,
        topIPs: topIPs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('IP analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get IP analytics',
      error: error.message,
    });
  }
});

app.get('/api/v1/restpoint/analytics/requests/logs', (req, res) => {
  // Winston logs are in JSON format, can be read similarly if needed
  res.json({ success: true, message: 'Check server logs directly' });
});

// ----------------- Performance Monitoring Routes -----------------
app.get('/api/v1/restpoint/performance', async (req, res) => {
  try {
    const stats = await updatePerformanceStats();
    const performanceStats = getPerformanceStats();

    // Calculate requests per minute
    const uptimeMinutes = (new Date() - requestStats.startTime) / (1000 * 60);
    const requestsPerMinute =
      requestStats.totalRequests / Math.max(uptimeMinutes, 1);

    // Get top endpoints
    const topEndpoints = Object.entries(requestStats.requestsByEndpoint)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    res.json({
      success: true,
      data: {
        ...stats,
        requests: {
          total: requestStats.totalRequests,
          perMinute: Math.round(requestsPerMinute * 100) / 100,
          byMethod: requestStats.requestsByMethod,
          byEndpoint: topEndpoints,
          byHour: requestStats.requestsByHour,
          uptime: Math.floor((new Date() - requestStats.startTime) / 1000),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Performance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance stats',
      error: error.message,
    });
  }
});

app.get('/api/v1/restpoint/performance/live', async (req, res) => {
  try {
    const stats = await updatePerformanceStats();

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(
      `data: ${JSON.stringify({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      })}\n\n`,
    );
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({
        success: false,
        error: error.message,
      })}\n\n`,
    );
  }
});

// ----------------- DB Initialization -----------------
async function startDB(retries = 5, delay = 5000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await initDB();
      console.log(`✅ Database initialized on attempt ${i}`);
      return;
    } catch (err) {
      logMainServerError(err, `DB connection attempt ${i} failed`);
      if (i < retries) await new Promise((res) => setTimeout(res, delay));
      else process.exit(1);
    }
  }
}

// ----------------- HTTP + Socket.IO -----------------
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🟢 Client connected via Socket.IO → Socket ID: ${socket.id}`);
  console.log('----------------------------------------------------------');

  // Send current performance stats immediately when client connects
  socket.emit('performance_stats', getPerformanceStats());

  // Handle performance stats request
  socket.on('get_performance_stats', async () => {
    const stats = await updatePerformanceStats();
    socket.emit('performance_stats', stats);
  });

  // 🔹 1️⃣ Handle new client inquiries
  socket.on('start_new_inquiry', async (data) => {
    try {
      console.log('📩 [start_new_inquiry] Incoming data:', data);

      const columns = [
        'client_name',
        'subject',
        'message',
        'created_at',
        'status',
      ];
      const placeholders = ['?', '?', '?', '?', '?'];
      const params = [
        data.client_name,
        data.subject,
        data.message,
        getKenyaTimeISO(),
        'pending',
      ];

      if (data.deceased_id) {
        columns.splice(1, 0, 'deceased_id');
        placeholders.splice(1, 0, '?');
        params.splice(1, 0, data.deceased_id);
      }

      const query = `INSERT INTO inquiries (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
      console.log('🧾 Executing SQL Query for Inquiry:\n', query);
      console.log('📦 Query Params:', params);

      const result = await safeQuery(query, params);
      console.log(
        '✅ Inquiry saved successfully to database. ID:',
        result.insertId,
      );

      io.emit('new_inquiry_alert', {
        inquiry_id: result.insertId,
        ...data,
        status: 'pending',
        message: data.message || '',
      });

      console.log('📢 Broadcasted new_inquiry_alert to all staff.');
      console.log('----------------------------------------------------------');
    } catch (err) {
      console.error('❌ Error saving inquiry to DB:', err);
      socket.emit('inquiry_error', {
        message: 'Failed to save inquiry to database',
        details: err.message,
      });
    }
  });

  // 🔹 2️⃣ Handle client follow-up messages
  socket.on('new_client_message', async (msg) => {
    try {
      console.log('💬 [new_client_message] Incoming data:', msg);

      const inquiryExists = await safeQuery(
        'SELECT id FROM inquiries WHERE id = ?',
        [msg.inquiry_id],
      );
      if (!inquiryExists.length) {
        return socket.emit('inquiry_error', {
          message: 'Parent inquiry does not exist',
        });
      }

      const query = `
        INSERT INTO inquiry_responses (inquiry_id, client_name, response, created_at)
        VALUES (?, ?, ?, ?)
      `;
      const params = [
        msg.inquiry_id,
        msg.client_name,
        msg.response,
        getKenyaTimeISO(),
      ];

      const responseData = {
        inquiry_id: msg.inquiry_id,
        client_name: msg.client_name,
        response: msg.response,
        created_at: getKenyaTimeISO(),
        type: 'client_message',
      };

      io.emit('new_client_message', responseData);
      await safeQuery(query, params);
      console.log('✅ Client message saved successfully.');
      io.emit('inquiry_updated', msg);
      console.log('📢 Broadcasted inquiry_updated to all staff.');
      console.log('----------------------------------------------------------');
    } catch (err) {
      console.error('❌ Error saving client message:', err);
      socket.emit('inquiry_error', {
        message: 'Failed to save client message',
      });
    }
  });

  // Get all inquiries for staff dashboard
  socket.on('get_all_inquiries', async () => {
    try {
      const query = `
        SELECT i.*, 
               (SELECT ir.response FROM inquiry_responses ir 
                WHERE ir.inquiry_id = i.id 
                ORDER BY ir.created_at DESC LIMIT 1) as last_message
        FROM inquiries i 
        ORDER BY i.created_at DESC
      `;
      const inquiries = await safeQuery(query);
      socket.emit('all_inquiries', inquiries);
    } catch (err) {
      console.error('Error fetching inquiries:', err);
    }
  });

  // Get inquiry history
  socket.on('get_inquiry_history', async (data) => {
    try {
      const query = `
        SELECT * FROM inquiry_responses 
        WHERE inquiry_id = ? 
        ORDER BY created_at ASC
      `;
      const history = await safeQuery(query, [data.inquiry_id]);
      socket.emit('inquiry_history', history);
    } catch (err) {
      console.error('Error fetching inquiry history:', err);
    }
  });

  // Update inquiry status
  socket.on('update_inquiry_status', async (data) => {
    try {
      const query = 'UPDATE inquiries SET status = ? WHERE id = ?';
      await safeQuery(query, [data.status, data.inquiry_id]);

      io.emit('inquiry_status_updated', {
        inquiry_id: data.inquiry_id,
        status: data.status,
      });
    } catch (err) {
      console.error('Error updating inquiry status:', err);
    }
  });

  // 🔹 3️⃣ Handle staff replies
  socket.on('staff_reply', async (reply) => {
    try {
      console.log('🧑‍💼 [staff_reply] Incoming data:', reply);

      const inquiryExists = await safeQuery(
        'SELECT id FROM inquiries WHERE id = ?',
        [reply.inquiry_id],
      );
      if (!inquiryExists.length) {
        return socket.emit('inquiry_error', {
          message: 'Parent inquiry does not exist',
        });
      }

      const query = `
        INSERT INTO inquiry_responses (inquiry_id, staff_name, response, created_at)
        VALUES (?, ?, ?, ?)
      `;
      const params = [
        reply.inquiry_id,
        reply.staff_name,
        reply.response,
        getKenyaTimeISO(),
      ];

      await safeQuery(query, params);
      console.log('✅ Staff reply saved successfully.');
      io.emit('inquiry_updated', reply);
      console.log('📢 Broadcasted inquiry_updated to client.');
      console.log('----------------------------------------------------------');
    } catch (err) {
      console.error('❌ Error saving staff reply:', err);
      socket.emit('inquiry_error', { message: 'Failed to save staff reply' });
    }
  });

  // 🔹 4️⃣ Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(
      `🔴 Client disconnected (Socket ID: ${socket.id}) → Reason: ${reason}`,
    );
    console.log('----------------------------------------------------------');
  });
});

// 🔹 Utility function to broadcast monitoring alerts
function broadcastActiveMonitoringAlert(alert) {
  console.log('🚨 [broadcastActiveMonitoringAlert] Alert Data:', alert);
  io.emit('active_monitoring_alert', alert);
  console.log('📢 Broadcasted active monitoring alert.');
  console.log('----------------------------------------------------------');
}

// Initialize active monitoring with Socket.IO broadcast function
const { activeMonitoringAssist } = createActiveMonitoringAssist(
  broadcastActiveMonitoringAlert,
);

app.get('/api/v1/restpoint/notifications', async (req, res) => {
  try {
    const notifications = await safeQuery(
      `SELECT * FROM notifications ORDER BY created_at DESC`,
    );
    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    logMainServerError(err, 'Fetching notifications failed');
    res
      .status(500)
      .json({ success: false, message: 'Error fetching notifications' });
  }
});

// ----------------- Import Routes -----------------
const routeBase = '/api/v1/restpoint';
app.use(routeBase, require('./routes/deceasedRoutes'));
app.use(routeBase, require('./routes/moltuaryRoutes'));
app.use(routeBase, require('./routes/visitorsRoutes'));
app.use(routeBase, require('./routes/coffinRoutes'));
app.use(routeBase, require('./routes/userRoutes'));
app.use(routeBase, require('./routes/analyticsRoutes'));
app.use(routeBase, require('./routes/deviceRoutes'));
app.use(routeBase, require('./routes/driverDispatchRoutes'));
app.use(routeBase, require('./routes/notifications'));
app.use(routeBase, require('./routes/burilNotifcationRoute'));
app.use(routeBase, require('./routes/portal'));
app.use(routeBase, require('./routes/uploadDocument'));
app.use(routeBase, require('./routes/qrCodes'));
app.use(routeBase, require('./routes/paymentHistory'));
app.use(routeBase, require('./routes/checkOut'));
app.use(routeBase, require('./routes/coldRoom'));
app.use(routeBase, require('./routes/tagRoutes'));

app.use(routeBase, require('./routes/embalming'));
app.use(routeBase, require('./routes/invoiceRoutes'));
app.use(routeBase, require('./routes/eventsroutes'));
app.use(routeBase, require('./routes/sendWatsApp'));

// -404
app.use((req, res) => res.status(404).json({ message: ' Route not found' }));

// start  server
(async () => {
  await startDB();
  await initBackgroundTasks(io);

  // Initialize performance
  await updatePerformanceStats();

  server.listen(PORT, HOST, () => {
    startPerformanceMonitoring(io); // Start the active monitoring loop
    console.log({
      message: '✅ App & Socket.IO server running',
      host: HOST,
      port: PORT,
      status: true,
    });
    console.log('📊 Performance monitoring enabled');
    console.log(
      '📝 Request logging enabled - All requests stored in logs directory',
    );
  });
})();
