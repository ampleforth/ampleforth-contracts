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
 *         point numbers denominated in raw (smallest-unit) reserves. This
 *         contract bridges that representation into an OUTPUT_DECIMALS (18)
 *         fixed point decimal price, which is the format MedianOracle expects:
 *
 *             price_18 = (avgRatioUQ112x112 * decimalsFactor) >> 112
 *             decimalsFactor = 10**(OUTPUT_DECIMALS + baseDecimals - quoteDecimals)
 *
 *         Intended 24h rebase cadence:
 *         - `update()`     is called right after rebase (appended to the
 *                          Orchestrator's transaction list) to open a fresh
 *                          measurement window.
 *         - `pushReport()` is called ~2h before the next rebase to close the
 *                          window and report the TWAP. The report then ages
 *                          past the MedianOracle report-delay (security) window
 *                          before it is consumed at the following rebase.
 */
contract DexOracle is Ownable {
    using SafeMath for uint256;

    /// @notice Decimals of the reported price; matches MedianOracle.DECIMALS.
    uint256 public constant OUTPUT_DECIMALS = 18;

    /// @notice MedianOracle this contract reports to as a registered provider.
    IMedianOracle public immutable medianOracle;

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

    /// @notice Raw UniswapV2 price cumulatives captured at the last `update()`.
    uint256 public priceLeg1CumulativeLast;
    uint256 public priceLeg2CumulativeLast;
    /// @notice Timestamp (mod 2**32) of the last `update()`. Zero until the
    ///         first `update()`, which marks the oracle as uninitialized.
    uint32 public blockTimestampLast;

    /// @notice Minimum measurement window length before a report can be pushed.
    uint256 public minReportTimeIntervalSec = 22 hours;

    /// @dev Daily cadence and the window (relative to the day) during which
    ///      `update()` may open a new measurement window. Defaults mirror the
    ///      policy's rebase window so updates land right after rebase.
    uint256 public updateTimeIntervalSec = 1 days;
    uint256 public updateWindowOffsetSec = 7200; // 2AM UTC, matches rebase
    uint256 public updateWindowLengthSec = 20 minutes;

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
     * @param pairLeg1_ UniswapV2 pair for the first (source/bridge) leg.
     * @param leg1UseToken1Price_ True to read price1 on leg1, false for price0.
     * @param pairLeg2_ UniswapV2 pair for the second (bridge/quote) leg.
     * @param leg2UseToken1Price_ True to read price1 on leg2, false for price0.
     */
    constructor(
        address medianOracle_,
        address pairLeg1_,
        bool leg1UseToken1Price_,
        address pairLeg2_,
        bool leg2UseToken1Price_
    ) {
        Ownable.initialize(msg.sender);

        medianOracle = IMedianOracle(medianOracle_);

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
     * @dev Gated to the daily update window so the measurement window cannot be
     *      reset off-schedule (which would shorten a subsequent report's TWAP).
     */
    function update() external {
        require(inUpdateWindow(), "DexOracle: NOT_IN_UPDATE_WINDOW");

        (
            uint256 leg1Cumulative,
            uint256 leg2Cumulative,
            uint32 blockTimestamp
        ) = _currentCumulatives();
        priceLeg1CumulativeLast = leg1Cumulative;
        priceLeg2CumulativeLast = leg2Cumulative;
        blockTimestampLast = blockTimestamp;

        emit LogPriceUpdate(leg1Cumulative, leg2Cumulative, blockTimestamp);
    }

    /**
     * @notice Closes the measurement window, computes the chained TWAP and
     *         reports it to the MedianOracle. Intended to be called ~2h before
     *         the next rebase, leaving the report to age past the MedianOracle
     *         report-delay window before it is consumed.
     * @return price The reported AMPL/USDC price as an OUTPUT_DECIMALS number.
     */
    function pushReport() external returns (uint256 price) {
        uint32 timeElapsed;
        (price, timeElapsed) = _computePrice(minReportTimeIntervalSec);

        medianOracle.pushReport(price);
        emit LogReportPushed(price, timeElapsed);
    }

    /**
     * @notice Computes the chained TWAP over the current measurement window
     *         without reporting it.
     * @return price The AMPL/USDC price as an OUTPUT_DECIMALS number.
     */
    function computePrice() external view returns (uint256 price) {
        // Require at least one second of measurement so the average is defined.
        (price, ) = _computePrice(1);
    }

    /**
     * @return True if the current block falls within the daily update window.
     */
    function inUpdateWindow() public view returns (bool) {
        uint256 timeOfDay = block.timestamp.mod(updateTimeIntervalSec);
        return (timeOfDay >= updateWindowOffsetSec &&
            timeOfDay < updateWindowOffsetSec.add(updateWindowLengthSec));
    }

    /**
     * @notice Sets the minimum measurement window length before a report can be
     *         pushed.
     * @param minReportTimeIntervalSec_ The new minimum window length in seconds.
     */
    function setMinReportTimeIntervalSec(uint256 minReportTimeIntervalSec_) external onlyOwner {
        require(minReportTimeIntervalSec_ < updateTimeIntervalSec, "DexOracle: INTERVAL_TOO_LONG");
        minReportTimeIntervalSec = minReportTimeIntervalSec_;
    }

    /**
     * @notice Sets the daily update window parameters.
     * @param updateTimeIntervalSec_ Length of a full cadence cycle in seconds.
     * @param updateWindowOffsetSec_ Offset of the window from the cycle start.
     * @param updateWindowLengthSec_ Length of the update window in seconds.
     */
    function setUpdateWindow(
        uint256 updateTimeIntervalSec_,
        uint256 updateWindowOffsetSec_,
        uint256 updateWindowLengthSec_
    ) external onlyOwner {
        require(updateWindowOffsetSec_ < updateTimeIntervalSec_, "DexOracle: BAD_OFFSET");
        require(updateWindowLengthSec_ <= updateTimeIntervalSec_, "DexOracle: BAD_LENGTH");
        updateTimeIntervalSec = updateTimeIntervalSec_;
        updateWindowOffsetSec = updateWindowOffsetSec_;
        updateWindowLengthSec = updateWindowLengthSec_;
    }

    /**
     * @dev Computes the chained TWAP, requiring at least `minElapsedSec` of
     *      measurement since the last `update()`.
     * @return price The chained price as an OUTPUT_DECIMALS number.
     * @return timeElapsed The length of the measurement window in seconds.
     */
    function _computePrice(uint256 minElapsedSec)
        private
        view
        returns (uint256 price, uint32 timeElapsed)
    {
        require(blockTimestampLast > 0, "DexOracle: UPDATE_NEVER_CALLED");

        (
            uint256 leg1Cumulative,
            uint256 leg2Cumulative,
            uint32 blockTimestamp
        ) = _currentCumulatives();
        unchecked {
            // Wraparound is desired; both timestamps are taken mod 2**32.
            timeElapsed = blockTimestamp - blockTimestampLast;
        }
        require(timeElapsed >= minElapsedSec, "DexOracle: PERIOD_NOT_ELAPSED");

        uint256 priceLeg1 = _legPrice(
            leg1Cumulative,
            priceLeg1CumulativeLast,
            timeElapsed,
            decimalsFactorLeg1
        );
        uint256 priceLeg2 = _legPrice(
            leg2Cumulative,
            priceLeg2CumulativeLast,
            timeElapsed,
            decimalsFactorLeg2
        );
        price = priceLeg1.mul(priceLeg2).div(10**OUTPUT_DECIMALS);
    }

    /**
     * @dev Reads the current raw price cumulatives for both legs, selecting the
     *      configured direction. Both legs share the same block timestamp.
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
        leg1Cumulative = leg1UseToken1Price ? price1 : price0;

        (price0, price1, ) = UniswapV2OracleLibrary.currentCumulativePrices(address(pairLeg2));
        leg2Cumulative = leg2UseToken1Price ? price1 : price0;
    }

    /**
     * @dev Converts the windowed difference of a raw UQ112x112 cumulative into
     *      an OUTPUT_DECIMALS decimal price.
     */
    function _legPrice(
        uint256 cumulativeNow,
        uint256 cumulativeLast,
        uint32 timeElapsed,
        uint256 decimalsFactor
    ) private pure returns (uint256) {
        uint256 avgRatioUQ112x112;
        unchecked {
            // The UniswapV2 accumulators are designed to overflow; the windowed
            // difference is well-defined modulo 2**256.
            avgRatioUQ112x112 = (cumulativeNow - cumulativeLast) / timeElapsed;
        }
        // Bridge the UQ112x112 raw reserve ratio into a decimal price. The
        // windowed average is bounded, so the scaling cannot overflow.
        return avgRatioUQ112x112.mul(decimalsFactor) >> 112;
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
