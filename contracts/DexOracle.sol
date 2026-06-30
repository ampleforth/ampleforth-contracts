// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import {Ownable} from "./_external/Ownable.sol";
import {SafeMath} from "./_external/SafeMath.sol";
import {IUniswapV2Pair} from "./_external/IUniswapV2Pair.sol";
import {UniswapV2OracleLibrary} from "./_external/UniswapV2OracleLibrary.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

interface IMedianOracle {
    function pushReport(uint256 payload) external;

    function purgeReports() external;
}

/**
 * @title DexOracle
 *
 * @notice Computes a 24h time-weighted average price (TWAP) for an asset pair
 *         that has no direct UniswapV2 market by chaining two underlying
 *         markets, and reports the result to a MedianOracle instance.
 *
 *         For AMPL/USDC the price is bridged through WETH:
 *
 *             AMPL/USDC = (AMPL/WETH) * (WETH/USDC)
 *
 *         - leg1 prices the source asset (AMPL) in the bridge asset (WETH)
 *         - leg2 prices the bridge asset (WETH) in the quote asset (USDC)
 *
 *         UniswapV2 maintains per-pair price accumulators as UQ112x112 fixed
 *         point numbers denominated in raw (smallest-unit) reserves. Following
 *         the canonical fixed-window oracle, each leg's cumulative is bridged
 *         into an OUTPUT_DECIMALS (18) fixed point decimal price-seconds value
 *         and stored at `update()`; the TWAP is the difference of two such
 *         snapshots divided by the elapsed time:
 *
 *             cumulative_18 = (cumulativeUQ112x112 * decimalsFactor) >> 112
 *             decimalsFactor = 10**(OUTPUT_DECIMALS + baseDecimals - quoteDecimals)
 *             legPrice_18    = (cumulative_18_now - cumulative_18_last) / timeElapsed
 *
 *         Intended 24h rebase cadence:
 *         - `update()`     is called right after rebase (appended to the
 *                          Orchestrator's transaction list) to open a fresh
 *                          measurement window. Callable by the Orchestrator or
 *                          owner anytime, or by anyone once more than the rebase
 *                          period has elapsed since the last update.
 *         - `pushReport()` is called ~2h before the next rebase to report the
 *                          TWAP. The MedianOracle's report-delay (security)
 *                          window then ages the report before it is consumed at
 *                          the following rebase, so no timing gate is enforced
 *                          here.
 */
