import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import '@ton/test-utils';
import { mnemonicToPrivateKey, sha256, sign } from '@ton/crypto';

// Test mnemonics for different users
const TEST_MNEMONICS = {
    user1: [
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
    ],
    user2: [
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
        'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'ability'
    ]
};

/**
 * Generate test keypair from mnemonic
 */
async function getTestKeyPair(userKey: keyof typeof TEST_MNEMONICS) {
    const keyPair = await mnemonicToPrivateKey(TEST_MNEMONICS[userKey]);
    const publicKeyBigInt = BigInt('0x' + keyPair.publicKey.toString('hex'));
    
    return {
        secretKey: keyPair.secretKey,
        publicKey: keyPair.publicKey,
        publicKeyBigInt
    };
}

/**
 * Create signature matching the contract's expected format
 */
async function createSignature(
    action: 'register' | 'update' | 'revoke',
    params: {
        publicKey?: bigint;
        username?: string;
        kycHash?: string | null;
        newUsername?: string | null;
        newKycHash?: string | null;
        nonce: number;
    },
    secretKey: Buffer
): Promise<Buffer> {
    let messageBuilder = `${action}::`;
    
    switch (action) {
        case 'register':
            messageBuilder += `publicKey:${params.publicKey!.toString()}`;
            messageBuilder += `username:${params.username!}`;
            if (params.kycHash !== null && params.kycHash !== undefined) {
                messageBuilder += `kycHash:${params.kycHash}`;
            }
            break;
            
        case 'update':
            if (params.newUsername !== null && params.newUsername !== undefined) {
                messageBuilder += `newUsername:${params.newUsername}`;
            }
            if (params.newKycHash !== null && params.newKycHash !== undefined) {
                messageBuilder += `newKycHash:${params.newKycHash}`;
            }
            break;
            
        case 'revoke':
            // No additional params for revoke
            break;
    }
    
    messageBuilder += `nonce:${params.nonce}`;
    
    // Hash the message
    const messageBuffer = Buffer.from(messageBuilder, 'utf8');
    const messageHash = await sha256(messageBuffer);
    
    // Sign the hash
    const signature = sign(messageHash, secretKey);
    
    return signature;
}

/**
 * Convert Buffer signature to Cell for contract
 */
function signatureToCell(signature: Buffer): any {
    return beginCell().storeBuffer(signature).endCell().beginParse();
}

