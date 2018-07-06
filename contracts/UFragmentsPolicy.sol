pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./UFragments.sol";


interface ExchangeRateAggregator {
    function aggregate() external returns (uint128, uint256);
}


/**
 * @title uFragments Monetary Supply Policy
 * @notice This component regulates the token supply of the uFragments ERC20 token in response to
 *         price-feed oracles.
 */
contract UFragmentsPolicy is Ownable {
    using SafeMath for uint256;

    event Rebase(uint256 indexed epoch, uint128 exchangeRate, uint256 volume, int256 appliedSupplyAdjustment);

    UFragments private uFrags;
    ExchangeRateAggregator private rateAggregator;

    // Timestamp of last rebase operation
    uint256 public lastRebaseTimestamp;

    // At least this much time must pass between rebase operations.
    uint256 public minRebaseTimeIntervalSec = 1 days;

    // The rebase lag parameter controls how long it takes, in cycles, to approach an absolute
    // supply correction. If the lag equals the smallest value of 1, then we apply full
    // supply correction at each rebase cycle. If it is greater than 1, say n, then we apply
    // a correction of 1/n at every cycle so that by the end of n cycles we would have
    // approached an absolute supply correction.
    uint32 public rebaseLag = 30;

    // If the current exchange rate is within this tolerance, no supply update is performed.
    // 18 decimal fixed point format
    uint128 public deviationThreshold = 0.05 * 10**18;  // 5%

    // Keeps track of the number of rebase cycles since inception
    uint256 public epoch = 0;

    // The upper bound on uFragments' supply
    uint256 private constant MAX_SUPPLY = 2**128 - 1;

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
        lastRebaseTimestamp = now;

        uint128 exchangeRate;
        uint256 volume;
        (exchangeRate, volume) = rateAggregator.aggregate();
        int256 supplyDelta = calcSupplyDelta(exchangeRate);
        supplyDelta = calcDampenedSupplyDelta(supplyDelta);

        if (supplyDelta > 0 && uFrags.totalSupply().add(uint256(supplyDelta)) >= MAX_SUPPLY) {
            supplyDelta = int256(MAX_SUPPLY.sub(uFrags.totalSupply()));
        }

        uFrags.rebase(epoch, supplyDelta);
        emit Rebase(epoch, exchangeRate, volume, supplyDelta);
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
    function setMinRebaseTimeIntervalSec(uint128 _minRebaseTimeIntervalSec) public onlyOwner {
        minRebaseTimeIntervalSec = _minRebaseTimeIntervalSec;
    }

    /**
     * @notice The rebase lag parameter controls how long it takes, in cycles, to approach an
     *         absolute supply correction. If the lag equals the smallest value of 1, then we
     *         apply full supply correction at each rebase cycle. If it is greater than 1, say n,
     *         then we apply a correction of 1/n at every cycle so that by the end of n cycles
     *         we would have approached an absolute supply correction.
     * @param _rebaseLag The new lag period for rebasing.
     * TODO: We should allow this parameter to be modified by distributed governance in the
     * future. #158010389
     */
    function setRebaseLag(uint32 _rebaseLag) public onlyOwner {
        require(_rebaseLag >= 1);
        rebaseLag = _rebaseLag;
    }

    /**
     * @return The total supply adjustment that should be made in response to the exchange
     *         rate, as read from the aggregator.
     */
    function calcSupplyDelta(uint128 rate) private view returns (int256) {
        if (withinDeviationThreshold(rate)) {
            return 0;
        }

        int256 target = 10**18;
        return (int256(rate) - target) * int256(uFrags.totalSupply()) / target;
    }

    /**
     * @return Damps the supply delta value so that only small changes to supply are made.
     *         This is currently set to supplyDelta / rebaseLag.
     */
    function calcDampenedSupplyDelta(int256 supplyDelta) private view returns (int256) {
        return supplyDelta / rebaseLag;
    }

    /**
     * @param rate The current exchange rate, in 18 decimal fixed point format.
     * @return True if the rate is within the deviation threshold and false otherwise.
     */
    function withinDeviationThreshold(uint128 rate) private view returns (bool) {
        uint128 target = 10**18;
        return (rate > target && rate - target < deviationThreshold)
            || (rate < target && target - rate < deviationThreshold);
    }
}
