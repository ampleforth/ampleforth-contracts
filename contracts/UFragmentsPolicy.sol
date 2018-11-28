pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/math/SafeMath.sol";
import "openzeppelin-eth/contracts/ownership/Ownable.sol";

import "./lib/SafeMathInt.sol";
import "./lib/UInt256Lib.sol";
import "./UFragments.sol";


interface IMarketOracle {
    function getPriceAnd24HourVolume() external returns (uint256, uint256);
}


/**
 * @title uFragments Monetary Supply Policy
 * @dev This is an implementation of the uFragments Ideal Money protocol.
 *      uFragments operates symmetrically on expansion and contraction. It will both split and
 *      combine coins to maintain a stable unit price.
 *
 *      This component regulates the token supply of the uFragments ERC20 token in response to
 *      market oracles.
 */
contract UFragmentsPolicy is Ownable {
    using SafeMath for uint256;
    using SafeMathInt for int256;
    using UInt256Lib for uint256;

    event LogRebase(
        uint256 indexed epoch,
        uint256 exchangeRate,
        uint256 volume24hrs,
        int256 requestedSupplyAdjustment
    );

    UFragments public uFrags;
    IMarketOracle public marketOracle;

    // If the current exchange rate is within this absolute distance from the target, no supply
    // update is performed. Fixed point number--same format as the rate.
    uint256 public deviationThreshold;

    // The 24hr market volume must be at least this value before any supply adjustments occur.
    uint256 public minimumVolume;

    // The rebase lag parameter, used to dampen the applied supply adjustment by 1 / rebaseLag
    // Check setRebaseLag comments for more details.
    uint256 public rebaseLag;

    // More than this much time must pass between rebase operations.
    uint256 public minRebaseTimeIntervalSec;

    // Block timestamp of last rebase operation
    uint256 public lastRebaseTimestampSec;

    // The number of rebase cycles since inception
    uint256 public epoch;

    uint256 private constant RATE_DECIMALS = 18;

    uint256 private constant TARGET_RATE = 1 * 10**RATE_DECIMALS;

    int256 private constant TARGET_RATE_SIGNED = int256(TARGET_RATE);

    // Due to the expression in computeSupplyDelta(), MAX_RATE * MAX_SUPPLY must fit into an int256.
    // Both are 18 decimals fixed point numbers.
    uint256 private constant MAX_RATE = 10**6 * 10**RATE_DECIMALS;
    // MAX_SUPPLY = MAX_INT256 / MAX_RATE
    uint256 private constant MAX_SUPPLY = ~(uint256(1) << 255) / MAX_RATE;

    /**
     * @notice Anyone can call this function to initiate a new rebase operation, provided more than
     *         the minimum time period has elapsed.
     * @dev The supply adjustment equals (_totalSupply * DeviationFromTargetRate) / rebaseLag
     *      Where DeviationFromTargetRate is (MarketOracleRate - TARGET_RATE) / TARGET_RATE
     */
    function rebase() external {
        // This comparison also ensures there is no reentrancy.
        require(lastRebaseTimestampSec.add(minRebaseTimeIntervalSec) < now);
        lastRebaseTimestampSec = now;
        epoch = epoch.add(1);

        uint256 exchangeRate;
        uint256 volume;
        (exchangeRate, volume) = marketOracle.getPriceAnd24HourVolume();
        if (exchangeRate > MAX_RATE) {
            exchangeRate = MAX_RATE;
        }

        int256 supplyDelta = computeSupplyDelta(exchangeRate, volume);
        // Apply the Dampening factor.
        supplyDelta = supplyDelta.div(rebaseLag.toInt256Safe());

        if (supplyDelta > 0 && uFrags.totalSupply().add(uint256(supplyDelta)) > MAX_SUPPLY) {
            supplyDelta = (MAX_SUPPLY.sub(uFrags.totalSupply())).toInt256Safe();
        }

        uint256 supplyAfterRebase = uFrags.rebase(epoch, supplyDelta);
        assert(supplyAfterRebase <= MAX_SUPPLY);
        emit LogRebase(epoch, exchangeRate, volume, supplyDelta);
    }

    /**
     * @notice Sets the reference to the market oracle.
     * @param marketOracle_ The address of the market oracle contract.
     */
    function setMarketOracle(IMarketOracle marketOracle_)
        external
        onlyOwner
    {
        marketOracle = marketOracle_;
    }

    /**
     * @notice Sets the deviation threshold. If the exchange rate given by the market
     *         oracle is within this absolute distance from the target, then no supply
     *         modifications are made. RATE_DECIMALS fixed point number.
     * @param deviationThreshold_ The new exchange rate threshold.
     */
    function setDeviationThreshold(uint256 deviationThreshold_)
        external
        onlyOwner
    {
        deviationThreshold = deviationThreshold_;
    }

    /**
     * @notice Sets the minimum volume. During rebase, the volume must be at least this value before
     * any supply adjustment is made.
     * @param minimumVolume_ The new minimum volume, measured in 24hr market Token Volume.
     */
    function setMinimumVolume(uint256 minimumVolume_)
        external
        onlyOwner
    {
        minimumVolume = minimumVolume_;
    }

    /**
     * @notice Sets the minimum time period that must elapse between rebase cycles.
     * @param minRebaseTimeIntervalSec_ More than this much time must pass between rebase
     *        operations, in seconds.
     */
    function setMinRebaseTimeIntervalSec(uint256 minRebaseTimeIntervalSec_)
        external
        onlyOwner
    {
        require(minRebaseTimeIntervalSec_ > 0);
        minRebaseTimeIntervalSec = minRebaseTimeIntervalSec_;
    }

    /**
     * @notice Sets the rebase lag parameter.
               It is used to dampen the applied supply adjustment by 1 / rebaseLag
               If the rebase lag R, equals 1, the smallest value for R, then the full supply
               correction is applied on each rebase cycle.
               If it is greater than 1, then a correction of 1/R of is applied on each rebase.
     * @param rebaseLag_ The new rebase lag parameter.
     */
    function setRebaseLag(uint256 rebaseLag_)
        external
        onlyOwner
    {
        require(rebaseLag_ > 0);
        rebaseLag = rebaseLag_;
    }

    /**
     * @dev ZOS upgradable contract initialization method.
     *      It is called at the time of contract creation to invoke parent class initializers and
     *      initialize the contract's state variables.
     */
    function initialize(address owner, UFragments uFrags_)
        public
        initializer
    {
        Ownable.initialize(owner);

        deviationThreshold = (5 * TARGET_RATE) / 100;  // 5% of target
        minimumVolume = 1;
        rebaseLag = 30;
        minRebaseTimeIntervalSec = 1 days;
        lastRebaseTimestampSec = 0;
        epoch = 0;

        uFrags = uFrags_;
    }

    /**
     * @return Computes the total supply adjustment in response to the exchange rate.
     */
    function computeSupplyDelta(uint256 rate, uint256 volume)
        private
        view
        returns (int256)
    {
        if (withinDeviationThreshold(rate) || !enoughVolume(volume)) {
            return 0;
        }

        // (totalSupply * (rate - target)) / target
        return uFrags.totalSupply().toInt256Safe().mul(
            rate.toInt256Safe().sub(TARGET_RATE_SIGNED)
        ).div(TARGET_RATE_SIGNED);
    }

    /**
     * @param rate The current exchange rate, an 18 decimal fixed point number.
     * @return If the rate is within the deviation threshold from the target rate, returns true.
     *         Otherwise, returns false.
     */
    function withinDeviationThreshold(uint256 rate)
        private
        view
        returns (bool)
    {
        return (rate >= TARGET_RATE && rate.sub(TARGET_RATE) < deviationThreshold)
            || (rate < TARGET_RATE && TARGET_RATE.sub(rate) < deviationThreshold);
    }

    /**
     * @param volume Total trade volume of the last reported 24 hours in Token volume.
     * return True, if the volume meets requirements for a supply adjustment. False otherwise.
     */
    function enoughVolume(uint256 volume)
        private
        view
        returns (bool)
    {
        return volume >= minimumVolume;
    }
}
