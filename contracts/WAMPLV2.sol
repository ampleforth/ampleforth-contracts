// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

// solhint-disable-next-line max-line-length
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
// solhint-disable-next-line max-line-length
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
// solhint-disable-next-line max-line-length
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {MathUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/**
 * @title WAMPLV2 (Wrapped AMPL V2).
 *
 * @dev A fixed-balance ERC-20 wrapper for the AMPL rebasing token.
 *      NOTE: This is functionally identical to V1 however,
 *      V2 implements the ERC-4626 (tokenized vault standard) interface.
 *
 *      Users "deposit" AMPL into this contract and can "mint" wAMPL.
 *      They can "redeem" their wAMPL and "withdraw" AMPL from this contract.
 *
 *      Each account's wAMPL balance represents the fixed percentage ownership of AMPL's market cap.
 *      For example: 100K wAMPL => 1% of the AMPL market cap
 *        when the AMPL supply is 100M, 100K wAMPL will be redeemable for 1M AMPL
 *        when the AMPL supply is 500M, 100K wAMPL will be redeemable for 5M AMPL
 *        and so on.
 *
 */
contract WAMPLV2 is ERC20Upgradeable, ERC20PermitUpgradeable, ERC4626Upgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using MathUpgradeable for uint256;

    //--------------------------------------------------------------------------
    // Constants

    /// @dev The maximum wAMPL supply.
    uint256 public constant MAX_SUPPLY = 10000000 * (10**18); // 10 M

    //--------------------------------------------------------------------------
    // Initializer

    /// @notice Contract state initialization.
    /// @param name_ The wAMPL ERC20 name.
    /// @param symbol_ The wAMPL ERC20 symbol.
    /// @param asset_ The address of the underlying asset, ie) the AMPL ERC-20 adddress.
    function init(
        string memory name_,
        string memory symbol_,
        address asset_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC4626_init(IERC20MetadataUpgradeable(asset_));
    }

    //--------------------------------------------------------------------------
    // Public view methods

    /// @param owner The account address.
    /// @return The AMPL balance redeemable by the owner.
    function assetBalanceOf(address owner) external view returns (uint256) {
        return _convertToAssets(balanceOf(owner), MathUpgradeable.Rounding.Down);
    }

    //--------------------------------------------------------------------------
    // Private methods

    /// @dev Internal conversion function (from assets to shares) with support for rounding direction.
    function _convertToShares(uint256 assets, MathUpgradeable.Rounding rounding)
        internal
        view
        override
        returns (uint256)
    {
        return assets.mulDiv(MAX_SUPPLY, _queryAMPLSupply(), rounding);
    }

    /// @dev Internal conversion function (from shares to assets) with support for rounding direction.
    function _convertToAssets(uint256 shares, MathUpgradeable.Rounding rounding)
        internal
        view
        override
        returns (uint256)
    {
        return shares.mulDiv(_queryAMPLSupply(), MAX_SUPPLY, rounding);
    }

    /// @dev Queries the current total supply of AMPL.
    /// @return The current AMPL supply.
    function _queryAMPLSupply() private view returns (uint256) {
        return IERC20Upgradeable(asset()).totalSupply();
    }
}
