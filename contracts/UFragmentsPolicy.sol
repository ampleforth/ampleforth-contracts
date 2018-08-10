pragma solidity 0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

import "./lib/SafeMathInt.sol";
import "./lib/UInt256Lib.sol";
import "./UFragments.sol";


interface MarketOracle {
    function getPriceAndVolume() external returns (uint256, uint256);
}


/**
 * @title uFragments Monetary Supply Policy
 * @dev This is an implementation of the uFragments Ideal Money protocol @ https://fragments.org/protocol
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

    event Rebase(uint256 indexed epoch, uint256 exchangeRate, uint256 volume24hrs, int256 appliedSupplyAdjustment);

    UFragments private uFrags;
    MarketOracle private marketOracle;

    // Block timestamp of last rebase operation
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
    uint256 public deviationThreshold = 0.05 * 10**18;  // 5%

    // Keeps track of the number of rebase cycles since inception
    uint256 public epoch = 0;

    // We cap the rate to avoid overflows in computations.
    // 18 decimal fixed point format
    // MAX_RATE = 100 * 10**18
    uint256 private constant MAX_RATE = 100000000000000000000;

    // We cap the supply to avoid overflows in computations.
    // Due to the signed math in rebase(), MAX_RATE x MAX_SUPPLY must fit into an int256.
    // MAX_SUPPLY = UInt256Lib.getMaxInt256() / MAX_RATE
    uint256 private constant MAX_SUPPLY = 578960446186580977117854925043439539266349923328202820197;

    constructor(UFragments _uFrags, MarketOracle _marketOracle) public {
        uFrags = _uFrags;
        marketOracle = _marketOracle;
    }

    /**
     * @notice Anyone may call this function to initiate a new rebase operation, provided the
     *         minimum time period has elapsed.
     */
    function rebase() external {
        require(lastRebaseTimestamp.add(minRebaseTimeIntervalSec) <= now);
        epoch = epoch.add(1);
        lastRebaseTimestamp = now;

        uint256 exchangeRate;
        uint256 volume;
        (exchangeRate, volume) = marketOracle.getPriceAndVolume();
        if (exchangeRate > MAX_RATE) {
            exchangeRate = MAX_RATE;
        }
        
        int256 supplyDelta = calcSupplyDelta(exchangeRate);
        supplyDelta = calcDampenedSupplyDelta(supplyDelta);

        if (supplyDelta > 0 && uFrags.totalSupply().add(uint256(supplyDelta)) > MAX_SUPPLY) {
            supplyDelta = (MAX_SUPPLY.sub(uFrags.totalSupply())).toInt256Safe();
        }

        uFrags.rebase(epoch, supplyDelta);
        assert(uFrags.totalSupply() <= MAX_SUPPLY);
        emit Rebase(epoch, exchangeRate, volume, supplyDelta);
    }

    /**
     * @notice Allows setting the Deviation Threshold. If the exchange rate given by the market
     *         oracle is within this threshold, then no supply modifications are made.
     * @param _deviationThreshold The new exchange rate threshold.
     */
    function setDeviationThreshold(uint128 _deviationThreshold) external onlyOwner {
        deviationThreshold = _deviationThreshold;
    }

    /**
     * @notice Allows setting the minimum time period that must elapse between rebase cycles.
     * @param _minRebaseTimeIntervalSec The new minimum time interval, in seconds.
     */
    function setMinRebaseTimeIntervalSec(uint128 _minRebaseTimeIntervalSec) external onlyOwner {
        minRebaseTimeIntervalSec = _minRebaseTimeIntervalSec;
    }

    /**
     * @notice The rebase lag parameter controls how long it takes, in cycles, to approach an
     *         absolute supply correction. If the lag equals the smallest value of 1, then we
     *         apply full supply correction at each rebase cycle. If it is greater than 1, say n,
     *         then we apply a correction of 1/n at every cycle so that by the end of n cycles
     *         we would have approached an absolute supply correction.
     * @param _rebaseLag The new lag period for rebasing.
     */
    function setRebaseLag(uint32 _rebaseLag) external onlyOwner {
        require(_rebaseLag > 0);
        rebaseLag = _rebaseLag;
    }

    /**
     * @return The total supply adjustment that should be made in response to the exchange
     *         rate, as provided by the market oracle.
     */
    function calcSupplyDelta(uint256 rate) private view returns (int256) {
        if (withinDeviationThreshold(rate)) {
            return 0;
        }

        int256 target = 10**18;
        return rate.toInt256Safe().sub(target).mul(uFrags.totalSupply().toInt256Safe()).div(target);
    }

    /**
     * @return Damps the supply delta value so that only small changes to supply are made.
     *         This is currently set to supplyDelta / rebaseLag.
     */
    function calcDampenedSupplyDelta(int256 supplyDelta) private view returns (int256) {
        return supplyDelta.div(rebaseLag);
    }

    /**
     * @param rate The current exchange rate, in 18 decimal fixed point format.
     * @return True if the rate is within the deviation threshold and false otherwise.
     */
    function withinDeviationThreshold(uint256 rate) private view returns (bool) {
        uint256 target = 10**18;
        return (rate >= target && rate.sub(target) < deviationThreshold)
            || (rate < target && target.sub(rate) < deviationThreshold);
    }
}
