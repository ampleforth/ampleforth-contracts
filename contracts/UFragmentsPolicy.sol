pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./UFragments.sol";


interface ExchangeRateAggregator {
    function aggregateExchangeRates() external returns (uint128);
}


/**
 * @title uFragments Monetary Supply Policy
 * @notice This component regulates the token supply of the uFragments ERC20 token in response to
 *         price-feed oracles.
 */
contract UFragmentsPolicy is Ownable {
    using SafeMath for uint256;

    event Rebase(uint256 indexed epoch, int256 appliedSupplyAdjustment);

    UFragments private uFrags;
    ExchangeRateAggregator private rateAggregator;

    // Timestamp of last rebase operation
    uint256 public lastRebaseTimestamp;

    // At least this much time must pass between rebase operations.
    uint256 constant public MIN_REBASE_TIME_INTERVAL = 1 days;

    // The number of rebase cycles we keep supply deltas for.
    uint32 constant private HISTORY_LENGTH = 30;

    // Circular array of supplyDeltas. One value per rebase cycle.
    int256[HISTORY_LENGTH] private supplyDeltaHistory;
    uint32 private historyIndex = 0;

    // If the current exchange rate is within this tolerance, no supply update is performed.
    // 18 decimal fixed point format
    uint128 constant private DEVIATION_THRESHOLD = 0.05 * 10**18;  // 5%

    uint256 private epoch = 0;

    constructor(UFragments _uFrags, ExchangeRateAggregator _rateAggregator) public {
        uFrags = _uFrags;
        rateAggregator = _rateAggregator;
    }

    /**
     * @notice Anyone may call this function to initiate a new rebase operation, provided the
     *         minimum time period has elapsed.
     */
    function rebase() public {
        require(lastRebaseTimestamp + MIN_REBASE_TIME_INTERVAL <= now);
        epoch++;

        int256 supplyDelta = calcSupplyDelta();
        historyIndex = historyIndex + 1 % HISTORY_LENGTH;
        supplyDeltaHistory[historyIndex] = supplyDelta;

        int256 smoothedSupplyDelta = calcSmoothedSupplyDelta();
        uFrags.rebase(smoothedSupplyDelta);
        emit Rebase(epoch, smoothedSupplyDelta);
    }

    /**
     * @return The total supply adjustment that should be made in response to the exchange
     *         rate, as read from the aggregator.
     */
    function calcSupplyDelta() private view returns (int256) {
        uint128 rate = rateAggregator.aggregateExchangeRates();
        if (withinDeviationThreshold(rate)) {
            return 0;
        }

        uint128 target = 10**18;
        return int256(((rate - target) / target) * uFrags.totalSupply());
    }

    /**
     * @return The supplyDelta we should enact right now, as a function of the history of exchange
     *         rates up until now.
     */
    function calcSmoothedSupplyDelta() private view returns (int256) {
        // TODO(iles): Actually compute this
        return supplyDeltaHistory[historyIndex] / HISTORY_LENGTH;
    }

    /**
     * @param rate The current exchange rate, in 18 decimal fixed point format.
     * @return True if the rate is within the deviation threshold and false otherwise.
     */
    function withinDeviationThreshold(uint128 rate) private pure returns (bool) {
        uint128 target = 10**18;
        return (rate > target && rate - target < DEVIATION_THRESHOLD)
            || (rate < target && target - rate < DEVIATION_THRESHOLD);
    }
}
