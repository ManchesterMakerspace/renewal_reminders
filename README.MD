# Renewal reminder scheduler

To start scheduler, create a file called start.sh put more or less the info bellow with correct information

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
