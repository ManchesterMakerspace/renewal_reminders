// encrypt.js encrypts local configuration files
var fs = require('fs');
var crypto = require('crypto');
var keyArray = process.env.KEYS.split(', ');
var envArray = process.env.ENVS.split(', ');
for(var i=0; i < keyArray.length; i++){ // for looping streams is probably stupid
    var readFile = fs.createReadStream(__dirname + '/decrypted_' + envArray[i] + '.js');
    var encrypt = crypto.createCipher('aes-256-ctr', keyArray[i]);
    var writeFile = fs.createWriteStream(__dirname + '/encrypted_' + envArray[i]);
    readFile.pipe(encrypt).pipe(writeFile);
}
