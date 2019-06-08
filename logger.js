/* eslint-disable global-require */
const os = require('os');

let logger = console;
if (os.platform() === 'win32') {
  // eslint-disable-next-line import/no-unresolved
  const { EventLogger } = require('node-windows');
  logger = new EventLogger('BitBucket Repo Watcher');
}

let isRunNow = false;

module.exports.logInfo = function logInfo(msg, args) {
  if (isRunNow) {
    console.log(msg, args);
  } else {
    logger.info(`${msg} ${args}`);
  }
};

module.exports.logError = function logError(msg, args) {
  if (isRunNow) {
    console.error(msg, args);
  } else {
    logger.error(`${msg} ${args}`);
  }
};

module.exports.setRunNow = function setRunNow(flag) {
  isRunNow = flag;
};
