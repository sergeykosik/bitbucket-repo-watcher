const _ = require('lodash');
const moment = require('moment');
const request = require('request');
const Bluebird = require('bluebird');
const rp = require('request-promise');
const nodemailer = require("nodemailer");

// https://medium.com/the-node-js-collection/making-your-node-js-work-everywhere-with-environment-variables-2da8cdf6e786
const dotenv = require('dotenv');
dotenv.config();

const commitsUrl = 'https://api.bitbucket.org/2.0/repositories/ocrex/ocrex.desktop.docurec-v2/commits/?page=';
const diffStatUrl = 'https://api.bitbucket.org/2.0/repositories/ocrex/ocrex.desktop.docurec-v2/diffstat/';
const diffUrl = 'https://api.bitbucket.org/2.0/repositories/ocrex/ocrex.desktop.docurec-v2/diff/';

var authObj = { 
  'user': process.env.BITBUCKET_USER,
  'pass': process.env.BITBUCKET_PASS,
  'sendImmediately': true
};

/////////////////////////////////////////////
// '3671a93f7af9d1f51aecc06933da25a1899aee47'  -- one file
// sergey: 'e224e15', '90da35e'; 
let commitHash = 'e224e15'; //'8f349818c99d1968f3e9ae690089e99b8a6f42f9';

// listCommits();
// showDiff(commitHash);
showDiffStat(commitHash);





function listCommits() {
  // Make 4 paged requests which would return 4*30 commits, which should cover about 2 days
  var request1 = rp({ url:commitsUrl+'1', method: 'GET', auth: authObj, json: true });
  var request2 = rp({ url:commitsUrl+'2', method: 'GET', auth: authObj, json: true });
  var request3 = rp({ url:commitsUrl+'3', method: 'GET', auth: authObj, json: true });
  var request4 = rp({ url:commitsUrl+'4', method: 'GET', auth: authObj, json: true });

  Bluebird.all([request1, request2, request3, request4])
      .spread(function (res1, res2, res3, res4) {
          var commits = _.concat(res1.values, res2.values, res3.values, res4.values);

          // console.log('commits count', commits[0]);
          parseCommits(commits);
      })
      .catch(function (err) {
        console.log('Get commits failed', err);
      });
}

function showDiffStat(hash) {
  var difReq = rp({ url:diffStatUrl+hash, method: 'GET', auth: authObj, json: true });
  
  difReq.then(function (res) {
    console.log('Dif', res);

    const paths = [];
    const diffs = res.values || [];

    _.each(diffs, diff => {

      // get path object which could be
      // either old (modified, deleted);
      // or new (added)
      var changed = diff.old || diff.new;
      paths.push(changed.path);
      console.log('paths', paths);
    });

    const isChanged =  isTargetProjectChanged(paths);

    console.log('is SPA changed', isChanged);

    if(isChanged) {
      sendEmail(paths).catch(console.error);
    }

  })
  .catch(function (err) {
    console.log('showDiffStat error', err);
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

function parseCommits(data) {
   
   var filtered = _.filter(data, commit => {
    return moment(commit.date).isAfter('2019-01-24', 'day');
   });
   
   var arr = _.map(filtered, commit => {
     return { id: commit.hash, author: commit.author.raw, date: moment(commit.date).format('LL') };
   });

   console.log('commits', arr);
   console.log('filtered count', arr.length);
}

function isTargetProjectChanged(changes) {
  var targetProject = 'OCrex.Web.DocuRec.Spa';
  var changed = false; 
  _.each(changes, path => {
    if (path.indexOf(targetProject) > -1) {
      changed = true;
      return;
    }
  });

  return changed;
}

function buildEmailContent(paths) {
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
    service: process.env.EMAIL_PROVIDER,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // setup email data with unicode symbols
  let mailOptions = {
    from: `"Bitbucket Notifier" <${process.env.EMAIL_FROM}>`, // sender address
    to: process.env.EMAIL_TO, // list of receivers
    subject: "Docurec repo changes", // Subject line
    text: "", // plain text body
    html: "<b>List of modified files:</b><br />" + buildEmailContent(paths) // html body
  };

  // send mail with defined transport object
  let info = await transporter.sendMail(mailOptions)

  console.log("Message sent: %s", info.messageId);
}



