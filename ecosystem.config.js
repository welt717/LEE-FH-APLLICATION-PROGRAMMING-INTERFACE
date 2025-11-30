module.exports = {
  apps: [
    {
      name: 'backend-api',
      script: 'index.js',

      // Restart when files change
      watch: true,
      ignore_watch: [
        'node_modules',
        'logs',
        'ecosystem.config.js',
        'package-lock.json',
        'package.json',
      ],

      // Auto restart if it crashes
      autorestart: true,

      // Restart if memory exceeds 500MB
      max_memory_restart: '500M',

      // Multiple CPU cores
      instances: 'max',
      exec_mode: 'cluster',

      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 5000,

        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'password',

        MARIA_DB_HOST: 'localhost',
        MARIA_DB_PORT: 3306,
        MARIA_DB_USER: 'root',
        MARIA_DB_PASSWORD: 'password',
        MARIA_DB_DATABASE: 'restpointdatabase',
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,

        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'password',

        MARIA_DB_HOST: 'localhost',
        MARIA_DB_PORT: 3306,
        MARIA_DB_USER: 'root',
        MARIA_DB_PASSWORD: 'password',
        MARIA_DB_DATABASE: 'restpointdatabase',
      },

      // Log settings
      output: './logs/out.log',
      error: './logs/error.log',
    },
  ],
};
