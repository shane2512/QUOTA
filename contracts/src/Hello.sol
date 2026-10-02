// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Phase 0 smoke-test contract. Deleted once QuotaRegistry deploys.
contract Hello {
    string public greeting = "QUOTA";

    function chainId() external view returns (uint256) {
        return block.chainid;
    }
}
