import "@stdlib/deploy";
import "@stdlib/ownable";

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

fun _verifySignature(userAddress: Address, signature: Slice, nonce: Int, operation: String, data: String, publicKey: Int) {
    let messageBuilder: Builder = beginCell()
        .storeAddress(userAddress)
        .storeUint(nonce, 64)
        .storeSlice(operation.asSlice())
        .storeSlice(data.asSlice());

    let messageSlice: Slice = messageBuilder.endCell().asSlice();

    require(signature.bits() >= 512, "Invalid signature length");

    let isValid: Bool = checkDataSignature(messageSlice, signature, publicKey);
    require(isValid, "Invalid signature");
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

    receive(msg: RegisterDID) {
        let userAddress: Address = sender();

        let usernameLength: Int = msg.username.asSlice().bits() / 8;

        require(usernameLength >= MIN_USERNAME_LENGTH, "Username too short");

        require(usernameLength <= MAX_USERNAME_LENGTH, "Username too long");

        require(msg.publicKey > 0, "Invalid public key");

        require(self.dids.get(userAddress) == null, "DID already exists");

        let currentNonce: Int = 0;

        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }

        require(msg.nonce == currentNonce + 1, "Invalid nonce");

        require(msg.nonce <= currentNonce + MAX_NONCE_GAP, "Nonce gap too large");

        let registerData: StringBuilder = beginString();

        registerData.append("register:");

        registerData.append(msg.username);

        if (msg.kycHash != null) {
            let kycHashLength: Int = msg.kycHash!!.asSlice().bits() / 8;

            require(kycHashLength <= MAX_KYC_HASH_LENGTH, "KYC hash too long");

            registerData.append(":");

            registerData.append(msg.kycHash!!);
        }

        registerData.append(":");

        registerData.append(msg.publicKey.toString());

        registerData.append(":");

        registerData.append(msg.nonce.toString());

        _verifySignature(userAddress, msg.signature, msg.nonce, "register", registerData.toString(), msg.publicKey);

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

        self.dids.set(userAddress, newDID);

        self.userNonces.set(userAddress, msg.nonce);

        self.totalDIDs += 1;

        self.reply("DID registered successfully".asComment());
    }

    receive(msg: UpdateDID) {
        let userAddress: Address = sender();

        let existingDID: DIDInfo? = self.dids.get(userAddress);

        require(existingDID != null, "DID does not exist");

        let did: DIDInfo = existingDID!!;

        require(did.isActive, "DID is revoked");

        let currentNonce: Int = 0;

        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }

        require(msg.nonce == currentNonce + 1, "Invalid nonce");

        let updateData: StringBuilder = beginString();

        updateData.append("update:");

        if (msg.newUsername != null) {
            let newUsernameLength: Int = msg.newUsername!!.asSlice().bits() / 8;

            require(newUsernameLength >= MIN_USERNAME_LENGTH, "Username too short");

            require(newUsernameLength <= MAX_USERNAME_LENGTH, "Username too long");

            updateData.append(":");

            updateData.append(msg.newUsername!!);
        }

        if (msg.newKycHash != null) {
            let newKycHashLength: Int = msg.newKycHash!!.asSlice().bits() / 8;

            require(newKycHashLength <= MAX_KYC_HASH_LENGTH, "KYC hash too long");

            updateData.append(":");

            updateData.append(msg.newKycHash!!);
        }

        require(did.publicKey != null, "Public key not found for user");

        updateData.append(":");

        updateData.append(msg.nonce.toString());

        _verifySignature(userAddress, msg.signature, msg.nonce, "update", updateData.toString(), did.publicKey!!);

        if (msg.newUsername != null) {
            did.username = msg.newUsername!!;
        }

        if (msg.newKycHash != null) {
            did.kycHash = msg.newKycHash;
        }

        did.updatedAt = now();

        did.nonce = msg.nonce;

        self.dids.set(userAddress, did);

        self.userNonces.set(userAddress, msg.nonce);

        self.reply("DID updated successfully".asComment());
    }

    receive(msg: RevokeDID) {
        let userAddress: Address = sender();

        let existingDID: DIDInfo? = self.dids.get(userAddress);

        require(existingDID != null, "DID does not exist");

        let did: DIDInfo = existingDID!!;

        require(did.isActive, "DID already revoked");

        let currentNonce: Int = 0;

        let storedNonce: Int? = self.userNonces.get(userAddress);

        if (storedNonce != null) {
            currentNonce = storedNonce!!;
        }

        require(msg.nonce == currentNonce + 1, "Invalid nonce");

        require(did.publicKey != null, "Public key not found for user");

        _verifySignature(userAddress, msg.signature, msg.nonce, "revoke", "", did.publicKey!!);

        did.isActive = false;

        did.updatedAt = now();

        did.nonce = msg.nonce;

        self.dids.set(userAddress, did);

        self.userNonces.set(userAddress, msg.nonce);

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
