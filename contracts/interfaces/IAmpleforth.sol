pragma solidity 0.4.24;

// Interface definition for the Ampleforth supply policy
interface IAmpleforth {
    function rebase() external;

    function uFrags() external view returns (address);

    function cpiOracle() external view returns (address);

    function marketOracle() external view returns (address);

    function deviationThreshold() external view returns (uint256);

    function rebaseLag() external view returns (uint256);

    function minRebaseTimeIntervalSec() external view returns (uint256);

    function lastRebaseTimestampSec() external view returns (uint256);

    function rebaseWindowOffsetSec() external view returns (uint256);

    function rebaseWindowLengthSec() external view returns (uint256);

    function epoch() external view returns (uint256);

    function inRebaseWindow() public view returns (bool);

    event LogRebase(
        uint256 indexed epoch,
        uint256 exchangeRate,
        uint256 cpi,
        int256 requestedSupplyAdjustment,
        uint256 timestampSec
    );

    // Multi-chain AMPL
    function globalAmpleforthEpoch() external view returns (uint256);

    function globalAmpleforthEpochAndAMPLSupply() external view returns (uint256, uint256);
}
