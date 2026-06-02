// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

/**
 * @title MockMedianOracle
 * @dev Records the most recent payload pushed by a provider so tests can assert
 *      on what DexOracle reports.
 */
contract MockMedianOracle {
    uint256 public lastPayload;
    uint256 public reportCount;

    event ReportPushed(address provider, uint256 payload);

    function pushReport(uint256 payload) external {
        lastPayload = payload;
        reportCount += 1;
        emit ReportPushed(msg.sender, payload);
    }
}
