// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
contract P256Probe is Test {
    function test_probe() public {
        uint256 pk = 0xA11CE;
        (uint256 x, uint256 y) = vm.publicKeyP256(pk);
        bytes32 h = sha256("hi");
        (bytes32 r, bytes32 s) = vm.signP256(pk, h);
        (bool ok, bytes memory out) = address(0x100).staticcall(abi.encode(h, r, s, x, y));
        emit log_named_uint("ok", ok ? 1 : 0);
        emit log_named_uint("len", out.length);
        if (out.length == 32) emit log_named_uint("val", abi.decode(out, (uint256)));
    }
}
