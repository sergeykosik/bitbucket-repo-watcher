const _ = require('lodash');
const Promise = require('bluebird');
const rp = require('request-promise');

function getWatchedPaths(paths, watchList) {
  let found = false;
  const watchedPaths = [];

  _.each(paths, (path) => {
    found = watchList.some(interested => path.indexOf(interested) > -1);
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
