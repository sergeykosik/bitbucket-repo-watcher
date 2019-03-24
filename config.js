// https://medium.com/the-node-js-collection/making-your-node-js-work-everywhere-with-environment-variables-2da8cdf6e786
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  bbRepoWebUrl: process.env.BITBUCKET_REPO_WEB_URL,
  bbRepoApiUrl: process.env.BITBUCKET_REPO_API_URL,
  bbRepoDesc: process.env.BITBUCKET_REPO_DESC,
  bbUser: process.env.BITBUCKET_USER,
  bbPass: process.env.BITBUCKET_PASS,
  commitPages: process.env.COMMIT_PAGES,
  watchList: process.env.WATCH_LIST.split(','),
  commitsFilterDate: process.env.COMMITS_FILTER_DATE,
  ignoreAuthors: process.env.IGNORE_AUTHORS,
  ignoreCommits: process.env.IGNORE_COMMITS,
  ignoreCommitsWithMessages: process.env.IGNORE_COMMITS_WITH_MESSAGES,
  scheduleDate: process.env.SCHEDULE_DATE,
  emailProvider: process.env.EMAIL_PROVIDER,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM,
  emailTo: process.env.EMAIL_TO
};
