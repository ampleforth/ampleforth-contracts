// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.4;

/**
 * @title Select
 * @dev Median Selection Library
 */
library Select {
    /**
     * @dev Sorts the input array up to the denoted size, and returns the median.
     * @param array Input array to compute its median.
     * @param size Number of elements in array to compute the median for.
     * @return Median of array.
     */
    function computeMedian(uint256[] memory array, uint256 size) internal pure returns (uint256) {
        require(size > 0 && array.length >= size);
        for (uint256 i = 1; i < size; i++) {
            for (uint256 j = i; j > 0 && array[j - 1] > array[j]; j--) {
                uint256 tmp = array[j];
                array[j] = array[j - 1];
                array[j - 1] = tmp;
            }
        }
        if (size % 2 == 1) {
            return array[size / 2];
        } else {
            return (array[size / 2] + array[size / 2 - 1]) / 2;
        }
    }
}
