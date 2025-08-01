import { toNano, Address, beginCell } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

// Mock signature helper for testing (in production, use real cryptographic signatures)
function createMockSignature(): Buffer {
    const signature = beginCell()
        .storeUint(12345678901234567890n, 256) // Mock r component
        .storeUint(98765432109876543210n, 256) // Mock s component  
        .endCell();
    return signature.asBuffer();
}

function createMockPublicKey(): bigint {
    return 123456789012345678901234567890123456789012345678901234567890123456n;
}

export async function run(provider: NetworkProvider) {
    console.log('🔧 DID Registry Interaction Script');
    console.log('📍 Network:', provider.network());
    
    // Replace with your deployed contract address
    const contractAddress = Address.parse('kQAIDzNnz5Q_bSVpJGEj7SqVlm6h_zCqvf3nkQqlv3oEhJ3N'); // Update this!
    
    try {
        // Open contract connection
        const didRegistry = provider.open(DIDRegistry.fromAddress(contractAddress));
        
        console.log('📄 Contract address:', contractAddress.toString());
        console.log('👤 User address:', provider.sender().address?.toString() || 'Unknown');
        
        // Display current contract state
        await displayContractState(didRegistry);
        
        // Interactive menu
        const actions = [
            { key: '1', name: 'Register DID', action: () => registerDID(provider, didRegistry) },
            { key: '2', name: 'Update DID', action: () => updateDID(provider, didRegistry) },
            { key: '3', name: 'Revoke DID', action: () => revokeDID(provider, didRegistry) },
            { key: '4', name: 'Query DID Info', action: () => queryDID(provider, didRegistry) },
            { key: '5', name: 'Transfer Ownership (Owner Only)', action: () => transferOwnership(provider, didRegistry) },
            { key: '6', name: 'Display Contract State', action: () => displayContractState(didRegistry) },
        ];
        
        console.log('\n📋 Available actions:');
        actions.forEach(action => {
            console.log(`   ${action.key}. ${action.name}`);
        });
        
        // For demo purposes, we'll run a sample registration
        console.log('\n🎬 Running demo registration...');
        await registerDID(provider, didRegistry, 'demo_user', 'demo_kyc_hash_123');
        
        console.log('\n✅ Interaction script completed!');
        console.log('💡 Modify this script to customize interactions for your needs');
        
    } catch (error) {
        console.error('❌ Interaction failed:', error);
        throw error;
    }
}

async function displayContractState(didRegistry: any) {
    console.log('\n📊 Current Contract State:');
    console.log('═'.repeat(50));
    
    try {
        const totalDIDs = await didRegistry.getGetTotalDiDs();
        console.log('📈 Total DIDs registered:', totalDIDs.toString());
        
        const contractOwner = await didRegistry.getGetContractOwner();
        console.log('👑 Contract owner:', contractOwner.toString());
        
    } catch (error) {
        console.error('❌ Failed to fetch contract state:', error);
    }
}

async function registerDID(
    provider: NetworkProvider, 
    didRegistry: any, 
    username?: string, 
    kycHash?: string
) {
    console.log('\n🆕 Registering new DID...');
    
    const userAddress = provider.sender().address;
    if (!userAddress) {
        throw new Error('User address not available');
    }
    
    // Get current nonce
    const currentNonce = await didRegistry.getGetUserNonce(userAddress);
    const nextNonce = Number(currentNonce) + 1;
    
    // Check if DID already exists
    const existingDID = await didRegistry.getGetDid(userAddress);
    if (existingDID) {
        console.log('⚠️ DID already exists for this address');
        console.log('📋 Existing DID info:');
        console.log('   - Username:', existingDID.username);
        console.log('   - Active:', existingDID.isActive);
        console.log('   - KYC Hash:', existingDID.kycHash || 'None');
        return;
    }
    
    const finalUsername = username || `user_${Date.now()}`;
    const finalKycHash = kycHash || null;
    const publicKey = createMockPublicKey();
    
    console.log('📝 Registration details:');
    console.log('   - Username:', finalUsername);
    console.log('   - KYC Hash:', finalKycHash || 'None');
    console.log('   - Nonce:', nextNonce);
    console.log('   - Public Key:', publicKey.toString(16).substring(0, 20) + '...');
    
    try {
        const result = await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'RegisterDID',
                username: finalUsername,
                kycHash: finalKycHash,
                publicKey: publicKey,
                nonce: BigInt(nextNonce),
                signature: beginCell()
                    .storeBuffer(createMockSignature())
                    .endCell()
                    .asSlice(),
            }
        );
        
        console.log('✅ Registration transaction sent!');
        console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');
        
        // Wait a moment and check if DID was created
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const newDID = await didRegistry.getGetDid(userAddress);
        if (newDID) {
            console.log('🎉 DID registered successfully!');
            console.log('📋 New DID info:');
            console.log('   - Username:', newDID.username);
            console.log('   - Active:', newDID.isActive);
            console.log('   - Created At:', new Date(Number(newDID.createdAt) * 1000).toISOString());
        }
        
    } catch (error) {
        console.error('❌ Registration failed:', error);
        throw error;
    }
}

