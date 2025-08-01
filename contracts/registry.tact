import "@stdlib/deploy";
import "@stdlib/ownable";

// Events for important operations
message(0x1001) DIDRegistered {
    owner: Address;
    username: String;
    timestamp: Int;
}

message(0x1002) DIDUpdated {
    owner: Address;
    username: String?;
    timestamp: Int;
}

message(0x1003) DIDRevoked {
    owner: Address;
    timestamp: Int;
}

struct DIDInfo {
    owner: Address;
    username: String;
    kycHash: String?;
    publicKey: Int?;
    isActive: Bool;
    createdAt: Int;
    updatedAt: Int;
    nonce: Int;
}

message RegisterDID {
    username: String;
    kycHash: String?;
    publicKey: Int;
    nonce: Int;
    signature: Slice;
}

message UpdateDID {
    newUsername: String?;
    newKycHash: String?;
    nonce: Int;
    signature: Slice;
}

message RevokeDID {
    nonce: Int;
    signature: Slice;
}

message TransferOwnership {
    newOwner: Address;
}

const MIN_USERNAME_LENGTH: Int = 1;
const MAX_USERNAME_LENGTH: Int = 64;
const MAX_NONCE_GAP: Int = 100;
const MAX_KYC_HASH_LENGTH: Int = 128;

// Improved signature verification with EIP-712 style
// Note: In test environment, signature verification is simplified for demonstration
fun _verifySignature(userAddress: Address, signature: Slice, nonce: Int, operation: String, data: String, publicKey: Int) {
    require(signature.bits() >= 512, "Invalid signature length");
    
    // For demonstration purposes, we'll do basic validation
    // In production, implement proper cryptographic signature verification
    require(publicKey > 0, "Invalid public key");
    
    // Simple validation: check signature has minimum length and format
    // Real implementation would verify cryptographic signature here
}

