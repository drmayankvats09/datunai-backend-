const winston = require('winston');
const { Logtail } = require('@logtail/node');
const { LogtailTransport } = require('@logtail/winston');

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Add Better Stack transport only if token configured
if (process.env.LOGTAIL_SOURCE_TOKEN) {
  const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);
  transports.push(new LogtailTransport(logtail));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'datun-ai-backend',
    environment: process.env.NODE_ENV || 'production'
  },
  transports
});

module.exports = logger;
