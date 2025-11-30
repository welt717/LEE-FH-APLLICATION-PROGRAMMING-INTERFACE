const allowedOrigins = [
  'https://clicking-return-pic-chen.trycloudflare.com/',
  'https://journals-leaves-fifteen-management.trycloudflare.com',
  'http://localhost:5175',
  'https://clicking-return-pic-chen.trycloudflare.com',
  'https://garmin-reasonably-guards-time.trycloudflare.com',
  'http://localhost:5174',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error(`CORS origin ${origin} not allowed`), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

module.exports = { allowedOrigins, corsOptions };
