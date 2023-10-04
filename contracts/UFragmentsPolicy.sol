// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import "./_external/SafeMath.sol";
import "./_external/Ownable.sol";

import "./lib/SafeMathInt.sol";
import "./lib/UInt256Lib.sol";

interface IUFragments {
    function totalSupply() external view returns (uint256);

    function rebase(uint256 epoch, int256 supplyDelta) external returns (uint256);
}

interface IOracle {
    function getData() external returns (uint256, bool);
}

/**
 * @title uFragments Monetary Supply Policy
 * @dev This is an implementation of the uFragments Ideal Money protocol.
 *
 *      This component regulates the token supply of the uFragments ERC20 token in response to
 *      market oracles.
 */
contract UFragmentsPolicy is Ownable {
    using SafeMath for uint256;
    using SafeMathInt for int256;
    using UInt256Lib for uint256;

    /// @notice DEPRECATED.
    event LogRebase(
        uint256 indexed epoch,
        uint256 exchangeRate,
        uint256 cpi,
        int256 requestedSupplyAdjustment,
        uint256 timestampSec
    );

    event LogRebaseV2(
        uint256 indexed epoch,
        uint256 exchangeRate,
        uint256 targetRate,
        int256 requestedSupplyAdjustment,
        uint256 timestampSec
    );

    IUFragments public uFrags;

    // Provides the cpi adjusted price target, as an 18 decimal fixed point number.
    IOracle public cpiOracle;

    // Market oracle provides the token/USD exchange rate as an 18 decimal fixed point number.
    // (eg) An oracle value of 1.5e18 it would mean 1 Ample is trading for $1.50.
    IOracle public marketOracle;

    // @notice DEPRECATED.
    // @dev This variable is NOT being used anymore.
    //      This used to store the CPI value at the time of launch to scale the incoming target
    //      and infer the price target. However, now the update CPI oracle returns the price target.
    uint256 private baseCpi;

    // If the current exchange rate is within this fractional distance from the target, no supply
    // update is performed. Fixed point number--same format as the rate.
    // (ie) abs(rate - targetRate) / targetRate < deviationThreshold, then no supply change.
    // DECIMALS Fixed point number.
    uint256 public deviationThreshold;

    uint256 private rebaseLagDeprecated;

    // More than this much time must pass between rebase operations.
    uint256 public minRebaseTimeIntervalSec;

    // Block timestamp of last rebase operation
    uint256 public lastRebaseTimestampSec;

    // The rebase window begins this many seconds into the minRebaseTimeInterval period.
    // For example if minRebaseTimeInterval is 24hrs, it represents the time of day in seconds.
    uint256 public rebaseWindowOffsetSec;

    // The length of the time window where a rebase operation is allowed to execute, in seconds.
    uint256 public rebaseWindowLengthSec;

    // The number of rebase cycles since inception
    uint256 public epoch;

    uint256 private constant DECIMALS = 18;

    // Due to the expression in computeSupplyDelta(), MAX_RATE * MAX_SUPPLY must fit into an int256.
    // Both are 18 decimals fixed point numbers.
    uint256 private constant MAX_RATE = 10**6 * 10**DECIMALS;
    // MAX_SUPPLY = MAX_INT256 / MAX_RATE
    uint256 private constant MAX_SUPPLY = uint256(type(int256).max) / MAX_RATE;

    // This module orchestrates the rebase execution and downstream notification.
    address public orchestrator;

    // DECIMALS decimal fixed point numbers.
    // Used in computation of  (Upper-Lower)/(1-(Upper/Lower)/2^(Growth*delta))) + Lower
    int256 public rebaseFunctionLowerPercentage;
    int256 public rebaseFunctionUpperPercentage;
    int256 public rebaseFunctionGrowth;

    int256 private constant ONE = int256(10**DECIMALS);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator);
        _;
    }

    /**
     * @notice Initiates a new rebase operation, provided the minimum time period has elapsed.
     * @dev Changes supply with percentage of:
     *  (Upper-Lower)/(1-(Upper/Lower)/2^(Growth*NormalizedPriceDelta))) + Lower
     */
    function rebase() external onlyOrchestrator {
        require(inRebaseWindow());

        // This comparison also ensures there is no reentrancy.
        require(lastRebaseTimestampSec.add(minRebaseTimeIntervalSec) < block.timestamp);

        // Snap the rebase time to the start of this window.
        lastRebaseTimestampSec = block
            .timestamp
            .sub(block.timestamp.mod(minRebaseTimeIntervalSec))
            .add(rebaseWindowOffsetSec);

        epoch = epoch.add(1);

        uint256 targetRate;
        bool targetRateValid;
        (targetRate, targetRateValid) = cpiOracle.getData();
        require(targetRateValid);

        uint256 exchangeRate;
        bool rateValid;
        (exchangeRate, rateValid) = marketOracle.getData();
        require(rateValid);

        if (exchangeRate > MAX_RATE) {
            exchangeRate = MAX_RATE;
        }

        int256 supplyDelta = computeSupplyDelta(exchangeRate, targetRate);

        if (supplyDelta > 0 && uFrags.totalSupply().add(uint256(supplyDelta)) > MAX_SUPPLY) {
            supplyDelta = (MAX_SUPPLY.sub(uFrags.totalSupply())).toInt256Safe();
        }

        uint256 supplyAfterRebase = uFrags.rebase(epoch, supplyDelta);
        assert(supplyAfterRebase <= MAX_SUPPLY);
        emit LogRebaseV2(epoch, exchangeRate, targetRate, supplyDelta, block.timestamp);
    }

    /**
     * @notice Sets the reference to the CPI oracle.
     * @param cpiOracle_ The address of the cpi oracle contract.
     */
    function setCpiOracle(IOracle cpiOracle_) external onlyOwner {
        cpiOracle = cpiOracle_;
    }

    /**
     * @notice Sets the reference to the market oracle.
     * @param marketOracle_ The address of the market oracle contract.
     */
    function setMarketOracle(IOracle marketOracle_) external onlyOwner {
        marketOracle = marketOracle_;
    }

    /**
     * @notice Sets the reference to the orchestrator.
     * @param orchestrator_ The address of the orchestrator contract.
     */
    function setOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
    }

    function setRebaseFunctionGrowth(int256 rebaseFunctionGrowth_) external onlyOwner {
        require(rebaseFunctionGrowth_ >= 0);
        rebaseFunctionGrowth = rebaseFunctionGrowth_;
    }

    function setRebaseFunctionLowerPercentage(int256 rebaseFunctionLowerPercentage_)
        external
        onlyOwner
    {
        require(rebaseFunctionLowerPercentage_ <= 0);
        rebaseFunctionLowerPercentage = rebaseFunctionLowerPercentage_;
    }

    function setRebaseFunctionUpperPercentage(int256 rebaseFunctionUpperPercentage_)
        external
        onlyOwner
    {
        require(rebaseFunctionUpperPercentage_ >= 0);
        rebaseFunctionUpperPercentage = rebaseFunctionUpperPercentage_;
    }

    /**
     * @notice Sets the deviation threshold fraction. If the exchange rate given by the market
     *         oracle is within this fractional distance from the targetRate, then no supply
     *         modifications are made. DECIMALS fixed point number.
     * @param deviationThreshold_ The new exchange rate threshold fraction.
     */
    function setDeviationThreshold(uint256 deviationThreshold_) external onlyOwner {
        deviationThreshold = deviationThreshold_;
    }

    /**
     * @notice Sets the parameters which control the timing and frequency of
     *         rebase operations.
     *         a) the minimum time period that must elapse between rebase cycles.
     *         b) the rebase window offset parameter.
     *         c) the rebase window length parameter.
     * @param minRebaseTimeIntervalSec_ More than this much time must pass between rebase
     *        operations, in seconds.
     * @param rebaseWindowOffsetSec_ The number of seconds from the beginning of
              the rebase interval, where the rebase window begins.
     * @param rebaseWindowLengthSec_ The length of the rebase window in seconds.
     */
    function setRebaseTimingParameters(
        uint256 minRebaseTimeIntervalSec_,
        uint256 rebaseWindowOffsetSec_,
        uint256 rebaseWindowLengthSec_
    ) external onlyOwner {
        require(minRebaseTimeIntervalSec_ > 0);
        require(rebaseWindowOffsetSec_ < minRebaseTimeIntervalSec_);

        minRebaseTimeIntervalSec = minRebaseTimeIntervalSec_;
        rebaseWindowOffsetSec = rebaseWindowOffsetSec_;
        rebaseWindowLengthSec = rebaseWindowLengthSec_;
    }

    /**
     * @notice A multi-chain AMPL interface method. The Ampleforth monetary policy contract
     *         on the base-chain and XC-AmpleController contracts on the satellite-chains
     *         implement this method. It atomically returns two values:
     *         what the current contract believes to be,
     *         the globalAmpleforthEpoch and globalAMPLSupply.
     * @return globalAmpleforthEpoch The current epoch number.
     * @return globalAMPLSupply The total supply at the current epoch.
     */
    function globalAmpleforthEpochAndAMPLSupply() external view returns (uint256, uint256) {
        return (epoch, uFrags.totalSupply());
    }

    /**
     * @dev ZOS upgradable contract initialization method.
     *      It is called at the time of contract creation to invoke parent class initializers and
     *      initialize the contract's state variables.
     */
    function initialize(address owner_, IUFragments uFrags_) public initializer {
        Ownable.initialize(owner_);

        // deviationThreshold = 0.05e18 = 5e16
        deviationThreshold = 5 * 10**(DECIMALS - 2);

        rebaseFunctionGrowth = int256(3 * (10**DECIMALS));
        rebaseFunctionUpperPercentage = int256(10 * (10**(DECIMALS - 2))); // 0.1
        rebaseFunctionLowerPercentage = int256((-10) * int256(10**(DECIMALS - 2))); // -0.1

        minRebaseTimeIntervalSec = 1 days;
        rebaseWindowOffsetSec = 7200; // 2AM UTC
        rebaseWindowLengthSec = 20 minutes;

        lastRebaseTimestampSec = 0;
        epoch = 0;

        uFrags = uFrags_;
    }

    /**
     * @return If the latest block timestamp is within the rebase time window it, returns true.
     *         Otherwise, returns false.
     */
    function inRebaseWindow() public view returns (bool) {
        return (block.timestamp.mod(minRebaseTimeIntervalSec) >= rebaseWindowOffsetSec &&
            block.timestamp.mod(minRebaseTimeIntervalSec) <
            (rebaseWindowOffsetSec.add(rebaseWindowLengthSec)));
    }

    /**
     * Computes the percentage of supply to be added or removed:
     * Using the function in https://github.com/ampleforth/AIPs/blob/master/AIPs/aip-5.md
     * @param normalizedRate value of rate/targetRate in DECIMALS decimal fixed point number
     * @return The percentage of supply to be added or removed.
     */
    function computeRebasePercentage(
        int256 normalizedRate,
        int256 lower,
        int256 upper,
        int256 growth
    ) public pure returns (int256) {
        int256 delta;

        delta = (normalizedRate.sub(ONE));

        // Compute: (Upper-Lower)/(1-(Upper/Lower)/2^(Growth*delta))) + Lower

        int256 exponent = growth.mul(delta).div(ONE);
        // Cap exponent to guarantee it is not too big for twoPower
        if (exponent > ONE.mul(100)) {
            exponent = ONE.mul(100);
        }
        if (exponent < ONE.mul(-100)) {
            exponent = ONE.mul(-100);
        }

        int256 pow = SafeMathInt.twoPower(exponent, ONE); // 2^(Growth*Delta)
        if (pow == 0) {
            return lower;
        }
        int256 numerator = upper.sub(lower); //(Upper-Lower)
        int256 intermediate = upper.mul(ONE).div(lower);
        intermediate = intermediate.mul(ONE).div(pow);
        int256 denominator = ONE.sub(intermediate); // (1-(Upper/Lower)/2^(Growth*delta)))

        int256 rebasePercentage = (numerator.mul(ONE).div(denominator)).add(lower);
        return rebasePercentage;
    }

    /**
     * @return Computes the total supply adjustment in response to the exchange rate
     *         and the targetRate.
     */
    function computeSupplyDelta(uint256 rate, uint256 targetRate) internal view returns (int256) {
        if (withinDeviationThreshold(rate, targetRate)) {
            return 0;
        }
        int256 targetRateSigned = targetRate.toInt256Safe();
        int256 normalizedRate = rate.toInt256Safe().mul(ONE).div(targetRateSigned);
        int256 rebasePercentage = computeRebasePercentage(
            normalizedRate,
            rebaseFunctionLowerPercentage,
            rebaseFunctionUpperPercentage,
            rebaseFunctionGrowth
        );

        return uFrags.totalSupply().toInt256Safe().mul(rebasePercentage).div(ONE);
    }

    /**
     * @param rate The current exchange rate, an 18 decimal fixed point number.
     * @param targetRate The target exchange rate, an 18 decimal fixed point number.
     * @return If the rate is within the deviation threshold from the target rate, returns true.
     *         Otherwise, returns false.
     */
    function withinDeviationThreshold(uint256 rate, uint256 targetRate)
        internal
        view
        returns (bool)
    {
        uint256 absoluteDeviationThreshold = targetRate.mul(deviationThreshold).div(10**DECIMALS);

        return
            (rate >= targetRate && rate.sub(targetRate) < absoluteDeviationThreshold) ||
            (rate < targetRate && targetRate.sub(rate) < absoluteDeviationThreshold);
    }

    /**
     * To maintain abi backward compatibility
     */
    function rebaseLag() public pure returns (uint256) {
        return 1;
    }
}
