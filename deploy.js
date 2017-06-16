// deploy.js  services that imediately deploys this service when it need to be updated
var PATH = ' PATH=' + process.env.PATH + ' '; // assuming this is started manually, will help find node/npm, otherwise exact paths are needed

var orcastrate = {
    io: require('socket.io-client'),                          // to connect to our orcastrate intergration server
    init: function(server, token, repoName){
        orcastrate.io = orcastrate.io(server);                // orcastrate socket server connection initiation
        orcastrate.io.on('connect', function authenticate(){  // connect with orcastrator
            orcastrate.io.emit('authenticate', {
                token: token,
                name: repoName,
            });                                               // its important lisner know that we are for real
            orcastrate.io.on('deploy', run.deploy);           // respond to deploy events
        });
    }
};

var config = {
    env: process.env.ENVIRONMENT,
    crypto: require('crypto'),
    fs: require('fs'),
    zlib: require('zlib'),
    options: {
        env: require('./config/decypted_' + config.env)
    }
};

var run = {
    child: require('child_process'),
    deploy: function(){
        var stage1 = run.child.exec('git pull &&'+PATH+'npm install');
        stage1.on('close', function closeEvent(code){
            if(code){
                console.log('Deploy failed with code ' + code);
            } else {
                if(run.service){
                    run.service.kill();         // send kill signal to current process then start it again
                } else {run.start();}           // if its not allready start service up
            }
        });
    },
    start: function(code){
        if(code){
            run.restarts++;
            console.log('restart' + run.restarts + ' with code: ' + code);
        }
        run.restart(code);
        run.service = run.child.exec(PATH+'npm run start', config.options);
        run.service.stdout.on('data', function(data){console.log("" + data);});
        run.service.stderr.on('data', function(data){console.log("" + data);});
        run.service.on('close', run.start); // habituly try to restart process
        run.service.on('error', function(error){console.log('child exec error: ' + error);});
    }
};


orcastrate.init(process.env.ORCASTRATE_SERVER, process.env.CONNECT_TOKEN, process.env.REPO_NAME);
run.deploy();
