const _ = require('lodash');
const Promise = require('bluebird');
const rp = require('request-promise');
const config = require('./config');
const util = require('util');

const commitsUrl = `${config.bbRepoApiUrl}commits/?page=`;
const commitUrl = `${config.bbRepoApiUrl}commit/`;
const diffStatUrl = `${config.bbRepoApiUrl}diffstat/`;
const diffUrl = `${config.bbRepoApiUrl}diff/`;
const srcUrl = `${config.bbRepoApiUrl}src/`;
const prUrl = `${config.bbRepoApiUrl}pullrequests/`;

const authObj = {
  user: config.bbUser,
  pass: config.bbPass,
  sendImmediately: true
};

function req(url) {
  return {
    url: `${url}`, method: 'GET', auth: authObj, json: true
  };
}

function getCommit(commitHash) {
  return rp(req(commitUrl + commitHash))
    .then((res) => {
      console.log('getCommit', res);
    }).catch((err) => {
      console.log('getCommit error', err);
    });
}

function getCommits() {
  return rp(req(commitsUrl + 1))
    .then((res) => {
      console.log('getCommits', res);
    }).catch((err) => {
      console.log('getCommits error', err);
    });
}

function getDiffStat(commitHash) {
  return rp(req(diffStatUrl + commitHash))
    .then((res) => {
      const diffs = res.values || [];
      console.log('getDiffStat', diffs);
    })
    .catch((err) => {
      console.log('getDiffStat error', err);
    });
}

function getDiff(commitHash) {
  return rp(req(diffUrl + commitHash))
    .then((res) => {
      console.log('getDiff', res);
    })
    .catch((err) => {
      console.log('getDiff error', err);
    });
}

function getFile(commitHash, path) {
  return rp(req(`${srcUrl}${commitHash}/${path}`))
    .then((res) => {
      console.log('getFile', res);
    })
    .catch((err) => {
      console.log('getFile error', err);
    });
}

function getComment(prId, commentId) {
  return rp(req(`${prUrl}${prId}/comments/${commentId}`))
    .then((res) => {
      console.log('getComment', res);
    })
    .catch((err) => {
      console.log('getComment error', err);
    });
}

function getPullRequests(state) {
  return rp(req(`${prUrl}?state=${state}`))
    .then((res) => {
      const pullRequests = res.values;

      console.log(`${state} PR found: ${pullRequests.length}`);

      const prData = [];
      _.each(pullRequests, (pr) => {
        prData.push({
          id: pr.id,
          title: pr.title,
          summary: pr.summary.raw,
          state: pr.state,
          comment_count: pr.comment_count,
          updated_on: pr.updated_on,
          author: pr.author.display_name
        });
        // console.log('Pull Request', util.inspect(prData, { showHidden: false, depth: null }));
      });
    })
    .catch((err) => {
      console.log('getPullRequests', err);
    });
}

function getPullRequest(id, type, done) {
  return rp(req(`${prUrl}${id}/${type}`))
    .then((res) => {
      console.log(`getPullRequest ${id}`, res);

      if (done) {
        done(res);
      }
    })
    .catch((err) => {
      console.log('getPullRequests', err);
    });
}

function prDiffStat(data) {
  const modifiedPath = [];
  const diffs = data.values || [];

  _.each(diffs, (diff) => {
    // get path object which could be
    // either old (modified, deleted);
    // or new (added)
    const changed = diff.old || diff.new;
    modifiedPath.push(changed.path);
    console.log('PR diff', changed.path);
  });
}

function prComments(data) {
  console.log('prComments', util.inspect(data, { showHidden: false, depth: null }));

  const contents = [];
  const comments = data.values || [];

  _.each(comments, (comment) => {
    contents.push(comment.content.raw);
    console.log('PR comment', comment.content.raw);
  });
}

// getCommits();
// getCommit('8cadbef587596d94b094990ff590e2f20c9a2943');
// getDiffStat('8cadbef587596d94b094990ff590e2f20c9a2943');
// getDiff('8cadbef587596d94b094990ff590e2f20c9a2943');
// getFile('8cadbef587596d94b094990ff590e2f20c9a2943', 'app/src/main/java/com/inspeko/app/data/FirebaseRepository.java');

getPullRequests('OPEN');

/* 
 * getFile takes hash from pullrequest's source/commit/hash retrieved using getPullRequest('1213', '');
 * filename is taken from diffstat using getPullRequest('1213', 'diffstat', prDiffStat);
*/
// getFile('eb975be4635d', 'src/Web.DocuRec/_build/build.json');
// getPullRequest('1213', '');
// getPullRequest('1213', 'diffstat', prDiffStat);
// getPullRequest('1166', 'comments', prComments);
// getComment('1166', '108398861');
// getFile('6bb7bd84045c', 'src/Web.ServiceInterface/Services/OrganisationService.cs');

/*

 for each comment
    filter out only:
       links.code is not null
       or inline is not null

 to get the file at the revision with old code parse links.code.href:
 'https://api.bitbucket.org/2.0/repositories/ocrex/ocrex.desktop.docurec-v2/diff/ocrex/ocrex.desktop.docurec-v2:9daa7b929a5b..6bb7bd84045c?path=src%2FWeb.ServiceInterface%2FServices%2FOrganisationService.cs'


*/

/* 
TODO:
see the explanation about git diff: https://www.atlassian.com/git/tutorials/saving-changes/git-diff 

From getDiff we split the content 
  1. by file using "diff --git"
  2. then we split each file by diff chunkes using "@@ ... @@" (use regex to ensure both markers used)
  3. then we remove all lines started with "-"
  4. then we can try to send those peaces of code for analysis

*/
