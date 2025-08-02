import { toNano, Address, beginCell } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';
import { mnemonicToPrivateKey, sha256, sign, keyPairFromSecretKey } from '@ton/crypto';

// Demo keypair for testing
const TEST_MNEMONIC = [
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'art'
];

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
    
    console.log('📝 Message to sign:', messageBuilder);
    
    // Hash the message
    const messageBuffer = Buffer.from(messageBuilder, 'utf8');
    const messageHash = await sha256(messageBuffer);
    
    // Sign the hash
    const signature = sign(messageHash, secretKey);
    
    console.log('✍️  Signature created:', signature.toString('hex'));
    
    return signature;
}

/**
 * Convert Buffer signature to Cell for contract
 */
function signatureToCell(signature: Buffer): any {
    return beginCell().storeBuffer(signature).endCell().beginParse();
}

/**
 * Get test keypair for demo purposes
 */
async function getTestKeyPair() {
    const keyPair = await mnemonicToPrivateKey(TEST_MNEMONIC);
    const publicKeyBigInt = BigInt('0x' + keyPair.publicKey.toString('hex'));
    
    return {
        secretKey: keyPair.secretKey,
        publicKey: keyPair.publicKey,
        publicKeyBigInt
    };
}

/**
 * Wait for transaction with timeout
 */
async function waitForTransaction(
    provider: NetworkProvider,
    contractAddress: Address,
    timeoutMs: number = 30000
): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const isDeployed = await provider.isContractDeployed(contractAddress);
            if (isDeployed) {
                return true;
            }
        } catch (error) {
            // Contract might not be responding yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return false;
}

/**
 * Register a new DID
 */
async function registerDID(
    provider: NetworkProvider,
    contractAddress: string,
    username: string,
    kycHash?: string
) {
    console.log('\n🔐 Registering new DID...');
    
    try {
        const contract = provider.open(DIDRegistry.fromAddress(Address.parse(contractAddress)));
        const keyPair = await getTestKeyPair();
        
        // Get current nonce
        const currentNonce = await contract.getUserNonce(keyPair.publicKeyBigInt);
        const nonce = Number(currentNonce) + 1;
        
        console.log('👤 Public Key:', keyPair.publicKeyBigInt.toString());
        console.log('📛 Username:', username);
        console.log('🔢 Nonce:', nonce);
        if (kycHash) console.log('🆔 KYC Hash:', kycHash);
        
        // Create signature
        const signature = await createSignature('register', {
            publicKey: keyPair.publicKeyBigInt,
            username,
            kycHash,
            nonce
        }, keyPair.secretKey);
        
        // Send transaction
        console.log('📤 Sending registration transaction...');
        
        await contract.send(
            provider.sender(),
            {
                value: toNano('0.05'),
                bounce: false,
            },
            {
                $$type: 'RegisterDID',
                publicKey: keyPair.publicKeyBigInt,
                username,
                kycHash: kycHash || null,
                nonce: BigInt(nonce),
                signature: signatureToCell(signature),
            }
        );
        
        console.log('✅ Registration transaction sent successfully!');
        console.log('⏳ Waiting for confirmation...');
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if DID was registered
        const didInfo = await contract.getDid(keyPair.publicKeyBigInt);
        if (didInfo) {
            console.log('🎉 DID registered successfully!');
            console.log('📊 DID Info:', {
                username: didInfo.username,
                isActive: didInfo.isActive,
                createdAt: new Date(Number(didInfo.createdAt) * 1000).toISOString(),
                nonce: Number(didInfo.nonce)
            });
        } else {
            console.log('⚠️  Transaction sent but DID not found. It may still be processing.');
        }
        
    } catch (error) {
        console.error('❌ Registration failed:', error);
        throw error;
    }
}

/**
 * Update an existing DID
 */
