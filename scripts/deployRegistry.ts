import { toNano } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    console.log('🔨 Deploying DID Registry contract...');
    console.log('📍 Network:', provider.network());

    try {
        // Create contract instance
        const didRegistry = provider.open(await DIDRegistry.fromInit());

        // Deploy the contract
        console.log('🚀 Deploying DID Registry to network...');

        const deployResult = await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.1'), // Deployment fee
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        await provider.waitForDeploy(didRegistry.address);

        const contractAddress = didRegistry.address;
        console.log('✅ DID Registry deployed successfully!');
        console.log('📄 Contract address:', contractAddress.toString());
        
        // Determine explorer URL based on network
        const isMainnet = provider.network() === 'mainnet';
        const explorerUrl = isMainnet 
            ? `https://tonscan.org/address/${contractAddress.toString()}`
            : `https://testnet.tonscan.org/address/${contractAddress.toString()}`;
        
        console.log('🔗 View on explorer:', explorerUrl);

        // Test basic functionality
        console.log('\n🧪 Testing contract functionality...');

        try {
            const totalDIDs = await didRegistry.getGetTotalDiDs();
            console.log('📊 Total DIDs registered:', totalDIDs.toString());

            const contractOwner = await didRegistry.getGetContractOwner();
            console.log('👤 Contract owner:', contractOwner.toString());

            const senderAddress = provider.sender().address;
            if (senderAddress) {
                const isActive = await didRegistry.getIsDidActive(senderAddress);
                console.log('❓ Deployer has active DID:', isActive);

                const userNonce = await didRegistry.getGetUserNonce(senderAddress);
                console.log('🔢 Deployer current nonce:', userNonce.toString());

                // Check if deployer has any DID info
                const didInfo = await didRegistry.getGetDid(senderAddress);
                if (didInfo) {
                    console.log('📋 Deployer DID info:');
                    console.log('   - Username:', didInfo.username);
                    console.log('   - Active:', didInfo.isActive);
                    console.log('   - Created At:', new Date(Number(didInfo.createdAt) * 1000).toISOString());
                } else {
                    console.log('📋 Deployer has no registered DID');
                }
            }

            console.log('\n🎉 Deployment and testing completed successfully!');
            
        } catch (testError) {
            console.error('⚠️ Contract deployed but testing failed:', testError);
        }

        console.log('\n💡 Next steps:');
        console.log('   1. Save the contract address for future interactions');
        console.log('   2. Use the interact script to register your first DID');
        console.log('   3. Monitor events and transactions on the explorer');
        
        console.log('\n📚 Available operations:');
        console.log('   - RegisterDID: Register a new decentralized identity');
        console.log('   - UpdateDID: Update existing DID information');
        console.log('   - RevokeDID: Revoke/deactivate a DID');
        console.log('   - TransferOwnership: Transfer contract ownership (owner only)');
        
        console.log('\n📖 Getter functions:');
        console.log('   - getDID: Query DID information by address');
        console.log('   - getUsername: Get username for active DID');
        console.log('   - getKYCHash: Get KYC hash for active DID');
        console.log('   - getPublicKey: Get public key for active DID');
        console.log('   - isDIDActive: Check if DID is active');
        console.log('   - getTotalDIDs: Get total number of registered DIDs');
        console.log('   - getUserNonce: Get current nonce for user');

        return {
            contractAddress: contractAddress.toString(),
            explorerUrl,
            network: provider.network(),
            totalDIDs: 0,
            success: true
        };

    } catch (error) {
        console.error('❌ Deployment failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}