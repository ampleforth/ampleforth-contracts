#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PROJECT_DIR=$DIR/../

# Exit script as soon as a command fails.
set -o errexit

process-pid(){
  lsof -t -i:$1
}

run-unit-tests(){
  npx truffle \
    --network $1 \
    test \
    $PROJECT_DIR/test/unit/*.js
}

run-simulation-tests(){
  npx truffle \
    --network $1 \
    exec \
    test/simulation/supply_precision.js

  npx truffle \
    --network $1 \
    exec \
    test/simulation/transfer_precision.js
}

run-all-tests(){
  read REF PORT < <(npx get-network-config $1)

  if [ $(process-pid $PORT) ]
  then
    REFRESH=0
  else
    REFRESH=1
    echo "------Start blockchain(s)"
    npx start-chain $1
  fi

  echo "------Running unit tests"
  run-unit-tests $1

  cleanup(){
    if [ "$REFRESH" == "1" ]
    then
      npx stop-chain $1
    fi
  }
  trap cleanup EXIT
}

npx truffle compile --reset

run-all-tests "ganacheUnitTest"

if [ "${TRAVIS_EVENT_TYPE}" == "cron" ]
then
  run-simulation-tests "ganacheUnitTest"
fi

exit 0
