# bitbucket-repo-watcher
A node.js utility to watch specific files / folders of a bitbucket repository and get notified by email.

If you are interested to be notified when specific files or folders have been changed.


## How to setup and run

1. `$ git clone git@github.com:Havrl/bitbucket-repo-watcher.git`
2. `$ cd bitbucket-repo-watcher`
3. `$ npm install`
4. Set the configuration file (see How to configure)
5. `$ npm run now`

## How to configure

1. Open bitbucket-repo-watcher folder in the IDE of your choice
2. Rename .env_example to .env
3. Replace the values with the real ones

## How to install as a Windows service

1. Ensure the correct config is in place
2. `$ npm run install-win-service`
3. Run services.msc to open the Services Manager 
4. Start the `bitbucket-repo-watcher` service


Variable | Description | Example
---|---|---
BITBUCKET_REPO_URL | Bitbucket url | https://api.bitbucket.org/2.0/repositories/sergey-kosik/bitbucket-repo-watcher/
BITBUCKET_REPO_DESC | Description of the repo will be used as a title of the email | Bitbucket Repository Watcher


### scheduler

### install as win service

### check event view
Search for "nssm" 
