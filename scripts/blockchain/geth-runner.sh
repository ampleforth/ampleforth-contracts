#!/usr/bin/env bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
GAS_PRICE=1000000000
frg-geth(){
  geth --networkid 1234 \
   --maxpeers 0 \
   --nodiscover \
   --gasprice $GAS_PRICE \
   --rpc \
   --rpccorsdomain "*" \
   --ws \
   --wsorigins "*" \
   --nat "any"  \
   --verbosity 2 \
   --rpcapi="db,eth,net,web3,personal" \
   --wsapi="db,eth,net,web3,personal" \
   "$@"
}

run-geth(){
  REFRESH=$1
  NETWORK_REF=$2
  PORT=$3

  echo "Running local geth network: $NETWORK_REF"

  CHAIN_DATA=$DIR/logs/chain_data_$NETWORK_REF
  if [ $REFRESH == 1 ]; then
    rm -rf $CHAIN_DATA
    echo "Cleaning up: $CHAIN_DATA"
  fi
  echo "Saving blockchain data at: $CHAIN_DATA"

  GENESIS_CONFIG=$DIR/config/genesis.json
  frg-geth --datadir $CHAIN_DATA \
    --keystore $DIR/config/keystore \
    --identity $NETWORK_REF \
    init $GENESIS_CONFIG
  echo "Using keystore: $DIR/config/keystore"
  echo "Initialized local geth chain using: $GENESIS_CONFIG"

  frg-geth --datadir $CHAIN_DATA \
     --keystore $DIR/config/keystore \
     --identity $NETWORK_REF \
     --port $((PORT-1)) \
     --rpcport $((PORT)) \
     --wsport $((PORT+1)) \
     --mine 1 console 2> $DIR/logs/$NETWORK_REF.log &

  echo "Started local geth chain"
  echo "Network port: $((PORT-1))"
  echo "RPC HTTP port: $((PORT))"
  echo "RPC WS port: $((PORT+1))"
  echo "Logging: $DIR/logs/$NETWORK_REF.log &"
}
