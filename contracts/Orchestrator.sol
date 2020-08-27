pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";

import "./UFragmentsPolicy.sol";


/**
 * @title Orchestrator
 * @notice The orchestrator is the main entry point for rebase operations. It coordinates the policy
 * actions with external consumers.
 */
contract Orchestrator is Ownable {

    struct Transaction {
        bool enabled;
        address destination;
        bytes data;
    }

    event TransactionFailed(address indexed destination, uint index, bytes data);

    // Stable ordering is not guaranteed.
    Transaction[] public transactions;

    UFragmentsPolicy public policy;

    /**
     * @param policy_ Address of the UFragments policy.
     */
    constructor(address policy_) public {
        Ownable.initialize(msg.sender);
        policy = UFragmentsPolicy(policy_);
    }

    /**
     * @notice Main entry point to initiate a rebase operation.
     *         The Orchestrator calls rebase on the policy and notifies downstream applications.
     *         Contracts are guarded from calling, to avoid flash loan attacks on liquidity
     *         providers.
     *         If a transaction in the transaction list reverts, it is swallowed and the remaining
     *         transactions are executed.
     */
    function rebase()
        external
    {
        // only callable by EOA to prevent flashloan attacks
        require(msg.sender == tx.origin);  // solhint-disable-line avoid-tx-origin

        // call monetary policy rebase, always revert on failure
        policy.rebase();

        // call peripheral contracts, revert batch if out-of-gas or silent revert
        for (uint256 index = 0; index < transactions.length; index++) {
            _executePeripheralTransaction(index);
        }
    }

    /**
     * @notice Get the revert message and code from a call.
     * @param index uint256 Index of the transaction.
     * @return success bool True if peripheral transaction was successful.
     * @return returnData bytes Return data.
     */
    function _executePeripheralTransaction(uint256 index)
        internal
        returns (bool success, bytes memory returnData)
    {
        // declare storage reference
        Transaction memory transaction = transactions[index];

        // return early if disabled
        if (!transaction.enabled) {
            return (success, returnData);
        }

        // perform low level external call and forward 63/64 remaining gas
        (success) = address(transaction.destination).call(transaction.data);

        // Check if any of the atomic transactions failed, if not, decode return data
        if (!success) {
            assembly {
                returndatacopy(returnData, 0, returndatasize)
            }
            if (returnData.length == 0) {
                // If revert reason is empty, it is either OOG error or silent revert so we revert the batch
                revert("Transaction reverted silently");
            } else {
                // Log any other revert and continue rebase execution
                emit TransactionFailed(
                    transaction.destination,
                    index,
                    transaction.data
                );
            }
        }

        // explicit return
        return (success, returnData);
    }

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param data Transaction data payload
     */
    function addTransaction(address destination, bytes data)
        external
        onlyOwner
    {
        transactions.push(Transaction({
            enabled: true,
            destination: destination,
            data: data
        }));
    }

    /**
     * @param index Index of transaction to remove.
     *              Transaction ordering may have changed since adding.
     */
    function removeTransaction(uint index)
        external
        onlyOwner
    {
        require(index < transactions.length, "index out of bounds");

        if (index < transactions.length - 1) {
            transactions[index] = transactions[transactions.length - 1];
        }

        transactions.length--;
    }

    /**
     * @param index Index of transaction. Transaction ordering may have changed since adding.
     * @param enabled True for enabled, false for disabled.
     */
    function setTransactionEnabled(uint index, bool enabled)
        external
        onlyOwner
    {
        require(index < transactions.length, "index must be in range of stored tx list");
        transactions[index].enabled = enabled;
    }

    /**
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function transactionsSize()
        external
        view
        returns (uint256)
    {
        return transactions.length;
    }
