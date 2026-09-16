'use strict';

const app = require('express')();
const bodyParser = require('body-parser');
const churchill = require('churchill');
const config = require('./config');
const logger = require('hof-logger')({
  loglevel: config.loglevel || 'info'
});
const controller = require('./controllers/convert');
const errorHandler = require('./middleware/error-handler');
const Converter = require('./models/converter');

app.use(churchill(logger));

app.use(bodyParser.json({ limit: config.limit }));

app.use('/convert', controller);
app.use(errorHandler);
const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  logger.info(`Listening on ${config.host}:${config.port}`);
});

const shutdown = signal => {
  logger.info(`Received ${signal}; closing html-pdf-converter`);
  server.close(() => {
    Converter.close()
      .then(() => process.exit(0))
      .catch(error => {
        logger.error('Failed closing PDF converter', error);
        process.exit(1);
      });
  });
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
