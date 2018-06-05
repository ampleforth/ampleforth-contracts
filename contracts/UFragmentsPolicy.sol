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
    uint256 public minRebaseTimeIntervalSec = 1 days;

    // The number of rebase cycles we keep supply deltas for.
    uint32 constant private HISTORY_LENGTH = 30;

    // Circular array of supplyDeltas. One value per rebase cycle.
    int256[HISTORY_LENGTH] private supplyDeltaHistory;
    uint32 private historyIndex = 0;

    // If the current exchange rate is within this tolerance, no supply update is performed.
    // 18 decimal fixed point format
    uint128 public deviationThreshold = 0.05 * 10**18;  // 5%

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
        require(lastRebaseTimestamp + minRebaseTimeIntervalSec <= now);
        epoch++;

        int256 supplyDelta = calcSupplyDelta();
        historyIndex = historyIndex + 1 % HISTORY_LENGTH;
        supplyDeltaHistory[historyIndex] = supplyDelta;

        int256 smoothedSupplyDelta = calcSmoothedSupplyDelta();
        uFrags.rebase(smoothedSupplyDelta);
        emit Rebase(epoch, smoothedSupplyDelta);
    }

    /**
     * @notice Allows setting the Deviation Threshold. If the exchange rate given by the exchange
     *         rate aggregator is within this threshold, then no supply modifications are made.
     * @param _deviationThreshold The new exchange rate threshold.
     * TODO(iles): This should only be modified through distributed governance. #158010389
     */
    function setDeviationThreshold(uint128 _deviationThreshold) public onlyOwner {
        deviationThreshold = _deviationThreshold;
    }

    /**
     * @notice Allows setting the minimum time period that must elapse between rebase cycles.
     * @param _minRebaseTimeIntervalSec The new minimum time interval, in seconds.
     * TODO(iles): This should only be modified through distributed governance. #158010389
     */
    function setMinRebaseTimeIntervallSec(uint128 _minRebaseTimeIntervalSec) public onlyOwner {
        minRebaseTimeIntervalSec = _minRebaseTimeIntervalSec;
    }

    /**
     * @return The total supply adjustment that should be made in response to the exchange
     *         rate, as read from the aggregator.
     */
    function calcSupplyDelta() private returns (int256) {
        uint256 rate = uint256(rateAggregator.aggregateExchangeRates());
        if (withinDeviationThreshold(rate)) {
            return 0;
        }

        uint256 target = 10**18;
        return int256(rate.sub(target).div(target).mul(uFrags.totalSupply()));
    }

    /**
     * @return The full supplyDelta we should apply, as a function of the history of exchange
     *         rates up until now.
     */
    function calcSmoothedSupplyDelta() private view returns (int256) {
        // TODO(iles): Update this, pending simulation results.
        return supplyDeltaHistory[historyIndex] / HISTORY_LENGTH;
    }

    /**
     * @param rate The current exchange rate, in 18 decimal fixed point format.
     * @return True if the rate is within the deviation threshold and false otherwise.
     */
    function withinDeviationThreshold(uint256 rate) private view returns (bool) {
        uint256 target = 10**18;
        return (rate > target && rate - target < deviationThreshold)
            || (rate < target && target - rate < deviationThreshold);
    }
}