describe('DIDRegistry', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let didRegistry: SandboxContract<DIDRegistry>;
    let user1KeyPair: any;
    let user2KeyPair: any;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        // Create test keypairs
        user1KeyPair = await getTestKeyPair('user1');
        user2KeyPair = await getTestKeyPair('user2');

        // Deploy contract
        didRegistry = blockchain.openContract(await DIDRegistry.fromInit());

        const deployResult = await didRegistry.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: didRegistry.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy with correct initial state', async () => {
            const totalDids = await didRegistry.getGetTotalDids();
            expect(totalDids).toBe(0n);
        });

        it('should return correct getter values for non-existent DID', async () => {
            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo).toBeNull();

            const isActive = await didRegistry.getIsDidActive(user1KeyPair.publicKeyBigInt);
            expect(isActive).toBe(false);

            const username = await didRegistry.getGetDidUsername(user1KeyPair.publicKeyBigInt);
            expect(username).toBeNull();

            const kycHash = await didRegistry.getGetDidKycHash(user1KeyPair.publicKeyBigInt);
            expect(kycHash).toBeNull();

            const createdAt = await didRegistry.getGetDidCreatedAt(user1KeyPair.publicKeyBigInt);
            expect(createdAt).toBeNull();

            const userNonce = await didRegistry.getGetUserNonce(user1KeyPair.publicKeyBigInt);
            expect(userNonce).toBe(0n);
        });
    });

    describe('DID Registration', () => {
        it('should register DID successfully with valid signature', async () => {
            const username = 'test_user';
            const kycHash = 'kyc_hash_123';
            const nonce = 1;

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            // Check DID was created
            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo).not.toBeNull();
            expect(didInfo!.username).toBe(username);
            expect(didInfo!.kycHash).toBe(kycHash);
            expect(didInfo!.isActive).toBe(true);
            expect(didInfo!.nonce).toBe(BigInt(nonce));

            // Check total count increased
            const totalDids = await didRegistry.getGetTotalDids();
            expect(totalDids).toBe(1n);

            // Check getters work
            const isActive = await didRegistry.getIsDidActive(user1KeyPair.publicKeyBigInt);
            expect(isActive).toBe(true);

            const retrievedUsername = await didRegistry.getGetDidUsername(user1KeyPair.publicKeyBigInt);
            expect(retrievedUsername).toBe(username);

            const userNonce = await didRegistry.getGetUserNonce(user1KeyPair.publicKeyBigInt);
            expect(userNonce).toBe(BigInt(nonce));
        });

        it('should register DID without KYC hash', async () => {
            const username = 'test_user_no_kyc';
            const nonce = 1;

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash: null,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.username).toBe(username);
            expect(didInfo!.kycHash).toBeNull();
        });

        it('should fail registration with invalid signature', async () => {
            const username = 'test_user';
            const nonce = 1;

            // Create signature with wrong data
            const wrongSignature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username: 'wrong_username',
                kycHash: null,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(wrongSignature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should fail registration with invalid nonce', async () => {
            const username = 'test_user';
            const wrongNonce = 5; // Should be 1

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash: null,
                nonce: wrongNonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash: null,
                    nonce: BigInt(wrongNonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should fail registration if DID already exists', async () => {
            // First registration
            const username1 = 'test_user';
            const nonce1 = 1;

            const signature1 = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username: username1,
                kycHash: null,
                nonce: nonce1
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username: username1,
                    kycHash: null,
                    nonce: BigInt(nonce1),
                    signature: signatureToCell(signature1),
                }
            );

            // Second registration attempt
            const username2 = 'test_user_2';
            const nonce2 = 2;

            const signature2 = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username: username2,
                kycHash: null,
                nonce: nonce2
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username: username2,
                    kycHash: null,
                    nonce: BigInt(nonce2),
                    signature: signatureToCell(signature2),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });
    });

    describe('DID Update', () => {
        beforeEach(async () => {
            // Register a DID first
            const username = 'initial_user';
            const nonce = 1;

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash: null,
                nonce
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );
        });

        it('should update username successfully', async () => {
            const newUsername = 'updated_user';
            const nonce = 2;

            const signature = await createSignature('update', {
                newUsername,
                newKycHash: null,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername,
                    newKycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.username).toBe(newUsername);
            expect(didInfo!.nonce).toBe(BigInt(nonce));
        });

        it('should update KYC hash successfully', async () => {
            const newKycHash = 'new_kyc_123';
            const nonce = 2;

            const signature = await createSignature('update', {
                newUsername: null,
                newKycHash,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername: null,
                    newKycHash,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.kycHash).toBe(newKycHash);
        });

        it('should update both username and KYC hash', async () => {
            const newUsername = 'completely_new_user';
            const newKycHash = 'completely_new_kyc';
            const nonce = 2;

            const signature = await createSignature('update', {
                newUsername,
                newKycHash,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername,
                    newKycHash,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.username).toBe(newUsername);
            expect(didInfo!.kycHash).toBe(newKycHash);
        });

        it('should fail update with invalid signature', async () => {
            const newUsername = 'hacked_user';
            const nonce = 2;

            // Use wrong private key
            const wrongSignature = await createSignature('update', {
                newUsername,
                newKycHash: null,
                nonce
            }, user2KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername,
                    newKycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(wrongSignature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should fail update for non-existent DID', async () => {
            const newUsername = 'non_existent_user';
            const nonce = 1;

            const signature = await createSignature('update', {
                newUsername,
                newKycHash: null,
                nonce
            }, user2KeyPair.secretKey);

            const result = await didRegistry.send(
                user2.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user2KeyPair.publicKeyBigInt,
                    newUsername,
                    newKycHash: null,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user2.address,
                to: didRegistry.address,
                success: false,
            });
        });
    });

    describe('DID Revocation', () => {
        beforeEach(async () => {
            // Register a DID first
            const username = 'revokable_user';
            const nonce = 1;

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash: 'kyc_123',
                nonce
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash: 'kyc_123',
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );
        });

        it('should revoke DID successfully', async () => {
            const nonce = 2;

            const signature = await createSignature('revoke', {
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RevokeDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.isActive).toBe(false);
            expect(didInfo!.nonce).toBe(BigInt(nonce));

            const isActive = await didRegistry.getIsDidActive(user1KeyPair.publicKeyBigInt);
            expect(isActive).toBe(false);
        });

        it('should fail revocation with invalid signature', async () => {
            const nonce = 2;

            const wrongSignature = await createSignature('revoke', {
                nonce
            }, user2KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RevokeDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(wrongSignature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should fail revocation for non-existent DID', async () => {
            const nonce = 1;

            const signature = await createSignature('revoke', {
                nonce
            }, user2KeyPair.secretKey);

            const result = await didRegistry.send(
                user2.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RevokeDID',
                    publicKey: user2KeyPair.publicKeyBigInt,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user2.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should fail operations on revoked DID', async () => {
            // First revoke the DID
            const revokeNonce = 2;
            const revokeSignature = await createSignature('revoke', {
                nonce: revokeNonce
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RevokeDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    nonce: BigInt(revokeNonce),
                    signature: signatureToCell(revokeSignature),
                }
            );

            // Try to update revoked DID
            const updateNonce = 3;
            const updateSignature = await createSignature('update', {
                newUsername: 'should_fail',
                newKycHash: null,
                nonce: updateNonce
            }, user1KeyPair.secretKey);

            const updateResult = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername: 'should_fail',
                    newKycHash: null,
                    nonce: BigInt(updateNonce),
                    signature: signatureToCell(updateSignature),
                }
            );

            expect(updateResult.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });

            // Try to revoke already revoked DID
            const secondRevokeNonce = 3;
            const secondRevokeSignature = await createSignature('revoke', {
                nonce: secondRevokeNonce
            }, user1KeyPair.secretKey);

            const secondRevokeResult = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RevokeDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    nonce: BigInt(secondRevokeNonce),
                    signature: signatureToCell(secondRevokeSignature),
                }
            );

            expect(secondRevokeResult.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });
    });

    describe('Multiple Users', () => {
        it('should handle multiple users independently', async () => {
            // Register user1
            const user1Username = 'user1';
            const user1Nonce = 1;

            const user1Signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username: user1Username,
                kycHash: 'kyc1',
                nonce: user1Nonce
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username: user1Username,
                    kycHash: 'kyc1',
                    nonce: BigInt(user1Nonce),
                    signature: signatureToCell(user1Signature),
                }
            );

            // Register user2
            const user2Username = 'user2';
            const user2Nonce = 1;

            const user2Signature = await createSignature('register', {
                publicKey: user2KeyPair.publicKeyBigInt,
                username: user2Username,
                kycHash: 'kyc2',
                nonce: user2Nonce
            }, user2KeyPair.secretKey);

            await didRegistry.send(
                user2.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user2KeyPair.publicKeyBigInt,
                    username: user2Username,
                    kycHash: 'kyc2',
                    nonce: BigInt(user2Nonce),
                    signature: signatureToCell(user2Signature),
                }
            );

            // Check both DIDs exist
            const user1DID = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            const user2DID = await didRegistry.getGetDid(user2KeyPair.publicKeyBigInt);

            expect(user1DID!.username).toBe(user1Username);
            expect(user2DID!.username).toBe(user2Username);

            const totalDids = await didRegistry.getGetTotalDids();
            expect(totalDids).toBe(2n);

            // Update user1 independently
            const user1UpdateNonce = 2;
            const user1UpdateSignature = await createSignature('update', {
                newUsername: 'user1_updated',
                newKycHash: null,
                nonce: user1UpdateNonce
            }, user1KeyPair.secretKey);

            await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'UpdateDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    newUsername: 'user1_updated',
                    newKycHash: null,
                    nonce: BigInt(user1UpdateNonce),
                    signature: signatureToCell(user1UpdateSignature),
                }
            );

            // Check user1 is updated but user2 is unchanged
            const updatedUser1DID = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            const unchangedUser2DID = await didRegistry.getGetDid(user2KeyPair.publicKeyBigInt);

            expect(updatedUser1DID!.username).toBe('user1_updated');
            expect(unchangedUser2DID!.username).toBe(user2Username);
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero public key rejection', async () => {
            const signature = await createSignature('register', {
                publicKey: 0n,
                username: 'zero_user',
                kycHash: null,
                nonce: 1
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: 0n,
                    username: 'zero_user',
                    kycHash: null,
                    nonce: 1n,
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should handle large nonce gap rejection', async () => {
            const largeNonce = 200; // Exceeds MAX_NONCE_GAP

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username: 'large_nonce_user',
                kycHash: null,
                nonce: largeNonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username: 'large_nonce_user',
                    kycHash: null,
                    nonce: BigInt(largeNonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: false,
            });
        });

        it('should handle empty string values', async () => {
            const username = '';
            const kycHash = '';
            const nonce = 1;

            const signature = await createSignature('register', {
                publicKey: user1KeyPair.publicKeyBigInt,
                username,
                kycHash,
                nonce
            }, user1KeyPair.secretKey);

            const result = await didRegistry.send(
                user1.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'RegisterDID',
                    publicKey: user1KeyPair.publicKeyBigInt,
                    username,
                    kycHash,
                    nonce: BigInt(nonce),
                    signature: signatureToCell(signature),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: user1.address,
                to: didRegistry.address,
                success: true,
            });

            const didInfo = await didRegistry.getGetDid(user1KeyPair.publicKeyBigInt);
            expect(didInfo!.username).toBe('');
            expect(didInfo!.kycHash).toBe('');
        });
    });
});
