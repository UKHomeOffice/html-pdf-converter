const path = require('path');
const fs = require('fs');
const fetch = require('r2');

const config = require('./config');

const params = {
  method: 'POST',
  json: {
    template: `<p>hi world</p>`
  }
};
fetch(`http://${config.host}:${config.port}/convert`, params)
  .response
  .then(response => {
    if (response.status < 300) {
      response.body.pipe(fs.createWriteStream(path.resolve(__dirname, './test.pdf')));
    }
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });