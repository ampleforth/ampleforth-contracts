if [ $TRAVIS_EVENT_TYPE == "cron" ]; then
  echo "Test Suite: FULL"
  TEST_SUITE="full"
else
  echo "Test Suite: LITE"
  TEST_SUITE="lite"
fi

npx setup-local-chains $TEST_SUITE
