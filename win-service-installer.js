// https://github.com/coreybutler/node-windows

const Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'BitBucket Repo Watcher',
  description: 'The bitbucket repository files watcher',
  script: require('path').join(__dirname,'index.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ]
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

svc.install();