// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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
    using StringUtils for uint16;

    // Reference to the Ampleforth Policy
    address public policy;

    struct Transaction {
        bool enabled;
        address destination;
        bytes data;
    }

    // Stable ordering is not guaranteed.
    Transaction[] public transactions;

    /**
     * @param policy_ Address of the UFragments policy.
     */
    constructor(address policy_) Ownable() {
        policy = policy_;
    }

    /**
     * @notice Main entry point to initiate a rebase operation.
     *         The Orchestrator calls rebase on the policy and notifies downstream applications.
     *         Contracts are guarded from calling, to avoid flash loan attacks on liquidity
     *         providers.
     */
    function rebase() external {
        require(msg.sender == tx.origin); // solhint-disable-line avoid-tx-origin

        IUFragmentsPolicy(policy).rebase();

        for (uint16 i = 0; i < transactions.length; i++) {
            Transaction storage t = transactions[i];
            if (t.enabled) {
                (bool success, ) = t.destination.call(t.data);

                // Transaction failed, revert with message
                if (!success) {
                    revert(buildRevertReason(i));
                }
            }
        }
    }

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param data Transaction data payload
     */
    function addTransaction(address destination, bytes memory data) external onlyOwner {
        // require(transactions.length < type(uint16).max);
        transactions.push(Transaction({enabled: true, destination: destination, data: data}));
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
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function transactionsSize() external view returns (uint256) {
        return transactions.length;
    }

    /**
     * @param txIndex The index of the failing transaction in the transaction array.
     * @return The revert reason.
     */
    function buildRevertReason(uint16 txIndex) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "Orchestrator: transaction:{index} reverted:",
                    txIndex.uintToBytes()
                )
            );
    }
}
