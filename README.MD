# Renewal reminder scheduler

This is a cron job to remind makerspace members that they might need to renew soon

Runs once a day everyday

### Makerspace Contributors

Because this is low risk service changes deploy on push to master

Requires running mongod, node, and npm

To test locally reach out on the slack #access_control channel for the key and access to the test channel. Running deploy in local with the key will decrypt the configuration and run the reminders in the test configuration. This config ONLY messages the test channel. Please keep debugging message in test_channel

Edit the following command with the right env, token, and key and run it in bash (root of project) to start things up

    touch /config/kick_off_cd.sh && chmod +x /config/kick_off_cd.sh && echo " #!/bin/bash
    export ENVIRONMENT="local"
    export ORCASTRATE_SERVER="https://orcastrate.herokuapp.com/"
    export CONNECT_TOKEN=<TEST_TOKEN>
    export REPO_NAME="test_reminders" # will not auto deploy
    export CONFIG_KEY=<CONFIG_KEY_FOR_THIS_ENV>
    node deploy.js
    " >> /config/kick_off_cd.sh && cd config/ && ./kick_off_cd.sh

if you need to change environment variables, do so in its decrypted_*.js file. You will need to write over the current encrypted_* file for that environment to commit to github. This can be done by running encrypt.js needs the config key used to decrypt. After editing the following template with proper key and env run it in the root of the project

    touch /config/crypt_all_the_things.sh && chmod +x crypt_all_the_things.sh && echo "#!/bin/bash
    export ENVS="local"
    export KEYS="<CONFIG_KEY>"
    node encrypt.js
    " >> /config/crypt_all_the_things.sh && cd config/ && ./crypt_all_the_things.sh
 
### If creating a different system

To start scheduler, create a file called start.sh put more or less the info below with correct information for your implementation. You'll want to look into replicating the masterslacker server or forking and using the slack library directly. We uses the masterslacker server because it abstracts controlling credentials and gives some ability to do admin task with out sharing those credentials

Then run chmod +x start.sh to make this file executable

Then to start type ./start.sh

    #!/bin/bash

    export MONGODB_URI="mongodb://host/urdb" # Address of your mongo database
    export MASTER_SLACKER="integration-url"  # Address of slack integration server
    export CONNECT_TOKEN="your-token"        # token to use slack server
    export HOUR_TO_SEND=7                    # Hour to run report in day 0-23
    export TESTING_MA=true                   # State whether testing application or not

    if $TESTING_MA; then
        export CHANNEL="test_channel"
        node scheduled_check.js
    else
        export CHANNEL="prod_channel_to_send_to"
        npm install
        npm run start
    fi
