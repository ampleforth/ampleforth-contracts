pragma solidity ^0.4.18;


/**
 * @title SafeMathInt
 * Borrowed from RequestNetwork SafeMathInt.sol, but with more efficient
 * assertion checks.
 * @dev Math operations with safety checks that throw on error
 * @dev SafeMath adapted for int256
 */
library SafeMathInt {
    int256 private constant MIN_INT256 = int256(1) << 255;
    int256 private constant MAX_INT256 = ~(int256(1) << 255);
    
    function mul(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a * b;

        // Detect overflow when multiplying MIN_INT256 with -1
        assert(
               c != MIN_INT256
               || (a & MIN_INT256) != (b & MIN_INT256)
               );
        assert((b == 0) || (c / b == a));
        return c;
    }
    
    function div(int256 a, int256 b) internal pure returns (int256) {
        // Prevent overflow when dividing MIN_INT256 by -1
        assert(b != -1 || a != MIN_INT256);
        
        // assert(b > 0); // Solidity automatically throws when dividing by 0
        int256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold
        return c;
    }

    function sub(int256 a, int256 b) internal pure returns (int256) {
        assert((b >= 0 && a - b <= a) || (b < 0 && a - b > a));
        
        return a - b;
    }
    
    function add(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a + b;
        assert((b >= 0 && c >= a) || (b < 0 && c < a));
        return c;
    }
    
    function toUint256Safe(int256 a) internal pure returns (uint256) {
        assert(a >= 0);
        return uint256(a);
  }
}
