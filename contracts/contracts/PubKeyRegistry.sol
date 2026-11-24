// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title PubKeyRegistry
/// @notice Stores X25519 encryption public keys per wallet. Senders look up
///         a recipient's pubkey to encrypt messages client-side.
contract PubKeyRegistry {
    /// @notice Public key bytes (X25519 = 32 bytes; cap at 64 for safety)
    mapping(address => bytes) public pubKeys;

    event PubKeyRegistered(address indexed wallet);
    event PubKeyUpdated(address indexed wallet);

    /// @notice Register or update your encryption public key
    /// @param _pubKey X25519 public key bytes (32 B expected, ≤64 B enforced)
    function registerPubKey(bytes calldata _pubKey) external {
        require(_pubKey.length > 0, "Empty public key");
        require(_pubKey.length <= 64, "PubKey too large");
        bool isNew = pubKeys[msg.sender].length == 0;
        pubKeys[msg.sender] = _pubKey;
        if (isNew) {
            emit PubKeyRegistered(msg.sender);
        } else {
            emit PubKeyUpdated(msg.sender);
        }
    }

    /// @notice Fetch a recipient's public key for encryption
    /// @dev Reverts if no key registered — caller should check hasPubKey first
    function fetchPubKey(address _receiver) external view returns (bytes memory) {
        bytes memory key = pubKeys[_receiver];
        require(key.length > 0, "No public key registered");
        return key;
    }

    /// @notice Check if a wallet has a registered public key
    function hasPubKey(address _wallet) external view returns (bool) {
        return pubKeys[_wallet].length > 0;
    }
}
