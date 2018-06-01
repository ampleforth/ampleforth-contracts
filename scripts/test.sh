#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PROJECT_DIR=$DIR/../

# Exit script as soon as a command fails.
set -o errexit

source $DIR/blockchain/index.sh

run-unit-tests(){
  frg-truffle \
    --network $NETWORK_REF \
    test \
    $PROJECT_DIR/test/unit/*
}

run-simulation-tests(){
  frg-truffle \
    --network $NETWORK_REF \
    test \
    test/simulation/*
}

run-load-tests(){
  frg-truffle \
    --network $NETWORK_REF \
    exec \
    $PROJECT_DIR/test/load/gas_utilization.js verify
}

NETWORK_REF=$1
read NETWORK_REF PORT < <(get-network-config $NETWORK_REF)

# Is chain running?
if [ $(process-pid $PORT) ]; then
  REFRESH=0
else
  REFRESH=1
fi

# Start chain
start-chain $NETWORK_REF
deploy-contracts $NETWORK_REF

# Run tests
run-unit-tests
run-load-tests
if [ "${TRAVIS_EVENT_TYPE}" == "cron" ]; then
  run-simulation-tests
fi

# Stop chain
cleanup(){
  if [ "$REFRESH" == "1" ]; then
    stop-chain $NETWORK_REF
  fi
}
trap cleanup EXIT
