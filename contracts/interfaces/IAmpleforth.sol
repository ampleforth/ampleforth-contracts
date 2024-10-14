// Public interface definition for the Ampleforth supply policy on Ethereum (the base-chain)
interface IAmpleforth {
    function epoch() external view returns (uint256);

    function lastRebaseTimestampSec() external view returns (uint256);

    function inRebaseWindow() external view returns (bool);

    function globalAmpleforthEpochAndAMPLSupply() external view returns (uint256, uint256);

    function getTargetRate() external returns (uint256, bool);
}
