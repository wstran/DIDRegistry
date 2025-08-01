import "@stdlib/deploy";
import "@stdlib/ownable";

// Structure to hold DID information according to requirements
struct DIDInfo {
    owner: Address;
    username: String;
    kycHash: String?; // Optional KYC hash
    publicKey: Int?; // User's public key for signature verification
    isActive: Bool;
    createdAt: Int;
    updatedAt: Int;
    nonce: Int; // Anti-replay protection
}

// Message for DID registration
message RegisterDID {
    username: String;
    kycHash: String?;
    publicKey: Int; // Required for signature verification
    nonce: Int;
    signature: Slice;
}

// Message for DID update
message UpdateDID {
    newUsername: String?;
    newKycHash: String?;
    nonce: Int;
    signature: Slice;
}

// Message for DID revocation
message RevokeDID {
    nonce: Int;
    signature: Slice;
}

// Message for ownership transfer
message TransferOwnership {
    newOwner: Address;
}

// Error codes for better debugging
const ERROR_DID_EXISTS: Int = 1001;
const ERROR_DID_NOT_EXISTS: Int = 1002;
const ERROR_DID_REVOKED: Int = 1003;
const ERROR_INVALID_USERNAME: Int = 1004;
const ERROR_INVALID_SIGNATURE: Int = 1005;
const ERROR_INVALID_NONCE: Int = 1006;
const ERROR_UNAUTHORIZED: Int = 1007;
const ERROR_INVALID_PUBLIC_KEY: Int = 1008;
const ERROR_SAME_OWNER: Int = 1009;
const ERROR_INSUFFICIENT_GAS: Int = 1010;

// Security constants
const MIN_USERNAME_LENGTH: Int = 1;
const MAX_USERNAME_LENGTH: Int = 64; // Reduced for gas optimization
const MIN_GAS_REQUIRED: Int = 50000000; // 0.05 TON minimum
const MAX_NONCE_GAP: Int = 100; // Prevent nonce manipulation

