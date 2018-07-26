if [ "${TRAVIS_EVENT_TYPE}" == "cron" ]; then
  echo "------Setting up environment"
  sudo apt-get install software-properties-common
  sudo add-apt-repository -y ppa:ethereum/ethereum
  sudo apt-get update
  sudo apt-get install ethereum
fi
