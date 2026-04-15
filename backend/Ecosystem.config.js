// ecosystem.config.js — PM2 cluster config
// Install: npm install -g pm2
// Run:     pm2 start ecosystem.config.js --env production
// Monitor: pm2 monit

module.exports = {
  apps: [
    {
      name: "mha-api",
      script: "./server.js",

      // Cluster mode: spawn one worker per CPU core
      // This is the NODE.JS-level load balancer — all workers share port 5001
      instances: "max",         // or a fixed number like 4
      exec_mode: "cluster",

      // Env
      env: {
        NODE_ENV: "development",
        PORT: 5001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5001,
      },

      // Auto-restart on crash
      autorestart: true,
      watch: false,             // Set true only in dev

      // Memory threshold auto-restart (prevents memory leaks)
      max_memory_restart: "500M",

      // Graceful shutdown timeout
      kill_timeout: 5001,
      listen_timeout: 3000,

      // Log files
      out_file:   "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};