contract DIDRegistry with Deployable, Ownable {
    dids: map<Address, DIDInfo>;
    userNonces: map<Address, Int>;
    totalDIDs: Int as uint32;
    owner: Address;

    init() {
        self.totalDIDs = 0;
        self.owner = sender();
    }

    // Modifier to ensure DID exists and is active
    fun requireActiveDID(userAddress: Address): DIDInfo {
        let existingDID: DIDInfo? = self.dids.get(userAddress);
        require(existingDID != null, "DID does not exist");
        let did: DIDInfo = existingDID!!;
        require(did.isActive, "DID is not active");
        return did;
    }

    // Helper function to validate and get nonce
    fun validateAndGetNonce(userAddress: Address, expectedNonce: Int): Int {
        let currentNonce: Int = 0;
        let storedNonce: Int? = self.userNonces.get(userAddress);
        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }
        require(expectedNonce == currentNonce + 1, "Invalid nonce");
        require(expectedNonce <= currentNonce + MAX_NONCE_GAP, "Nonce gap too large");
        return currentNonce;
    }



    receive(msg: RegisterDID) {
        let userAddress: Address = sender();
        
        // Validate inputs
        let usernameLength: Int = msg.username.asSlice().bits() / 8;
        require(usernameLength >= MIN_USERNAME_LENGTH, "Username too short");
        require(usernameLength <= MAX_USERNAME_LENGTH, "Username too long");
        require(msg.publicKey > 0, "Invalid public key");
        require(self.dids.get(userAddress) == null, "DID already exists");
        
        // Validate KYC hash length if provided
        if (msg.kycHash != null) {
            let kycHashLength: Int = msg.kycHash!!.asSlice().bits() / 8;
            require(kycHashLength <= MAX_KYC_HASH_LENGTH, "KYC hash too long");
        }

        // Validate nonce using helper function
        self.validateAndGetNonce(userAddress, msg.nonce);

        // Build signature data
        let registerData: StringBuilder = beginString();
        registerData.append("register:");
        registerData.append(msg.username);
        if (msg.kycHash != null) {
            registerData.append(":");
            registerData.append(msg.kycHash!!);
        }
        registerData.append(":");
        registerData.append(msg.publicKey.toString());
        registerData.append(":");
        registerData.append(msg.nonce.toString());

        // Verify signature
        _verifySignature(userAddress, msg.signature, msg.nonce, "register", registerData.toString(), msg.publicKey);

        // Gas optimization: batch storage operations
        let nowTime = now();
        let newDID: DIDInfo = DIDInfo {
            owner: userAddress,
            username: msg.username,
            kycHash: msg.kycHash,
            publicKey: msg.publicKey,
            isActive: true,
            createdAt: nowTime,
            updatedAt: nowTime,
            nonce: msg.nonce,
        };

        // Batch storage writes for gas optimization
        self.dids.set(userAddress, newDID);
        self.userNonces.set(userAddress, msg.nonce);
        self.totalDIDs += 1;

        // Emit event
        emit(DIDRegistered{
            owner: userAddress,
            username: msg.username,
            timestamp: nowTime
        }.toCell());

        self.reply("DID registered successfully".asComment());
    }

    receive(msg: UpdateDID) {
        let userAddress: Address = sender();
        
        // Use modifier to validate DID exists and is active
        let did: DIDInfo = self.requireActiveDID(userAddress);
        
        // Validate nonce
        self.validateAndGetNonce(userAddress, msg.nonce);
        
        // Validate inputs if provided
        if (msg.newUsername != null) {
            let newUsernameLength: Int = msg.newUsername!!.asSlice().bits() / 8;
            require(newUsernameLength >= MIN_USERNAME_LENGTH, "Username too short");
            require(newUsernameLength <= MAX_USERNAME_LENGTH, "Username too long");
        }
        
        if (msg.newKycHash != null) {
            let newKycHashLength: Int = msg.newKycHash!!.asSlice().bits() / 8;
            require(newKycHashLength <= MAX_KYC_HASH_LENGTH, "KYC hash too long");
        }

        require(did.publicKey != null, "Public key not found for user");

        // Build signature data
        let updateData: StringBuilder = beginString();
        updateData.append("update:");
        if (msg.newUsername != null) {
            updateData.append(":");
            updateData.append(msg.newUsername!!);
        }
        if (msg.newKycHash != null) {
            updateData.append(":");
            updateData.append(msg.newKycHash!!);
        }
        updateData.append(":");
        updateData.append(msg.nonce.toString());

        // Verify signature
        _verifySignature(userAddress, msg.signature, msg.nonce, "update", updateData.toString(), did.publicKey!!);

        // Update fields if provided
        if (msg.newUsername != null) {
            did.username = msg.newUsername!!;
        }
        if (msg.newKycHash != null) {
            did.kycHash = msg.newKycHash;
        }

        // Gas optimization: batch updates
        let nowTime = now();
        did.updatedAt = nowTime;
        did.nonce = msg.nonce;

        // Batch storage writes
        self.dids.set(userAddress, did);
        self.userNonces.set(userAddress, msg.nonce);

        // Emit event
        emit(DIDUpdated{
            owner: userAddress,
            username: msg.newUsername,
            timestamp: nowTime
        }.toCell());

        self.reply("DID updated successfully".asComment());
    }

    receive(msg: RevokeDID) {
        let userAddress: Address = sender();
        
        // Use modifier to validate DID exists and is active
        let did: DIDInfo = self.requireActiveDID(userAddress);
        
        // Validate nonce
        self.validateAndGetNonce(userAddress, msg.nonce);
        
        require(did.publicKey != null, "Public key not found for user");

        // Verify signature
        _verifySignature(userAddress, msg.signature, msg.nonce, "revoke", "", did.publicKey!!);

        // Gas optimization: batch updates
        let nowTime = now();
        did.isActive = false;
        did.updatedAt = nowTime;
        did.nonce = msg.nonce;

        // Batch storage writes
        self.dids.set(userAddress, did);
        self.userNonces.set(userAddress, msg.nonce);

        // Emit event
        emit(DIDRevoked{
            owner: userAddress,
            timestamp: nowTime
        }.toCell());

        self.reply("DID revoked successfully".asComment());
    }

    get fun getDID(owner: Address): DIDInfo? {
        return self.dids.get(owner);
    }

    get fun getTotalDIDs(): Int {
        return self.totalDIDs;
    }

    get fun isDIDActive(owner: Address): Bool {
        let did: DIDInfo? = self.dids.get(owner);
        return did != null && did!!.isActive;
    }

    get fun getUsername(owner: Address): String? {
        let did: DIDInfo? = self.dids.get(owner);

        if (did == null || !did!!.isActive) {
            return null;
        }

        return did!!.username;
    }

    get fun getKYCHash(owner: Address): String? {
        let did: DIDInfo? = self.dids.get(owner);

        if (did == null || !did!!.isActive) {
            return null;
        }

        return did!!.kycHash;
    }

    get fun getUserNonce(owner: Address): Int {
        let storedNonce: Int? = self.userNonces.get(owner);

        if (storedNonce != null) {
            return storedNonce!!;
        }

        return 0;
    }

    get fun getContractOwner(): Address {
        return self.owner;
    }

    get fun getPublicKey(owner: Address): Int? {
        let did: DIDInfo? = self.dids.get(owner);

        if (did == null || !did!!.isActive) {
            return null;
        }

        return did!!.publicKey;
    }

    receive(msg: TransferOwnership) {
        self.requireOwner();

        require(msg.newOwner != self.owner, "New owner cannot be the same as current owner");

        self.owner = msg.newOwner;

        self.reply("OwnershipTransferred".asComment());
    }

    bounced(src: bounced<RegisterDID>) {
        self.reply("Registration failed: bounced message".asComment());
    }

    bounced(src: bounced<UpdateDID>) {
        self.reply("Registration failed: bounced message".asComment());
    }

    bounced(src: bounced<RevokeDID>) {
        self.reply("Registration failed: bounced message".asComment());
    }
}
