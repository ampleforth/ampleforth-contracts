#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PROJECT_DIR=$DIR/../

# Exit script as soon as a command fails.
set -o errexit

process-pid(){
  lsof -t -i:$1
}

frg-truffle(){
  npx truffle \
    --working-directory $PROJECT_DIR \
    "$@"
}

run-unit-tests(){
  frg-truffle \
    --network $1 \
    --timeout 25000 \
    test \
    $PROJECT_DIR/test/unit/*.js
}

run-simulation-tests(){
  frg-truffle \
    --network $1 \
    test \
    test/simulation/*
}

run-load-tests(){
  frg-truffle \
    --network $1 \
    exec \
    $PROJECT_DIR/test/load/gas_utilization.js verify
}

read REF GANACHE_PORT < <(npx get-network-config ganacheUnitTest)
read REF GETH_PORT < <(npx get-network-config gethUnitTest)

# Is chain running?
if [ $(process-pid $GANACHE_PORT) ]
then
  REFRESH_GANACHE=0
else
  REFRESH_GANACHE=1
fi
if [ $(process-pid $GETH_PORT) ]
then
  REFRESH_GETH=0
else
  REFRESH_GETH=1
fi

# Stop chain
cleanupGanache(){
  if [ "$REFRESH_GANACHE" == "1" ]
  then
    npx stop-chain "ganacheUnitTest"
  fi
}

cleanupGeth(){
  if [ "$REFRESH_GETH" == "1" ]
  then
    npx stop-chain "gethUnitTest"
  fi
}

echo "------Start blockchain(s)"
npx start-chain "ganacheUnitTest"

echo "------Deploying contracts"
npx truffle  migrate --reset --network "ganacheUnitTest"
npx truffle --network "ganacheUnitTest" exec $PROJECT_DIR/scripts/clean_deploy_contracts.js

echo "------Running unit tests"
run-unit-tests "ganacheUnitTest"

echo "------Running gas utilization test"
run-load-tests "ganacheUnitTest"

if [ "${TRAVIS_EVENT_TYPE}" == "cron" ]
then
  echo "------Running simulation tests"
  run-simulation-tests "ganacheUnitTest"
fi
trap cleanupGanache EXIT

if [ "${TRAVIS_EVENT_TYPE}" == "cron" ]
then
  echo "------Start blockchain(s)"
  npx start-chain "gethUnitTest"

  echo "------Deploying contracts"
  npx truffle  migrate --reset --network "gethUnitTest"
  npx truffle --network "gethUnitTest" exec $PROJECT_DIR/scripts/clean_deploy_contracts.js

  echo "------Running unit tests"
  run-unit-tests "gethUnitTest"

  echo "------Running simulation tests"
  run-simulation-tests "gethUnitTest"

  zos session --close
  trap cleanupGeth EXIT
fi

exit 0
