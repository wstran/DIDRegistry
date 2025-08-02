import { toNano } from '@ton/core';
import { DIDRegistry } from '../build/Registry/Registry_DIDRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    console.log('🔨 Deploying DID Registry contract...');
    console.log('📍 Network:', provider.network());

    try {
        // Create contract instance
        const didRegistry = provider.open(await DIDRegistry.fromInit());
        
        // Check if already deployed
        const isDeployed = await provider.isContractDeployed(didRegistry.address);
        if (isDeployed) {
            console.log('✅ Contract already deployed at:', didRegistry.address.toString());
            return {
                success: true,
                address: didRegistry.address.toString(),
                message: 'Contract already deployed'
            };
        }

        console.log('🚀 Deploying DID Registry to network...');
        console.log('💰 Deployment cost: 0.1 TON');
        
        // Deploy with higher gas limit
        await didRegistry.send(
            provider.sender(),
            {
                value: toNano('0.1'),
                bounce: false,
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        console.log('⏳ Transaction sent, waiting for confirmation...');
        
        // Wait a bit for deployment to process
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if deployment was successful
        const deploymentCheck = await provider.isContractDeployed(didRegistry.address);
        
        if (deploymentCheck) {
            console.log('✅ DID Registry deployed successfully!');
            console.log('📄 Contract address:', didRegistry.address.toString());
            console.log('🔗 View on explorer: https://testnet.tonscan.org/address/' + didRegistry.address.toString());
            
            // Test basic functionality
            try {
                const totalDids = await didRegistry.getTotalDids();
                console.log('📊 Initial total DIDs:', totalDids.toString());
            } catch (error) {
                console.log('⚠️  Contract deployed but getter test failed:', error);
            }
            
            return {
                success: true,
                address: didRegistry.address.toString(),
                message: 'Contract deployed successfully'
            };
        } else {
            throw new Error('Contract deployment verification failed');
        }

    } catch (error) {
        console.error('❌ Deployment failed:', error);
        
        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                console.error('💸 Insufficient funds for deployment. Please add more TON to your wallet.');
            } else if (error.message.includes('timeout')) {
                console.error('⏰ Deployment timed out. The contract might still be deploying.');
            }
        }
        
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown deployment error',
            message: 'Deployment failed'
        };
    }
}