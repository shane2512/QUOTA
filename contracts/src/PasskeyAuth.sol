// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PasskeyAuth
/// @notice WebAuthn assertion verification via the P256VERIFY precompile at 0x100 (PRD C2).
/// Checks: type == "webauthn.get", challenge, origin allowlist, rpIdHash, UP, UV, low-s, signature.
/// Replay protection (per-operator nonce) and payload binding live in the caller (QuotaRegistry),
/// which derives `challenge` from (chainId, registry, operator, action, params, nonce).
///
/// clientDataJSON is parsed strictly. The WebAuthn spec fixes the serialization order
/// {"type","challenge","origin",...}; anything else is rejected rather than searched for.
library PasskeyAuth {
    struct Assertion {
        bytes authenticatorData;
        string clientDataJSON;
        uint256 r;
        uint256 s;
    }

    error BadAuthData();
    error RpIdMismatch();
    error UserNotPresent();
    error UserNotVerified();
    error BadClientData();
    error ChallengeMismatch();
    error OriginNotAllowed();
    error HighS();
    error BadSignature();

    address internal constant P256VERIFY = address(0x100);
    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant HALF_N = N / 2;
    uint8 internal constant FLAG_UP = 0x01;
    uint8 internal constant FLAG_UV = 0x04;

    bytes internal constant PREFIX = '{"type":"webauthn.get","challenge":"'; // 36 bytes
    bytes internal constant ORIGIN_KEY = '","origin":"'; // 12 bytes
    uint256 internal constant CHALLENGE_LEN = 43; // base64url(32 bytes), no padding

    function verify(
        Assertion calldata a,
        bytes32 challenge,
        uint256 x,
        uint256 y,
        bytes32 rpIdHash,
        mapping(bytes32 => bool) storage allowedOrigins
    ) internal view {
        bytes calldata ad = a.authenticatorData;
        if (ad.length < 37) revert BadAuthData();
        if (bytes32(ad[0:32]) != rpIdHash) revert RpIdMismatch();
        uint8 flags = uint8(ad[32]);
        if (flags & FLAG_UP == 0) revert UserNotPresent();
        if (flags & FLAG_UV == 0) revert UserNotVerified();

        bytes calldata cd = bytes(a.clientDataJSON);
        _checkClientData(cd, challenge, allowedOrigins);

        if (a.s > HALF_N) revert HighS();
        _checkSignature(sha256(abi.encodePacked(ad, sha256(cd))), a.r, a.s, x, y);
    }

    function _checkClientData(bytes calldata cd, bytes32 challenge, mapping(bytes32 => bool) storage allowedOrigins)
        private
        view
    {
        uint256 pl = PREFIX.length;
        uint256 chEnd = pl + CHALLENGE_LEN;
        uint256 oStart = chEnd + ORIGIN_KEY.length;
        if (cd.length <= oStart) revert BadClientData();
        if (keccak256(cd[0:pl]) != keccak256(PREFIX)) revert BadClientData();
        if (keccak256(cd[chEnd:oStart]) != keccak256(ORIGIN_KEY)) revert BadClientData();
        if (keccak256(cd[pl:chEnd]) != keccak256(bytes(b64url(challenge)))) revert ChallengeMismatch();

        uint256 oEnd = oStart;
        while (oEnd < cd.length && cd[oEnd] != 0x22) oEnd++;
        if (oEnd == cd.length) revert BadClientData();
        if (!allowedOrigins[keccak256(cd[oStart:oEnd])]) revert OriginNotAllowed();
    }

    function _checkSignature(bytes32 digest, uint256 r, uint256 s, uint256 x, uint256 y) private view {
        if (r == 0 || r >= N || s == 0) revert BadSignature();
        (bool ok, bytes memory ret) = P256VERIFY.staticcall(abi.encode(digest, r, s, x, y));
        // A missing precompile returns ok with empty data, so the length check is load-bearing.
        if (!ok || ret.length != 32 || abi.decode(ret, (uint256)) != 1) revert BadSignature();
    }

    /// @dev base64url (RFC 4648 §5), no padding, of exactly 32 bytes -> 43 chars.
    function b64url(bytes32 v) internal pure returns (string memory) {
        bytes memory T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        bytes memory out = new bytes(CHALLENGE_LEN);
        uint256 o;
        for (uint256 i = 0; i < 30; i += 3) {
            uint256 n = (uint256(uint8(v[i])) << 16) | (uint256(uint8(v[i + 1])) << 8) | uint256(uint8(v[i + 2]));
            out[o++] = T[(n >> 18) & 63];
            out[o++] = T[(n >> 12) & 63];
            out[o++] = T[(n >> 6) & 63];
            out[o++] = T[n & 63];
        }
        uint256 t = (uint256(uint8(v[30])) << 8) | uint256(uint8(v[31]));
        out[o++] = T[(t >> 10) & 63];
        out[o++] = T[(t >> 4) & 63];
        out[o] = T[(t << 2) & 63];
        return string(out);
    }
}