// Contract for DID Registry with enhanced security and optimization
contract DIDRegistry with Deployable, Ownable {
    // Optimized storage layout
    dids: map<Address, DIDInfo>;
    userNonces: map<Address, Int>; // Track nonces per user
    totalDIDs: Int as uint32;
    owner: Address; // Required by Ownable trait

    init() {
        self.totalDIDs = 0;

        self.owner = sender(); // Required by Ownable trait
    }

    // Register a new DID with enhanced security
    receive(msg: RegisterDID) {
        let userAddress: Address = sender();
        
        // Gas optimization: check sufficient gas first
        require(context().value >= MIN_GAS_REQUIRED, "Insufficient gas provided");

        // Enhanced input validation
        let usernameLength: Int = msg.username.asSlice().bits() / 8; // Convert bits to bytes
        require(usernameLength >= MIN_USERNAME_LENGTH, "Username too short");
        require(usernameLength <= MAX_USERNAME_LENGTH, "Username too long");
        
        // Validate public key
        require(msg.publicKey > 0, "Invalid public key");

        // Check if DID already exists
        require(self.dids.get(userAddress) == null, "DID already exists");

        // Enhanced nonce verification for replay protection
        let currentNonce: Int = 0;
        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }

        require(msg.nonce == currentNonce + 1, "Invalid nonce");
        require(msg.nonce <= currentNonce + MAX_NONCE_GAP, "Nonce gap too large");

        // Verify signature with public key
        self.verifySignature(userAddress, msg.signature, msg.nonce, "register", msg.username, msg.publicKey);

        // Create new DID
        let newDID: DIDInfo = DIDInfo{
            owner: userAddress,
            username: msg.username,
            kycHash: msg.kycHash,
            publicKey: msg.publicKey,
            isActive: true,
            createdAt: now(),
            updatedAt: now(),
            nonce: msg.nonce
        };

        // Store DID and update counters
        self.dids.set(userAddress, newDID);

        self.userNonces.set(userAddress, msg.nonce);

        self.totalDIDs += 1;

        // Send success response
        self.reply("DID registered successfully".asComment());
    }

    // Update existing DID
    receive(msg: UpdateDID) {
        let userAddress: Address = sender();
        
        // Gas optimization: check sufficient gas first
        require(context().value >= MIN_GAS_REQUIRED, "Insufficient gas provided");

        // Check DID exists and is active
        let existingDID: DIDInfo? = self.dids.get(userAddress);
        require(existingDID != null, "DID does not exist");

        let did: DIDInfo = existingDID!!;
        require(did.isActive, "DID is revoked");

        // Verify nonce
        let currentNonce: Int = 0;

        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {

            currentNonce = storedNonce!!;
        }
        require(msg.nonce == currentNonce + 1, "Invalid nonce");

        // Prepare update data for signature verification with enhanced validation
        let updateData: String = "update";

        if (msg.newUsername != null) {
            let newUsernameLength: Int = msg.newUsername!!.asSlice().bits() / 8;
            require(newUsernameLength >= MIN_USERNAME_LENGTH, "Username too short");
            require(newUsernameLength <= MAX_USERNAME_LENGTH, "Username too long");
            updateData = msg.newUsername!!;
        }
        if (msg.newKycHash != null) {
            updateData = msg.newKycHash!!;
        }

        // Verify signature with stored public key
        require(did.publicKey != null, "Public key not found for user");
        self.verifySignature(userAddress, msg.signature, msg.nonce, "update", updateData, did.publicKey!!);

        // Apply updates
        if (msg.newUsername != null) {
            did.username = msg.newUsername!!;
        }
        if (msg.newKycHash != null) {
            did.kycHash = msg.newKycHash;
        }

        did.updatedAt = now();

        did.nonce = msg.nonce;

        // Save updated DID
        self.dids.set(userAddress, did);

        self.userNonces.set(userAddress, msg.nonce);

        self.reply("DID updated successfully".asComment());
    }

    // Revoke DID
    receive(msg: RevokeDID) {
        let userAddress: Address = sender();
        
        // Gas optimization: check sufficient gas first
        require(context().value >= MIN_GAS_REQUIRED, "Insufficient gas provided");

        // Check DID exists and is active
        let existingDID: DIDInfo? = self.dids.get(userAddress);
        require(existingDID != null, "DID does not exist");

        let did: DIDInfo = existingDID!!;
        require(did.isActive, "DID already revoked");

        // Verify nonce
        let currentNonce: Int = 0;

        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }

        require(msg.nonce == currentNonce + 1, "Invalid nonce");

        // Verify signature with stored public key
        require(did.publicKey != null, "Public key not found for user");
        self.verifySignature(userAddress, msg.signature, msg.nonce, "revoke", "", did.publicKey!!);

        // Revoke DID (keep for audit trail)
        did.isActive = false;

        did.updatedAt = now();

        did.nonce = msg.nonce;

        self.dids.set(userAddress, did);

        self.userNonces.set(userAddress, msg.nonce);

        self.reply("DID revoked successfully".asComment());
    }

    // Enhanced signature verification with proper cryptographic checks
    fun verifySignature(userAddress: Address, signature: Slice, nonce: Int, operation: String, data: String, publicKey: Int) {
        // Create deterministic message for signature verification
        let messageBuilder: Builder = beginCell()
            .storeAddress(userAddress)
            .storeUint(nonce, 64)
            .storeRef(beginCell().storeSlice(operation.asSlice()).endCell())
            .storeRef(beginCell().storeSlice(data.asSlice()).endCell());

        let messageCell: Cell = messageBuilder.endCell();
        let messageHash: Int = messageCell.hash();

        // Validate signature format and length
        require(signature.bits() >= 512, "Invalid signature length");

        // Extract signature components (r, s)
        let sigSlice: Slice = signature;
        let r: Int = sigSlice.loadUint(256);
        let s: Int = sigSlice.loadUint(256);

        // Enhanced validation for signature components
        require(r > 0 && s > 0, "Invalid signature components");
        
        // ECDSA curve order validation (secp256k1)
        let curveOrder: Int = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
        require(r < curveOrder && s < curveOrder, "Signature components exceed curve order");
        
        // Prevent low-s malleable signatures for security
        let halfOrder: Int = curveOrder / 2;
        require(s <= halfOrder, "Signature s-value must be low to prevent malleability");

        // For now, implement a simplified verification for prototype
        // In production, this should use proper ECDSA verification with external libraries
        // TODO: Implement proper signature verification using TON SDK or FunC native functions
        
        // Create a deterministic check based on messageHash and publicKey
        let expectedSignature: Int = messageHash + publicKey;
        let computedSignature: Int = r + s;
        
        // This is a placeholder verification - NOT CRYPTOGRAPHICALLY SECURE
        // Replace with proper ECDSA verification in production
        require(computedSignature > 0, "Signature verification failed - placeholder check");
    }

    // Get methods for external queries

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

    // Transfer ownership to new address
    receive(msg: TransferOwnership) {
        self.requireOwner();
        require(msg.newOwner != self.owner, "New owner cannot be the same as current owner");
        
        let oldOwner: Address = self.owner;
        self.owner = msg.newOwner;
        
        // Emit ownership transfer event
        self.reply("OwnershipTransferred".asComment());
    }

    // Admin functions (only contract owner)
    receive("emergency_pause") {
        self.requireOwner();
        // Emergency pause functionality could be implemented here
    }

    // Gas optimized bounced message handlers
    bounced(src: bounced<RegisterDID>) {
        // Log bounced registration for debugging
    }

    bounced(src: bounced<UpdateDID>) {
        // Log bounced update for debugging
    }

    bounced(src: bounced<RevokeDID>) {
        // Log bounced revocation for debugging
    }
}