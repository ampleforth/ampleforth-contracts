// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.4;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./lib/Select.sol";

interface IOracle {
    function getData() external returns (uint256, bool);
}

/**
 * @title Median Oracle
 *
 * @notice Provides a value onchain that's aggregated from a whitelisted set of
 *         providers.
 */
contract MedianOracle is OwnableUpgradeable, IOracle {
    struct Report {
        uint256 timestamp;
        uint256 payload;
    }

    // Addresses of providers authorized to push reports.
    address[] public providers;

    // Reports indexed by provider address. Report[0].timestamp > 0
    // indicates provider existence.
    mapping(address => Report[2]) public providerReports;

    event ProviderAdded(address provider);
    event ProviderRemoved(address provider);
    event ReportTimestampOutOfRange(address provider);
    event ProviderReportPushed(address indexed provider, uint256 payload, uint256 timestamp);

    // The number of seconds after which the report is deemed expired.
    uint256 public reportExpirationTimeSec;

    // The number of seconds since reporting that has to pass before a report
    // is usable.
    uint256 public reportDelaySec;

    // The minimum number of providers with valid reports to consider the
    // aggregate report valid.
    uint256 public minimumProviders = 1;

    // Timestamp of 1 is used to mark uninitialized and invalidated data.
    // This is needed so that timestamp of 1 is always considered expired.
    uint256 private constant MAX_REPORT_EXPIRATION_TIME = 520 weeks;

    /**
     * @notice Contract state initialization.
     *
     * @param reportExpirationTimeSec_ The number of seconds after which the
     *                                 report is deemed expired.
     * @param reportDelaySec_ The number of seconds since reporting that has to
     *                        pass before a report is usable
     * @param minimumProviders_ The minimum number of providers with valid
     *                          reports to consider the aggregate report valid.
     */
    function init(
        uint256 reportExpirationTimeSec_,
        uint256 reportDelaySec_,
        uint256 minimumProviders_
    ) public initializer {
        require(reportExpirationTimeSec_ <= MAX_REPORT_EXPIRATION_TIME);
        require(minimumProviders_ > 0);
        reportExpirationTimeSec = reportExpirationTimeSec_;
        reportDelaySec = reportDelaySec_;
        minimumProviders = minimumProviders_;
        __Ownable_init();
    }

    /**
     * @notice Sets the report expiration period.
     * @param reportExpirationTimeSec_ The number of seconds after which the
     *        report is deemed expired.
     */
    function setReportExpirationTimeSec(uint256 reportExpirationTimeSec_) external onlyOwner {
        require(reportExpirationTimeSec_ <= MAX_REPORT_EXPIRATION_TIME);
        reportExpirationTimeSec = reportExpirationTimeSec_;
    }

    /**
     * @notice Sets the time period since reporting that has to pass before a
     *         report is usable.
     * @param reportDelaySec_ The new delay period in seconds.
     */
    function setReportDelaySec(uint256 reportDelaySec_) external onlyOwner {
        reportDelaySec = reportDelaySec_;
    }

    /**
     * @notice Sets the minimum number of providers with valid reports to
     *         consider the aggregate report valid.
     * @param minimumProviders_ The new minimum number of providers.
     */
    function setMinimumProviders(uint256 minimumProviders_) external onlyOwner {
        require(minimumProviders_ > 0);
        minimumProviders = minimumProviders_;
    }

    /**
     * @notice Pushes a report for the calling provider.
     * @param payload is expected to be 18 decimal fixed point number.
     */
    function pushReport(uint256 payload) external {
        address providerAddress = msg.sender;
        Report[2] storage reports = providerReports[providerAddress];
        uint256[2] memory timestamps = [reports[0].timestamp, reports[1].timestamp];

        // Checks that this providerAddress is already whitelisted
        require(timestamps[0] > 0);

        uint8 index_recent = timestamps[0] >= timestamps[1] ? 0 : 1;
        uint8 index_past = 1 - index_recent;

        uint256 minValidTimestamp = block.timestamp.sub(reportExpirationTimeSec);
        uint256 maxValidTimestamp = block.timestamp.sub(reportDelaySec);

        // Check that the push is not too soon after the last one.
        // unless past one is already expired
        require(
            timestamps[index_past] < minValidTimestamp ||
                timestamps[index_recent] <= maxValidTimestamp
        );

        reports[index_past].timestamp = block.timestamp;
        reports[index_past].payload = payload;

        emit ProviderReportPushed(providerAddress, payload, block.timestamp);
    }

    /**
     * @notice Invalidates the reports of the calling provider.
     */
    function purgeReports() external {
        address providerAddress = msg.sender;
        // Check that this providerAddress is already whitelisted
        require(providerReports[providerAddress][0].timestamp > 0);
        providerReports[providerAddress][0].timestamp = 1;
        providerReports[providerAddress][1].timestamp = 1;
    }

    /**
     * @notice Computes median of provider reports whose timestamps are in the
     *         valid timestamp range.
     * @return AggregatedValue: Median of providers reported values.
     *         valid: Boolean indicating an aggregated value was computed successfully.
     */
    function getData() external override returns (uint256, bool) {
        uint256 reportsCount = providers.length;
        uint256[] memory validReports = new uint256[](reportsCount);
        uint256 size = 0;
        uint256 minValidTimestamp = block.timestamp - reportExpirationTimeSec;
        uint256 maxValidTimestamp = block.timestamp - reportDelaySec;

        for (uint256 i = 0; i < reportsCount; i++) {
            address providerAddress = providers[i];
            Report[2] memory reports = providerReports[providerAddress];

            uint8 index_recent = reports[0].timestamp >= reports[1].timestamp ? 0 : 1;
            uint8 index_past = 1 - index_recent;
            uint256 reportTimestampRecent = reports[index_recent].timestamp;
            if (reportTimestampRecent > maxValidTimestamp) {
                // Recent report is too recent.
                uint256 reportTimestampPast = providerReports[providerAddress][index_past]
                    .timestamp;
                if (reportTimestampPast < minValidTimestamp) {
                    // Past report is too old.
                    emit ReportTimestampOutOfRange(providerAddress);
                } else if (reportTimestampPast > maxValidTimestamp) {
                    // Past report is too recent.
                    emit ReportTimestampOutOfRange(providerAddress);
                } else {
                    // Using past report.
                    validReports[size++] = providerReports[providerAddress][index_past].payload;
                }
            } else {
                // Recent report is not too recent.
                if (reportTimestampRecent < minValidTimestamp) {
                    // Recent report is too old.
                    emit ReportTimestampOutOfRange(providerAddress);
                } else {
                    // Using recent report.
                    validReports[size++] = providerReports[providerAddress][index_recent].payload;
                }
            }
        }

        if (size < minimumProviders) {
            return (0, false);
        }

        return (Select.computeMedian(validReports, size), true);
    }

    /**
     * @notice Authorizes a provider.
     * @param provider Address of the provider.
     */
    function addProvider(address provider) external onlyOwner {
        require(providerReports[provider][0].timestamp == 0);
        providers.push(provider);
        providerReports[provider][0].timestamp = 1;
        emit ProviderAdded(provider);
    }

    /**
     * @notice Revokes provider authorization.
     * @param provider Address of the provider.
     */
    function removeProvider(address provider) external onlyOwner {
        delete providerReports[provider];
        for (uint256 i = 0; i < providers.length; i++) {
            if (providers[i] == provider) {
                if (i + 1 != providers.length) {
                    providers[i] = providers[providers.length - 1];
                }
                providers.pop();
                emit ProviderRemoved(provider);
                break;
            }
        }
    }

    /**
     * @return The number of authorized providers.
     */
    function providersSize() external view returns (uint256) {
        return providers.length;
    }
}
