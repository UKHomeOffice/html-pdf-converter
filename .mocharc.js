module.exports = {
  forbidOnly: !!process.env.CI,
  exit: true,
  recursive: true,
  timeout: 5000,
  require: 'dotenv/config'
};
