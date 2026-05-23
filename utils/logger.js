/**
 * Winston Logger Configuration
 * Provides structured logging with file and console transports
 */

const winston = require('winston');
const path = require('path');

const config = require('../config');

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Create transports array
const transports = [
    new winston.transports.Console({
        format: consoleFormat
    })
];

// Add file transports in production
if (config.isProduction) {
    transports.push(
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
}

const logger = winston.createLogger({
    level: config.logLevel,
    defaultMeta: { service: 'creviabeauty' },
    transports
});

// Add request logging helper
logger.logRequest = (req, res, duration) => {
    const logData = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    };

    if (res.statusCode >= 400) {
        logger.warn('Request completed with error', logData);
    } else {
        logger.info('Request completed', logData);
    }
};

module.exports = logger;
