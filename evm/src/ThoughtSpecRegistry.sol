// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ContractCodeStorage} from "./ContractCodeStorage.sol";

contract ThoughtSpecRegistry {
    error EmptyThoughtSpec();
    error InvalidThoughtSpecName(string specName);
    error InvalidThoughtSpecPair(bytes32 specId, bytes32 specHash);
    error NotOwner();
    error ThoughtSpecAlreadyRegistered(bytes32 specId);
    error ThoughtSpecHashMismatch(bytes32 specId, bytes32 expected, bytes32 actual);
    error ThoughtSpecNotFound(bytes32 specId);
    error ThoughtSpecPointerInvalid(bytes32 specId);
    error ThoughtSpecTooLarge(uint256 length, uint256 maxLength);

    event ThoughtSpecRegistered(
        bytes32 indexed specId,
        bytes32 indexed specHash,
        string specName,
        string ref,
        address pointer,
        uint32 byteLength
    );

    struct ThoughtSpecRecord {
        bool exists;
        string specName;
        bytes32 specId;
        bytes32 specHash;
        string ref;
        address pointer;
        uint32 byteLength;
        uint64 registeredAt;
    }

    uint256 public constant MAX_THOUGHT_SPEC_BYTES = 20_000;

    address public immutable owner;

    mapping(bytes32 specId => ThoughtSpecRecord spec) private _specs;
    bytes32[] private _specIds;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    function registerThoughtSpec(string calldata specName, string calldata ref, bytes calldata specData)
        external
        onlyOwner
        returns (bytes32 specId, bytes32 specHash, address pointer)
    {
        if (!isValidThoughtSpecName(specName)) {
            revert InvalidThoughtSpecName(specName);
        }
        if (specData.length == 0) {
            revert EmptyThoughtSpec();
        }
        if (specData.length > MAX_THOUGHT_SPEC_BYTES) {
            revert ThoughtSpecTooLarge(specData.length, MAX_THOUGHT_SPEC_BYTES);
        }

        specId = keccak256(bytes(specName));
        if (_specs[specId].exists) {
            revert ThoughtSpecAlreadyRegistered(specId);
        }

        specHash = keccak256(specData);
        pointer = ContractCodeStorage.write(specData);

        bytes memory storedData = ContractCodeStorage.read(pointer);
        bytes32 storedHash = keccak256(storedData);
        if (storedHash != specHash) {
            revert ThoughtSpecHashMismatch(specId, specHash, storedHash);
        }

        uint32 byteLength = uint32(specData.length);
        _specs[specId] = ThoughtSpecRecord({
            exists: true,
            specName: specName,
            specId: specId,
            specHash: specHash,
            ref: ref,
            pointer: pointer,
            byteLength: byteLength,
            registeredAt: uint64(block.timestamp)
        });
        _specIds.push(specId);

        emit ThoughtSpecRegistered(specId, specHash, specName, ref, pointer, byteLength);
    }

    function thoughtSpecIdOfName(string calldata specName) external pure returns (bytes32) {
        if (!isValidThoughtSpecName(specName)) {
            revert InvalidThoughtSpecName(specName);
        }
        return keccak256(bytes(specName));
    }

    function isValidThoughtSpecName(string memory specName) public pure returns (bool) {
        bytes memory value = bytes(specName);
        bytes memory prefix = bytes("THOUGHT.v");
        bytes memory suffix = bytes(".md");

        if (value.length <= prefix.length + suffix.length) {
            return false;
        }

        for (uint256 i = 0; i < prefix.length; i++) {
            if (value[i] != prefix[i]) {
                return false;
            }
        }

        uint256 suffixStart = value.length - suffix.length;
        for (uint256 i = 0; i < suffix.length; i++) {
            if (value[suffixStart + i] != suffix[i]) {
                return false;
            }
        }

        uint256 versionStart = prefix.length;
        if (versionStart >= suffixStart) {
            return false;
        }
        if (value[versionStart] == bytes1("0")) {
            return false;
        }

        for (uint256 i = versionStart; i < suffixStart; i++) {
            if (value[i] < bytes1("0") || value[i] > bytes1("9")) {
                return false;
            }
        }

        return true;
    }

    function thoughtSpecExists(bytes32 specId) external view returns (bool) {
        return _specs[specId].exists;
    }

    function isRegisteredThoughtSpec(bytes32 specId, bytes32 specHash) external view returns (bool) {
        ThoughtSpecRecord storage spec = _specs[specId];
        return spec.exists && specHash != bytes32(0) && spec.specHash == specHash;
    }

    function validateThoughtSpec(bytes32 specId, bytes32 specHash) external view returns (bool) {
        ThoughtSpecRecord storage spec = _specs[specId];
        if (!spec.exists || specHash == bytes32(0) || spec.specHash != specHash || spec.pointer == address(0)) {
            return false;
        }
        if (spec.pointer.code.length <= 1) {
            return false;
        }

        bytes memory data = ContractCodeStorage.read(spec.pointer);
        return data.length == spec.byteLength && keccak256(data) == specHash;
    }

    function thoughtSpecMeta(bytes32 specId)
        public
        view
        returns (
            bool exists,
            string memory specName,
            bytes32 specHash,
            string memory ref,
            address pointer,
            uint32 byteLength,
            uint64 registeredAt
        )
    {
        ThoughtSpecRecord storage spec = _specs[specId];
        return (
            spec.exists,
            spec.specName,
            spec.specHash,
            spec.ref,
            spec.pointer,
            spec.byteLength,
            spec.registeredAt
        );
    }

    function thoughtSpecBytes(bytes32 specId) public view returns (bytes memory) {
        ThoughtSpecRecord storage spec = _requireSpec(specId);
        bytes memory data = ContractCodeStorage.read(spec.pointer);
        bytes32 actualHash = keccak256(data);
        if (actualHash != spec.specHash) {
            revert ThoughtSpecHashMismatch(specId, spec.specHash, actualHash);
        }
        if (data.length != spec.byteLength) {
            revert ThoughtSpecPointerInvalid(specId);
        }
        return data;
    }

    function thoughtSpecText(bytes32 specId) external view returns (string memory) {
        return string(thoughtSpecBytes(specId));
    }

    function thoughtSpecCount() external view returns (uint256) {
        return _specIds.length;
    }

    function thoughtSpecIdAt(uint256 index) external view returns (bytes32) {
        return _specIds[index];
    }

    function latestThoughtSpecId() external view returns (bytes32) {
        if (_specIds.length == 0) {
            return bytes32(0);
        }
        return _specIds[_specIds.length - 1];
    }

    // Backward-compatible read wrappers. They expose archive data only; there is no active spec.
    function specMeta(bytes32 specId)
        external
        view
        returns (
            bytes32 specHash,
            string memory ref,
            address pointer,
            uint32 byteLength,
            uint64 registeredAt,
            bool exists
        )
    {
        ThoughtSpecRecord storage spec = _specs[specId];
        return (spec.specHash, spec.ref, spec.pointer, spec.byteLength, spec.registeredAt, spec.exists);
    }

    function specBytes(bytes32 specId) external view returns (bytes memory) {
        return thoughtSpecBytes(specId);
    }

    function specText(bytes32 specId) external view returns (string memory) {
        return string(thoughtSpecBytes(specId));
    }

    function validateSpec(bytes32 specId) external view returns (bool) {
        ThoughtSpecRecord storage spec = _specs[specId];
        if (!spec.exists) {
            return false;
        }
        return this.validateThoughtSpec(specId, spec.specHash);
    }

    function _requireSpec(bytes32 specId) private view returns (ThoughtSpecRecord storage spec) {
        spec = _specs[specId];
        if (!spec.exists) {
            revert ThoughtSpecNotFound(specId);
        }
        if (spec.pointer == address(0) || spec.pointer.code.length <= 1) {
            revert ThoughtSpecPointerInvalid(specId);
        }
    }
}
