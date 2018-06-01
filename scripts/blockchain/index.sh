#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PROJECT_DIR=$DIR/../../

# Blockchain runners
source $DIR/ganache-runner.sh
source $DIR/geth-runner.sh

# $1 => Network ref specifed in truffle.js
get-network-config(){
  NETWORK_REF=$1
  PORT=0
  CHAIN_RNR=99
  if [ "$NETWORK_REF" == "ganacheDev" ]; then
    PORT=7545
    CHAIN_RNR=0
  elif [ "$NETWORK_REF" == "gethDev" ]; then
    PORT=7550
    CHAIN_RNR=1
  elif [ "$NETWORK_REF" == "ganacheUnitTest" ]; then
    PORT=8545
    CHAIN_RNR=0
  elif [ "$NETWORK_REF" == "gethUnitTest" ]; then
    PORT=8550
    CHAIN_RNR=1
  else
    echo "Invalid network reference"
    exit -1
  fi
  echo "$NETWORK_REF" "$PORT" "$CHAIN_RNR"
}

frg-truffle(){
  $PROJECT_DIR/node_modules/truffle/build/cli.bundled.js \
    --working-directory $PROJECT_DIR \
    "$@"
}

process-pid(){
  lsof -t -i:$1
}

start-appropriate-chain(){
  REFRESH=1
  read NETWORK_REF PORT CHAIN_RNR < <(get-network-config $1)
  if [ $CHAIN_RNR == 0 ]; then
    run-ganache $REFRESH $NETWORK_REF $PORT
  elif [ $CHAIN_RNR == 1 ]; then
    run-geth $REFRESH $NETWORK_REF $PORT
  else
    echo "Invalid blockchain runner"
    exit -1
  fi
}

start-chain(){
  read NETWORK_REF PORT CHAIN_RNR < <(get-network-config $1)
  if [ $(process-pid $PORT) ]; then
    echo "Using blockchain running on $PORT"
  else
    echo "Starting blockchain on $PORT"
    start-appropriate-chain $NETWORK_REF
  fi
}

stop-chain(){
  read NETWORK_REF PORT CHAIN_RNR < <(get-network-config $1)
  echo "Shutting down blockchain on $PORT"
  CHAIN_PID=$(process-pid $PORT)
  if [[ $CHAIN_PID ]]; then
    kill -9 $CHAIN_PID
  fi
}

deploy-contracts(){
  echo "Removing previous builds"
  rm -rf $DIR/build

  echo "Deploying contracts onto the blockchain"
  read NETWORK_REF PORT CHAIN_RNR < <(get-network-config $1)
  frg-truffle --network $NETWORK_REF migrate --reset
}
