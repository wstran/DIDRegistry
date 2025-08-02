import { toNano, Address, beginCell, Cell } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';
import { mnemonicToPrivateKey, sha256, sign } from '@ton/crypto';

async function createMockSignature(
    username: string,
    kycHash: string | null,
    publicKey: bigint,
    nonce: number
): Promise<Buffer> {
    const mnemonic = [
        'wreck', 'art', 'cereal', 'more', 'helmet', 'winner',
        'law', 'lawn', 'beauty', 'volcano', 'polar', 'tube',
        'dice', 'very', 'follow', 'color', 'volcano', 'giant',
        'bunker', 'cabbage', 'slogan', 'glue', 'decade', 'sight'
    ];

    // Chuyển mnemonic thành key pair
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // Xây dựng message
    let message = `register:${username}`;
    if (kycHash) {
        message += `:${kycHash}`;
    }
    message += `:${publicKey.toString(10)}:${nonce.toString(10)}`;

    console.log('Message to sign:', message); // Debug

    // Chuyển message thành Buffer và băm SHA-256
    const messageBuffer = Buffer.from(message, 'utf8');
    const messageHash = await sha256(messageBuffer); // Giả sử @ton/crypto cung cấp sha256

    // Ký hash
    const signature = sign(messageHash, keyPair.secretKey);

    console.log('Signature:', signature.toString('hex')); // Debug

    return signature;
}

async function createMockPublicKey(): Promise<bigint> {
    const mnemonic = [
        'wreck', 'art', 'cereal', 'more', 'helmet', 'winner',
        'law', 'lawn', 'beauty', 'volcano', 'polar', 'tube',
        'dice', 'very', 'follow', 'color', 'volcano', 'giant',
        'bunker', 'cabbage', 'slogan', 'glue', 'decade', 'sight'
    ];

    // Chuyển mnemonic thành key pair
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // Public key là Buffer, chuyển thành bigint
    const publicKeyBigInt = BigInt('0x' + keyPair.publicKey.toString('hex'));

    return publicKeyBigInt;
}