async function updateDID(
    provider: NetworkProvider,
    contractAddress: string,
    newUsername?: string,
    newKycHash?: string
) {
    console.log('\n🔄 Updating DID...');
    
    try {
        const contract = provider.open(DIDRegistry.fromAddress(Address.parse(contractAddress)));
        const keyPair = await getTestKeyPair();
        
        // Check if DID exists
        const existingDID = await contract.getDid(keyPair.publicKeyBigInt);
        if (!existingDID) {
            throw new Error('DID not found. Please register first.');
        }
        
        if (!existingDID.isActive) {
            throw new Error('DID is revoked and cannot be updated.');
        }
        
        // Get current nonce
        const currentNonce = await contract.getUserNonce(keyPair.publicKeyBigInt);
        const nonce = Number(currentNonce) + 1;
        
        console.log('👤 Public Key:', keyPair.publicKeyBigInt.toString());
        console.log('🔢 Nonce:', nonce);
        if (newUsername) console.log('📛 New Username:', newUsername);
        if (newKycHash) console.log('🆔 New KYC Hash:', newKycHash);
        
        // Create signature
        const signature = await createSignature('update', {
            newUsername,
            newKycHash,
            nonce
        }, keyPair.secretKey);
        
        // Send transaction
        console.log('📤 Sending update transaction...');
        
        await contract.send(
            provider.sender(),
            {
                value: toNano('0.03'),
                bounce: false,
            },
            {
                $$type: 'UpdateDID',
                publicKey: keyPair.publicKeyBigInt,
                newUsername: newUsername || null,
                newKycHash: newKycHash || null,
                nonce: BigInt(nonce),
                signature: signatureToCell(signature),
            }
        );
        
        console.log('✅ Update transaction sent successfully!');
        console.log('⏳ Waiting for confirmation...');
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check updated DID
        const updatedDID = await contract.getDid(keyPair.publicKeyBigInt);
        if (updatedDID) {
            console.log('🎉 DID updated successfully!');
            console.log('📊 Updated DID Info:', {
                username: updatedDID.username,
                kycHash: updatedDID.kycHash,
                isActive: updatedDID.isActive,
                updatedAt: new Date(Number(updatedDID.updatedAt) * 1000).toISOString(),
                nonce: Number(updatedDID.nonce)
            });
        }
        
    } catch (error) {
        console.error('❌ Update failed:', error);
        throw error;
    }
}

/**
 * Revoke a DID
 */
async function revokeDID(
    provider: NetworkProvider,
    contractAddress: string
) {
    console.log('\n🚫 Revoking DID...');
    
    try {
        const contract = provider.open(DIDRegistry.fromAddress(Address.parse(contractAddress)));
        const keyPair = await getTestKeyPair();
        
        // Check if DID exists and is active
        const existingDID = await contract.getDid(keyPair.publicKeyBigInt);
        if (!existingDID) {
            throw new Error('DID not found.');
        }
        
        if (!existingDID.isActive) {
            throw new Error('DID is already revoked.');
        }
        
        // Get current nonce
        const currentNonce = await contract.getUserNonce(keyPair.publicKeyBigInt);
        const nonce = Number(currentNonce) + 1;
        
        console.log('👤 Public Key:', keyPair.publicKeyBigInt.toString());
        console.log('🔢 Nonce:', nonce);
        
        // Create signature
        const signature = await createSignature('revoke', {
            nonce
        }, keyPair.secretKey);
        
        // Send transaction
        console.log('📤 Sending revocation transaction...');
        
        await contract.send(
            provider.sender(),
            {
                value: toNano('0.03'),
                bounce: false,
            },
            {
                $$type: 'RevokeDID',
                publicKey: keyPair.publicKeyBigInt,
                nonce: BigInt(nonce),
                signature: signatureToCell(signature),
            }
        );
        
        console.log('✅ Revocation transaction sent successfully!');
        console.log('⏳ Waiting for confirmation...');
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check revoked DID
        const revokedDID = await contract.getDid(keyPair.publicKeyBigInt);
        if (revokedDID) {
            console.log('🎉 DID revoked successfully!');
            console.log('📊 Revoked DID Info:', {
                username: revokedDID.username,
                isActive: revokedDID.isActive,
                updatedAt: new Date(Number(revokedDID.updatedAt) * 1000).toISOString(),
                nonce: Number(revokedDID.nonce)
            });
        }
        
    } catch (error) {
        console.error('❌ Revocation failed:', error);
        throw error;
    }
}

/**
 * Query DID information
 */
