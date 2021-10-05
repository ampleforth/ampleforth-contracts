// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.4;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title WAMPL (Wrapped AMPL).
 *
 * @dev A fixed-balance ERC-20 wrapper for the AMPL rebasing token.
 *
 *      Users deposit AMPL into this contract and are minted wAMPL.
 *
 *      Each account's wAMPL balance represents the fixed percentage ownership
 *      of AMPL's market cap.
 *
 *      For example: 100K wAMPL => 1% of the AMPL market cap
 *        when the AMPL supply is 100M, 100K wAMPL will be redeemable for 1M AMPL
 *        when the AMPL supply is 500M, 100K wAMPL will be redeemable for 5M AMPL
 *        and so on.
 *
 *      We call wAMPL the "wrapper" token and AMPL the "underlying" or "wrapped" token.
 */
contract WAMPL is ERC20, ERC20Permit {
    using SafeERC20 for IERC20;

    //--------------------------------------------------------------------------
    // Constants

    /// @dev The maximum wAMPL supply.
    uint256 public constant MAX_WAMPL_SUPPLY = 10000000 * (10**18); // 10 M

    //--------------------------------------------------------------------------
    // Attributes

    /// @dev The reference to the AMPL token.
    address private immutable _ampl;

    //--------------------------------------------------------------------------

    /// @param ampl The AMPL ERC20 token address.
    /// @param name_ The wAMPL ERC20 name.
    /// @param symbol_ The wAMPL ERC20 symbol.
    constructor(
        address ampl,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        _ampl = ampl;
    }

    //--------------------------------------------------------------------------
    // WAMPL write methods

    /// @notice Transfers AMPLs from {msg.sender} and mints wAMPLs.
    ///
    /// @param wamples The amount of wAMPLs to mint.
    /// @return The amount of AMPLs deposited.
    function mint(uint256 wamples) external returns (uint256) {
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _deposit(_msgSender(), _msgSender(), amples, wamples);
        return amples;
    }

    /// @notice Transfers AMPLs from {msg.sender} and mints wAMPLs,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @param wamples The amount of wAMPLs to mint.
    /// @return The amount of AMPLs deposited.
    function mintFor(address to, uint256 wamples) external returns (uint256) {
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _deposit(_msgSender(), to, amples, wamples);
        return amples;
    }

    /// @notice Burns wAMPLs from {msg.sender} and transfers AMPLs back.
    ///
    /// @param wamples The amount of wAMPLs to burn.
    /// @return The amount of AMPLs withdrawn.
    function burn(uint256 wamples) external returns (uint256) {
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), _msgSender(), amples, wamples);
        return amples;
    }

    /// @notice Burns wAMPLs from {msg.sender} and transfers AMPLs back,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @param wamples The amount of wAMPLs to burn.
    /// @return The amount of AMPLs withdrawn.
    function burnTo(address to, uint256 wamples) external returns (uint256) {
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), to, amples, wamples);
        return amples;
    }

    /// @notice Burns all wAMPLs from {msg.sender} and transfers AMPLs back.
    ///
    /// @return The amount of AMPLs withdrawn.
    function burnAll() external returns (uint256) {
        uint256 wamples = balanceOf(_msgSender());
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), _msgSender(), amples, wamples);
        return amples;
    }

    /// @notice Burns all wAMPLs from {msg.sender} and transfers AMPLs back,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @return The amount of AMPLs withdrawn.
    function burnAllTo(address to) external returns (uint256) {
        uint256 wamples = balanceOf(_msgSender());
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), to, amples, wamples);
        return amples;
    }

    /// @notice Transfers AMPLs from {msg.sender} and mints wAMPLs.
    ///
    /// @param amples The amount of AMPLs to deposit.
    /// @return The amount of wAMPLs minted.
    function deposit(uint256 amples) external returns (uint256) {
        uint256 wamples = _ampleToWample(amples, _queryAMPLSupply());
        _deposit(_msgSender(), _msgSender(), amples, wamples);
        return wamples;
    }

    /// @notice Transfers AMPLs from {msg.sender} and mints wAMPLs,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @param amples The amount of AMPLs to deposit.
    /// @return The amount of wAMPLs minted.
    function depositFor(address to, uint256 amples) external returns (uint256) {
        uint256 wamples = _ampleToWample(amples, _queryAMPLSupply());
        _deposit(_msgSender(), to, amples, wamples);
        return wamples;
    }

    /// @notice Burns wAMPLs from {msg.sender} and transfers AMPLs back.
    ///
    /// @param amples The amount of AMPLs to withdraw.
    /// @return The amount of burnt wAMPLs.
    function withdraw(uint256 amples) external returns (uint256) {
        uint256 wamples = _ampleToWample(amples, _queryAMPLSupply());
        _withdraw(_msgSender(), _msgSender(), amples, wamples);
        return wamples;
    }

    /// @notice Burns wAMPLs from {msg.sender} and transfers AMPLs back,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @param amples The amount of AMPLs to withdraw.
    /// @return The amount of burnt wAMPLs.
    function withdrawTo(address to, uint256 amples) external returns (uint256) {
        uint256 wamples = _ampleToWample(amples, _queryAMPLSupply());
        _withdraw(_msgSender(), to, amples, wamples);
        return wamples;
    }

    /// @notice Burns all wAMPLs from {msg.sender} and transfers AMPLs back.
    ///
    /// @return The amount of burnt wAMPLs.
    function withdrawAll() external returns (uint256) {
        uint256 wamples = balanceOf(_msgSender());
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), _msgSender(), amples, wamples);
        return wamples;
    }

    /// @notice Burns all wAMPLs from {msg.sender} and transfers AMPLs back,
    ///         to the specified beneficiary.
    ///
    /// @param to The beneficiary wallet.
    /// @return The amount of burnt wAMPLs.
    function withdrawAllTo(address to) external returns (uint256) {
        uint256 wamples = balanceOf(_msgSender());
        uint256 amples = _wampleToAmple(wamples, _queryAMPLSupply());
        _withdraw(_msgSender(), to, amples, wamples);
        return wamples;
    }

    //--------------------------------------------------------------------------
    // WAMPL view methods

    /// @return The address of the underlying "wrapped" token ie) AMPL.
    function underlying() external view returns (address) {
        return _ampl;
    }

    /// @return The total AMPLs held by this contract.
    function totalUnderlying() external view returns (uint256) {
        return _wampleToAmple(totalSupply(), _queryAMPLSupply());
    }

    /// @param owner The account address.
    /// @return The AMPL balance redeemable by the owner.
    function balanceOfUnderlying(address owner) external view returns (uint256) {
        return _wampleToAmple(balanceOf(owner), _queryAMPLSupply());
    }

    /// @param amples The amount of AMPL tokens.
    /// @return The amount of wAMPL tokens exchangeable.
    function underlyingToWrapper(uint256 amples) external view returns (uint256) {
        return _ampleToWample(amples, _queryAMPLSupply());
    }

    /// @param wamples The amount of wAMPL tokens.
    /// @return The amount of AMPL tokens exchangeable.
    function wrapperToUnderlying(uint256 wamples) external view returns (uint256) {
        return _wampleToAmple(wamples, _queryAMPLSupply());
    }

    //--------------------------------------------------------------------------
    // Private methods

    /// @dev Internal helper function to handle deposit state change.
    /// @param from The initiator wallet.
    /// @param to The beneficiary wallet.
    /// @param amples The amount of AMPLs to deposit.
    /// @param wamples The amount of wAMPLs to mint.
    function _deposit(
        address from,
        address to,
        uint256 amples,
        uint256 wamples
    ) private {
        IERC20(_ampl).safeTransferFrom(from, address(this), amples);

        _mint(to, wamples);
    }

    /// @dev Internal helper function to handle withdraw state change.
    /// @param from The initiator wallet.
    /// @param to The beneficiary wallet.
    /// @param amples The amount of AMPLs to withdraw.
    /// @param wamples The amount of wAMPLs to burn.
    function _withdraw(
        address from,
        address to,
        uint256 amples,
        uint256 wamples
    ) private {
        _burn(from, wamples);

        IERC20(_ampl).safeTransfer(to, amples);
    }

    /// @dev Queries the current total supply of AMPL.
    /// @return The current AMPL supply.
    function _queryAMPLSupply() private view returns (uint256) {
        return IERC20(_ampl).totalSupply();
    }

    //--------------------------------------------------------------------------
    // Pure methods

    /// @dev Converts AMPLs to wAMPL amount.
    function _ampleToWample(uint256 amples, uint256 totalAMPLSupply)
        private
        pure
        returns (uint256)
    {
        return (amples * MAX_WAMPL_SUPPLY) / totalAMPLSupply;
    }

    /// @dev Converts wAMPLs amount to AMPLs.
    function _wampleToAmple(uint256 wamples, uint256 totalAMPLSupply)
        private
        pure
        returns (uint256)
    {
        return (wamples * totalAMPLSupply) / MAX_WAMPL_SUPPLY;
    }
}
