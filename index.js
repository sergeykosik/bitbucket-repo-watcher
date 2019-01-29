const _ = require('lodash');
const moment = require('moment');
const request = require('request');
const Bluebird = require('bluebird');
const rp = require('request-promise');
const nodemailer = require('nodemailer');
const config = require('./config');

const commitsUrl = config.bbRepoUrl + 'commits/?page=';
const diffStatUrl = config.bbRepoUrl + 'diffstat/';
const diffUrl = config.bbRepoUrl + 'diff/';

let changedCommits = [];

var authObj = { 
  'user': config.bbUser,
  'pass': config.bbPass,
  'sendImmediately': true
};

// console.log('config.watchList', config.watchList);

// '3671a93f7af9d1f51aecc06933da25a1899aee47'  -- one file
// sergey: 'e224e15', '90da35e'; 
// let commitHash = 'e224e15'; //'8f349818c99d1968f3e9ae690089e99b8a6f42f9';

listCommits();
// showDiff(commitHash);
// showDiffStat(commitHash);

///////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////

function listCommits() {
  // Make 4 paged requests which would return 4*30 commits, which should cover about 2 days
  var request1 = rp({ url:commitsUrl+'1', method: 'GET', auth: authObj, json: true });
  var request2 = rp({ url:commitsUrl+'2', method: 'GET', auth: authObj, json: true });
  var request3 = rp({ url:commitsUrl+'3', method: 'GET', auth: authObj, json: true });
  var request4 = rp({ url:commitsUrl+'4', method: 'GET', auth: authObj, json: true });

  Bluebird.all([request1, request2, request3, request4])
      .spread(function (res1, res2, res3, res4) {
          var commits = _.concat(res1.values, res2.values, res3.values, res4.values);

          const mapped = mapCommits(commits);
          checkCommits(mapped);

          // TODO: sendNotification should be called only after all getDiffStat completed.
          sendNotification();
      })
      .catch(function (err) {
        console.log('Get commits failed', err);
      });
}

function checkCommits(commits) {
  for (let i = 0; i < commits.length; i++) {
    _.delay(getDiffStat, 500, commits[i]);
  }
}
  

function getDiffStat(commit) {
  var difReq = rp({ url:diffStatUrl + commit.hash, method: 'GET', auth: authObj, json: true });
  
  difReq.then(function (res) {
    // console.log('Dif', res);

    const paths = [];
    const diffs = res.values || [];

    _.each(diffs, diff => {

      // get path object which could be
      // either old (modified, deleted);
      // or new (added)
      var changed = diff.old || diff.new;
      paths.push(changed.path);
      // console.log('paths', paths);
    });

    const isChanged = isAnyWachedChanged(paths);

    if(isChanged) {
      commit.paths = paths;
      changedCommits.push(commit);
    }

  })
  .catch(function (err) {
    console.log('getDiffStat error', err);
  });
}

function showDiff(hash) {
  var difReq = rp({ url:diffUrl+hash, method: 'GET', auth: authObj, json: true });
  
  difReq.then(function (res) {
    console.log('Dif', res);
  })
  .catch(function (err) {
    console.log('showDiff error', err);
  });
}

function mapCommits(data) {
   
  let comparedDate = moment();

   var filtered = _.filter(data, commit => {
    // return moment(commit.date).isAfter('2019-01-24', 'day');
    return moment(commit.date).isSame(comparedDate, 'date');
   });
   
   var arr = _.map(filtered, commit => {
     return { 
       hash: commit.hash, 
       message: commit.message,
       author: commit.author.raw, 
       date: moment(commit.date).format('LLL') };
   });

   // console.log('commits', arr);
   // console.log('filtered count', arr.length);

   return arr;
}

function isAnyWachedChanged(paths) {
  let found = false;

  _.each(paths, path => {
    found = config.watchList.some(interested => path.indexOf(interested) > -1);
    if(found) {
      return;
    }
  }); ;
  console.log('isAnyWatchedChanged', found);
  return found;
}

function sendNotification() {
  if (changedCommits.length === 0) {
    return;
  }
  
  let content = '';
  _.each(changedCommits, changed => {
    content += buildCommitContent(changed);
    content += '<hr>';
  });

  console.log('email content', content);
  
  sendEmail(content).catch(console.error);
}
  
function buildCommitContent(commit) {
  let content = `
  <h4>Commit: ${commit.hash}</h4>
  <h4>Author: ${commit.author}</h4>
  <h4>Date: ${commit.date}</h4>
  <h4>Message:</h4>
  <p>${commit.message}</p>
  ${buildPathsContent(commit.paths)}
  `;

  return content;
}

function buildPathsContent(paths) {
  let rows = '';
  _.each(paths, path => {
    rows += `<tr><td>${path}</td></tr>`;
  });

  return `<table>${rows}</table>`;
}

async function sendEmail(paths) {
// Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  // let account = await nodemailer.createTestAccount();

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    service: config.emailProvider,
    auth: {
      user: config.emailUser,
      pass: config.emailPass
    }
  });

  // setup email data with unicode symbols
  let mailOptions = {
    from: `"Bitbucket Notifier" <${config.emailFrom}>`, // sender address
    to: config.emailTo, // list of receivers
    subject: "Docurec repo changes", // Subject line
    text: "", // plain text body
    html: "<b>List of modified files:</b><br />" + buildEmailContent(paths) // html body
  };

  // send mail with defined transport object
  let info = await transporter.sendMail(mailOptions)

  console.log("Message sent: %s", info.messageId);
}



