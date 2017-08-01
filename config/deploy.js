// deploy.js  services that imediately deploys this service when it need to be updated
var PATH = ' PATH=' + process.env.PATH + ' ';// assuming this is started manually, will help find node/npm, otherwise exact paths are needed

var jitploy = {
    io: require('socket.io-client'),                       // to connect to our jitploy intergration server
    init: function(server, token, repoName){
        jitploy.io = jitploy.io(server);                   // jitploy socket server connection initiation
        jitploy.io.on('connect', function authenticate(){  // connect with orcastrator
            jitploy.io.emit('authenticate', {
                token: token,
                name: repoName,
            });                                            // its important lisner know that we are for real
            jitploy.io.on('deploy', run.deploy);           // respond to deploy events
        });
    }
};

var config = {
    env: process.env.ENVIRONMENT,
    key: process.env.CONFIG_KEY,
    crypto: require('crypto'),
    fs: require('fs'),
    options: {
        env: {}
    }, // ultimately config vars are stored here and past to program being tracked
    run: function(onFinsh){
        var readFile = config.fs.createReadStream(__dirname + '/encrypted_' + config.env);
        var decrypt = config.crypto.createDecipher('aes-256-ctr', config.key);
        var writeFile = config.fs.createWriteStream(__dirname + '/decrypted_' + config.env + '.js');
        readFile.pipe(decrypt).pipe(writeFile);
        writeFile.on('finish', function(){
            config.options.env = require(__dirname + '/decrypted_' + config.env + '.js');
            onFinsh(); // call next thing to do, prabably npm install
        });

    }
};

var run = {
    child: require('child_process'),
    cmd: function(command, cmdName, onSuccess, onFail){
        console.log('running command:' + command);
        run[cmdName] = run.child.exec(command, config.options);
        run[cmdName].stdout.on('data', function(data){console.log("" + data);});
        run[cmdName].stderr.on('data', function(data){console.log("" + data);});
        run[cmdName].on('close', function doneCommand(code){
            if(code){onFail(code);}
            else {onSuccess();}
        });
        run[cmdName].on('error', function(error){console.log('child exec error: ' + error);});
    },
    deploy: function(){ // or at least start to
        run.cmd('git pull', 'gitPull', function pullSuccess(){
            config.run(run.install); // decrypt configuration then install
        }, function pullFail(code){
            console.log('no pull? ' + code);
        });
    },
    install: function(){ // and probably restart when done
        run.cmd('cd ' + __dirname + ' &&' + PATH + 'npm install', 'npmInstall', function installSuccess(){
            run.start(run.service); // if its not already, start service up
        }, function installFail(code){
            console.log('bad install? ' + code);
        });
    },
    start: function(code){
        if(code){               // anything besides 0 is a case where we need to restart
            run.service.kill(); // send kill signal to current process then start it again
            console.log('restart with code: ' + code);
        }
        run.cmd('cd ' + __dirname + ' &&' + PATH + 'npm run start', 'service', run.start, run.start);
    }
};

jitploy.init(process.env.JITPLOY_SERVER, process.env.CONNECT_TOKEN, process.env.REPO_NAME);
run.deploy();
