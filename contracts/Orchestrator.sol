// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BytesLib} from "./_external/BytesLib.sol";
import {StringUtils} from "./_external/StringUtils.sol";

interface IUFragmentsPolicy {
    function rebase() external;
}

/**
 * @title Orchestrator
 * @notice The orchestrator is the main entry point for rebase operations. It coordinates the policy
 * actions with external consumers.
 */
contract Orchestrator is Ownable {
    using BytesLib for bytes;
    using StringUtils for uint16;

    // Reference to the Ampleforth Policy
    address public policy;

    struct Transaction {
        bool enabled;
        // A failed Transaction marked critical will also cause rebase to fail.
        bool critical;
        address destination;
        bytes data;
    }

    // Stable ordering is not guaranteed.
    Transaction[] public transactions;

    // events
    event TransactionFailed(uint16 index);

    /**
     * @param policy_ Address of the UFragments policy.
     */
    constructor(address policy_) {
        policy = policy_;
    }

    /**
     * @notice Main entry point to initiate a rebase operation.
     *         The Orchestrator calls rebase on the policy and notifies downstream applications.
     *         Contracts are guarded from calling, to avoid flash loan attacks on liquidity
     *         providers.
     *         If a transaction marked 'critical' in the transaction list fails,
     *         Orchestrator will stop execution and revert.
     */
    function rebase() external {
        require(msg.sender == tx.origin); // solhint-disable-line avoid-tx-origin

        IUFragmentsPolicy(policy).rebase();

        for (uint16 i = 0; i < transactions.length; i++) {
            Transaction storage t = transactions[i];
            if (t.enabled) {
                (bool success, bytes memory reason) = t.destination.call(t.data);

                // Critical transaction failed, revert with message
                if (!success && t.critical) {
                    revert(buildRevertReason(i, reason));
                }

                // Non-Critical transaction failed, log error and continue
                if (!success) {
                    emit TransactionFailed(i);
                }
            }
        }
    }

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param data Transaction data payload
     */
    function addTransaction(
        bool critical,
        address destination,
        bytes memory data
    ) external onlyOwner {
        transactions.push(
            Transaction({enabled: true, critical: critical, destination: destination, data: data})
        );
    }

    /**
     * @param index Index of transaction to remove.
     *              Transaction ordering may have changed since adding.
     */
    function removeTransaction(uint16 index) external onlyOwner {
        require(index < transactions.length, "Orchestrator: index out of bounds");

        if (index < transactions.length - 1) {
            transactions[index] = transactions[transactions.length - 1];
        }

        transactions.pop();
    }

    /**
     * @param index Index of transaction. Transaction ordering may have changed since adding.
     * @param enabled True for enabled, false for disabled.
     */
    function setTransactionEnabled(uint16 index, bool enabled) external onlyOwner {
        require(
            index < transactions.length,
            "Orchestrator: index must be in range of stored tx list"
        );
        transactions[index].enabled = enabled;
    }

    /**
     * @param index Index of transaction. Transaction ordering may have changed since adding.
     * @param critical True for critical, false for non-critical.
     */
    function setTransactionCritical(uint16 index, bool critical) external onlyOwner {
        require(
            index < transactions.length,
            "Orchestrator: index must be in range of stored tx list"
        );
        transactions[index].critical = critical;
    }

    /**
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function transactionsSize() external view returns (uint256) {
        return transactions.length;
    }

    /**
     * @param txIndex The index of the failing transaction in the transaction array.
     * @param reason The revert reason in bytes.
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function buildRevertReason(uint16 txIndex, bytes memory reason)
        internal
        pure
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    "Orchestrator: critical index:{job} reverted with: {reason}:",
                    txIndex.uintToBytes(),
                    "|",
                    revertReasonToString(reason)
                )
            );
    }

    /**
     * @dev github.com/authereum/contracts/account/BaseAccount.sol#L132
     * @param reason The revert reason in bytes.
     * @return The revert reason as a string.
     */
    function revertReasonToString(bytes memory reason) internal pure returns (string memory) {
        // If the reason length is less than 68, then the transaction failed
        // silently (without a revert message)
        if (reason.length < 68) return "Transaction reverted silently";

        // Remove the selector which is the first 4 bytes
        bytes memory revertData = reason.slice(4, reason.length - 4);

        // All that remains is the revert string
        return abi.decode(revertData, (string));
    }
}