async function queryDID(
    provider: NetworkProvider,
    contractAddress: string,
    publicKey?: string
) {
    console.log('\n🔍 Querying DID information...');
    
    try {
        const contract = provider.open(DIDRegistry.fromAddress(Address.parse(contractAddress)));
        
        // Use provided public key or test keypair
        let queryPublicKey: bigint;
        if (publicKey) {
            queryPublicKey = BigInt(publicKey);
        } else {
            const keyPair = await getTestKeyPair();
            queryPublicKey = keyPair.publicKeyBigInt;
        }
        
        console.log('👤 Querying Public Key:', queryPublicKey.toString());
        
        // Get DID info
        const didInfo = await contract.getDid(queryPublicKey);
        
        if (didInfo) {
            console.log('📊 DID Information:');
            console.log('  📛 Username:', didInfo.username);
            console.log('  🆔 KYC Hash:', didInfo.kycHash || 'None');
            console.log('  ✅ Active:', didInfo.isActive);
            console.log('  📅 Created:', new Date(Number(didInfo.createdAt) * 1000).toISOString());
            console.log('  📅 Updated:', new Date(Number(didInfo.updatedAt) * 1000).toISOString());
            console.log('  🔢 Nonce:', Number(didInfo.nonce));
        } else {
            console.log('❌ DID not found for this public key');
        }
        
        // Get contract stats
        const totalDIDs = await contract.getTotalDids();
        const isActive = await contract.isDidActive(queryPublicKey);
        const userNonce = await contract.getUserNonce(queryPublicKey);
        
        console.log('\n📈 Contract Statistics:');
        console.log('  📊 Total DIDs:', totalDIDs.toString());
        console.log('  ✅ Is Active:', isActive);
        console.log('  🔢 User Nonce:', userNonce.toString());
        
    } catch (error) {
        console.error('❌ Query failed:', error);
        throw error;
    }
}

/**
 * Main interaction function
 */
export async function run(provider: NetworkProvider) {
    console.log('🎯 DID Registry Interaction Script');
    console.log('📍 Network:', provider.network());
    
    const args = process.argv.slice(2);
    const action = args[0];
    
    if (!action) {
        console.log(`
📋 Available actions:
  deploy    - Deploy new contract  
  register  - Register new DID (username) [kycHash]
  update    - Update DID [newUsername] [newKycHash]  
  revoke    - Revoke DID
  query     - Query DID info [publicKey]
  
💡 Examples:
  npm run start register "john_doe" "kyc123456"
  npm run start update "john_doe_updated" 
  npm run start query
        `);
        return;
    }
    
    // For non-deploy actions, we need contract address
    let contractAddress: string;
    
    if (action === 'deploy') {
        console.log('🚀 Use: npm run start deployRegistry');
        return;
    } else {
        // Try to read contract address from a deployment file or use provided address
        contractAddress = args[1] || process.env.CONTRACT_ADDRESS;
        
        if (!contractAddress) {
            console.error('❌ Contract address required. Please provide as second argument or set CONTRACT_ADDRESS env var.');
            console.log('💡 Example: npm run start register EQC... "username"');
            return;
        }
        
        console.log('📄 Contract:', contractAddress);
    }
    
    try {
        switch (action) {
            case 'register':
                const username = args[2];
                const kycHash = args[3];
                if (!username) {
                    console.error('❌ Username required for registration');
                    return;
                }
                await registerDID(provider, contractAddress, username, kycHash);
                break;
                
            case 'update':
                const newUsername = args[2];
                const newKycHash = args[3];
                if (!newUsername && !newKycHash) {
                    console.error('❌ At least newUsername or newKycHash required for update');
                    return;
                }
                await updateDID(provider, contractAddress, newUsername, newKycHash);
                break;
                
            case 'revoke':
                await revokeDID(provider, contractAddress);
                break;
                
            case 'query':
                const queryPublicKey = args[2];
                await queryDID(provider, contractAddress, queryPublicKey);
                break;
                
            default:
                console.error('❌ Unknown action:', action);
                console.log('💡 Use: npm run start to see available actions');
        }
        
    } catch (error) {
        console.error('💥 Script failed:', error);
        process.exit(1);
    }
}
