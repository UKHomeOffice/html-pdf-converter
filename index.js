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

app.use(churchill(logger));

app.use(bodyParser.json({ limit: config.limit }));

app.use('/convert', controller);
app.use(errorHandler);
app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  logger.info(`Listening on ${config.host}:${config.port}`);
});

module.exports = app;
