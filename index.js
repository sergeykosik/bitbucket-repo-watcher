const _ = require('lodash');
const moment = require('moment');
const Promise = require('bluebird');
const rp = require('request-promise');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const config = require('./config');

const commitsUrl = `${config.bbRepoUrl}commits/?page=`;
const diffStatUrl = `${config.bbRepoUrl}diffstat/`;
// const diffUrl = `${config.bbRepoUrl}diff/`;

const changedCommits = [];

const authObj = {
  user: config.bbUser,
  pass: config.bbPass,
  sendImmediately: true
};

function isAnyWachedChanged(paths) {
  let found = false;

  _.each(paths, (path) => {
    found = config.watchList.some(interested => path.indexOf(interested) > -1);
    if (found) {
      return found;
    }
  });

  if (found) {
    console.log('isAnyWatchedChanged', found);
  }

  return found;
}

function getDiffStat(commit) {
  return rp({
    url: diffStatUrl + commit.hash, method: 'GET', auth: authObj, json: true
  })
    .then((res) => {
      const paths = [];
      const diffs = res.values || [];

      _.each(diffs, (diff) => {
        // get path object which could be
        // either old (modified, deleted);
        // or new (added)
        const changed = diff.old || diff.new;
        paths.push(changed.path);
      });

      const isChanged = isAnyWachedChanged(paths);

      if (isChanged) {
        commit.paths = paths;
        changedCommits.push(commit);
      }

      return this;
    })
    .catch((err) => {
      console.log('getDiffStat error', err);
      return this;
    });
}

function buildPathsContent(paths) {
  let rows = '';
  _.each(paths, (path) => {
    rows += `<tr><td>${path}</td></tr>`;
  });

  return `<table>${rows}</table>`;
}

function buildCommitContent(commit) {
  const content = `
  <b>Commit:</b> ${commit.hash}<br/>
  <b>Author:</b> ${commit.author}<br/>
  <b>Date:</b> ${commit.date}<br/>
  <b>Message:</b><br/>
  ${commit.message} <br/><br/>
  <b>Changes:</b><br/>
  ${buildPathsContent(commit.paths)}
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

  console.log('Message sent: %s', info.messageId);
}

function sendNotification() {
  if (changedCommits.length === 0) {
    return;
  }

  let content = '';
  _.each(changedCommits, (changed) => {
    content += buildCommitContent(changed);
    content += '<hr>';
  });

  content += `<h5>Sent by Bitbucket-Repo-Notifier | ${moment().format('LLL')}</h5>`;

  console.log('email content', content);

  sendEmail(content).catch(console.error);
}

function checkCommits(commits) {
  if (!commits || commits.length === 0) {
    return;
  }

  const promises = [];
  for (let i = 0; i < commits.length; i++) {
    promises.push(getDiffStat(commits[i]));
  }

  Promise.all(promises).then(() => {
    console.log('all completed', changedCommits);
    sendNotification();
  });
}

function filterCommits(data) {
  const comparedDate = config.commitsFilterDate === 'TODAY' ? moment() : moment(config.commitsFilterDate);

  if (!comparedDate.isValid) {
    console.log('env.COMMITS_FILTER_DATE is invalid');
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
  // console.log('filtered count', arr.length);

  return arr;
}

function checkRepo() {
  const requests = [];

  // Make a number of paged requests which would return 30 commits per page
  for (let i = 1; i <= config.commitPages; i++) {
    requests.push(rp({
      url: `${commitsUrl}${i}`, method: 'GET', auth: authObj, json: true
    }));
  }

  Promise.all(requests)
    .then((res) => {
      const commits = [];

      for (let i = 0; i < res.length; i++) {
        commits.push(...res[i].values);
      }

      const mapped = filterCommits(commits);
      console.log('commits num: ', mapped.length);
      checkCommits(mapped);
    })
    .catch((err) => {
      console.log('Get commits failed', err);
    });
}

function parseScheduleDate(val) {
  if (!val) {
    console.log('parseScheduleDate value is empty');
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
const scheduleDate = parseScheduleDate(config.scheduleDate);

if (_.isEmpty(scheduleDate)) {
  throw new Error('Error -> Scheduler Date is Emtpy.');
}

console.log(`Scheduled for ${config.scheduleDate}`);
console.log('Watch list', config.watchList);

// https://stackoverflow.com/questions/4018154/how-do-i-run-a-node-js-app-as-a-background-service

schedule.scheduleJob(scheduleDate, () => {
  checkRepo();
});


// showDiff(commitHash);
// showDiffStat(commitHash);

/* function showDiff(hash) {
  var difReq = rp({ url: diffUrl + hash, method: 'GET', auth: authObj, json: true });

  difReq
    .then(function(res) {
      console.log('Dif', res);
    })
    .catch(function(err) {
      console.log('showDiff error', err);
    });
} */