contract DexOracle is Ownable {
    using SafeMath for uint256;

    /// @notice Decimals of the reported price; matches MedianOracle.DECIMALS.
    uint256 public constant OUTPUT_DECIMALS = 18;

    /// @notice MedianOracle this contract reports to as a registered provider.
    IMedianOracle public medianOracle;

    /// @notice First leg market: prices the source asset in the bridge asset.
    IUniswapV2Pair public immutable pairLeg1;
    /// @notice Second leg market: prices the bridge asset in the quote asset.
    IUniswapV2Pair public immutable pairLeg2;

    /// @dev When true the leg reads price1 (token1 priced in token0),
    ///      otherwise price0 (token0 priced in token1).
    bool public immutable leg1UseToken1Price;
    bool public immutable leg2UseToken1Price;

    /// @dev 10**(OUTPUT_DECIMALS + baseDecimals - quoteDecimals) per leg, used
    ///      to convert a raw UQ112x112 reserve ratio into a decimal price.
    uint256 public immutable decimalsFactorLeg1;
    uint256 public immutable decimalsFactorLeg2;

    /// @notice Decimal (OUTPUT_DECIMALS) price-seconds cumulatives captured at
    ///         the last `update()`.
    uint256 public priceLeg1CumulativeLast;
    uint256 public priceLeg2CumulativeLast;
    /// @notice Timestamp (mod 2**32) of the last `update()`. Zero until the
    ///         first `update()`, which marks the oracle as uninitialized.
    uint32 public blockTimestampLast;

    /// @notice The Orchestrator, which may call `update()` (it runs right after
    ///         each rebase). The owner may also call `update()` at any time.
    address public orchestrator;

    /// @notice The rebase period (e.g. 24h). Any address may call `update()`
    ///         once more than this has elapsed since the last `update()`, a
    ///         liveness fallback if the Orchestrator/owner stop updating.
    uint256 public rebasePeriodSec;

    event LogPriceUpdate(
        uint256 priceLeg1Cumulative,
        uint256 priceLeg2Cumulative,
        uint32 timestamp
    );
    event LogReportPushed(uint256 price, uint32 timeElapsed);
    // Emitted once at construction. The two bridge-side tokens (leg1's quote
    // and leg2's base) are expected to represent the same value; `matched` is
    // true when they are the exact same address. They may legitimately differ
    // (e.g. two equivalent wrapped representations), so this is informational
    // only and never reverts.
    event LogBridgeTokens(address leg1QuoteToken, address leg2BaseToken, bool matched);

    /**
     * @param medianOracle_ MedianOracle instance to report to.
     * @param orchestrator_ Orchestrator allowed to call `update()` (alongside
     *        the owner).
     * @param pairLeg1_ UniswapV2 pair for the first (source/bridge) leg.
     * @param leg1UseToken1Price_ True to read price1 on leg1, false for price0.
     * @param pairLeg2_ UniswapV2 pair for the second (bridge/quote) leg.
     * @param leg2UseToken1Price_ True to read price1 on leg2, false for price0.
     * @param rebasePeriodSec_ Rebase period after which any address may call
     *        `update()` (the public liveness fallback).
     */
    constructor(
        address medianOracle_,
        address orchestrator_,
        address pairLeg1_,
        bool leg1UseToken1Price_,
        address pairLeg2_,
        bool leg2UseToken1Price_,
        uint256 rebasePeriodSec_
    ) {
        Ownable.initialize(msg.sender);

        medianOracle = IMedianOracle(medianOracle_);
        orchestrator = orchestrator_;
        rebasePeriodSec = rebasePeriodSec_;

        pairLeg1 = IUniswapV2Pair(pairLeg1_);
        pairLeg2 = IUniswapV2Pair(pairLeg2_);
        leg1UseToken1Price = leg1UseToken1Price_;
        leg2UseToken1Price = leg2UseToken1Price_;

        (address leg1Base, address leg1Quote) = _baseQuote(pairLeg1_, leg1UseToken1Price_);
        (address leg2Base, address leg2Quote) = _baseQuote(pairLeg2_, leg2UseToken1Price_);
        decimalsFactorLeg1 = _decimalsFactor(leg1Base, leg1Quote);
        decimalsFactorLeg2 = _decimalsFactor(leg2Base, leg2Quote);

        // The bridge token is leg1's quote (asset AMPL is priced in) and leg2's
        // base (asset priced in USDC). Logged for off-chain inspection; the two
        // may legitimately be distinct equivalent tokens, so this never reverts.
        emit LogBridgeTokens(leg1Quote, leg2Base, leg1Quote == leg2Base);

        // blockTimestampLast is left at 0 to mark the oracle as uninitialized.
    }

    /**
     * @notice Opens a fresh measurement window by snapshotting the current
     *         price cumulatives. Intended to be appended to the Orchestrator's
     *         transaction list so it runs immediately after each rebase.
     * @dev The Orchestrator and the owner may call at any time. Any other
     *      caller is allowed only once more than `rebasePeriodSec` has elapsed
     *      since the last `update()`, a liveness fallback that cannot run before
     *      the oracle has been initialized by a trusted caller.
     */
    function update() external {
        (
            uint256 leg1Cumulative,
            uint256 leg2Cumulative,
            uint32 blockTimestamp
        ) = _currentCumulatives();

        if (msg.sender != orchestrator && !isOwner()) {
            require(blockTimestampLast > 0, "DexOracle: UNAUTHORIZED");
            uint32 timeElapsed;
            unchecked {
                // unchecked because both timestamps are uint32 (mod 2**32) and
                // the subtraction must wrap correctly across the year-2106
                // boundary instead of reverting.
                timeElapsed = blockTimestamp - blockTimestampLast;
            }
            require(timeElapsed > rebasePeriodSec, "DexOracle: TOO_SOON");
        }

        priceLeg1CumulativeLast = leg1Cumulative;
        priceLeg2CumulativeLast = leg2Cumulative;
        blockTimestampLast = blockTimestamp;

        emit LogPriceUpdate(leg1Cumulative, leg2Cumulative, blockTimestamp);
    }

    /**
     * @notice Computes the chained TWAP over the current measurement window and
     *         reports it to the MedianOracle. Intended to be called ~2h before
     *         the next rebase, leaving the report to age past the MedianOracle
     *         report-delay window before it is consumed.
     * @return price The reported AMPL/USDC price as an OUTPUT_DECIMALS number.
     */
    function pushReport() external returns (uint256 price) {
        uint32 timeElapsed;
        (price, timeElapsed) = _computePrice();

        medianOracle.pushReport(price);
        emit LogReportPushed(price, timeElapsed);
    }

    /**
     * @notice Purges this provider's outstanding reports on the MedianOracle,
     *         e.g. to retract a report pushed in error.
     */
    function purgeReports() external onlyOwner {
        medianOracle.purgeReports();
    }

    /**
     * @notice Reads the chained TWAP over the current measurement window
     *         without reporting it. Unlike `update()` this never gates on the
     *         period, so the live average can always be inspected.
     * @return price The AMPL/USDC price as an OUTPUT_DECIMALS number.
     */
    function consult() external view returns (uint256 price) {
        (price, ) = _computePrice();
    }

    /**
     * @notice Sets the MedianOracle this contract reports to.
     * @param medianOracle_ The new MedianOracle address.
     */
    function setMedianOracle(address medianOracle_) external onlyOwner {
        medianOracle = IMedianOracle(medianOracle_);
    }

    /**
     * @notice Sets the Orchestrator address allowed to call `update()`.
     * @param orchestrator_ The Orchestrator address (zero to allow only the
     *        owner to call `update()`).
     */
    function setOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
    }

    /**
     * @notice Sets the rebase period gating the public `update()` fallback.
     * @param rebasePeriodSec_ The new rebase period in seconds.
     */
    function setRebasePeriodSec(uint256 rebasePeriodSec_) external onlyOwner {
        rebasePeriodSec = rebasePeriodSec_;
    }

    /**
     * @dev Computes the chained TWAP since the last `update()`. Requires the
     *      oracle to be initialized and at least one second of measurement (to
     *      avoid division by zero), but never gates on the full period.
     * @return price The chained price as an OUTPUT_DECIMALS number.
     * @return timeElapsed The length of the measurement window in seconds.
     */
    function _computePrice() private view returns (uint256 price, uint32 timeElapsed) {
        require(blockTimestampLast > 0, "DexOracle: UPDATE_NEVER_CALLED");

        (
            uint256 leg1Cumulative,
            uint256 leg2Cumulative,
            uint32 blockTimestamp
        ) = _currentCumulatives();

        unchecked {
            // unchecked because both timestamps are uint32 (mod 2**32) and the
            // subtraction must wrap correctly across the year-2106 boundary
            // instead of reverting.
            timeElapsed = blockTimestamp - blockTimestampLast;
        }
        require(timeElapsed > 0, "DexOracle: NO_TIME_ELAPSED");

        // The decimal cumulatives grow monotonically, so the windowed averages
        // are plain differences divided by the elapsed time.
        uint256 priceLeg1 = (leg1Cumulative - priceLeg1CumulativeLast) / timeElapsed;
        uint256 priceLeg2 = (leg2Cumulative - priceLeg2CumulativeLast) / timeElapsed;
        price = priceLeg1.mul(priceLeg2).div(10**OUTPUT_DECIMALS);
    }

    /**
     * @dev Reads the current price cumulatives for both legs, selecting the
     *      configured direction and bridging each from a raw UQ112x112 reserve
     *      ratio into an OUTPUT_DECIMALS price-seconds cumulative. Both legs
     *      share the same block timestamp.
     */
    function _currentCumulatives()
        private
        view
        returns (
            uint256 leg1Cumulative,
            uint256 leg2Cumulative,
            uint32 blockTimestamp
        )
    {
        uint256 price0;
        uint256 price1;

        (price0, price1, blockTimestamp) = UniswapV2OracleLibrary.currentCumulativePrices(
            address(pairLeg1)
        );
        leg1Cumulative = (leg1UseToken1Price ? price1 : price0).mul(decimalsFactorLeg1) >> 112;

        (price0, price1, ) = UniswapV2OracleLibrary.currentCumulativePrices(address(pairLeg2));
        leg2Cumulative = (leg2UseToken1Price ? price1 : price0).mul(decimalsFactorLeg2) >> 112;
    }

    /**
     * @dev Resolves the (base, quote) tokens a leg prices, given the read
     *      direction. price0 prices token0 in token1; price1 prices token1 in
     *      token0.
     */
    function _baseQuote(address pair, bool useToken1Price)
        private
        view
        returns (address base, address quote)
    {
        if (useToken1Price) {
            base = IUniswapV2Pair(pair).token1();
            quote = IUniswapV2Pair(pair).token0();
        } else {
            base = IUniswapV2Pair(pair).token0();
            quote = IUniswapV2Pair(pair).token1();
        }
    }

    /**
     * @dev Computes 10**(OUTPUT_DECIMALS + baseDecimals - quoteDecimals), the
     *      factor that converts a leg's raw UQ112x112 reserve ratio into an
     *      OUTPUT_DECIMALS decimal price.
     */
    function _decimalsFactor(address base, address quote) private view returns (uint256) {
        uint256 baseDecimals = uint256(IERC20Decimals(base).decimals());
        uint256 quoteDecimals = uint256(IERC20Decimals(quote).decimals());
        return 10**(OUTPUT_DECIMALS.add(baseDecimals).sub(quoteDecimals));
    }
}