async function updateDID(provider: NetworkProvider, didRegistry: any) {
    console.log('\n✏️ Updating DID...');
    
    const userAddress = provider.sender().address;
    if (!userAddress) {
        throw new Error('User address not available');
    }
    
    // Check if DID exists
    const existingDID = await didRegistry.getGetDid(userAddress);
    if (!existingDID) {
        console.log('❌ No DID found for this address. Please register first.');
        return;
    }
    
    if (!existingDID.isActive) {
        console.log('❌ DID is not active. Cannot update revoked DID.');
        return;
    }
    
    // Get current nonce
    const currentNonce = await didRegistry.getGetUserNonce(userAddress);
    const nextNonce = Number(currentNonce) + 1;
    
    const newUsername = `updated_user_${Date.now()}`;
    const newKycHash = `updated_kyc_${Date.now()}`;
    
    console.log('📝 Update details:');
    console.log('   - Current username:', existingDID.username);
    console.log('   - New username:', newUsername);
    console.log('   - Current KYC:', existingDID.kycHash || 'None');
    console.log('   - New KYC:', newKycHash);
    console.log('   - Nonce:', nextNonce);
    
    try {
        const result = await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'UpdateDID',
                newUsername: newUsername,
                newKycHash: newKycHash,
                nonce: BigInt(nextNonce),
                signature: beginCell()
                    .storeBuffer(createMockSignature())
                    .endCell()
                    .asSlice(),
            }
        );
        
        console.log('✅ Update transaction sent!');
        console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');
        
        // Wait a moment and check updates
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const updatedDID = await didRegistry.getGetDid(userAddress);
        if (updatedDID) {
            console.log('🎉 DID updated successfully!');
            console.log('📋 Updated DID info:');
            console.log('   - Username:', updatedDID.username);
            console.log('   - KYC Hash:', updatedDID.kycHash);
            console.log('   - Updated At:', new Date(Number(updatedDID.updatedAt) * 1000).toISOString());
        }
        
    } catch (error) {
        console.error('❌ Update failed:', error);
        throw error;
    }
}

async function revokeDID(provider: NetworkProvider, didRegistry: any) {
    console.log('\n🚫 Revoking DID...');
    
    const userAddress = provider.sender().address;
    if (!userAddress) {
        throw new Error('User address not available');
    }
    
    // Check if DID exists and is active
    const existingDID = await didRegistry.getGetDid(userAddress);
    if (!existingDID) {
        console.log('❌ No DID found for this address.');
        return;
    }
    
    if (!existingDID.isActive) {
        console.log('⚠️ DID is already revoked.');
        return;
    }
    
    // Get current nonce
    const currentNonce = await didRegistry.getGetUserNonce(userAddress);
    const nextNonce = Number(currentNonce) + 1;
    
    console.log('📝 Revocation details:');
    console.log('   - Username:', existingDID.username);
    console.log('   - Current status: Active');
    console.log('   - Nonce:', nextNonce);
    console.log('⚠️ This action cannot be undone!');
    
    try {
        const result = await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'RevokeDID',
                nonce: BigInt(nextNonce),
                signature: beginCell()
                    .storeBuffer(createMockSignature())
                    .endCell()
                    .asSlice(),
            }
        );
        
        console.log('✅ Revocation transaction sent!');
        console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');
        
        // Wait a moment and check status
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const revokedDID = await didRegistry.getGetDid(userAddress);
        if (revokedDID && !revokedDID.isActive) {
            console.log('🎉 DID revoked successfully!');
            console.log('📋 Final DID info:');
            console.log('   - Username:', revokedDID.username);
            console.log('   - Status: Revoked');
            console.log('   - Revoked At:', new Date(Number(revokedDID.updatedAt) * 1000).toISOString());
        }
        
    } catch (error) {
        console.error('❌ Revocation failed:', error);
        throw error;
    }
}

