pragma solidity 0.8.4;

//import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
//import '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol';
//import '@uniswap/lib/contracts/libraries/FixedPoint.sol';

import "./_external/ERC20Detailed.sol";
import "./_external/SafeMath.sol";
//import "hardhat/console.sol";

// fixed window oracle that recomputes the average price for the entire period once every period
// note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract DexOracle {
    using SafeMath for *;

    IUniswapV2Pair immutable pair;

//    using FixedPoint for *;

    uint256[2] public decimalsFactor;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint32  public blockTimestampLast;

    uint256  public constant OUTPUT_DECIMALS = 18;

    uint public period = 24 hours;
    uint256 public updateTimeIntervalSec = 24 hours;
    uint256 public updateWindowOffsetSec = 2 hours;
    uint256 public updateWindowLengthSec = 2 hours;

    function currentBlockTimestamp() internal view returns (uint32) {
        return uint32(block.timestamp % 2 ** 32);
    }

    function currentCumulativePrices(
        address pair
    ) public view returns (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) {
        blockTimestamp = currentBlockTimestamp();
        price0Cumulative = IUniswapV2Pair(pair).price0CumulativeLast().mul(decimalsFactor[0]) >> 112;
        price1Cumulative = IUniswapV2Pair(pair).price1CumulativeLast().mul(decimalsFactor[1]) >> 112;
        // if time has elapsed since the last update on the pair, mock the accumulated price values
//        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair).getReserves();
//        if (blockTimestampLast != blockTimestamp) {
//            // subtraction overflow is desired
//            uint32 timeElapsed = blockTimestamp - blockTimestampLast;
//            // addition overflow is desired
//            // unstored
//            price0Cumulative += uint(FixedPoint.fraction(reserve1, reserve0)._x) * timeElapsed;
//            // unstored
//            price1Cumulative += uint(FixedPoint.fraction(reserve0, reserve1)._x) * timeElapsed;
//        }
    }

    constructor(address pool) public {
        IUniswapV2Pair _pair = IUniswapV2Pair(pool);
        pair = _pair;
        decimalsFactor[0] = uint256(10)**(OUTPUT_DECIMALS.add(ERC20Detailed(_pair.token0()).decimals()).sub(ERC20Detailed(_pair.token1()).decimals()));
        decimalsFactor[1] = uint256(10)**(OUTPUT_DECIMALS.add(ERC20Detailed(_pair.token1()).decimals()).sub(ERC20Detailed(_pair.token0()).decimals()));
        blockTimestampLast = 0;
    }
    function inWindow() public view returns (bool) {
        return (block.timestamp.mod(updateTimeIntervalSec) >= updateWindowOffsetSec &&
            block.timestamp.mod(updateTimeIntervalSec) <
        (updateWindowOffsetSec.add(updateWindowLengthSec)));
    }

    function update() external {
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
        require(inWindow() || timeElapsed >= period,'DexOracle: NOT_IN_WINDOW');
        (uint price0CumulativeLast, uint price1CumulativeLast, uint32 blockTimestampLast) = currentCumulativePrices(address(pair));
    }

    function consult(uint tokenID) external view returns (uint256) {
        require(blockTimestampLast > 0, 'DexOracle: UPDATE_NEVER_CALLED');
        (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) = currentCumulativePrices(address(pair));

        uint32 timeElapsed = blockTimestamp - blockTimestampLast;
        uint256 priceAverage0 = (price0Cumulative - price0CumulativeLast) / timeElapsed;
        return priceAverage0;
    }
}
