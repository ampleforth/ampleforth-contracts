// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import {IUniswapV2Pair} from "./IUniswapV2Pair.sol";

/**
 * @title UniswapV2OracleLibrary
 * @dev Helper methods for oracles that consume the UniswapV2 price
 *      accumulators. Ported to 0.8.x; the `unchecked` blocks preserve the
 *      modulo-2**N wraparound that the UniswapV2Pair accumulators rely on.
 */
library UniswapV2OracleLibrary {
    // Returns the current block timestamp within the range of uint32,
    // i.e. [0, 2**32 - 1]. Matches the truncation used by UniswapV2Pair.
    function currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2**32);
    }

    // Produces the cumulative prices using counterfactuals to save gas and
    // avoid a call to sync. The returned cumulatives are UQ112x112 fixed point
    // numbers denominated in raw (smallest-unit) reserves.
    function currentCumulativePrices(address pair)
        internal
        view
        returns (
            uint256 price0Cumulative,
            uint256 price1Cumulative,
            uint32 blockTimestamp
        )
    {
        blockTimestamp = currentBlockTimestamp();
        price0Cumulative = IUniswapV2Pair(pair).price0CumulativeLast();
        price1Cumulative = IUniswapV2Pair(pair).price1CumulativeLast();

        // If time has elapsed since the last update on the pair, mock the
        // accumulated price values to bring them current.
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair)
            .getReserves();
        if (blockTimestampLast != blockTimestamp) {
            unchecked {
                // Subtraction overflow is desired.
                uint32 timeElapsed = blockTimestamp - blockTimestampLast;
                // Addition overflow is desired (matches UniswapV2Pair).
                // counterfactual
                price0Cumulative += uint256(_fraction(reserve1, reserve0)) * timeElapsed;
                // counterfactual
                price1Cumulative += uint256(_fraction(reserve0, reserve1)) * timeElapsed;
            }
        }
    }

    // Encodes (numerator / denominator) as a UQ112x112 fixed point number,
    // mirroring UniswapV2's FixedPoint.fraction.
    function _fraction(uint112 numerator, uint112 denominator) private pure returns (uint224) {
        require(denominator > 0, "UniswapV2OracleLibrary: DIVISION_BY_ZERO");
        return uint224((uint256(numerator) << 112) / denominator);
    }
}
