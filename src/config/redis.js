const Redis = require('ioredis');
const logger = require('../utils/logger');

let client;

function getRedisClient() {
  if (client) return client;

  const options = process.env.REDIS_URL
    ? process.env.REDIS_URL
    : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      };

  client = new Redis(options);

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}

module.exports = { getRedisClient };
