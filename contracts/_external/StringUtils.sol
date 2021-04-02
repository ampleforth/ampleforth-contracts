// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.0;

// https://github.com/pipermerriam/ethereum-string-utils/blob/master/contracts/StringLib.sol
// String Utils v0.1
/// @title String Utils - String utility functions
/// @author Piper Merriam - <pipermerriam@gmail.com>
library StringUtils {
    /// @dev Converts an unsigned integert to its string representation.
    /// @param v The number to be converted.
    function uintToBytes(uint256 v) internal pure returns (bytes32 ret) {
        if (v == 0) {
            ret = "0";
        } else {
            while (v > 0) {
                ret = bytes32(uint256(ret) / (2**8));
                ret |= bytes32(((v % 10) + 48) * 2**(8 * 31));
                v /= 10;
            }
        }
        return ret;
    }
}