async function queryDID(provider: NetworkProvider, didRegistry: any) {
    console.log('\n🔍 Querying DID information...');
    
    const userAddress = provider.sender().address;
    if (!userAddress) {
        throw new Error('User address not available');
    }
    
    console.log('📍 Querying address:', userAddress.toString());
    
    try {
        // Get full DID info
        const didInfo = await didRegistry.getGetDid(userAddress);
        
        if (!didInfo) {
            console.log('❌ No DID found for this address');
            return;
        }
        
        console.log('📋 DID Information:');
        console.log('═'.repeat(40));
        console.log('👤 Owner:', didInfo.owner.toString());
        console.log('📛 Username:', didInfo.username);
        console.log('🔐 KYC Hash:', didInfo.kycHash || 'None');
        console.log('🔑 Public Key:', didInfo.publicKey ? didInfo.publicKey.toString(16).substring(0, 20) + '...' : 'None');
        console.log('✅ Active:', didInfo.isActive);
        console.log('📅 Created:', new Date(Number(didInfo.createdAt) * 1000).toISOString());
        console.log('🔄 Updated:', new Date(Number(didInfo.updatedAt) * 1000).toISOString());
        console.log('🔢 Nonce:', didInfo.nonce.toString());
        
        // Additional queries for active DIDs
        if (didInfo.isActive) {
            console.log('\n🔍 Active DID Queries:');
            
            const username = await didRegistry.getGetUsername(userAddress);
            console.log('📛 Active Username:', username);
            
            const kycHash = await didRegistry.getGetKycHash(userAddress);
            console.log('🔐 Active KYC Hash:', kycHash || 'None');
            
            const publicKey = await didRegistry.getGetPublicKey(userAddress);
            console.log('🔑 Active Public Key:', publicKey ? publicKey.toString(16).substring(0, 20) + '...' : 'None');
        }
        
        // Get current nonce
        const userNonce = await didRegistry.getGetUserNonce(userAddress);
        console.log('🔢 Current User Nonce:', userNonce.toString());
        
        // Check active status
        const isActive = await didRegistry.getIsDidActive(userAddress);
        console.log('✅ Is Active (direct check):', isActive);
        
    } catch (error) {
        console.error('❌ Query failed:', error);
        throw error;
    }
}

async function transferOwnership(provider: NetworkProvider, didRegistry: any) {
    console.log('\n👑 Transferring contract ownership...');
    
    const currentOwner = await didRegistry.getGetContractOwner();
    const userAddress = provider.sender().address;
    
    if (!userAddress) {
        throw new Error('User address not available');
    }
    
    console.log('👤 Current owner:', currentOwner.toString());
    console.log('👤 Your address:', userAddress.toString());
    
    if (!userAddress.equals(currentOwner)) {
        console.log('❌ Only the current owner can transfer ownership');
        return;
    }
    
    // For demo, we'll transfer to a dummy address
    // In practice, you'd want to specify the actual new owner
    const newOwner = Address.parse('0QAIDzNnz5Q_bSVpJGEj7SqVlm6h_zCqvf3nkQqlv3oEhK3E'); // Dummy address
    
    console.log('📝 Transfer details:');
    console.log('   - From:', currentOwner.toString());
    console.log('   - To:', newOwner.toString());
    console.log('⚠️ This will permanently transfer contract control!');
    
    try {
        const result = await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'TransferOwnership',
                newOwner: newOwner,
            }
        );
        
        console.log('✅ Ownership transfer transaction sent!');
        console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');
        
        // Wait a moment and check new owner
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const updatedOwner = await didRegistry.getGetContractOwner();
        console.log('🎉 New owner:', updatedOwner.toString());
        
    } catch (error) {
        console.error('❌ Ownership transfer failed:', error);
        throw error;
    }
}
