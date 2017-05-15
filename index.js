'use strict';

const app = require('express')();
const bodyParser = require('body-parser');
const churchill = require('churchill');
const logger = require('hof-logger')();
const config = require('./config');
const controller = require('./controllers/convert');
const errorHandler = require('./middleware/error-handler');

if (config.env === 'production') {
  app.use(churchill(logger));
}

app.use(bodyParser.json());

app.use('/convert', controller);
app.use(errorHandler);
app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  logger.info(`Listening on ${config.host}:${config.port}`);
});

module.exports = app;
