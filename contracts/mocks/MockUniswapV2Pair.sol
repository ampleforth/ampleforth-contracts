// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

/**
 * @title MockERC20Decimals
 * @dev Minimal token exposing only `decimals()`, used to back a mock pair's
 *      token0/token1 so DexOracle can read their decimals.
 */
contract MockERC20Decimals {
    uint8 public decimals;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }
}

/**
 * @title MockUniswapV2Pair
 * @dev Test double exposing the UniswapV2Pair surface DexOracle consumes, with
 *      setters so cumulatives, reserves and the pair's last-sync timestamp can
 *      be driven deterministically.
 */
contract MockUniswapV2Pair {
    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 private _blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setReserves(
        uint112 reserve0_,
        uint112 reserve1_,
        uint32 blockTimestampLast_
    ) external {
        _reserve0 = reserve0_;
        _reserve1 = reserve1_;
        _blockTimestampLast = blockTimestampLast_;
    }

    function setCumulatives(uint256 price0CumulativeLast_, uint256 price1CumulativeLast_) external {
        price0CumulativeLast = price0CumulativeLast_;
        price1CumulativeLast = price1CumulativeLast_;
    }

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        )
    {
        return (_reserve0, _reserve1, _blockTimestampLast);
    }
}
