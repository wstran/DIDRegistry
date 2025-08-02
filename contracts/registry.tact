import "@stdlib/deploy";

// Events for important operations
message(0x1001) DIDRegistered {
    publicKey: Int;
    username: String;
    kycHash: String?;
    timestamp: Int;
}

message(0x1002) DIDUpdated {
    publicKey: Int;
    username: String;
    kycHash: String?;
    timestamp: Int;
}

message(0x1003) DIDRevoked {
    publicKey: Int;
    username: String;
    kycHash: String?;
    timestamp: Int;
}

struct DIDInfo {
    publicKey: Int;
    username: String;
    kycHash: String?;
    isActive: Bool;
    createdAt: Int;
    updatedAt: Int;
    nonce: Int;
}

message RegisterDID {
    publicKey: Int;
    username: String;
    kycHash: String?;
    nonce: Int;
    signature: Slice;
}

message UpdateDID {
    publicKey: Int;
    newUsername: String?;
    newKycHash: String?;
    nonce: Int;
    signature: Slice;
}

message RevokeDID {
    publicKey: Int;
    nonce: Int;
    signature: Slice;
}

const MAX_NONCE_GAP: Int = 100;

contract DIDRegistry with Deployable {
    dids: map<Int, DIDInfo>;
    userNonces: map<Int, Int>;
    totalDIDs: Int as uint32;

    init() {
        self.totalDIDs = 0;
    }

    fun requireActiveDID(publicKey: Int): DIDInfo {
        let did: DIDInfo? = self.dids.get(publicKey);

        require(did != null, "DID does not exist");

        require(did!!.isActive, "DID is not active");

        return did!!;
    }

    fun validateAndGetNonce(publicKey: Int, expectedNonce: Int): Int {
        let currentNonce: Int = self.userNonces.get(publicKey) ?: 0;

        require(expectedNonce == currentNonce + 1, "Invalid nonce");

        require(expectedNonce <= currentNonce + MAX_NONCE_GAP, "Nonce gap too large");

        return currentNonce + 1;
    }

    receive(msg: RegisterDID) {
        require(msg.publicKey > 0, "Invalid public key");

        require(self.dids.get(msg.publicKey) == null, "DID already exists");

        let nonce = self.validateAndGetNonce(msg.publicKey, msg.nonce);

        let registerData: StringBuilder = beginString();

        registerData.append("register::");

        registerData.append("publicKey:");

        registerData.append(msg.publicKey.toString());

        registerData.append("username:");

        registerData.append(msg.username);

        if (msg.kycHash != null) {
            registerData.append("kycHash:");

            registerData.append(msg.kycHash!!);
        }

        registerData.append("nonce:");

        registerData.append(nonce.toString());

        let isValid: Bool = checkSignature(sha256(registerData.toSlice()), msg.signature, msg.publicKey);

        require(isValid, "Invalid signature");

        let nowTime = now();

        let newDID: DIDInfo = DIDInfo {
            publicKey: msg.publicKey,
            username: msg.username,
            kycHash: msg.kycHash,
            isActive: true,
            createdAt: nowTime,
            updatedAt: nowTime,
            nonce,
        };

        self.dids.set(msg.publicKey, newDID);

        self.userNonces.set(msg.publicKey, msg.nonce);

        self.totalDIDs += 1;

        emit(DIDRegistered {
            publicKey: msg.publicKey,
            username: msg.username,
            kycHash: msg.kycHash,
            timestamp: nowTime,
        }.toCell());

        self.reply("DID registered successfully".asComment());
    }

    receive(msg: UpdateDID) {
        let did: DIDInfo = self.requireActiveDID(msg.publicKey);

        let nonce = self.validateAndGetNonce(did.publicKey, msg.nonce);

        let updateData: StringBuilder = beginString();

        updateData.append("update::");

        if (msg.newUsername != null) {
            updateData.append("newUsername:");

            updateData.append(msg.newUsername!!);
        }

        if (msg.newKycHash != null) {
            updateData.append("newKycHash:");

            updateData.append(msg.newKycHash!!);
        }

        updateData.append("nonce:");

        updateData.append(nonce.toString());

        let isValid: Bool = checkSignature(sha256(updateData.toSlice()), msg.signature, did.publicKey);

        require(isValid, "Invalid signature");

        if (msg.newUsername != null) {
            did.username = msg.newUsername!!;
        }

        if (msg.newKycHash != null) {
            did.kycHash = msg.newKycHash;
        }

        let nowTime = now();

        did.updatedAt = nowTime;

        did.nonce = nonce;

        self.dids.set(did.publicKey, did);

        self.userNonces.set(did.publicKey, nonce);

        emit(DIDUpdated {
            publicKey: did.publicKey,
            username: did.username,
            kycHash: did.kycHash,
            timestamp: nowTime,
        }.toCell());

        self.reply("DID updated successfully".asComment());
    }

    receive(msg: RevokeDID) {
        let did: DIDInfo = self.requireActiveDID(msg.publicKey);

        let nonce = self.validateAndGetNonce(did.publicKey, msg.nonce);

        let revokeData: StringBuilder = beginString();

        revokeData.append("revoke::");

        revokeData.append("nonce:");

        revokeData.append(nonce.toString());

        let isValid: Bool = checkSignature(sha256(revokeData.toSlice()), msg.signature, did.publicKey);

        require(isValid, "Invalid signature");

        let nowTime = now();

        did.isActive = false;

        did.updatedAt = nowTime;

        did.nonce = nonce;

        self.dids.set(did.publicKey, did);

        self.userNonces.set(did.publicKey, msg.nonce);

        emit(DIDRevoked {
            publicKey: did.publicKey,
            username: did.username,
            kycHash: did.kycHash,
            timestamp: nowTime,
        }.toCell());

        self.reply("DID revoked successfully".asComment());
    }

    get fun getTotalDids(): Int {
        return self.totalDIDs;
    }

    get fun isDidActive(publicKey: Int): Bool {
        let did: DIDInfo? = self.dids.get(publicKey);

        return did != null && did!!.isActive;
    }

    get fun getDid(publicKey: Int): DIDInfo? {
        return self.dids.get(publicKey);
    }

    get fun getDidUsername(publicKey: Int): String? {
        let did: DIDInfo? = self.dids.get(publicKey);

        if (did != null) {
            return did!!.username;
        } else {
            return null;
        }
    }

    get fun getDidKycHash(publicKey: Int): String? {
        let did: DIDInfo? = self.dids.get(publicKey);

        if (did != null) {
            return did!!.kycHash;
        } else {
            return null;
        }
    }

    get fun getDidCreatedAt(publicKey: Int): Int? {
        let did: DIDInfo? = self.dids.get(publicKey);

        if (did != null) {
            return did!!.createdAt;
        } else {
            return null;
        }
    }

    get fun getUserNonce(publicKey: Int): Int {
        let storedNonce: Int? = self.userNonces.get(publicKey);

        if (storedNonce != null) {
            return storedNonce!!;
        }

        return 0;
    }

    bounced(src: bounced<RegisterDID>) {
        self.reply("Registration failed: bounced message".asComment());
    }

    bounced(src: bounced<UpdateDID>) {
        self.reply("Update failed: bounced message".asComment());
    }

    bounced(src: bounced<RevokeDID>) {
        self.reply("Revocation failed: bounced message".asComment());
    }
}