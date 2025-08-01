import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Cell, beginCell, Address } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import '@ton/test-utils';

describe('DIDRegistry', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user1: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let didRegistry: SandboxContract<DIDRegistry>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        // Create test users
        deployer = await blockchain.treasury('deployer');
        user1 = await blockchain.treasury('user1');
        user2 = await blockchain.treasury('user2');

        // Deploy DID Registry contract
        didRegistry = blockchain.openContract(await DIDRegistry.fromInit());

        const deployResult = await didRegistry.send(
            deployer.getSender(),
            {
                value: toNano('0.1'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: didRegistry.address,
            deploy: true,
            success: true,
        });
    });

    // Helper function to create a mock signature
    function createMockSignature(): Cell {
        return beginCell()
            .storeUint(12345678901234567890n, 256) // Mock r component
            .storeUint(98765432109876543210n, 256) // Mock s component  
            .endCell();
    }

    it('should deploy successfully', async () => {
        // Check initial state
        const totalDIDs = await didRegistry.getGetTotalDiDs();
        expect(totalDIDs).toBe(0n);

        const contractOwner = await didRegistry.getGetContractOwner();
        expect(contractOwner).toEqualAddress(deployer.address);
    });

    it('should register a new DID successfully', async () => {
        const username = 'alice';
        const kycHash = 'kycHash123';
        const nonce = 1n;
        const signature = createMockSignature().asSlice();

        const registerResult = await didRegistry.send(
            user1.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'RegisterDID',
                username,
                kycHash,
                nonce,
                signature,
            }
        );

        expect(registerResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: true,
        });

        // Verify DID was created
        const didInfo = await didRegistry.getGetDid(user1.address);
        expect(didInfo).not.toBeNull();
        expect(didInfo?.username).toBe(username);
        expect(didInfo?.kycHash).toBe(kycHash);
        expect(didInfo?.isActive).toBe(true);
        expect(didInfo?.owner).toEqualAddress(user1.address);

        // Check total count
        const totalDIDs = await didRegistry.getGetTotalDiDs();
        expect(totalDIDs).toBe(1n);

        // Check helper methods
        const isActive = await didRegistry.getIsDidActive(user1.address);
        expect(isActive).toBe(true);

        const retrievedUsername = await didRegistry.getGetUsername(user1.address);
        expect(retrievedUsername).toBe(username);

        const retrievedKycHash = await didRegistry.getGetKycHash(user1.address);
        expect(retrievedKycHash).toBe(kycHash);
    });

    it('should prevent duplicate DID registration', async () => {
        const username = 'alice';
        const nonce = 1n;
        const signature = createMockSignature().asSlice();

        // First registration should succeed
        await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username,
                kycHash: null,
                nonce,
                signature,
            }
        );

        // Second registration should fail
        const duplicateResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username: 'bob',
                kycHash: null,
                nonce: 2n,
                signature,
            }
        );

        expect(duplicateResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: false,
        });
    });

    it('should update DID information', async () => {
        // First register a DID
        const initialUsername = 'alice';
        const nonce1 = 1n;
        const signature = createMockSignature().asSlice();

        await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username: initialUsername,
                kycHash: null,
                nonce: nonce1,
                signature,
            }
        );

        // Update username
        const newUsername = 'alice_updated';
        const nonce2 = 2n;

        const updateResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'UpdateDID',
                newUsername,
                newKycHash: 'newKycHash456',
                nonce: nonce2,
                signature,
            }
        );

        expect(updateResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: true,
        });

        // Verify updates
        const updatedDID = await didRegistry.getGetDid(user1.address);
        expect(updatedDID?.username).toBe(newUsername);
        expect(updatedDID?.kycHash).toBe('newKycHash456');
        expect(updatedDID?.isActive).toBe(true);
    });

    it('should revoke DID', async () => {
        const username = 'alice';
        const nonce1 = 1n;
        const signature = createMockSignature().asSlice();

        // Register DID first
        await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username,
                kycHash: null,
                nonce: nonce1,
                signature,
            }
        );

        // Revoke DID
        const nonce2 = 2n;
        const revokeResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RevokeDID',
                nonce: nonce2,
                signature,
            }
        );

        expect(revokeResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: true,
        });

        // Verify DID is revoked
        const revokedDID = await didRegistry.getGetDid(user1.address);
        expect(revokedDID?.isActive).toBe(false);

        const isActive = await didRegistry.getIsDidActive(user1.address);
        expect(isActive).toBe(false);

        // Should not return username/kyc for revoked DID
        const username_result = await didRegistry.getGetUsername(user1.address);
        expect(username_result).toBeNull();

        const kycHash_result = await didRegistry.getGetKycHash(user1.address);
        expect(kycHash_result).toBeNull();
    });

    it('should handle nonce validation correctly', async () => {
        const username = 'alice';
        const signature = createMockSignature().asSlice();

        // Should fail with invalid nonce (should start with 1)
        const invalidNonceResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username,
                kycHash: null,
                nonce: 5n, // Invalid - should be 1
                signature,
            }
        );

        expect(invalidNonceResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: false,
        });

        // Should succeed with correct nonce
        const validResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username,
                kycHash: null,
                nonce: 1n, // Correct nonce
                signature,
            }
        );

        expect(validResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: true,
        });

        // Check nonce was updated
        const userNonce = await didRegistry.getGetUserNonce(user1.address);
        expect(userNonce).toBe(1n);
    });

    it('should handle multiple users independently', async () => {
        const signature = createMockSignature().asSlice();

        // Register DIDs for both users
        await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username: 'alice',
                kycHash: 'kyc1',
                nonce: 1n,
                signature,
            }
        );

        await didRegistry.send(
            user2.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username: 'bob',
                kycHash: 'kyc2',
                nonce: 1n,
                signature,
            }
        );

        // Verify both DIDs exist independently
        const user1DID = await didRegistry.getGetDid(user1.address);
        const user2DID = await didRegistry.getGetDid(user2.address);

        expect(user1DID?.username).toBe('alice');
        expect(user2DID?.username).toBe('bob');
        expect(user1DID?.kycHash).toBe('kyc1');
        expect(user2DID?.kycHash).toBe('kyc2');

        const totalDIDs = await didRegistry.getGetTotalDiDs();
        expect(totalDIDs).toBe(2n);
    });

    it('should validate username length', async () => {
        const signature = createMockSignature().asSlice();

        // Test empty username
        const emptyUsernameResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RegisterDID',
                username: '',
                kycHash: null,
                nonce: 1n,
                signature,
            }
        );

        expect(emptyUsernameResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: false,
        });
    });

    it('should prevent operations on non-existent DID', async () => {
        const signature = createMockSignature().asSlice();

        // Try to update non-existent DID
        const updateResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'UpdateDID',
                newUsername: 'updated',
                newKycHash: null,
                nonce: 1n,
                signature,
            }
        );

        expect(updateResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: false,
        });

        // Try to revoke non-existent DID
        const revokeResult = await didRegistry.send(
            user1.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'RevokeDID',
                nonce: 1n,
                signature,
            }
        );

        expect(revokeResult.transactions).toHaveTransaction({
            from: user1.address,
            to: didRegistry.address,
            success: false,
        });
    });
});
