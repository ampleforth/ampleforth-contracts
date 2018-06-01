#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PROJECT_DIR=$DIR/../../

MNEMONIC='fragments.org'
GAS_PRICE=1000000000
BLOCK_GAS_LIMIT=7989556
frg-ganache(){
  $PROJECT_DIR/node_modules/ganache-cli/build/cli.node.js \
    -g $GAS_PRICE \
    -l $BLOCK_GAS_LIMIT \
    -a 10 \
    -m $MNEMONIC \
    "$@"
}

run-ganache(){
  REFRESH=$1
  NETWORK_REF=$2
  PORT=$3

  echo "Running local ganache network: $NETWORK_REF"
  frg-ganache -p $3 > $DIR/logs/$NETWORK_REF.log &
  echo "Started local ganache chain"
  echo "Network port: $PORT"
  echo "Logging: $DIR/logs/$NETWORK_REF.log"
}