export async function run(provider: NetworkProvider) {
    console.log('🔧 DID Registry Interaction Script');
    console.log('📍 Network:', provider.network());

    // Replace with your deployed contract address
    const contractAddress = Address.parse('kQAx2UYVEtFOqopm1Q97WxmbeQnSc-rSB9WSagENZ4rMtbn_'); // Update this!

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
            // { key: '2', name: 'Update DID', action: () => updateDID(provider, didRegistry) },
            // { key: '3', name: 'Revoke DID', action: () => revokeDID(provider, didRegistry) },
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

        await queryDID(provider, didRegistry);

        // await registerDID(provider, didRegistry, 'demo_user', 'demo_kyc_hash_123');

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
        const totalDIDs = await didRegistry.getGetTotalDids();
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
    const slice = existingDID.beginParse();
    const status = slice.loadInt(8);

    console.log({ status })

    if (status !== -1) {
        const username = slice.loadStringRefTail() ?? "";
        const kycHash = slice.loadStringRefTail() ?? "";
        const publicKey = Number(slice.loadInt(256)) ?? 0; // Giả sử publicKey 256 bit
        const isActive = slice.loadBool();

        console.log('⚠️ DID already exists for this address');
        console.log('📋 Existing DID info:');
        console.log('   - Username:', username);
        console.log('   - Active:', isActive);
        console.log('   - KYC Hash:', kycHash || 'None');
        return;
    }

    const finalUsername = username || `user_${Date.now()}`;
    const finalKycHash = kycHash || null;
    const publicKey = await createMockPublicKey();

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
                    .storeBuffer(await createMockSignature(finalUsername, finalKycHash, publicKey, nextNonce))
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

// async function updateDID(provider: NetworkProvider, didRegistry: any) {
//     console.log('\n✏️ Updating DID...');

//     const userAddress = provider.sender().address;
//     if (!userAddress) {
//         throw new Error('User address not available');
//     }

//     // Check if DID exists
//     const existingDID = await didRegistry.getGetDid(userAddress);
//     if (!existingDID) {
//         console.log('❌ No DID found for this address. Please register first.');
//         return;
//     }

//     if (!existingDID.isActive) {
//         console.log('❌ DID is not active. Cannot update revoked DID.');
//         return;
//     }

//     // Get current nonce
//     const currentNonce = await didRegistry.getGetUserNonce(userAddress);
//     const nextNonce = Number(currentNonce) + 1;

//     const newUsername = `updated_user_${Date.now()}`;
//     const newKycHash = `updated_kyc_${Date.now()}`;

//     console.log('📝 Update details:');
//     console.log('   - Current username:', existingDID.username);
//     console.log('   - New username:', newUsername);
//     console.log('   - Current KYC:', existingDID.kycHash || 'None');
//     console.log('   - New KYC:', newKycHash);
//     console.log('   - Nonce:', nextNonce);

//     try {
//         const result = await didRegistry.send(
//             provider.sender(),
//             {
//                 value: toNano('0.05'),
//             },
//             {
//                 $$type: 'UpdateDID',
//                 newUsername: newUsername,
//                 newKycHash: newKycHash,
//                 nonce: BigInt(nextNonce),
//                 signature: beginCell()
//                     .storeBuffer(await createMockSignature())
//                     .endCell()
//                     .asSlice(),
//             }
//         );

//         console.log('✅ Update transaction sent!');
//         console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');

//         // Wait a moment and check updates
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         const updatedDID = await didRegistry.getGetDid(userAddress);
//         if (updatedDID) {
//             console.log('🎉 DID updated successfully!');
//             console.log('📋 Updated DID info:');
//             console.log('   - Username:', updatedDID.username);
//             console.log('   - KYC Hash:', updatedDID.kycHash);
//             console.log('   - Updated At:', new Date(Number(updatedDID.updatedAt) * 1000).toISOString());
//         }

//     } catch (error) {
//         console.error('❌ Update failed:', error);
//         throw error;
//     }
// }

// async function revokeDID(provider: NetworkProvider, didRegistry: any) {
//     console.log('\n🚫 Revoking DID...');

//     const userAddress = provider.sender().address;
//     if (!userAddress) {
//         throw new Error('User address not available');
//     }

//     // Check if DID exists and is active
//     const existingDID = await didRegistry.getGetDid(userAddress);
//     if (!existingDID) {
//         console.log('❌ No DID found for this address.');
//         return;
//     }

//     if (!existingDID.isActive) {
//         console.log('⚠️ DID is already revoked.');
//         return;
//     }

//     // Get current nonce
//     const currentNonce = await didRegistry.getGetUserNonce(userAddress);
//     const nextNonce = Number(currentNonce) + 1;

//     console.log('📝 Revocation details:');
//     console.log('   - Username:', existingDID.username);
//     console.log('   - Current status: Active');
//     console.log('   - Nonce:', nextNonce);
//     console.log('⚠️ This action cannot be undone!');

//     try {
//         const result = await didRegistry.send(
//             provider.sender(),
//             {
//                 value: toNano('0.05'),
//             },
//             {
//                 $$type: 'RevokeDID',
//                 nonce: BigInt(nextNonce),
//                 signature: beginCell()
//                     .storeBuffer(await createMockSignature())
//                     .endCell()
//                     .asSlice(),
//             }
//         );

//         console.log('✅ Revocation transaction sent!');
//         console.log('🔗 Transaction hash:', result?.toString() || 'Unknown');

//         // Wait a moment and check status
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         const revokedDID = await didRegistry.getGetDid(userAddress);
//         if (revokedDID && !revokedDID.isActive) {
//             console.log('🎉 DID revoked successfully!');
//             console.log('📋 Final DID info:');
//             console.log('   - Username:', revokedDID.username);
//             console.log('   - Status: Revoked');
//             console.log('   - Revoked At:', new Date(Number(revokedDID.updatedAt) * 1000).toISOString());
//         }

//     } catch (error) {
//         console.error('❌ Revocation failed:', error);
//         throw error;
//     }
// }


async function queryDID(provider: NetworkProvider, didRegistry: any) {
    const contractAddress = Address.parse('kQAx2UYVEtFOqopm1Q97WxmbeQnSc-rSB9WSagENZ4rMtbn_');
    didRegistry = provider.open(DIDRegistry.fromAddress(contractAddress));
    console.log('\n🔍 Querying DID information...');

    const userAddress = provider.sender().address;
    if (!userAddress) {
        throw new Error('User address not available');
    }

    console.log('📍 Querying address:', userAddress.toString());

    try {
        // Lấy dữ liệu từ các hàm get riêng để kiểm tra
        const usernameFromGetter = await didRegistry.getGetUsername(userAddress);
        const kycHashFromGetter = await didRegistry.getGetKycHash(userAddress);
        const isActiveFromGetter = await didRegistry.getIsDidActive(userAddress);
        console.log('Username from getUsername:', usernameFromGetter ?? 'None');
        console.log('KycHash from getKycHash:', kycHashFromGetter ?? 'None');
        console.log('IsActive from getIsDidActive:', isActiveFromGetter);

        const didInfo = await didRegistry.getGetDid(userAddress);
        console.log('didInfo type:', typeof didInfo, didInfo instanceof Cell ? 'is Cell' : 'not Cell');
        console.log('didInfo bits length:', didInfo.bits.length);
        console.log('didInfo refs length:', didInfo.refs.length);

        const slice = didInfo.beginParse();
        const status = slice.loadInt(8);
        console.log('Status:', status);

        if (status === -1) {
            console.log('❌ No DID found for this address');
            return;
        }

        let username = "";
        try {
            username = slice.loadStringTail() ?? "";
            console.log('Username parsed:', username);
        } catch (e) {
            console.error('Failed to parse username:', e);
            console.log('Remaining bits before username:', slice.remainingBits);
            if (slice.remainingBits > 0) {
                const rawBits = slice.loadBits(slice.remainingBits);
                console.log('Username raw data (hex):', rawBits.toString('hex'));
                try {
                    const rawString = Buffer.from(rawBits.toString('hex'), 'hex').toString('utf8');
                    if (rawString.startsWith('demo_user')) {
                        username = 'demo_user';
                        console.log('Extracted valid username:', username);
                    }
                } catch (e) {
                    console.error('Failed to extract valid username:', e);
                }
            }
            slice.skip(slice.remainingBits); // Bỏ qua bits không hợp lệ
        }

        let kycHash = "";
        try {
            kycHash = slice.loadStringTail() ?? "";
            console.log('KycHash parsed:', kycHash);
        } catch (e) {
            console.error('Failed to parse kycHash:', e);
            console.log('Remaining bits before kycHash:', slice.remainingBits);
            if (slice.remainingBits > 0) {
                console.log('kycHash raw data (hex):', slice.loadBits(slice.remainingBits).toString('hex'));
            }
            slice.skip(slice.remainingBits);
        }

        let publicKey = BigInt(0);
        if (slice.remainingBits >= 256) {
            try {
                publicKey = slice.loadInt(256) ?? BigInt(0);
                console.log('PublicKey parsed:', publicKey.toString(16));
            } catch (e) {
                console.error('Failed to parse publicKey:', e);
            }
        } else {
            console.log('Not enough bits for publicKey:', slice.remainingBits);
        }

        let isActive = false;
        if (slice.remainingBits >= 1) {
            try {
                isActive = slice.loadBit();
                console.log('IsActive parsed:', isActive);
            } catch (e) {
                console.error('Failed to parse isActive:', e);
            }
        } else {
            console.log('Not enough bits for isActive:', slice.remainingBits);
        }

        let createdAt = 0;
        if (slice.remainingBits >= 64) {
            try {
                createdAt = slice.loadInt(64) ?? 0;
                console.log('CreatedAt parsed:', createdAt);
            } catch (e) {
                console.error('Failed to parse createdAt:', e);
            }
        } else {
            console.log('Not enough bits for createdAt:', slice.remainingBits);
        }

        let updatedAt = 0;
        if (slice.remainingBits >= 64) {
            try {
                updatedAt = slice.loadInt(64) ?? 0;
                console.log('UpdatedAt parsed:', updatedAt);
            } catch (e) {
                console.error('Failed to parse updatedAt:', e);
            }
        } else {
            console.log('Not enough bits for updatedAt:', slice.remainingBits);
        }

        let nonce = 0;
        if (slice.remainingBits >= 64) {
            try {
                nonce = slice.loadInt(64) ?? 0;
                console.log('Nonce parsed:', nonce);
            } catch (e) {
                console.error('Failed to parse nonce:', e);
            }
        } else {
            console.log('Not enough bits for nonce:', slice.remainingBits);
        }

        console.log('📋 DID Information:');
        console.log('═'.repeat(40));
        console.log('👤 Owner:', userAddress.toString());
        console.log('📛 Username:', username || usernameFromGetter || 'None');
        console.log('🔐 KYC Hash:', kycHash || kycHashFromGetter || 'None');
        console.log('🔑 Public Key:', publicKey.toString(16).substring(0, 20) + '...');
        console.log('✅ Active:', isActive || isActiveFromGetter);
        console.log('📅 Created:', new Date(Number(createdAt) * 1000).toISOString());
        console.log('🔄 Updated:', new Date(Number(updatedAt) * 1000).toISOString());
        console.log('🔢 Nonce:', nonce);

        const userNonce = await didRegistry.getGetUserNonce(userAddress);
        console.log('🔢 Current User Nonce:', userNonce.toString());

        console.log('✅ Is Active (direct check):', isActiveFromGetter);

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
    const newOwner = Address.parse('kQAx2UYVEtFOqopm1Q97WxmbeQnSc-rSB9WSagENZ4rMtbn_'); // Dummy address

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
