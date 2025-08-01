import { toNano, beginCell } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();
    const sender = provider.sender();

    // Get contract address from user or use default
    const contractAddress = args.length > 0 ? args[0] : await ui.input('DID Registry contract address');
    
    console.log(`📋 Interacting with DID Registry at: ${contractAddress}`);

    // Open contract instance
    const didRegistry = provider.open(DIDRegistry.fromAddress(provider.api().parseAddress(contractAddress)));

    // Get current user nonce
    const currentNonce = await didRegistry.getUserNonce(sender.address!);
    console.log(`🔢 Current user nonce: ${currentNonce}`);

    // Check if user already has a DID
    const existingDID = await didRegistry.getDID(sender.address!);
    
    if (existingDID && existingDID.isActive) {
        console.log('✅ You already have an active DID:');
        console.log(`   👤 Username: ${existingDID.username}`);
        console.log(`   🔐 KYC Hash: ${existingDID.kycHash || 'Not set'}`);
        console.log(`   📅 Created: ${new Date(Number(existingDID.createdAt) * 1000).toISOString()}`);
        console.log(`   🔄 Updated: ${new Date(Number(existingDID.updatedAt) * 1000).toISOString()}`);

        // Ask what operation to perform
        const operation = await ui.choose('What would you like to do?', [
            'Update DID',
            'Revoke DID',
            'View DID info only'
        ], (c) => c);

        if (operation === 'Update DID') {
            await updateDID(didRegistry, provider, Number(currentNonce) + 1);
        } else if (operation === 'Revoke DID') {
            await revokeDID(didRegistry, provider, Number(currentNonce) + 1);
        }
    } else {
        console.log('ℹ️  You don\'t have an active DID. Let\'s register one!');
        await registerDID(didRegistry, provider, Number(currentNonce) + 1);
    }

    // Show final stats
    const totalDIDs = await didRegistry.getTotalDIDs();
    console.log(`\n📊 Total DIDs in registry: ${totalDIDs}`);
}

async function registerDID(didRegistry: any, provider: NetworkProvider, nonce: number) {
    const ui = provider.ui();
    
    const username = await ui.input('Enter username for your DID');
    const kycHash = await ui.input('Enter KYC hash (optional, press enter to skip)') || null;

    // Create mock signature for demonstration
    const signature = createMockSignature().asSlice();

    console.log('🚀 Registering DID...');
    
    const result = await didRegistry.send(
        provider.sender(),
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

    console.log('✅ DID registration transaction sent!');
    console.log(`📄 Transaction hash: ${result.transactions[0]?.hash()?.toString('hex')}`);
}

async function updateDID(didRegistry: any, provider: NetworkProvider, nonce: number) {
    const ui = provider.ui();
    
    const newUsername = await ui.input('Enter new username (press enter to keep current)') || null;
    const newKycHash = await ui.input('Enter new KYC hash (press enter to keep current)') || null;

    if (!newUsername && !newKycHash) {
        console.log('❌ No updates specified');
        return;
    }

    // Create mock signature for demonstration
    const signature = createMockSignature().asSlice();

    console.log('🔄 Updating DID...');
    
    const result = await didRegistry.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'UpdateDID',
            newUsername,
            newKycHash,
            nonce,
            signature,
        }
    );

    console.log('✅ DID update transaction sent!');
    console.log(`📄 Transaction hash: ${result.transactions[0]?.hash()?.toString('hex')}`);
}

async function revokeDID(didRegistry: any, provider: NetworkProvider, nonce: number) {
    const ui = provider.ui();
    
    const confirm = await ui.choose('Are you sure you want to revoke your DID? This cannot be undone.', [
        'Yes, revoke it',
        'Cancel'
    ], (c) => c);

    if (confirm === 'Cancel') {
        console.log('❌ DID revocation cancelled');
        return;
    }

    // Create mock signature for demonstration
    const signature = createMockSignature().asSlice();

    console.log('🗑️  Revoking DID...');
    
    const result = await didRegistry.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'RevokeDID',
            nonce,
            signature,
        }
    );

    console.log('✅ DID revocation transaction sent!');
    console.log(`📄 Transaction hash: ${result.transactions[0]?.hash()?.toString('hex')}`);
}

// Helper function to create mock signature for demonstration
function createMockSignature() {
    return beginCell()
        .storeUint(12345678901234567890n, 256) // Mock r component
        .storeUint(98765432109876543210n, 256) // Mock s component  
        .endCell();
}
