# Renewal reminder scheduler

To start scheduler, create a file called start.sh put more or less the info bellow with correct information

Then run chmod +x start.sh to make this file executable

Then to start type ./start.sh

    #!/bin/bash

    MONGODB_URI="mongodb://host/urdb"
    export MONGODB_URI

    SLACK_WEBHOOK_URL="urhook"
    export SLACK_WEBHOOK_URL

    # State whether testing application or not
    TESTING_MA=false
    export TESTING_MA

    if $TESTING_MA; then
        # run at 8 next day
        node scheduled_check.js 8
    else
        npm install
        pm2 start scheduled_check.js 8
    fi
