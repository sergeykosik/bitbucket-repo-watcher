const _ = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const rp = require('request-promise');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const logger = require('./logger');
const config = require('./config');

const commitWebUrl = `${config.bbRepoWebUrl}commits`;
const commitsUrl = `${config.bbRepoApiUrl}commits/?page=`;
const diffStatUrl = `${config.bbRepoApiUrl}diffstat/`;
const diffUrl = `${config.bbRepoApiUrl}diff/`;

let isRunNow = false;

const authObj = {
  user: config.bbUser,
  pass: config.bbPass,
  sendImmediately: true
};

function getWatchedPaths(paths) {
  let found = false;
  const watchedPaths = [];

  _.each(paths, (path) => {
    found = config.watchList.some(interested => path.indexOf(interested) > -1);
    if (found) {
      watchedPaths.push(path);
    }
  });

  return watchedPaths;
}

function getDiffStat(commit) {
  return rp({
    url: diffStatUrl + commit.hash, method: 'GET', auth: authObj, json: true
  })
    .then((res) => {
      const commitPaths = [];
      const diffs = res.values || [];

      _.each(diffs, (diff) => {
        // get path object which could be
        // either old (modified, deleted);
        // or new (added)
        const changed = diff.old || diff.new;
        commitPaths.push(changed.path);
      });

      const watchedPaths = getWatchedPaths(commitPaths);

      if (watchedPaths.length > 0) {
        commit.paths = watchedPaths;
        return commit;
      }

      return {};
    })
    .catch((err) => {
      logger.logError('getDiffStat error', err);
      return {};
    });
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDiff(content) {
  const lines = content.split('\n');

  let inlineStyle = '';
  const styledContent = lines.map((line) => {
    if (line.startsWith('+')) {
      inlineStyle = 'style="background-color: #dfd;"';
    } else if (line.startsWith('-')) {
      inlineStyle = 'style="background-color: #fee8e9;"';
    } else if (line.startsWith('diff')) {
      inlineStyle = 'style="border-top: 1px solid #ccc; margin-top: 10px;"';
    } else {
      inlineStyle = '';
    }

    return `<div ${inlineStyle}>${escapeHtml(line)}</div>`;
  });
  // console.log('parseDiff', content, styledContent);

  return styledContent;
}

function getDiff(commit) {
  // The query string might exceed the limit
  // so only requesting few paths.
  // There might be a need to change the request
  // in order to load all paths
  const reducesPath = commit.paths.length > 5 ? commit.paths.slice(0, 6) : commit.paths;

  const pathQueryString = reducesPath.map(path => `path=${path}`).join('&');

  return rp({
    url: `${diffUrl + commit.hash}?${pathQueryString}`, method: 'GET', auth: authObj, json: true
  })
    .then((res) => {
      commit.diffDetails = parseDiff(res).join('');
      return commit;
    })
    .catch((err) => {
      logger.logError('getDiff error', err);
      return {};
    });
}

function buildPathsContent(paths) {
  let rows = '';
  _.each(paths, (path) => {
    rows += `<tr><td>${path}</td></tr>`;
  });

  return `<table>${rows}</table>`;
}

function buildDiffContent(diff) {
  return `<pre>${diff || ''}</pre>`;
}

function buildCommitContent(commit) {
  const content = `
  <b>Commit:</b> <a href="${commitWebUrl}/${commit.hash}" target="_blank">${commit.hash}</a><br/>
  <b>Author:</b> ${commit.author}<br/>
  <b>Date:</b> ${commit.date}<br/>
  <b>Message:</b><br/>
  ${commit.message} <br/><br/>
  <b>Changes:</b><br/>
  ${buildPathsContent(commit.paths)}
  <br/>
  <div style="background-color: #f9f9f9">
  ${buildDiffContent(commit.diffDetails)}
  </div>
  <br/>
  `;

  return content;
}

async function sendEmail(body) {
  // Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  // let account = await nodemailer.createTestAccount();

  // create reusable transporter object using the default SMTP transport
  const transporter = nodemailer.createTransport({
    service: config.emailProvider,
    auth: {
      user: config.emailUser,
      pass: config.emailPass
    }
  });

  // setup email data with unicode symbols
  const mailOptions = {
    from: `"Bitbucket Notifier" <${config.emailFrom}>`, // sender address
    to: config.emailTo, // list of receivers
    subject: `Bitbucket changes for ${config.bbRepoDesc}`, // Subject line
    text: '', // plain text body
    html: body // html body
  };

  // send mail with defined transport object
  const info = await transporter.sendMail(mailOptions);

  logger.logInfo('Email sent: %s', info.messageId);
}

function sendNotification(commits) {
  if (commits.length === 0) {
    return;
  }

  let content = '';
  _.each(commits, (changed) => {
    content += buildCommitContent(changed);
    content += '<hr>';
  });

  content += `<h5>Sent by Bitbucket-Repo-Notifier | ${moment().format('LLL')}</h5>`;

  // console.log('email content', content);

  sendEmail(content).catch(console.error);
}

function collectDiffs(commits) {
  if (!commits || commits.length === 0) {
    return;
  }

  const promises = [];
  for (let i = 0; i < commits.length; i++) {
    promises.push(getDiff(commits[i]));
  }

  Promise.all(promises).then((res) => {
    const changedCommitDiffs = [];

    for (let i = 0; i < res.length; i++) {
      changedCommitDiffs.push(res[i]);
    }

    sendNotification(changedCommitDiffs);
  });
}

function checkCommits(commits) {
  if (!commits || commits.length === 0) {
    return;
  }

  const promises = [];
  for (let i = 0; i < commits.length; i++) {
    promises.push(getDiffStat(commits[i]));
  }

  Promise.all(promises).then((res) => {
    const changedCommits = [];

    for (let i = 0; i < res.length; i++) {
      // could be empty objects, so check for any property
      if (res[i].hash) {
        changedCommits.push(res[i]);
      }
    }

    logger.logInfo('Found Commits: ', changedCommits.length);

    collectDiffs(changedCommits);
  });
}

function filterCommits(data) {
  const comparedDate = config.commitsFilterDate === 'TODAY' ? moment() : moment(config.commitsFilterDate);

  if (!comparedDate.isValid) {
    logger.logError('env.COMMITS_FILTER_DATE is invalid');
    return [];
  }

  let filtered = _.filter(data, (commit) => {
    if (config.commitsFilterDate === 'TODAY') {
      return moment(commit.date).isSame(comparedDate, 'date');
    }
    return moment(commit.date).isSameOrAfter(comparedDate, 'date');
  });

  const ignoreAuthors = config.ignoreAuthors ? config.ignoreAuthors.split(',') : [];

  if (ignoreAuthors.length > 0) {
    filtered = _.filter(filtered, (commit) => {
      const commitAuthor = commit.author && commit.author.raw ? commit.author.raw.toLowerCase() : '';
      return !ignoreAuthors.some(author => commitAuthor.indexOf(author.toLowerCase()) > -1);
    });
  }

  const ignoreMessages = config.ignoreMessages ? config.ignoreMessages.split(',') : [];

  if (ignoreMessages.length > 0) {
    filtered = _.filter(filtered, (commit) => {
      const commitMessage = commit.message || '';
      
      // https://stackoverflow.com/questions/37428338/check-if-a-string-contains-any-element-of-an-array-in-javascript
      return !ignoreMessages.some(msg => commitMessage.includes(msg))
    });
  }

  logger.logInfo('Filtered Commits:', filtered.length);

  if (filtered.length === 0) {
    return [];
  }

  const arr = _.map(filtered, (commit) => {
    const obj = {
      hash: commit.hash,
      message: commit.message,
      author: commit.author ? commit.author.raw : '',
      date: moment(commit.date).format('LLL')
    };
    return obj;
  });

  // console.log('commits', arr);

  return arr;
}

function buildExcludeQueryString() {
  const ignoreCommits = config.ignoreBranches ? config.ignoreBranches.split(',') : [];
  const excludeQueryParams = ignoreCommits.map(name => `exclude=${name}`).join('&');
  return excludeQueryParams ? `&${excludeQueryParams}` : '';
}

function checkRepo() {
  const requests = [];

  // Make a number of paged requests which would return 30 commits per page
  for (let i = 1; i <= config.commitPages; i++) {
    requests.push(rp({
      url: `${commitsUrl}${i}${buildExcludeQueryString()}`, method: 'GET', auth: authObj, json: true
    }));
  }

  Promise.all(requests)
    .then((res) => {
      const commits = [];

      for (let i = 0; i < res.length; i++) {
        commits.push(...res[i].values);
      }

      logger.logInfo('Retrieved Commits: ', commits.length);
      const mapped = filterCommits(commits);
      checkCommits(mapped);
    })
    .catch((err) => {
      logger.logError('Get commits failed', err);
    });
}

function parseScheduleDate(val) {
  if (!val) {
    logger.logError('parseScheduleDate value is empty');
    return null;
  }

  const dateObj = {};
  const parts = val.split(',') || [];
  _.each(parts, (part) => {
    const prop = part.split(':');
    dateObj[prop[0]] = Number(prop[1]);
  });
  return dateObj;
}

/**
 * Start app
 */

// Check the command arguments for "-now"
// to bypass the scheduler
process.argv.forEach((val, index) => {
  // console.log('arg', index, val);
  if (index === 2 && val === '-now') {
    isRunNow = true;
  }
  logger.setRunNow(isRunNow);
});

logger.logInfo('Watch list: ', config.watchList.join(','));

if (isRunNow) {
  logger.logInfo('Bypass scheduler');
  checkRepo();
} else {
  const scheduleDate = parseScheduleDate(config.scheduleDate);

  if (_.isEmpty(scheduleDate)) {
    logger.logError('Scheduler Date is Emtpy.');
  }

  logger.logInfo(`Scheduled for ${config.scheduleDate}`);

  schedule.scheduleJob(scheduleDate, () => {
    checkRepo();
  });
}

module.exports.parseScheduleDate = parseScheduleDate;
