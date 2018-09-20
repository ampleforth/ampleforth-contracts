pragma solidity 0.4.24;

import "openzeppelin-zos/contracts/math/SafeMath.sol";
import "openzeppelin-zos/contracts/ownership/Ownable.sol";

import "./lib/SafeMathInt.sol";
import "./lib/UInt256Lib.sol";
import "./UFragments.sol";


interface IMarketOracle {
    function getPriceAnd24HourVolume() external returns (uint256, uint256);
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

    event LogRebase(
        uint256 indexed epoch,
        uint256 exchangeRate,
        uint256 volume24hrs,
        int256 appliedSupplyAdjustment
    );

    UFragments public _uFrags;
    IMarketOracle public _marketOracle;

    // Block timestamp of last rebase operation
    uint256 public _lastRebaseTimestamp;

    // At least this much time must pass between rebase operations.
    uint256 public _minRebaseTimeIntervalSec;

    // The rebase lag parameter controls how long it takes, in cycles, to approach an absolute
    // supply correction. If the lag equals the smallest value of 1, then we apply full
    // supply correction at each rebase cycle. If it is greater than 1, say n, then we apply
    // a correction of 1/n at every cycle so that by the end of n cycles we would have
    // approached an absolute supply correction.
    uint32 public _rebaseLag;

    // If the current exchange rate is within this tolerance, no supply update is performed.
    // 18 decimal fixed point format
    uint256 public _deviationThreshold;

    // Keeps track of the number of rebase cycles since inception
    uint256 public _epoch;

    uint256 private constant RATE_DECIMALS = 18;

    uint256 private constant TARGET_RATE = 1 * 10 ** RATE_DECIMALS;

    int256 private constant TARGET_RATE_SIGNED = int256(TARGET_RATE);

    // We cap the rate to avoid overflows in computations.
    // 18 decimals fixed point format
    uint256 private constant MAX_RATE = 100 * 10 ** RATE_DECIMALS;

    // We cap the supply to avoid overflows in computations.
    // Due to the signed math in rebase(), MAX_RATE x MAX_SUPPLY must fit into an int256.
    // MAX_SUPPLY = MAX_INT256 / MAX_RATE
    uint256 private constant MAX_SUPPLY = ~(uint256(1) << 255) / MAX_RATE;

    /**
     * @notice Anyone may call this function to initiate a new rebase operation, provided the
     *         minimum time period has elapsed.
     */
    function rebase() external {
        require(_lastRebaseTimestamp.add(_minRebaseTimeIntervalSec) <= now);
        _epoch = _epoch.add(1);
        _lastRebaseTimestamp = now;

        uint256 exchangeRate;
        uint256 volume;
        (exchangeRate, volume) = _marketOracle.getPriceAnd24HourVolume();
        if (exchangeRate > MAX_RATE) {
            exchangeRate = MAX_RATE;
        }

        int256 supplyDelta = calcSupplyDelta(exchangeRate);
        supplyDelta = calcDampenedSupplyDelta(supplyDelta);

        if (supplyDelta > 0 && _uFrags.totalSupply().add(uint256(supplyDelta)) > MAX_SUPPLY) {
            supplyDelta = (MAX_SUPPLY.sub(_uFrags.totalSupply())).toInt256Safe();
        }

        _uFrags.rebase(_epoch, supplyDelta);
        assert(_uFrags.totalSupply() <= MAX_SUPPLY);
        emit LogRebase(_epoch, exchangeRate, volume, supplyDelta);
    }

    /**
     * @notice Allows setting the reference to the market oracle.
     * @param marketOracle The address of the market oracle contract.
     */
    function setMarketOracle(IMarketOracle marketOracle)
        external
        onlyOwner
    {
        _marketOracle = marketOracle;
    }

    /**
     * @notice Allows setting the Deviation Threshold. If the exchange rate given by the market
     *         oracle is within this threshold, then no supply modifications are made.
     * @param deviationThreshold The new exchange rate threshold.
     */
    function setDeviationThreshold(uint128 deviationThreshold)
        external
        onlyOwner
    {
        _deviationThreshold = deviationThreshold;
    }

    /**
     * @notice Allows setting the minimum time period that must elapse between rebase cycles.
     * @param minRebaseTimeIntervalSec The new minimum time interval, in seconds.
     */
    function setMinRebaseTimeIntervalSec(uint128 minRebaseTimeIntervalSec)
        external
        onlyOwner
    {
        _minRebaseTimeIntervalSec = minRebaseTimeIntervalSec;
    }

    /**
     * @notice The rebase lag parameter controls how long it takes, in cycles, to approach an
     *         absolute supply correction. If the lag equals the smallest value of 1, then we
     *         apply full supply correction at each rebase cycle. If it is greater than 1, say n,
     *         then we apply a correction of 1/n at every cycle so that by the end of n cycles
     *         we would have approached an absolute supply correction.
     * @param rebaseLag The new lag period for rebasing.
     */
    function setRebaseLag(uint32 rebaseLag)
        external
        onlyOwner
    {
        require(rebaseLag > 0);
        _rebaseLag = rebaseLag;
    }

    /**
     * @dev ZOS upgradable contract initialization method, called at the time of contract creation.
     *      This is where parent class initializers are invoked and contract storage variables
     *      are set with initial values.
     */
    function initialize(address owner, UFragments uFrags)
        public
        isInitializer("UFragmentsPolicy", "0")
    {
        Ownable.initialize(owner);

        _deviationThreshold = (10 ** RATE_DECIMALS * 5) / 100;
        // 5%
        _rebaseLag = 30;
        _minRebaseTimeIntervalSec = 1 days;
        _epoch = 0;

        _uFrags = uFrags;
    }

    /**
     * @return The total supply adjustment that should be made in response to the exchange
     *         rate, as provided by the market oracle.
     */
    function calcSupplyDelta(uint256 rate)
        private
        view
        returns (int256)
    {
        if (withinDeviationThreshold(rate)) {
            return 0;
        }

        // (totalSupply * (rate - target)) / target
        return _uFrags.totalSupply().toInt256Safe().mul(
            rate.toInt256Safe().sub(TARGET_RATE_SIGNED)
        ).div(TARGET_RATE_SIGNED);
    }

    /**
     * @return Damps the supply delta value so that only small changes to supply are made.
     *         This is currently set to supplyDelta / _rebaseLag.
     */
    function calcDampenedSupplyDelta(int256 supplyDelta)
        private
        view
        returns (int256)
    {
        return supplyDelta.div(_rebaseLag);
    }

    /**
     * @param rate The current exchange rate, in 18 decimal fixed point format.
     * @return True if the rate is within the deviation threshold and false otherwise.
     */
    function withinDeviationThreshold(uint256 rate)
        private
        view
        returns (bool)
    {
        return (rate >= TARGET_RATE && rate.sub(TARGET_RATE) < _deviationThreshold)
        || (rate < TARGET_RATE && TARGET_RATE.sub(rate) < _deviationThreshold);
    }
}
