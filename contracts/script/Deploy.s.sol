// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {QuotaRegistry} from "../src/QuotaRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external returns (QuotaRegistry r) {
        string memory rpId = vm.envString("WEBAUTHN_RP_ID");
        string[] memory origins = vm.envString("WEBAUTHN_ALLOWED_ORIGINS", ",");
        vm.startBroadcast();
        r = new QuotaRegistry(
            rpId,
            origins,
            vm.envOr("TREE_DEPTH", uint256(20)),
            vm.envOr("STAKE_UNIT_WEI", uint256(0.01 ether)),
            vm.envOr("UNSTAKE_DELAY_S", uint256(2 hours)),
            vm.envOr("ROOT_TTL_S", uint256(10 minutes)),
            vm.envOr("SLASH_SHARE_BPS", uint256(5000))
        );
        vm.stopBroadcast();
        console.log("QuotaRegistry", address(r));
    }
}
