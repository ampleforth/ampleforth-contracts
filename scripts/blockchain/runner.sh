#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

# Blockchain runners
source $DIR/ganache-runner.sh
source $DIR/geth-runner.sh
source $DIR/index.sh

if [ ! -z $2 ]
then
  CHAINREF=$2
else
  CHAINREF="ganacheUnitTest"
fi
if [ "$1" == "1" ]; then
  start-chain $CHAINREF
  deploy-contracts $CHAINREF
else
  stop-chain $CHAINREF
fi
